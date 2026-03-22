'use strict';

const cashboxService = require('../services/cashbox.service');
const asyncHandler = require('../utils/asyncHandler');

const summary = asyncHandler(async (req, res) => {
  const data = await cashboxService.getSummary();

  res.json({ status: 'success', data });
});

const transactions = asyncHandler(async (req, res) => {
  const query = { ...req.query };

  // Kassir cannot see withdrawal-type transactions
  if (req.user.role === 'seller') {
    query.excludeTypes = ['withdrawal', 'card_withdrawal'];
  }

  const data = await cashboxService.getTransactions(query);
  res.json({ status: 'success', data });
});

const withdrawals = asyncHandler(async (req, res) => {
  const data = await cashboxService.getWithdrawals(req.query);
  res.json({ status: 'success', data });
});

const withdraw = asyncHandler(async (req, res) => {
  const { amount, note } = req.body;
  const data = await cashboxService.withdraw(amount, note, req.user._id);
  res.status(201).json({ status: 'success', data });
});

const cardWithdrawals = asyncHandler(async (req, res) => {
  const data = await cashboxService.getCardWithdrawals(req.query);
  res.json({ status: 'success', data });
});

const withdrawCard = asyncHandler(async (req, res) => {
  const { amount, note } = req.body;
  const data = await cashboxService.withdrawCard(amount, note, req.user._id);
  res.status(201).json({ status: 'success', data });
});

module.exports = { summary, transactions, withdrawals, withdraw, cardWithdrawals, withdrawCard };
