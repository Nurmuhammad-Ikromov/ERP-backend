'use strict';

const Product = require('../models/Product');
const StockEntry = require('../models/StockEntry');
const AppError = require('../utils/AppError');

const buildFilter = ({ search, type, category, isActive }) => {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true' || isActive === true;
  if (type) filter.type = type;
  if (category) filter.category = new RegExp(category, 'i');
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
      { barcode: new RegExp(search, 'i') },
    ];
  }
  return filter;
};

// Returns { start, end } for the full day of a date string
const dayBounds = (dateStr) => {
  const d = new Date(dateStr);
  return {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0),
    end:   new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
  };
};

const list = async (query = {}) => {
  const { page = 1, limit = 50, sort = '-createdAt', date, ...filters } = query;
  const filter = buildFilter(filters);
  const skip = (Number(page) - 1) * Number(limit);

  // ── Date filter: restrict to products that had a StockEntry on that day ──
  let entryMap = null; // productId → { totalQty, totalKg, totalBags, totalCost }

  if (date) {
    const { start, end } = dayBounds(date);

    // Aggregate all stock entries for that day
    const entries = await StockEntry.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$product',
          totalQuantityAdded: { $sum: '$quantityAdded' },
          totalWeightKgAdded: { $sum: '$weightKgAdded' },
          totalBagsAdded:     { $sum: '$bagsAdded' },
          totalCost:          { $sum: '$totalCost' },
          entriesCount:       { $sum: 1 },
        },
      },
    ]);

    if (entries.length === 0) {
      return { products: [], total: 0, page: Number(page), limit: Number(limit) };
    }

    entryMap = {};
    const productIds = entries.map((e) => {
      entryMap[e._id.toString()] = e;
      return e._id;
    });

    // Restrict products to those that received stock on this date
    filter._id = { $in: productIds };
  }

  const [rawProducts, total] = await Promise.all([
    Product.find(filter)
      .populate('createdBy', 'fullName username')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    Product.countDocuments(filter),
  ]);

  // Attach dateEntry summary when date filter is active
  const products = entryMap
    ? rawProducts.map((p) => {
        const obj = p.toObject();
        obj.dateEntry = entryMap[p._id.toString()] || null;
        return obj;
      })
    : rawProducts;

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getById = async (id) => {
  const product = await Product.findById(id).populate('createdBy', 'fullName username');
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const getByBarcode = async (barcode) => {
  const product = await Product.findOne({ barcode, isActive: true });
  if (!product) throw new AppError('Product not found for this barcode', 404);
  return product;
};

const create = async (data, userId) => {
  if (!data.barcode) data.barcode = undefined;
  if (!data.sku) data.sku = undefined;
  if (data.barcode) {
    const dup = await Product.findOne({ barcode: data.barcode });
    if (dup) throw new AppError('Barcode already in use', 409);
  }

  // map costPrice → averageCostPrice if frontend sends costPrice
  if (data.costPrice !== undefined && data.averageCostPrice === undefined) {
    data.averageCostPrice = data.costPrice;
  }

  // map productType → type
  if (data.productType && !data.type) data.type = data.productType;

  // hasBags: ensure bagSalePrice is set when hasBags is true
  if (data.hasBags && !data.bagSalePrice && data.bagSalePrice !== 0) {
    // leave it as-is; frontend should send bagSalePrice
  }
  // If hasBags is false/not set, clear bagSalePrice
  if (!data.hasBags) {
    data.bagSalePrice = 0;
  }

  // For weight products: auto-compute stockWeightKg from bags if not provided
  if (data.type === 'weight' || data.productType === 'weight') {
    const bags = Number(data.bagsCount) || 0;
    const kgPerBag = Number(data.kgPerBag) || 0;
    if (bags > 0 && kgPerBag > 0 && !data.stockWeightKg) {
      data.stockWeightKg = bags * kgPerBag;
    }
  }

  // Auto-compute totalStockValue
  const avgCost = Number(data.averageCostPrice) || 0;
  if (avgCost > 0 && !data.totalStockValue) {
    if (data.type === 'weight' || data.productType === 'weight') {
      data.totalStockValue = (Number(data.stockWeightKg) || 0) * avgCost;
    } else {
      data.totalStockValue = (Number(data.stockQuantity) || 0) * avgCost;
    }
  }

  const product = await Product.create({ ...data, createdBy: userId });
  return product;
};

const update = async (id, data) => {
  if (!data.barcode) data.barcode = undefined;
  if (!data.sku) data.sku = undefined;
  // Prevent barcode conflicts
  if (data.barcode) {
    const dup = await Product.findOne({ barcode: data.barcode, _id: { $ne: id } });
    if (dup) throw new AppError('Barcode already in use by another product', 409);
  }
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true }
  );
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const archive = async (id) => {
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: { isActive: false } },
    { new: true }
  );
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const remove = async (id) => {
  const product = await Product.findById(id).select('_id name');
  if (!product) throw new AppError('Product not found', 404);

  await StockEntry.deleteMany({ product: product._id });
  await Product.deleteOne({ _id: product._id });

  return product;
};

const search = async (q) => {
  if (!q) return [];
  const products = await Product.find({
    isActive: true,
    $or: [
      { name: new RegExp(q, 'i') },
      { sku: new RegExp(q, 'i') },
      { barcode: q },
    ],
  }).limit(20);
  return products;
};

module.exports = { list, getById, getByBarcode, create, update, archive, remove, search };
