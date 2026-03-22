'use strict';

const stockEntryService = require('../services/stockEntry.service');
const asyncHandler = require('../utils/asyncHandler');

const add = asyncHandler(async (req, res) => {
  const result = await stockEntryService.addStock(req.body, req.user._id);
  res.status(201).json({ status: 'success', data: result });
});

const list = asyncHandler(async (req, res) => {
  const result = await stockEntryService.list(req.query);
  res.json({ status: 'success', data: result });
});

const listByProduct = asyncHandler(async (req, res) => {
  const result = await stockEntryService.list({ ...req.query, productId: req.params.productId });
  res.json({ status: 'success', data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const entry = await stockEntryService.getById(req.params.id);
  res.json({ status: 'success', data: { entry } });
});

module.exports = { add, list, listByProduct, getOne };
