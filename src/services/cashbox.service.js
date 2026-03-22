'use strict';

const Cashbox = require('../models/Cashbox');
const CashWithdrawal = require('../models/CashWithdrawal');
const CardWithdrawal = require('../models/CardWithdrawal');
const CashboxTransaction = require('../models/CashboxTransaction');
const DailyCashLog = require('../models/DailyCashLog');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const { dayBounds, toDateString } = require('../utils/dateUtils');

/* ─────────────────────────────────────────────────────────────
   Internal helper: get or create today's DailyCashLog entry
   with carry-over from the previous day.
───────────────────────────────────────────────────────────── */
const _ensureTodayLog = async (session = null) => {
  const opts = session ? { session } : {};
  const todayKey = toDateString();
  let log = session
    ? await DailyCashLog.findOne({ dateKey: todayKey }).session(session)
    : await DailyCashLog.findOne({ dateKey: todayKey });

  if (!log) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const prevLog = session
      ? await DailyCashLog.findOne({ dateKey: toDateString(yesterday) }).session(session)
      : await DailyCashLog.findOne({ dateKey: toDateString(yesterday) });

    const docs = await DailyCashLog.create(
      [
        {
          dateKey: todayKey,
          date: new Date(),
          openingCarryAmount: prevLog ? prevLog.closingRemaining : 0,
        },
      ],
      opts
    );
    log = Array.isArray(docs) ? docs[0] : docs;
  }
  return log;
};

/* ─────────────────────────────────────────────────────────────
   Add cash to the cashbox from a cash sale.
   Called from sale.service after a cash sale is created.
───────────────────────────────────────────────────────────── */
const addCashFromSale = async (amount, saleId, userId) => {
  const cashbox = await Cashbox.getOrCreate();
  const balanceBefore = cashbox.currentBalance;
  cashbox.currentBalance += amount;
  await cashbox.save();

  await CashboxTransaction.create({
    type: 'sale_cash',
    amount,
    balanceBefore,
    balanceAfter: cashbox.currentBalance,
    relatedSale: saleId,
    createdBy: userId,
    note: 'Cash sale',
  });

  return cashbox;
};

/* ─────────────────────────────────────────────────────────────
   Add cash to the cashbox from a debt repayment.
   Called from debt.service when paymentMethod === 'cash'.
───────────────────────────────────────────────────────────── */
const addCashFromDebtRepayment = async (amount, debtTransactionId, userId) => {
  const cashbox = await Cashbox.getOrCreate();
  const balanceBefore = cashbox.currentBalance;
  cashbox.currentBalance += amount;
  await cashbox.save();

  await CashboxTransaction.create({
    type: 'debt_repayment',
    amount,
    balanceBefore,
    balanceAfter: cashbox.currentBalance,
    relatedDebtTransaction: debtTransactionId,
    createdBy: userId,
    note: 'Debt repayment (cash)',
  });

  const todayLog = await _ensureTodayLog();
  todayLog.totalDebtRepayments = (todayLog.totalDebtRepayments || 0) + amount;
  await todayLog.save();

  return cashbox;
};

/* ─────────────────────────────────────────────────────────────
   Withdraw cash from cashbox (admin only).
   Creates CashWithdrawal + CashboxTransaction + updates
   Cashbox balance + updates DailyCashLog.cashTakenOut.
   All inside a MongoDB transaction for atomicity.
───────────────────────────────────────────────────────────── */
const withdraw = async (amount, note, userId) => {
  // Fetch current cashbox balance
  let cashbox = await Cashbox.findOne();
  if (!cashbox) {
    cashbox = await Cashbox.create({ currentBalance: 0 });
  }

  if (amount > cashbox.currentBalance) {
    throw new AppError(
      `Insufficient cashbox balance. Available: ${cashbox.currentBalance}, requested: ${amount}`,
      400
    );
  }

  const balanceBefore = cashbox.currentBalance;
  cashbox.currentBalance -= amount;
  await cashbox.save();

  // Create withdrawal record
  const withdrawal = await CashWithdrawal.create({
    amount,
    note: note || undefined,
    withdrawnBy: userId,
    withdrawnAt: new Date(),
    balanceBefore,
    balanceAfter: cashbox.currentBalance,
  });

  // Create cashbox transaction log entry
  await CashboxTransaction.create({
    type: 'withdrawal',
    amount,
    balanceBefore,
    balanceAfter: cashbox.currentBalance,
    relatedWithdrawal: withdrawal._id,
    createdBy: userId,
    note: note || 'Cash withdrawal',
  });

  // Update today's DailyCashLog.cashTakenOut (for daily reporting)
  const todayLog = await _ensureTodayLog();
  todayLog.cashTakenOut += amount;
  await todayLog.save();

  return { cashbox, withdrawal };
};

/* ─────────────────────────────────────────────────────────────
   GET /api/cashbox/summary
   Returns current cashbox state + today's payment breakdown.
───────────────────────────────────────────────────────────── */
const getSummary = async () => {
  const { start, end } = dayBounds();

  const [
    cashbox,
    todaySalesAgg,
    todayCashWithdrawalsAgg,
    todayCardWithdrawalsAgg,
    todayCashDebtRepaymentsAgg,
    todayCardDebtRepaymentsAgg,
  ] = await Promise.all([
    Cashbox.getOrCreate(),

    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          cashSales: {
            $sum: { $cond: [{ $eq: ['$paymentType', 'cash'] }, '$total', 0] },
          },
          cardSales: {
            $sum: { $cond: [{ $eq: ['$paymentType', 'card'] }, '$total', 0] },
          },
          debtSales: {
            $sum: { $cond: [{ $eq: ['$paymentType', 'debt'] }, '$total', 0] },
          },
        },
      },
    ]),

    CashWithdrawal.aggregate([
      { $match: { withdrawnAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    CardWithdrawal.aggregate([
      { $match: { withdrawnAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    CashboxTransaction.aggregate([
      { $match: { type: 'debt_repayment', createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    CashboxTransaction.aggregate([
      { $match: { type: 'card_debt_repayment', createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const sales = todaySalesAgg[0] || { totalSales: 0, cashSales: 0, cardSales: 0, debtSales: 0 };
  const cashWithdrawals = todayCashWithdrawalsAgg[0] || { total: 0, count: 0 };
  const cardWithdrawals = todayCardWithdrawalsAgg[0] || { total: 0, count: 0 };
  const cashDebtRepayments = todayCashDebtRepaymentsAgg[0] || { total: 0, count: 0 };
  const cardDebtRepayments = todayCardDebtRepaymentsAgg[0] || { total: 0, count: 0 };

  const openingCashBalance =
    cashbox.currentBalance - sales.cashSales - cashDebtRepayments.total + cashWithdrawals.total;
  const openingCardBalance =
    cashbox.cardBalance - sales.cardSales - cardDebtRepayments.total + cardWithdrawals.total;

  return {
    cash: {
      currentBalance: cashbox.currentBalance,
      openingBalanceToday: Math.max(0, openingCashBalance),
      today: {
        cashSales: sales.cashSales,
        debtRepaymentsTotal: cashDebtRepayments.total,
        debtRepaymentCount: cashDebtRepayments.count,
        withdrawalsTotal: cashWithdrawals.total,
        withdrawalCount: cashWithdrawals.count,
      },
    },
    card: {
      currentBalance: cashbox.cardBalance,
      openingBalanceToday: Math.max(0, openingCardBalance),
      today: {
        cardSales: sales.cardSales,
        debtRepaymentsTotal: cardDebtRepayments.total,
        debtRepaymentCount: cardDebtRepayments.count,
        withdrawalsTotal: cardWithdrawals.total,
        withdrawalCount: cardWithdrawals.count,
      },
    },
    today: {
      totalSales: sales.totalSales,
      cashSales: sales.cashSales,
      cardSales: sales.cardSales,
      debtSales: sales.debtSales,
    },
  };
};

/* ─────────────────────────────────────────────────────────────
   GET /api/cashbox/transactions
   Paginated list with optional date range and type filter.
───────────────────────────────────────────────────────────── */
const getTransactions = async ({ dateFrom, dateTo, type, excludeTypes, page = 1, limit = 50 }) => {
  const filter = {};
  if (type) {
    filter.type = type;
  } else if (excludeTypes && excludeTypes.length > 0) {
    filter.type = { $nin: excludeTypes };
  }
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }
  const skip = (Number(page) - 1) * Number(limit);

  const [transactions, total] = await Promise.all([
    CashboxTransaction.find(filter)
      .populate('createdBy', 'fullName username')
      .populate('relatedSale', 'total paymentType saleDate')
      .populate('relatedWithdrawal', 'amount note withdrawnAt')
      .populate('relatedCardWithdrawal', 'amount note withdrawnAt')
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit)),
    CashboxTransaction.countDocuments(filter),
  ]);

  return { transactions, total, page: Number(page), limit: Number(limit) };
};

/* ─────────────────────────────────────────────────────────────
   GET /api/cashbox/withdrawals
   Paginated withdrawal history with optional date range.
───────────────────────────────────────────────────────────── */
const getWithdrawals = async ({ dateFrom, dateTo, page = 1, limit = 50 }) => {
  const filter = {};
  if (dateFrom || dateTo) {
    filter.withdrawnAt = {};
    if (dateFrom) filter.withdrawnAt.$gte = new Date(dateFrom);
    if (dateTo) filter.withdrawnAt.$lte = new Date(dateTo);
  }
  const skip = (Number(page) - 1) * Number(limit);

  const [withdrawals, total] = await Promise.all([
    CashWithdrawal.find(filter)
      .populate('withdrawnBy', 'fullName username')
      .sort('-withdrawnAt')
      .skip(skip)
      .limit(Number(limit)),
    CashWithdrawal.countDocuments(filter),
  ]);

  return { withdrawals, total, page: Number(page), limit: Number(limit) };
};

/* ─────────────────────────────────────────────────────────────
   Add card amount from a card sale.
   Called from sale.service after a card sale is created.
───────────────────────────────────────────────────────────── */
const addCardFromSale = async (amount, saleId, userId) => {
  const cashbox = await Cashbox.getOrCreate();
  const balanceBefore = cashbox.cardBalance;
  cashbox.cardBalance += amount;
  await cashbox.save();

  await CashboxTransaction.create({
    type: 'card_sale',
    amount,
    balanceBefore,
    balanceAfter: cashbox.cardBalance,
    relatedSale: saleId,
    createdBy: userId,
    note: 'Card sale',
  });

  return cashbox;
};

/* ─────────────────────────────────────────────────────────────
   Add card amount from a debt repayment paid by card.
───────────────────────────────────────────────────────────── */
const addCardFromDebtRepayment = async (amount, debtTransactionId, userId) => {
  const cashbox = await Cashbox.getOrCreate();
  const balanceBefore = cashbox.cardBalance;
  cashbox.cardBalance += amount;
  await cashbox.save();

  await CashboxTransaction.create({
    type: 'card_debt_repayment',
    amount,
    balanceBefore,
    balanceAfter: cashbox.cardBalance,
    relatedDebtTransaction: debtTransactionId,
    createdBy: userId,
    note: 'Debt repayment (card)',
  });

  const todayLog = await _ensureTodayLog();
  todayLog.totalDebtRepayments = (todayLog.totalDebtRepayments || 0) + amount;
  await todayLog.save();

  return cashbox;
};

/* ─────────────────────────────────────────────────────────────
   Withdraw from card balance (admin only).
───────────────────────────────────────────────────────────── */
const withdrawCard = async (amount, note, userId) => {
  const cashbox = await Cashbox.getOrCreate();

  if (amount > cashbox.cardBalance) {
    throw new AppError(
      `Insufficient card balance. Available: ${cashbox.cardBalance}, requested: ${amount}`,
      400
    );
  }

  const balanceBefore = cashbox.cardBalance;
  cashbox.cardBalance -= amount;
  await cashbox.save();

  const withdrawal = await CardWithdrawal.create({
    amount,
    note: note || undefined,
    withdrawnBy: userId,
    withdrawnAt: new Date(),
    balanceBefore,
    balanceAfter: cashbox.cardBalance,
  });

  await CashboxTransaction.create({
    type: 'card_withdrawal',
    amount,
    balanceBefore,
    balanceAfter: cashbox.cardBalance,
    relatedCardWithdrawal: withdrawal._id,
    createdBy: userId,
    note: note || 'Card withdrawal',
  });

  const todayLog = await _ensureTodayLog();
  todayLog.cardTakenOut = (todayLog.cardTakenOut || 0) + amount;
  await todayLog.save();

  return { cashbox, withdrawal };
};

/* ─────────────────────────────────────────────────────────────
   GET /api/cashbox/card-withdrawals
   Paginated card withdrawal history with optional date range.
───────────────────────────────────────────────────────────── */
const getCardWithdrawals = async ({ dateFrom, dateTo, page = 1, limit = 50 }) => {
  const filter = {};
  if (dateFrom || dateTo) {
    filter.withdrawnAt = {};
    if (dateFrom) filter.withdrawnAt.$gte = new Date(dateFrom);
    if (dateTo) filter.withdrawnAt.$lte = new Date(dateTo);
  }
  const skip = (Number(page) - 1) * Number(limit);

  const [withdrawals, total] = await Promise.all([
    CardWithdrawal.find(filter)
      .populate('withdrawnBy', 'fullName username')
      .sort('-withdrawnAt')
      .skip(skip)
      .limit(Number(limit)),
    CardWithdrawal.countDocuments(filter),
  ]);

  return { withdrawals, total, page: Number(page), limit: Number(limit) };
};

module.exports = {
  addCashFromSale,
  addCashFromDebtRepayment,
  addCardFromSale,
  addCardFromDebtRepayment,
  withdraw,
  withdrawCard,
  getSummary,
  getTransactions,
  getWithdrawals,
  getCardWithdrawals,
};
