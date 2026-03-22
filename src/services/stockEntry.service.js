'use strict';

const Product = require('../models/Product');
const StockEntry = require('../models/StockEntry');
const AppError = require('../utils/AppError');

/**
 * Create a stock entry and update product inventory using WAC.
 *
 * WAC update:
 *   newTotalValue = currentTotalValue + totalCost
 *   newStock      = currentStock + addedStock
 *   newAvgCost    = newTotalValue / newStock
 */
const addStock = async (data, userId) => {
  const product = await Product.findById(data.productId);
  if (!product) throw new AppError('Product not found', 404);
  if (!product.isActive) throw new AppError('Cannot add stock to an archived product', 400);

  // Validate that required fields are supplied for the product type
  if (product.type === 'unit' && !data.quantityAdded) {
    throw new AppError('quantityAdded is required for unit products', 400);
  }
  if (product.type === 'weight' && !data.weightKgAdded && !data.bagsAdded) {
    throw new AppError('weightKgAdded or bagsAdded is required for weight products', 400);
  }

  // ── Resolve actual kg added ────────────────────────────────
  let kgAdded = data.weightKgAdded || 0;
  let bagsAdded = data.bagsAdded || 0;

  if (product.type === 'weight' && bagsAdded > 0) {
    const kgPerBag = data.kgPerBag || product.kgPerBag;
    if (!kgPerBag) throw new AppError('kgPerBag is required when adding bags', 400);
    kgAdded += bagsAdded * kgPerBag;

    if (data.kgPerBag) product.kgPerBag = data.kgPerBag;
  }

  // ── Compute totals ─────────────────────────────────────────
  const addedStock = product.type === 'unit' ? data.quantityAdded : kgAdded;
  const unitCost = data.unitCostPrice;
  const totalCost = data.totalCost != null ? data.totalCost : unitCost * addedStock;

  // ── WAC update ────────────────────────────────────────────
  const currentValue = product.totalStockValue;
  const currentStock =
    product.type === 'unit' ? product.stockQuantity : product.stockWeightKg;

  const newTotalValue = currentValue + totalCost;
  const newStock = currentStock + addedStock;
  const newAvgCost = newStock > 0 ? newTotalValue / newStock : 0;

  // ── Apply to product ──────────────────────────────────────
  if (product.type === 'unit') {
    product.stockQuantity = newStock;
  } else {
    product.stockWeightKg = newStock;
    product.bagsCount = (product.bagsCount || 0) + bagsAdded;
  }
  product.totalStockValue = newTotalValue;
  product.averageCostPrice = newAvgCost;

  // ── Update sale price if provided ─────────────────────────
  const salePriceBefore = product.salePrice;
  const bagSalePriceBefore = product.bagSalePrice;

  if (data.newSalePrice != null && data.newSalePrice > 0) {
    product.salePrice = data.newSalePrice;
  }
  if (data.newBagSalePrice != null && data.newBagSalePrice > 0) {
    product.bagSalePrice = data.newBagSalePrice;
  }

  await product.save();

  // ── Create entry record ───────────────────────────────────
  const entry = await StockEntry.create({
    product: product._id,
    entryType: data.entryType || 'purchase',
    quantityAdded: data.quantityAdded || 0,
    weightKgAdded: kgAdded,
    bagsAdded,
    kgPerBagSnapshot: product.kgPerBag || 0,
    unitCostPrice: unitCost,
    totalCost,
    salePriceBefore,
    salePriceAfter: product.salePrice,
    bagSalePriceBefore,
    bagSalePriceAfter: product.bagSalePrice,
    stockAfter: newStock,
    stockValueAfter: newTotalValue,
    date: data.date || new Date(),
    supplier: data.supplier,
    note: data.note,
    createdBy: userId,
  });

  return { entry, product };
};

const list = async (query = {}) => {
  const { productId, page = 1, limit = 50, sort = '-date' } = query;
  const filter = productId ? { product: productId } : {};
  const skip = (Number(page) - 1) * Number(limit);

  const [entries, total] = await Promise.all([
    StockEntry.find(filter)
      .populate('product', 'name sku type unitLabel')
      .populate('createdBy', 'fullName username')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    StockEntry.countDocuments(filter),
  ]);

  return { entries, total, page: Number(page), limit: Number(limit) };
};

const getById = async (id) => {
  const entry = await StockEntry.findById(id)
    .populate('product', 'name sku type unitLabel')
    .populate('createdBy', 'fullName username');
  if (!entry) throw new AppError('Stock entry not found', 404);
  return entry;
};

module.exports = { addStock, list, getById };
