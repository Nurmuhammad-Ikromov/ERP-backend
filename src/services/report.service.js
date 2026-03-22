'use strict';

const Sale = require('../models/Sale');
const Product = require('../models/Product');
const DebtAccount = require('../models/DebtAccount');
const DailyCashLog = require('../models/DailyCashLog');
const Cashbox = require('../models/Cashbox');
const { dayBounds, monthBounds, yearBounds, toDateString } = require('../utils/dateUtils');

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
          cash: {
            $sum: { $cond: [{ $eq: ['$paymentType', 'cash'] }, '$total', 0] },
          },
          card: {
            $sum: { $cond: [{ $eq: ['$paymentType', 'card'] }, '$total', 0] },
          },
          debt: {
            $sum: { $cond: [{ $eq: ['$paymentType', 'debt'] }, '$total', 0] },
          },
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
  const products = await Product.find({ isActive: true })
    .select(
      'name sku barcode type category unitLabel salePrice averageCostPrice stockQuantity stockWeightKg bagsCount kgPerBag totalStockValue lowStockThreshold'
    )
    .sort('name');

  const [totals] = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalInventoryValue: { $sum: '$totalStockValue' },
        totalProducts: { $sum: 1 },
      },
    },
  ]);

  return {
    products,
    totals: totals || { totalInventoryValue: 0, totalProducts: 0 },
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
        totalCash: {
          $sum: { $cond: [{ $eq: ['$paymentType', 'cash'] }, '$total', 0] },
        },
        totalCard: {
          $sum: { $cond: [{ $eq: ['$paymentType', 'card'] }, '$total', 0] },
        },
        totalDebt: {
          $sum: { $cond: [{ $eq: ['$paymentType', 'debt'] }, '$total', 0] },
        },
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

  const [saleSummary, cashLog, itemsSold] = await Promise.all([
    Sale.aggregate([
      { $match: { saleDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$paymentType',
          total: { $sum: '$total' },
          profit: { $sum: '$totalProfit' },
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
  ]);

  const summary = { totalSales: 0, totalProfit: 0, cash: 0, card: 0, debt: 0, count: 0 };
  for (const row of saleSummary) {
    summary.totalSales += row.total;
    summary.totalProfit += row.profit;
    if (row._id === 'cash') summary.cash += row.total;
    else if (row._id === 'card') summary.card += row.total;
    else if (row._id === 'debt') summary.debt += row.total;
    summary.count += row.count;
  }

  return { date: dateKey, summary, cashLog, itemsSold };
};

/* ── Monthly report ─────────────────────────────────────────── */
const monthlyReport = async (year, month) => {
  const { start, end } = monthBounds(year, month);

  const data = await Sale.aggregate([
    { $match: { saleDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        totalSales: { $sum: '$total' },
        totalProfit: { $sum: '$totalProfit' },
        cash: { $sum: { $cond: [{ $eq: ['$paymentType', 'cash'] }, '$total', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentType', 'card'] }, '$total', 0] } },
        debt: { $sum: { $cond: [{ $eq: ['$paymentType', 'debt'] }, '$total', 0] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
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

  return { year, month, byDay: data, totals };
};

/* ── Yearly report ──────────────────────────────────────────── */
const yearlyReport = async (year) => {
  const { start, end } = yearBounds(year);

  const data = await Sale.aggregate([
    { $match: { saleDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $month: '$saleDate' },
        totalSales: { $sum: '$total' },
        totalProfit: { $sum: '$totalProfit' },
        cash: { $sum: { $cond: [{ $eq: ['$paymentType', 'cash'] }, '$total', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentType', 'card'] }, '$total', 0] } },
        debt: { $sum: { $cond: [{ $eq: ['$paymentType', 'debt'] }, '$total', 0] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
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

  return { year, byMonth: data, totals };
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
