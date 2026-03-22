'use strict';

const reportService = require('../services/report.service');
const asyncHandler = require('../utils/asyncHandler');

const dashboard = asyncHandler(async (req, res) => {
  const data = await reportService.dashboard();
  res.json({ status: 'success', data });
});

const inventory = asyncHandler(async (req, res) => {
  const data = await reportService.inventory();
  res.json({ status: 'success', data });
});

const salesByProduct = asyncHandler(async (req, res) => {
  const data = await reportService.salesByProduct(req.query);
  res.json({ status: 'success', data });
});

const salesBySeller = asyncHandler(async (req, res) => {
  const data = await reportService.salesBySeller(req.query);
  res.json({ status: 'success', data });
});

const debtsReport = asyncHandler(async (req, res) => {
  const data = await reportService.debtsReport();
  res.json({ status: 'success', data });
});

const dailyReport = asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const data = await reportService.dailyReport(date);
  res.json({ status: 'success', data });
});

const monthlyReport = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const data = await reportService.monthlyReport(year, month);
  res.json({ status: 'success', data });
});

const yearlyReport = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const data = await reportService.yearlyReport(year);
  res.json({ status: 'success', data });
});

const profitByProduct = asyncHandler(async (req, res) => {
  const data = await reportService.profitByProduct(req.query);
  res.json({ status: 'success', data });
});

const topProfitableProducts = asyncHandler(async (req, res) => {
  const data = await reportService.topProfitableProducts(req.query);
  res.json({ status: 'success', data });
});

const lowStock = asyncHandler(async (req, res) => {
  const data = await reportService.lowStock();
  res.json({ status: 'success', data });
});

module.exports = {
  dashboard,
  inventory,
  salesByProduct,
  salesBySeller,
  debtsReport,
  dailyReport,
  monthlyReport,
  yearlyReport,
  profitByProduct,
  topProfitableProducts,
  lowStock,
};
