'use strict';

const DebtAccount = require('../models/DebtAccount');
const DebtTransaction = require('../models/DebtTransaction');
const cashboxService = require('./cashbox.service');
const AppError = require('../utils/AppError');

const buildSortObject = (sort = '-debtCreatedAt') => {
  const tokens = String(sort)
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const sortObject = {};
  for (const token of tokens) {
    if (token.startsWith('-')) {
      sortObject[token.slice(1)] = -1;
    } else {
      sortObject[token] = 1;
    }
  }

  if (!Object.keys(sortObject).length) {
    sortObject.debtCreatedAt = -1;
  }

  return sortObject;
};

const listCustomers = async (query = {}) => {
  const {
    page = 1,
    limit: rawLimit,
    pageSize,
    sort = '-debtCreatedAt',
    search,
  } = query;
  const limit = Number(rawLimit || pageSize || 50);
  const filter = {};
  if (search) {
    filter.$or = [
      { customerName: new RegExp(search, 'i') },
      { customerPhone: new RegExp(search, 'i') },
    ];
  }
  const skip = (Number(page) - 1) * limit;
  const sortStage = buildSortObject(sort);

  const [accounts, total] = await Promise.all([
    DebtAccount.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'debttransactions',
          let: { debtAccountId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$debtAccount', '$$debtAccountId'] },
                    { $eq: ['$type', 'created'] },
                  ],
                },
              },
            },
            { $sort: { date: -1, createdAt: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, debtCreatedAt: '$date' } },
          ],
          as: 'latestDebtTx',
        },
      },
      {
        $addFields: {
          debtCreatedAt: {
            $ifNull: [
              { $arrayElemAt: ['$latestDebtTx.debtCreatedAt', 0] },
              '$createdAt',
            ],
          },
        },
      },
      { $project: { latestDebtTx: 0 } },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
    ]),
    DebtAccount.countDocuments(filter),
  ]);

  return { accounts, total, page: Number(page), limit };
};

const getCustomer = async (id) => {
  const account = await DebtAccount.findById(id);
  if (!account) throw new AppError('Debt account not found', 404);
  return account;
};

/**
 * Record a repayment from a customer.
 * Validates that amount does not exceed balance unless correction.
 */
const recordRepayment = async ({ debtAccountId, amount, note, paymentMethod, isCorrection = false }, userId) => {
  const account = await DebtAccount.findById(debtAccountId);
  if (!account) throw new AppError('Debt account not found', 404);

  if (!isCorrection && amount > account.balance) {
    throw new AppError(
      `Repayment amount (${amount}) exceeds outstanding balance (${account.balance})`,
      400
    );
  }

  account.totalPaid += amount;
  account.balance -= amount;
  await account.save();

  const tx = await DebtTransaction.create({
    debtAccount: account._id,
    type: isCorrection ? 'correction' : 'payment',
    amount,
    balanceAfter: account.balance,
    note,
    createdBy: userId,
  });

  if (paymentMethod === 'cash') {
    await cashboxService.addCashFromDebtRepayment(amount, tx._id, userId);
  } else if (paymentMethod === 'card') {
    await cashboxService.addCardFromDebtRepayment(amount, tx._id, userId);
  }

  return { account, transaction: tx };
};

const getHistory = async (debtAccountId, query = {}) => {
  const { page = 1, limit = 50 } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const account = await DebtAccount.findById(debtAccountId);
  if (!account) throw new AppError('Debt account not found', 404);

  const [transactions, total] = await Promise.all([
    DebtTransaction.find({ debtAccount: debtAccountId })
      .populate('sale', 'total saleDate paymentType')
      .populate('createdBy', 'fullName username')
      .sort('-date')
      .skip(skip)
      .limit(Number(limit)),
    DebtTransaction.countDocuments({ debtAccount: debtAccountId }),
  ]);

  return { account, transactions, total, page: Number(page), limit: Number(limit) };
};

const summary = async () => {
  const [result] = await DebtAccount.aggregate([
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: '$balance' },
        activeDebtors: {
          $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] },
        },
        totalAccounts: { $sum: 1 },
      },
    },
  ]);
  return result || { totalOutstanding: 0, activeDebtors: 0, totalAccounts: 0 };
};

module.exports = { listCustomers, getCustomer, recordRepayment, getHistory, summary };
