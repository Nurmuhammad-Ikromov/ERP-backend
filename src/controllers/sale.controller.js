'use strict';

const saleService = require('../services/sale.service');
const { formatReceipt } = require('../utils/receipt');
const asyncHandler = require('../utils/asyncHandler');

// Strip profit-related fields from a sale object for kassir role
const stripProfit = (sale) => {
  const s = sale.toObject ? sale.toObject() : { ...sale };
  delete s.totalProfit;
  if (Array.isArray(s.items)) {
    s.items = s.items.map((item) => {
      const i = { ...item };
      delete i.profitSnapshot;
      delete i.costPriceSnapshot;
      return i;
    });
  }
  return s;
};

const create = asyncHandler(async (req, res) => {
  const sale = await saleService.createSale(req.body, req.user._id);
  const data = req.user.role === 'seller' ? stripProfit(sale) : sale;
  const receipt = formatReceipt(sale);
  res.status(201).json({ status: 'success', data: { sale: data, receipt } });
});

const list = asyncHandler(async (req, res) => {
  const result = await saleService.list(req.query);
  if (req.user.role === 'seller') {
    result.sales = result.sales.map(stripProfit);
  }
  res.json({ status: 'success', data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const sale = await saleService.getById(req.params.id);
  const data = req.user.role === 'seller' ? stripProfit(sale) : sale;
  res.json({ status: 'success', data: { sale: data } });
});

const dailySummary = asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const summary = await saleService.dailySummary(date);
  res.json({ status: 'success', data: { summary } });
});

const monthlySummary = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const result = await saleService.monthlySummary(year, month);
  res.json({ status: 'success', data: result });
});

const yearlySummary = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const result = await saleService.yearlySummary(year);
  res.json({ status: 'success', data: result });
});

const getReceipt = asyncHandler(async (req, res) => {
  const sale = await saleService.getById(req.params.id);
  const receipt = formatReceipt(sale);
  res.json({ status: 'success', data: { receipt } });
});

const voidSale = asyncHandler(async (req, res) => {
  const result = await saleService.voidSale(req.params.id, req.user._id);
  res.json({
    status: 'success',
    message: `${result.receiptNumber || 'Sotuv'} bekor qilindi`,
    data: result,
  });
});

module.exports = { create, list, getOne, getReceipt, dailySummary, monthlySummary, yearlySummary, voidSale };
