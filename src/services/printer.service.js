'use strict';

const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');
const {
  PRINTER_NAME,
  PRINTER_INTERFACE,
  PRINTER_DRIVER,
  PRINTER_CHARACTER_SET,
  PRINTER_AUTO_CUT,
  PRINTER_CUT_FEED_LINES,
  PRINTER_CUT_MODE,
  SHOP_NAME,
} = require('../config/env');
const { createWindowsRawInterface } = require('./windowsRawPrinter.interface');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const iconv = require('iconv-lite');
const EPSON_CONFIG = require('node-thermal-printer/lib/types/epson-config');

const PRINTER_WIDTH = 48; // 80mm paper ~= 48 chars
let windowsFallbackWarned = false;

// Uzbek Cyrillic letters that are usually not available in common ESC/POS tables.
const UNSUPPORTED_CYRILLIC_MAP = {
  '\u049A': '\u041A', // Қ -> К
  '\u049B': '\u043A', // қ -> к
  '\u0492': '\u0413', // Ғ -> Г
  '\u0493': '\u0433', // ғ -> г
  '\u04B2': '\u0425', // Ҳ -> Х
  '\u04B3': '\u0445', // ҳ -> х
};

const resolveCharacterSet = () => {
  const requested = (PRINTER_CHARACTER_SET || '').trim();
  if (requested && Object.prototype.hasOwnProperty.call(CharacterSet, requested)) {
    return CharacterSet[requested];
  }

  if (requested) {
    logger.warn(`Unknown PRINTER_CHARACTER_SET "${requested}", fallback to PC866_CYRILLIC2`);
  }
  return CharacterSet.PC866_CYRILLIC2;
};

const getPrinterInterface = () => {
  if (PRINTER_INTERFACE && PRINTER_INTERFACE.trim()) {
    return PRINTER_INTERFACE.trim();
  }
  return `printer:${PRINTER_NAME}`;
};

const loadModule = (moduleName) => {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return { driver: require(moduleName), error: null };
  } catch (error) {
    return { driver: null, error };
  }
};

const resolveDriver = (printerInterface) => {
  if (!printerInterface.toLowerCase().startsWith('printer:')) {
    return { driver: null, loadErrors: {}, tried: [] };
  }

  const preferred = (PRINTER_DRIVER || 'printer').trim();
  const candidates = [...new Set([preferred, 'printer', 'electron-printer'])];
  const loadErrors = {};

  for (const moduleName of candidates) {
    const { driver, error } = loadModule(moduleName);
    if (driver) {
      return { driver, loadErrors: {}, tried: candidates };
    }
    if (error) {
      loadErrors[moduleName] = error.message;
    }
  }

  return { driver: null, loadErrors, tried: candidates };
};

const createThermalPrinter = () => {
  const printerInterface = getPrinterInterface();
  const { driver, loadErrors, tried } = resolveDriver(printerInterface);
  const isSystemPrinter = printerInterface.toLowerCase().startsWith('printer:');

  let interfaceTarget = printerInterface;
  if (isSystemPrinter && !driver) {
    if (process.platform !== 'win32') {
      throw new AppError(
        'Printer driver yuklanmadi. "npm install printer --legacy-peer-deps" qiling.',
        500,
        { tried, loadErrors }
      );
    }

    const printerName = printerInterface.slice('printer:'.length).trim();
    interfaceTarget = createWindowsRawInterface(printerName);

    if (!windowsFallbackWarned) {
      logger.warn('Falling back to Windows RAW spooler interface', {
        printer: printerName,
        tried,
        loadErrors,
      });
      windowsFallbackWarned = true;
    }
  }

  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: interfaceTarget,
    ...(driver ? { driver } : {}),
    characterSet: resolveCharacterSet(),
    breakLine: BreakLine.WORD,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    width: PRINTER_WIDTH,
  });
};

const canEncodeInActiveCodePage = (ch, characterSet) => {
  if (/^[\x00-\x7F]$/.test(ch)) {
    return true;
  }

  const encoding = EPSON_CONFIG.CODE_PAGES[characterSet];
  if (!encoding) {
    return true;
  }

  try {
    const encoded = iconv.encode(ch, encoding);
    return encoded.toString() !== '?' || ch === '?';
  } catch (error) {
    return false;
  }
};

const sanitizeForPrinter = (value, characterSet) => {
  if (value === null || value === undefined) {
    return value;
  }

  const normalized = String(value)
    .replace(/[\u049A\u049B\u0492\u0493\u04B2\u04B3]/g, (ch) => UNSUPPORTED_CYRILLIC_MAP[ch] || ch)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2019/g, "'")
    .replace(/[\u2013\u2014]/g, '-');

  let out = '';
  for (const ch of normalized) {
    out += canEncodeInActiveCodePage(ch, characterSet) ? ch : '?';
  }
  return out;
};

const normalizeReceiptForPrinter = (receipt = {}, characterSet) => ({
  ...receipt,
  shopName: sanitizeForPrinter(receipt.shopName, characterSet),
  seller: sanitizeForPrinter(receipt.seller, characterSet),
  paymentLabel: sanitizeForPrinter(receipt.paymentLabel, characterSet),
  paymentBreakdown: Array.isArray(receipt.paymentBreakdown)
    ? receipt.paymentBreakdown.map((part) => ({
      ...part,
      label: sanitizeForPrinter(part?.label, characterSet),
    }))
    : [],
  currency: sanitizeForPrinter(receipt.currency, characterSet),
  customerName: sanitizeForPrinter(receipt.customerName, characterSet),
  customerPhone: sanitizeForPrinter(receipt.customerPhone, characterSet),
  note: sanitizeForPrinter(receipt.note, characterSet),
  items: Array.isArray(receipt.items)
    ? receipt.items.map((item) => ({
      ...item,
      name: sanitizeForPrinter(item?.name, characterSet),
      qty: sanitizeForPrinter(item?.qty, characterSet),
    }))
    : [],
});

const fmt = (n) =>
  Number(n)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const formatQtyForReceipt = (value) => {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }

  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  return match ? match[0] : text;
};

const padL = (str, width) => String(str).padStart(width);
const padR = (str, width) => String(str).padEnd(width);
const trunc = (str, maxLen) =>
  str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;

const divider = () => '-'.repeat(PRINTER_WIDTH);
const padC = (str, width) => {
  const value = String(str);
  if (value.length >= width) {
    return value.slice(0, width);
  }

  const total = width - value.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return `${' '.repeat(left)}${value}${' '.repeat(right)}`;
};

const wrapText = (value, maxLen) => {
  const text = String(value || '').trim();
  if (!text) {
    return [''];
  }

  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      if (word.length <= maxLen) {
        current = word;
        continue;
      }

      let rest = word;
      while (rest.length > maxLen) {
        lines.push(rest.slice(0, maxLen));
        rest = rest.slice(maxLen);
      }
      current = rest;
      continue;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    lines.push(current);
    if (word.length <= maxLen) {
      current = word;
      continue;
    }

    let rest = word;
    while (rest.length > maxLen) {
      lines.push(rest.slice(0, maxLen));
      rest = rest.slice(maxLen);
    }
    current = rest;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
};

const buildGdiItemRows = (item, columns) => {
  const nameLines = wrapText(item.name, columns.name);
  const rowCount = Math.max(nameLines.length, 1);
  const middleRow = Math.floor((rowCount - 1) / 2);
  const qty = trunc(String(item.qty), columns.qty);
  const total = fmt(item.lineTotal);
  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const namePart = padR(nameLines[index] || '', columns.name);
    const qtyPart = index === middleRow ? padC(qty, columns.qty) : ' '.repeat(columns.qty);
    const totalPart = index === middleRow ? padL(total, columns.total) : ' '.repeat(columns.total);
    rows.push(`${namePart}${qtyPart}${totalPart}`);
  }

  return rows;
};

const buildGdiReceiptPayload = (receipt, shopName) => {
  const columns = { name: 30, qty: 8, total: 10 };
  return {
    shopName,
    receiptNumber: receipt.receiptNumber || '-',
    date: receipt.date,
    time: receipt.time,
    seller: receipt.seller,
    paymentLabel: receipt.paymentLabel,
    paymentBreakdown: Array.isArray(receipt.paymentBreakdown)
      ? receipt.paymentBreakdown.map((part) => `${part.label}: ${fmt(part.amount)} ${receipt.currency}`)
      : [],
    currency: receipt.currency,
    totalText: `${fmt(receipt.total)} ${receipt.currency}`,
    paidText: receipt.paidAmount > 0 && receipt.paidAmount < receipt.total
      ? `${fmt(receipt.paidAmount)} ${receipt.currency}`
      : '',
    debtText: receipt.debtAmount > 0
      ? `${fmt(receipt.debtAmount)} ${receipt.currency}`
      : '',
    customerName: receipt.customerName || '',
    customerPhone: receipt.customerPhone || '',
    note: receipt.note || '',
    columns,
    items: receipt.items.map((item) => ({
      nameLines: wrapText(item.name, columns.name),
      qty: trunc(formatQtyForReceipt(item.qty), columns.qty),
      total: fmt(item.lineTotal),
    })),
  };
};

const printReceipt = async (receipt) => {
  const characterSet = resolveCharacterSet();
  const safeReceipt = normalizeReceiptForPrinter(receipt, characterSet);
  const printerInterface = getPrinterInterface();
  const shopName = SHOP_NAME || safeReceipt.shopName || "ADOKON DO'KON";
  const isWindowsGdiMode =
    process.platform === 'win32' &&
    printerInterface.toLowerCase().startsWith('printer:') &&
    (process.env.PRINTER_WINDOWS_MODE || 'gdi').toLowerCase() === 'gdi';

  if (isWindowsGdiMode) {
    const printerName = printerInterface.slice('printer:'.length).trim();
    const printer = createWindowsRawInterface(printerName);
    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      throw new AppError(`Printer "${printerInterface}" ulanmagan yoki topilmadi`, 500);
    }

    await printer.executeGdiReceipt(buildGdiReceiptPayload(safeReceipt, shopName));
    if (String(PRINTER_AUTO_CUT).toLowerCase() !== 'false') {
      await printer.executeFeedAndCut({
        feedLines: PRINTER_CUT_FEED_LINES,
        cutMode: PRINTER_CUT_MODE,
      });
    }
    logger.info(`Receipt ${safeReceipt.receiptNumber} printed on "${printerInterface}"`);
    return;
  }

  const printer = createThermalPrinter();

  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) {
    throw new AppError(`Printer "${printerInterface}" ulanmagan yoki topilmadi`, 500);
  }

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(shopName);
  printer.bold(false);
  printer.setTextNormal();

  printer.drawLine();

  printer.alignLeft();
  printer.println(`Chek   : ${safeReceipt.receiptNumber || '-'}`);
  printer.println(`Sana   : ${safeReceipt.date} ${safeReceipt.time}`);
  printer.println(`Kassir : ${safeReceipt.seller}`);

  printer.drawLine();

  const COL = { name: 30, qty: 8, total: 10 };
  printer.println(
    padR('Mahsulot', COL.name) +
    padC('Miqdor', COL.qty) +
    padC('Jami', COL.total)
  );
  printer.println(divider());

  for (const item of safeReceipt.items) {
    const qty = trunc(formatQtyForReceipt(item.qty), COL.qty);
    const total = fmt(item.lineTotal);
    const nameLines = wrapText(item.name, COL.name);

    if (nameLines.length === 1) {
      printer.println(
        padR(nameLines[0], COL.name) +
        padC(qty, COL.qty) +
        padL(total, COL.total)
      );
    } else {
      for (const line of nameLines) {
        printer.println(line);
      }
      printer.println(
        padR('', COL.name) +
        padC(qty, COL.qty) +
        padL(total, COL.total)
      );
    }
  }

  printer.drawLine();

  printer.alignRight();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(`JAMI: ${fmt(safeReceipt.total)} ${safeReceipt.currency}`);
  printer.bold(false);
  printer.setTextNormal();

  printer.alignLeft();
  printer.println(`To'lov: ${safeReceipt.paymentLabel}`);
  if (Array.isArray(safeReceipt.paymentBreakdown) && safeReceipt.paymentBreakdown.length > 1) {
    for (const part of safeReceipt.paymentBreakdown) {
      printer.println(`  ${part.label}: ${fmt(part.amount)} ${safeReceipt.currency}`);
    }
  }

  if (safeReceipt.paidAmount > 0 && safeReceipt.paidAmount < safeReceipt.total) {
    printer.println(`To'landi: ${fmt(safeReceipt.paidAmount)} ${safeReceipt.currency}`);
  }

  if (safeReceipt.debtAmount > 0) {
    printer.bold(true);
    printer.println(`Qarz: ${fmt(safeReceipt.debtAmount)} ${safeReceipt.currency}`);
    printer.bold(false);
    if (safeReceipt.customerName) printer.println(`Mijoz: ${safeReceipt.customerName}`);
    if (safeReceipt.customerPhone) printer.println(`Tel  : ${safeReceipt.customerPhone}`);
  }

  if (safeReceipt.note) {
    printer.drawLine();
    printer.println(`Izoh: ${safeReceipt.note}`);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println('Rahmat!');
  printer.println('Yana keling :)');

  printer.cut();

  await printer.execute();
  logger.info(`Receipt ${safeReceipt.receiptNumber} printed on "${printerInterface}"`);
};

module.exports = { printReceipt, createThermalPrinter, getPrinterInterface };
