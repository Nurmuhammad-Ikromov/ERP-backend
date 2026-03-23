'use strict';

const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Counter = require('../models/Counter');
const DebtAccount = require('../models/DebtAccount');
const DebtTransaction = require('../models/DebtTransaction');
const DailyCashLog = require('../models/DailyCashLog');
const cashboxService = require('./cashbox.service');
const AppError = require('../utils/AppError');
const { dayBounds, toDateString } = require('../utils/dateUtils');

/* ────────────────────────────────────────────────────────────
   Internal helper: resolve one sale item line against product
   and compute stock deduction amounts.

   Returns:
   {
     builtItem,        — the SaleItem object to embed in Sale
     stockDeduction,   — { field, amount } to apply to product
     costDeducted      — value to subtract from totalStockValue
   }
────────────────────────────────────────────────────────────── */
const resolveItem = (product, raw) => {
  const avgCost = product.averageCostPrice || 0;

  if (product.type === 'unit') {
    // Case A — unit product sale
    if (!raw.quantity || raw.quantity <= 0) {
      throw new AppError(`quantity required for unit product "${product.name}"`, 400);
    }
    if (product.stockQuantity < raw.quantity) {
      throw new AppError(
        `Insufficient stock for "${product.name}": available ${product.stockQuantity}, requested ${raw.quantity}`,
        400
      );
    }
    const unitPrice = raw.unitPrice ?? product.salePrice;
    const lineTotal = raw.lineTotal ?? unitPrice * raw.quantity;

    const totalCost = avgCost * raw.quantity;
    return {
      builtItem: {
        product: product._id,
        productNameSnapshot: product.name,
        productTypeSnapshot: 'unit',
        quantity: raw.quantity,
        weightKg: 0,
        bagsCount: 0,
        unitPrice,
        costPriceSnapshot: avgCost,
        lineTotal,
        profitSnapshot: lineTotal - totalCost,
      },
      stockDeduction: { field: 'stockQuantity', amount: raw.quantity },
      costDeducted: totalCost,
    };
  }

  // ── Weight product ─────────────────────────────────────────
  if (product.type === 'weight') {
    let weightKg = 0;
    let bagsCount = 0;
    let lineTotal = 0;
    let unitPrice = raw.unitPrice ?? product.salePrice;

    // Case D — bag sale
    if (raw.bagsCount && raw.bagsCount > 0) {
      if (!product.kgPerBag) {
        throw new AppError(`Product "${product.name}" does not have kgPerBag set`, 400);
      }
      if (product.bagsCount < raw.bagsCount) {
        throw new AppError(
          `Insufficient bags for "${product.name}": available ${product.bagsCount}, requested ${raw.bagsCount}`,
          400
        );
      }
      bagsCount = raw.bagsCount;
      weightKg = raw.bagsCount * product.kgPerBag;

      // If product has a discounted bag price, apply it per bag
      if (product.hasBags && product.bagSalePrice > 0) {
        unitPrice = raw.unitPrice ?? product.bagSalePrice; // price per bag
        lineTotal = raw.lineTotal ?? unitPrice * bagsCount;
      } else {
        // No special bag price: fall back to per-kg price × total kg
        lineTotal = raw.lineTotal ?? unitPrice * weightKg;
      }
    }
    // Case C — sale by money amount (backend computes kg)
    else if (raw.amountMoney && raw.amountMoney > 0) {
      if (!unitPrice || unitPrice <= 0) {
        throw new AppError(`salePrice for "${product.name}" must be > 0 for amount-based sale`, 400);
      }
      weightKg = raw.amountMoney / unitPrice;
      lineTotal = raw.amountMoney; // line total IS the money amount
    }
    // Case B — sale by explicit kg
    else if (raw.weightKg && raw.weightKg > 0) {
      weightKg = raw.weightKg;
      lineTotal = raw.lineTotal ?? unitPrice * weightKg;
    } else {
      throw new AppError(
        `For weight product "${product.name}", provide weightKg, amountMoney, or bagsCount`,
        400
      );
    }

    if (product.stockWeightKg < weightKg) {
      throw new AppError(
        `Insufficient stock for "${product.name}": available ${product.stockWeightKg} kg, requested ${weightKg.toFixed(3)} kg`,
        400
      );
    }

    const totalCost = avgCost * weightKg;
    return {
      builtItem: {
        product: product._id,
        productNameSnapshot: product.name,
        productTypeSnapshot: 'weight',
        quantity: 0,
        weightKg,
        bagsCount,
        unitPrice,
        costPriceSnapshot: avgCost,
        lineTotal,
        profitSnapshot: lineTotal - totalCost,
      },
      stockDeduction: { field: 'stockWeightKg', amount: weightKg },
      bagsDeduction: bagsCount,
      costDeducted: totalCost,
    };
  }

  throw new AppError(`Unknown product type for "${product.name}"`, 500);
};

/* ────────────────────────────────────────────────────────────
   Ensure today's DailyCashLog exists (creates it if missing).
   Also handles carry-over from the previous day.
────────────────────────────────────────────────────────────── */
const ensureTodayLog = async () => {
  const todayKey = toDateString();
  let log = await DailyCashLog.findOne({ dateKey: todayKey });

  if (!log) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const prevLog = await DailyCashLog.findOne({ dateKey: toDateString(yesterday) });

    const carry = prevLog ? prevLog.closingRemaining : 0;

    log = await DailyCashLog.create({
      dateKey: todayKey,
      date: new Date(),
      openingCarryAmount: carry,
    });
  }

  return log;
};

/* ────────────────────────────────────────────────────────────
   Main sale creation
────────────────────────────────────────────────────────────── */
const createSale = async (data, sellerId) => {
  const {
    items: rawItems,
    paymentType,
    currency = 'UZS',
    customerName,
    customerPhone,
    paidAmount = 0,
    note,
    saleDate,
  } = data;

  // ── Validate debt fields ──────────────────────────────────
  if (paymentType === 'debt') {
    if (!customerName || !customerPhone) {
      throw new AppError('customerName and customerPhone are required for debt sales', 400);
    }
  }

  // ── Resolve each item ─────────────────────────────────────
  const productIds = rawItems.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });

  const productMap = {};
  for (const p of products) productMap[p._id.toString()] = p;

  const builtItems = [];
  const deductions = [];

  for (const raw of rawItems) {
    const product = productMap[raw.productId];
    if (!product) throw new AppError(`Product ${raw.productId} not found or inactive`, 404);

    const { builtItem, stockDeduction, bagsDeduction = 0, costDeducted } = resolveItem(
      product,
      raw
    );
    builtItems.push(builtItem);
    deductions.push({ product, stockDeduction, bagsDeduction, costDeducted });
  }

  // ── Compute totals ─────────────────────────────────────────
  const subtotal = builtItems.reduce((s, i) => s + i.lineTotal, 0);
  const total = subtotal;
  const totalProfit = builtItems.reduce((s, i) => s + i.profitSnapshot, 0);

  // cash and card are fully paid; debt is fully owed
  const paid = (paymentType === 'cash' || paymentType === 'card') ? total : paidAmount;
  const debtAmount = paymentType === 'debt' ? total : 0;

  // ── Apply stock deductions to products ────────────────────
  for (const { product, stockDeduction, bagsDeduction, costDeducted } of deductions) {
    product[stockDeduction.field] -= stockDeduction.amount;
    product.totalStockValue = Math.max(0, product.totalStockValue - costDeducted);

    const currentStock =
      product.type === 'unit' ? product.stockQuantity : product.stockWeightKg;
    product.averageCostPrice =
      currentStock > 0 ? product.totalStockValue / currentStock : product.averageCostPrice;

    // Update bagsCount: if bags were explicitly sold use deduction,
    // otherwise recalculate from remaining stockWeightKg
    if (product.type === 'weight' && product.kgPerBag > 0) {
      if (bagsDeduction > 0) {
        product.bagsCount = Math.max(0, product.bagsCount - bagsDeduction);
      } else {
        product.bagsCount = Math.floor(product.stockWeightKg / product.kgPerBag);
      }
    }

    await product.save();
  }

  // ── Handle debt account if needed ─────────────────────────
  let debtAccountId = null;
  if (debtAmount > 0) {
    let debtAccount = await DebtAccount.findOne({ customerPhone });
    if (!debtAccount) {
      debtAccount = await DebtAccount.create({ customerName, customerPhone, currency });
    }
    debtAccount.totalDebt += debtAmount;
    debtAccount.balance += debtAmount;
    await debtAccount.save();
    debtAccountId = debtAccount._id;
  }

  // ── Generate receipt number ────────────────────────────────
  const seq = await Counter.nextSeq('receipt');
  const receiptNumber = `CHK-${String(seq).padStart(6, '0')}`;

  // ── Create sale record ─────────────────────────────────────
  const sale = await Sale.create({
    seller: sellerId,
    customerName,
    customerPhone,
    paymentType,
    currency,
    items: builtItems,
    subtotal,
    total,
    totalProfit,
    paidAmount: paid,
    debtAmount,
    debtAccount: debtAccountId,
    receiptNumber,
    note,
    saleDate: saleDate || new Date(),
  });

  // ── Create debt transaction if debt exists ────────────────
  if (debtAmount > 0 && debtAccountId) {
    const debtAccount = await DebtAccount.findById(debtAccountId);
    await DebtTransaction.create({
      debtAccount: debtAccountId,
      sale: sale._id,
      type: 'created',
      amount: debtAmount,
      balanceAfter: debtAccount.balance,
      note: `Sale on ${paymentType}`,
      createdBy: sellerId,
    });
  }

  // ── Update today's cash log ────────────────────────────────
  const todayLog = await ensureTodayLog();
  if (paymentType === 'cash') {
    todayLog.totalCashSales += total;
  } else if (paymentType === 'card') {
    todayLog.totalCardSales += total;
  } else if (paymentType === 'debt') {
    todayLog.totalDebtSales += total;
  }
  await todayLog.save();

  // ── Update cashbox balance (cash sales only) ──────────────
  if (paymentType === 'cash') {
    await cashboxService.addCashFromSale(total, sale._id, sellerId);
  } else if (paymentType === 'card') {
    await cashboxService.addCardFromSale(total, sale._id, sellerId);
  }

  await sale.populate('seller', 'fullName username');
  return sale;
};

const list = async (query = {}) => {
  const { page = 1, limit = 50, sort = '-saleDate', paymentType, sellerId, dateFrom, dateTo } = query;
  const filter = {};
  if (paymentType) filter.paymentType = paymentType;
  if (sellerId) filter.seller = sellerId;
  if (dateFrom || dateTo) {
    filter.saleDate = {};
    if (dateFrom) filter.saleDate.$gte = new Date(dateFrom);
    if (dateTo) filter.saleDate.$lte = new Date(dateTo);
  }
  const skip = (Number(page) - 1) * Number(limit);

  const [sales, total] = await Promise.all([
    Sale.find(filter)
      .populate('seller', 'fullName username')
      .populate('debtAccount', 'customerName customerPhone balance')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    Sale.countDocuments(filter),
  ]);

  return { sales, total, page: Number(page), limit: Number(limit) };
};

const getById = async (id) => {
  const sale = await Sale.findById(id)
    .populate('seller', 'fullName username')
    .populate('debtAccount')
    .populate('items.product', 'name sku type');
  if (!sale) throw new AppError('Sale not found', 404);
  return sale;
};

const dailySummary = async (date) => {
  const { start, end } = dayBounds(date);
  const [result] = await Sale.aggregate([
    { $match: { saleDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
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
  ]);
  return result || { totalSales: 0, totalCash: 0, totalCard: 0, totalDebt: 0, count: 0 };
};

const monthlySummary = async (year, month) => {
  const { start, end } = require('../utils/dateUtils').monthBounds(year, month);
  const pipeline = [
    { $match: { saleDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
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
    { $sort: { _id: 1 } },
  ];
  const data = await Sale.aggregate(pipeline);
  const totals = data.reduce(
    (acc, d) => ({
      totalSales: acc.totalSales + d.totalSales,
      totalCash: acc.totalCash + d.totalCash,
      totalCard: acc.totalCard + d.totalCard,
      totalDebt: acc.totalDebt + d.totalDebt,
      count: acc.count + d.count,
    }),
    { totalSales: 0, totalCash: 0, totalCard: 0, totalDebt: 0, count: 0 }
  );
  return { byDay: data, totals };
};

const yearlySummary = async (year) => {
  const { start, end } = require('../utils/dateUtils').yearBounds(year);
  const pipeline = [
    { $match: { saleDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $month: '$saleDate' },
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
    { $sort: { _id: 1 } },
  ];
  const data = await Sale.aggregate(pipeline);
  const totals = data.reduce(
    (acc, d) => ({
      totalSales: acc.totalSales + d.totalSales,
      totalCash: acc.totalCash + d.totalCash,
      totalCard: acc.totalCard + d.totalCard,
      totalDebt: acc.totalDebt + d.totalDebt,
      count: acc.count + d.count,
    }),
    { totalSales: 0, totalCash: 0, totalCard: 0, totalDebt: 0, count: 0 }
  );
  return { byMonth: data, totals };
};

module.exports = { createSale, list, getById, dailySummary, monthlySummary, yearlySummary };
