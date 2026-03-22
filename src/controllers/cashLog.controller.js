'use strict';

const cashLogService = require('../services/cashLog.service');
const asyncHandler = require('../utils/asyncHandler');

const today = asyncHandler(async (req, res) => {
  const log = await cashLogService.getOrCreateToday(req.user._id);
  res.json({ status: 'success', data: { log } });
});

const takeOut = asyncHandler(async (req, res) => {
  const log = await cashLogService.takeOut(req.body, req.user._id);
  res.json({ status: 'success', data: { log } });
});

const closeDay = asyncHandler(async (req, res) => {
  const log = await cashLogService.closeDay(req.body, req.user._id);
  res.json({ status: 'success', data: { log } });
});

const range = asyncHandler(async (req, res) => {
  const result = await cashLogService.getRange(req.query);
  res.json({ status: 'success', data: result });
});

module.exports = { today, takeOut, closeDay, range };
