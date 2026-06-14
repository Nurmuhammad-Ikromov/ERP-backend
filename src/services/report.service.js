'use strict';

const Sale = require('../models/Sale');
const Product = require('../models/Product');
const DebtAccount = require('../models/DebtAccount');
const DebtTransaction = require('../models/DebtTransaction');
const DailyCashLog = require('../models/DailyCashLog');
const Cashbox = require('../models/Cashbox');
const { dayBounds, monthBounds, yearBounds, toDateString } = require('../utils/dateUtils');
const {
  buildCardPaidExpr,
  buildCashPaidExpr,
  buildDebtAmountExpr,
} = require('../utils/salePayment');

const repaymentsByPeriod = async (dateFilter) => {
  const [result] = await DebtTransaction.aggregate([
    { $match: { type: 'payment', ...dateFilter } },
    {
      $group: {
        _id: null,
        totalRepayments: { $sum: '$amount' },
        cashRepayments: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$amount', 0] },
        },
        cardRepayments: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$amount', 0] },
        },
        count: { $sum: 1 },
      },
    },
  ]);
  return result || { totalRepayments: 0, cashRepayments: 0, cardRepayments: 0, count: 0 };
};

/* ── Dashboard ─────────────────────────────────────────────── */
const dashboard = async () => {
  const { start, end } = dayBounds();

  const [
    todaySales,
    totalInventoryValue,
    debtSummary,
    lowStockProducts,
    topSellingToday,
    salesBySellerToday,
    todayCashLog,
    cashbox,
  ] = await Promise.all([
    // Today's sales totals broken down by payment type
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          totalProfit: { $sum: '$totalProfit' },
          cash: { $sum: buildCashPaidExpr() },
          card: { $sum: buildCardPaidExpr() },
          debt: { $sum: buildDebtAmountExpr() },
          count: { $sum: 1 },
        },
      },
    ]),

    // Total inventory value
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, totalValue: { $sum: '$totalStockValue' } } },
    ]),

    // Debt summary
    DebtAccount.aggregate([
      { $match: { balance: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$balance' },
          count: { $sum: 1 },
        },
      },
    ]),

    // Low stock products (below threshold)
    Product.find({
      isActive: true,
      $or: [
        { type: 'unit', $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] } },
        { type: 'weight', $expr: { $lte: ['$stockWeightKg', '$lowStockThreshold'] } },
      ],
    })
      .select('name type stockQuantity stockWeightKg lowStockThreshold unitLabel')
      .limit(10),

    // Top 5 selling products today by lineTotal
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.productNameSnapshot' },
          totalRevenue: { $sum: '$items.lineTotal' },
          totalProfit: { $sum: '$items.profitSnapshot' },
          totalQty: { $sum: '$items.quantity' },
          totalKg: { $sum: '$items.weightKg' },
        },
      },
      { $sort: { totalProfit: -1 } },
      { $limit: 5 },
    ]),

    // Sales by seller today
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$seller',
          totalSales: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'seller',
        },
      },
      { $unwind: { path: '$seller', preserveNullAndEmpty: true } },
      {
        $project: {
          sellerName: '$seller.fullName',
          totalSales: 1,
          count: 1,
        },
      },
    ]),

    // Today's cash log
    DailyCashLog.findOne({ dateKey: toDateString() }),

    // Current cashbox balance
    Cashbox.findOne(),
  ]);

  return {
    today: {
      sales: todaySales[0] || { total: 0, totalProfit: 0, cash: 0, card: 0, debt: 0, count: 0 },
      cashLog: todayCashLog,
    },
    cashbox: {
      currentBalance: cashbox?.currentBalance ?? 0,
    },
    inventory: {
      totalValue: totalInventoryValue[0]?.totalValue || 0,
      lowStockProducts,
    },
    debts: debtSummary[0] || { totalOutstanding: 0, count: 0 },
    topSellingToday,
    salesBySellerToday,
  };
};

/* ── Inventory report ──────────────────────────────────────── */
const inventory = async () => {
  const rawProducts = await Product.find({ isActive: true })
    .select(
      'name sku barcode type category unitLabel salePrice bagSalePrice hasBags averageCostPrice stockQuantity stockWeightKg bagsCount kgPerBag totalStockValue lowStockThreshold'
    )
    .sort('name')
    .lean();

  // Calculate sale value per product:
  // - unit: stockQuantity × salePrice
  // - weight with bags: bagsCount × bagSalePrice + remainingKg × salePrice
  // - weight without bags: stockWeightKg × salePrice
  const products = rawProducts.map((p) => {
    let totalSaleValue = 0;
    if (p.type === 'unit') {
      totalSaleValue = (p.stockQuantity || 0) * (p.salePrice || 0);
    } else {
      const hasBagPrice = p.hasBags && p.bagsCount > 0 && p.kgPerBag > 0 && p.bagSalePrice > 0;
      if (hasBagPrice) {
        const bagKg = p.bagsCount * p.kgPerBag;
        const remainingKg = Math.max(0, (p.stockWeightKg || 0) - bagKg);
        totalSaleValue = p.bagsCount * p.bagSalePrice + remainingKg * (p.salePrice || 0);
      } else {
        totalSaleValue = (p.stockWeightKg || 0) * (p.salePrice || 0);
      }
    }
    return { ...p, totalSaleValue };
  });

  const totalInventoryValue = products.reduce((s, p) => s + (p.totalStockValue || 0), 0);
  const totalSaleValue = products.reduce((s, p) => s + p.totalSaleValue, 0);
  const totalProducts = products.length;

  return {
    products,
    totals: { totalInventoryValue, totalSaleValue, totalProducts },
  };
};

/* ── Sales by product ──────────────────────────────────────── */
const salesByProduct = async ({ dateFrom, dateTo }) => {
  const match = {};
  if (dateFrom || dateTo) {
    match.saleDate = {};
    if (dateFrom) match.saleDate.$gte = new Date(dateFrom);
    if (dateTo) match.saleDate.$lte = new Date(dateTo);
  }

  const data = await Sale.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.productNameSnapshot' },
        totalRevenue: { $sum: '$items.lineTotal' },
        totalCost: {
          $sum: {
            $multiply: [
              '$items.costPriceSnapshot',
              { $add: ['$items.quantity', '$items.weightKg'] },
            ],
          },
        },
        totalProfit: { $sum: '$items.profitSnapshot' },
        totalQty: { $sum: '$items.quantity' },
        totalKg: { $sum: '$items.weightKg' },
        saleCount: { $sum: 1 },
      },
    },
    {
      $addFields: {
        profitMargin: {
          $cond: [
            { $gt: ['$totalRevenue', 0] },
            { $multiply: [{ $divide: ['$totalProfit', '$totalRevenue'] }, 100] },
            0,
          ],
        },
      },
    },
    { $sort: { totalProfit: -1 } },
  ]);

  return data;
};

/* ── Sales by seller ───────────────────────────────────────── */
const salesBySeller = async ({ dateFrom, dateTo }) => {
  const match = {};
  if (dateFrom || dateTo) {
    match.saleDate = {};
    if (dateFrom) match.saleDate.$gte = new Date(dateFrom);
    if (dateTo) match.saleDate.$lte = new Date(dateTo);
  }

  const data = await Sale.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$seller',
        totalSales: { $sum: '$total' },
        totalCash: { $sum: buildCashPaidExpr() },
        totalCard: { $sum: buildCardPaidExpr() },
        totalDebt: { $sum: buildDebtAmountExpr() },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'sellerInfo',
      },
    },
    { $unwind: { path: '$sellerInfo', preserveNullAndEmpty: true } },
    {
      $project: {
        sellerName: '$sellerInfo.fullName',
        sellerUsername: '$sellerInfo.username',
        totalSales: 1,
        totalCash: 1,
        totalCard: 1,
        totalDebt: 1,
        count: 1,
      },
    },
    { $sort: { totalSales: -1 } },
  ]);

  return data;
};

/* ── Debt report ────────────────────────────────────────────── */
const debtsReport = async () => {
  const [accounts, totals] = await Promise.all([
    DebtAccount.find({ balance: { $gt: 0 } }).sort('-balance'),
    DebtAccount.aggregate([
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$balance' },
          totalDebt: { $sum: '$totalDebt' },
          totalPaid: { $sum: '$totalPaid' },
          debtorCount: {
            $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  return {
    accounts,
    totals: totals[0] || {
      totalOutstanding: 0,
      totalDebt: 0,
      totalPaid: 0,
      debtorCount: 0,
    },
  };
};

/* ── Daily report ───────────────────────────────────────────── */
const dailyReport = async (date) => {
  const { start, end } = dayBounds(date);
  const dateKey = toDateString(date);

  const [saleSummary, cashLog, itemsSold, repayments] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalProfit: { $sum: '$totalProfit' },
          cash: { $sum: buildCashPaidExpr() },
          card: { $sum: buildCardPaidExpr() },
          debt: { $sum: buildDebtAmountExpr() },
          count: { $sum: 1 },
        },
      },
    ]),
    DailyCashLog.findOne({ dateKey }),
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.productNameSnapshot' },
          totalRevenue: { $sum: '$items.lineTotal' },
          totalCost: {
            $sum: {
              $multiply: [
                '$items.costPriceSnapshot',
                { $add: ['$items.quantity', '$items.weightKg'] },
              ],
            },
          },
          totalProfit: { $sum: '$items.profitSnapshot' },
          totalQty: { $sum: '$items.quantity' },
          totalKg: { $sum: '$items.weightKg' },
        },
      },
      { $sort: { totalProfit: -1 } },
    ]),
    repaymentsByPeriod({ date: { $gte: start, $lte: end } }),
  ]);

  const summary = saleSummary[0] || {
    totalSales: 0,
    totalProfit: 0,
    cash: 0,
    card: 0,
    debt: 0,
    count: 0,
  };

  return { date: dateKey, summary, cashLog, itemsSold, repayments };
};

/* ── Monthly report ─────────────────────────────────────────── */
const monthlyReport = async (year, month) => {
  const { start, end } = monthBounds(year, month);

  const [data, repayments] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
          totalSales: { $sum: '$total' },
          totalProfit: { $sum: '$totalProfit' },
          cash: { $sum: buildCashPaidExpr() },
          card: { $sum: buildCardPaidExpr() },
          debt: { $sum: buildDebtAmountExpr() },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    repaymentsByPeriod({ date: { $gte: start, $lte: end } }),
  ]);

  const totals = data.reduce(
    (acc, d) => ({
      totalSales: acc.totalSales + d.totalSales,
      totalProfit: acc.totalProfit + d.totalProfit,
      cash: acc.cash + d.cash,
      card: acc.card + d.card,
      debt: acc.debt + d.debt,
      count: acc.count + d.count,
    }),
    { totalSales: 0, totalProfit: 0, cash: 0, card: 0, debt: 0, count: 0 }
  );

  return { year, month, byDay: data, totals, repayments };
};

/* ── Yearly report ──────────────────────────────────────────── */
const yearlyReport = async (year) => {
  const { start, end } = yearBounds(year);

  const [data, repayments] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $month: '$saleDate' },
          totalSales: { $sum: '$total' },
          totalProfit: { $sum: '$totalProfit' },
          cash: { $sum: buildCashPaidExpr() },
          card: { $sum: buildCardPaidExpr() },
          debt: { $sum: buildDebtAmountExpr() },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    repaymentsByPeriod({ date: { $gte: start, $lte: end } }),
  ]);

  const totals = data.reduce(
    (acc, d) => ({
      totalSales: acc.totalSales + d.totalSales,
      totalProfit: acc.totalProfit + d.totalProfit,
      cash: acc.cash + d.cash,
      card: acc.card + d.card,
      debt: acc.debt + d.debt,
      count: acc.count + d.count,
    }),
    { totalSales: 0, totalProfit: 0, cash: 0, card: 0, debt: 0, count: 0 }
  );

  return { year, byMonth: data, totals, repayments };
};

/* ── Profit by product ──────────────────────────────────────── */
const profitByProduct = async ({ dateFrom, dateTo, limit = 0 }) => {
  const match = {};
  if (dateFrom || dateTo) {
    match.saleDate = {};
    if (dateFrom) match.saleDate.$gte = new Date(dateFrom);
    if (dateTo) match.saleDate.$lte = new Date(dateTo);
  }

  const pipeline = [
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.productNameSnapshot' },
        totalRevenue: { $sum: '$items.lineTotal' },
        totalCost: {
          $sum: {
            $multiply: [
              '$items.costPriceSnapshot',
              { $add: ['$items.quantity', '$items.weightKg'] },
            ],
          },
        },
        totalProfit: { $sum: '$items.profitSnapshot' },
        totalQty: { $sum: '$items.quantity' },
        totalKg: { $sum: '$items.weightKg' },
        totalBags: { $sum: '$items.bagsCount' },
        saleCount: { $sum: 1 },
      },
    },
    {
      $addFields: {
        profitMargin: {
          $cond: [
            { $gt: ['$totalRevenue', 0] },
            { $round: [{ $multiply: [{ $divide: ['$totalProfit', '$totalRevenue'] }, 100] }, 2] },
            0,
          ],
        },
      },
    },
    { $sort: { totalProfit: -1 } },
  ];

  if (limit > 0) pipeline.push({ $limit: Number(limit) });

  const data = await Sale.aggregate(pipeline);

  const totals = data.reduce(
    (acc, d) => ({
      totalRevenue: acc.totalRevenue + d.totalRevenue,
      totalCost: acc.totalCost + d.totalCost,
      totalProfit: acc.totalProfit + d.totalProfit,
    }),
    { totalRevenue: 0, totalCost: 0, totalProfit: 0 }
  );
  totals.profitMargin =
    totals.totalRevenue > 0
      ? +((totals.totalProfit / totals.totalRevenue) * 100).toFixed(2)
      : 0;

  return { products: data, totals };
};

/* ── Top profitable products ────────────────────────────────── */
const topProfitableProducts = async ({ dateFrom, dateTo, limit = 10 }) => {
  return profitByProduct({ dateFrom, dateTo, limit });
};

const lowStock = async () => {
  const products = await Product.find({
    isActive: true,
    lowStockThreshold: { $gt: 0 },
    $or: [
      { type: 'unit', $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] } },
      { type: 'weight', $expr: { $lte: ['$stockWeightKg', '$lowStockThreshold'] } },
    ],
  })
    .select('name sku barcode type category unitLabel salePrice stockQuantity stockWeightKg bagsCount kgPerBag lowStockThreshold')
    .sort('name');

  return { products, total: products.length };
};

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
