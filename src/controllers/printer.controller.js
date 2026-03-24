'use strict';

const { printReceipt, createThermalPrinter, getPrinterInterface } = require('../services/printer.service');
const { formatReceipt } = require('../utils/receipt');
const saleService = require('../services/sale.service');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

/**
 * POST /api/printer/receipt
 * Body: receipt object (direct from frontend or from sale response)
 */
const print = asyncHandler(async (req, res) => {
  const receipt = req.body;

  if (!receipt || !receipt.items || receipt.items.length === 0) {
    throw new AppError('receipt.items bo\'sh bo\'lmasligi kerak', 400);
  }

  await printReceipt(receipt);

  res.json({ status: 'success', message: 'Chek chop etildi' });
});

/**
 * POST /api/printer/receipt-by-sale/:saleId
 * Fetches sale from DB, formats receipt, and prints it.
 * Useful for reprint from sale history.
 */
const printBySaleId = asyncHandler(async (req, res) => {
  const sale = await saleService.getById(req.params.saleId);
  const receipt = formatReceipt(sale);
  await printReceipt(receipt);

  res.json({ status: 'success', message: `Chek ${receipt.receiptNumber} qayta chop etildi` });
});

/**
 * GET /api/printer/test
 * Prints a test receipt to verify printer connection.
 */
const testPrint = asyncHandler(async (req, res) => {
  const testReceipt = {
    shopName: 'MUNAVVAR TONG',
    receiptNumber: 'TEST-001',
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    seller: 'Test Foydalanuvchi',
    paymentLabel: 'Naqd pul',
    currency: 'UZS',
    items: [
      { name: 'Test mahsulot 1', qty: '2 dona',    unitPrice: 15000,  lineTotal: 30000 },
      { name: 'Test mahsulot 2', qty: '1.500 kg',  unitPrice: 20000,  lineTotal: 30000 },
    ],
    subtotal: 60000,
    total: 60000,
    paidAmount: 60000,
    debtAmount: 0,
    customerName: null,
    customerPhone: null,
    note: 'Bu test cheki',
  };

  await printReceipt(testReceipt);
  res.json({ status: 'success', message: 'Test cheki chop etildi' });
});

/**
 * GET /api/printer/status
 * Check if printer is reachable (no actual print).
 */
const status = asyncHandler(async (req, res) => {
  const printer = createThermalPrinter();
  const printerTarget = getPrinterInterface();

  const connected = await printer.isPrinterConnected();
  res.json({
    status: 'success',
    data: {
      printer: printerTarget,
      connected,
      message: connected ? 'Printer tayyor' : 'Printer ulanmagan',
    },
  });
});

module.exports = { print, printBySaleId, testPrint, status };
