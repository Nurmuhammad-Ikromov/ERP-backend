'use strict';

const path = require('path');
const { execFile } = require('child_process');
const iconv = require('iconv-lite');
const EPSON_CONFIG = require('node-thermal-printer/lib/types/epson-config');

const POWERSHELL = 'powershell.exe';
const CHECK_SCRIPT = path.resolve(__dirname, '../../scripts/windows-printer-check.ps1');
const RAW_PRINT_SCRIPT = path.resolve(__dirname, '../../scripts/windows-raw-print.ps1');
const GDI_PRINT_SCRIPT = path.resolve(__dirname, '../../scripts/windows-gdi-print.ps1');
const GDI_RECEIPT_SCRIPT = path.resolve(__dirname, '../../scripts/windows-gdi-receipt.ps1');
const DEFAULT_CODEPAGE = 'PC866_CYRILLIC2';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CODEPAGE_BY_ID = Object.keys(EPSON_CONFIG)
  .filter((key) => key.startsWith('CODE_PAGE_') && Buffer.isBuffer(EPSON_CONFIG[key]) && EPSON_CONFIG[key].length === 3)
  .reduce((acc, key) => {
    const seq = EPSON_CONFIG[key];
    if (seq[0] === 0x1b && seq[1] === 0x74) {
      acc[seq[2]] = key.replace('CODE_PAGE_', '');
    }
    return acc;
  }, {});

const runPowerShellFile = (scriptPath, args = []) =>
  new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 10 },
      (error, stdout, stderr) => {
        if (error) {
          const err = new Error(stderr?.trim() || stdout?.trim() || error.message);
          err.cause = error;
          reject(err);
          return;
        }
        resolve((stdout || '').trim());
      }
    );
  });

const decodeChunk = (bytes, codePageName) => {
  if (!bytes || bytes.length === 0) {
    return '';
  }

  const encoding = EPSON_CONFIG.CODE_PAGES[codePageName] || EPSON_CONFIG.CODE_PAGES[DEFAULT_CODEPAGE] || 'CP866';
  try {
    return iconv.decode(Buffer.from(bytes), encoding);
  } catch (error) {
    return iconv.decode(Buffer.from(bytes), 'CP866');
  }
};

const escPosBufferToText = (buffer, defaultCodePage = DEFAULT_CODEPAGE) => {
  const bytes = Buffer.from(buffer);
  let i = 0;
  let currentCodePage = defaultCodePage;
  let chunk = [];
  let out = '';

  const flushChunk = () => {
    if (chunk.length > 0) {
      out += decodeChunk(chunk, currentCodePage);
      chunk = [];
    }
  };

  while (i < bytes.length) {
    const b = bytes[i];

    if (b === 0x0a) {
      flushChunk();
      out += '\n';
      i += 1;
      continue;
    }

    if (b === 0x0d) {
      i += 1;
      continue;
    }

    if (b === 0x09) {
      chunk.push(0x20, 0x20, 0x20, 0x20);
      i += 1;
      continue;
    }

    if (b === 0x1b) {
      const cmd = bytes[i + 1];

      if (cmd === 0x74 && i + 2 < bytes.length) {
        flushChunk();
        const cp = CODEPAGE_BY_ID[bytes[i + 2]];
        if (cp) {
          currentCodePage = cp;
        }
        i += 3;
        continue;
      }

      if ([0x21, 0x61, 0x45, 0x4d, 0x2d, 0x33, 0x7b, 0x64].includes(cmd)) {
        i += 3;
        continue;
      }

      if ([0x40, 0x32].includes(cmd)) {
        i += 2;
        continue;
      }

      i += 2;
      continue;
    }

    if (b === 0x1d) {
      const cmd = bytes[i + 1];

      if ([0x21, 0x42, 0x56, 0x72, 0x68, 0x77, 0x48, 0x66].includes(cmd)) {
        i += 3;
        continue;
      }

      if (cmd === 0x28 && i + 4 < bytes.length) {
        const pL = bytes[i + 3];
        const pH = bytes[i + 4];
        i += 5 + pL + (pH << 8);
        continue;
      }

      i += 2;
      continue;
    }

    if (b < 0x20) {
      i += 1;
      continue;
    }

    chunk.push(b);
    i += 1;
  }

  flushChunk();

  return `${out.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
};

class WindowsRawPrinterInterface {
  constructor(printerName) {
    this.printerName = printerName;
  }

  async isPrinterConnected() {
    const result = await runPowerShellFile(CHECK_SCRIPT, ['-PrinterName', this.printerName]);
    return result.toLowerCase() === 'true';
  }

  async executeRaw(buffer) {
    const dataBase64 = Buffer.from(buffer).toString('base64');
    await runPowerShellFile(RAW_PRINT_SCRIPT, ['-PrinterName', this.printerName, '-DataBase64', dataBase64]);
    return `Printed with Windows RAW spooler: ${this.printerName}`;
  }

  async executeFeedAndCut(options = {}) {
    const feedLines = Math.max(0, Math.min(12, Number(options.feedLines) || 0));
    const cutMode = String(options.cutMode || 'full').toLowerCase() === 'partial' ? 1 : 0;
    const delayMs = Math.max(0, Number(options.delayMs) || 0);

    if (delayMs > 0) {
      await delay(delayMs);
    }

    const command = Buffer.from([
      0x1b, 0x40, // ESC @ init
      0x1b, 0x64, feedLines, // ESC d n -> feed n lines
      0x1d, 0x56, cutMode, // GS V m -> cut
    ]);

    return this.executeRaw(command);
  }

  async executeGdiText(text) {
    const textBase64 = Buffer.from(String(text || ''), 'utf8').toString('base64');
    await runPowerShellFile(GDI_PRINT_SCRIPT, ['-PrinterName', this.printerName, '-TextBase64', textBase64]);
    return `Printed with Windows GDI text mode: ${this.printerName}`;
  }

  async executeGdiReceipt(receipt) {
    const receiptBase64 = Buffer.from(JSON.stringify(receipt || {}), 'utf8').toString('base64');
    await runPowerShellFile(GDI_RECEIPT_SCRIPT, ['-PrinterName', this.printerName, '-ReceiptBase64', receiptBase64]);
    return `Printed with Windows GDI receipt mode: ${this.printerName}`;
  }

  async executeGdi(buffer) {
    const text = escPosBufferToText(buffer);
    return this.executeGdiText(text);
  }

  async execute(buffer) {
    const mode = (process.env.PRINTER_WINDOWS_MODE || 'gdi').toLowerCase();

    if (mode === 'raw') {
      return this.executeRaw(buffer);
    }

    if (mode === 'auto') {
      try {
        return await this.executeRaw(buffer);
      } catch (rawError) {
        return this.executeGdi(buffer);
      }
    }

    return this.executeGdi(buffer);
  }
}

const createWindowsRawInterface = (printerName) => new WindowsRawPrinterInterface(printerName);

module.exports = { createWindowsRawInterface, escPosBufferToText };
