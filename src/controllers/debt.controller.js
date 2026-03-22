'use strict';

const debtService = require('../services/debt.service');
const asyncHandler = require('../utils/asyncHandler');

const listCustomers = asyncHandler(async (req, res) => {
  const result = await debtService.listCustomers(req.query);
  res.json({ status: 'success', data: result });
});

const getCustomer = asyncHandler(async (req, res) => {
  const account = await debtService.getCustomer(req.params.id);
  res.json({ status: 'success', data: { account } });
});

const repayment = asyncHandler(async (req, res) => {
  const result = await debtService.recordRepayment(req.body, req.user._id);
  res.status(201).json({ status: 'success', data: result });
});

const history = asyncHandler(async (req, res) => {
  const result = await debtService.getHistory(req.params.customerId, req.query);
  res.json({ status: 'success', data: result });
});

const summary = asyncHandler(async (req, res) => {
  const result = await debtService.summary();
  res.json({ status: 'success', data: result });
});

module.exports = { listCustomers, getCustomer, repayment, history, summary };
