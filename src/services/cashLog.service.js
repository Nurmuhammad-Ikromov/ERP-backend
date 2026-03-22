'use strict';

const DailyCashLog = require('../models/DailyCashLog');
const cashboxService = require('./cashbox.service');
const AppError = require('../utils/AppError');
const { toDateString } = require('../utils/dateUtils');

/**
 * Get or create today's cash log.
 * Automatically carries over closingRemaining from the previous day.
 */
const getOrCreateToday = async (userId) => {
  const todayKey = toDateString();
  let log = await DailyCashLog.findOne({ dateKey: todayKey });

  if (!log) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const prevLog = await DailyCashLog.findOne({ dateKey: toDateString(yesterday) });

    log = await DailyCashLog.create({
      dateKey: todayKey,
      date: new Date(),
      openingCarryAmount: prevLog ? prevLog.closingRemaining : 0,
      createdBy: userId,
    });
  }

  return log;
};

/**
 * Admin withdraws cash from the cashbox.
 * Delegates to cashboxService which handles Cashbox balance,
 * CashWithdrawal record, CashboxTransaction, and DailyCashLog update.
 */
const takeOut = async ({ amount, note }, userId) => {
  const { withdrawal } = await cashboxService.withdraw(amount, note, userId);
  // Return today's log so the response is backward-compatible
  const log = await DailyCashLog.findOne({ dateKey: toDateString() });
  return { log, withdrawal };
};

/**
 * Close the day: compute closingRemaining and lock the record.
 * closingRemaining = openingCarry + totalCashSales - cashTakenOut
 */
const closeDay = async ({ note }, userId) => {
  const todayKey = toDateString();
  const log = await DailyCashLog.findOne({ dateKey: todayKey });
  if (!log) throw new AppError('No cash log found for today — make at least one sale first', 404);
  if (log.isClosed) throw new AppError("Today's cash log is already closed", 400);

  log.closingRemaining =
    log.openingCarryAmount + log.totalCashSales + (log.totalDebtRepayments || 0) - log.cashTakenOut;
  log.isClosed = true;
  log.closedAt = new Date();
  if (note) log.note = note;
  await log.save();

  return log;
};

/**
 * Get cash logs for a date range, sorted by dateKey desc.
 */
const getRange = async ({ dateFrom, dateTo, page = 1, limit = 31 }) => {
  const filter = {};
  if (dateFrom || dateTo) {
    filter.dateKey = {};
    if (dateFrom) filter.dateKey.$gte = dateFrom;
    if (dateTo) filter.dateKey.$lte = dateTo;
  }
  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    DailyCashLog.find(filter)
      .populate('createdBy', 'fullName username')
      .sort('-dateKey')
      .skip(skip)
      .limit(Number(limit)),
    DailyCashLog.countDocuments(filter),
  ]);

  return { logs, total, page: Number(page), limit: Number(limit) };
};

module.exports = { getOrCreateToday, takeOut, closeDay, getRange };
