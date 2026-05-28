'use strict';

const mongoose = require('mongoose');

/**
 * INVENTORY COST STRATEGY: Weighted Average Cost (WAC)
 *
 * averageCostPrice = totalStockValue / currentStock
 *
 * On stock entry:
 *   totalStockValue += unitCost * addedQty
 *   averageCostPrice = totalStockValue / newTotalQty
 *
 * On sale:
 *   costDeducted = soldQty * averageCostPrice
 *   totalStockValue -= costDeducted
 *
 * This ensures totalStockValue always reflects the correct book value.
 */
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: 200,
    },
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      sparse: true, // allow multiple nulls
    },
    barcode: {
      type: String,
      trim: true,
      sparse: true, // unique but nullable
      unique: true,
    },
    type: {
      type: String,
      enum: ['unit', 'weight'],
      required: [true, 'Product type is required'],
    },
    category: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    // Human-readable unit label: piece, kg, litr, qop, ...
    unitLabel: {
      type: String,
      trim: true,
      maxlength: 30,
      default: 'piece',
    },

    // ── Pricing ──────────────────────────────────────────────
    salePrice: {
      type: Number,
      required: [true, 'Sale price is required'],
      min: 0,
    },
    // Discounted price when selling a full bag (e.g. 200 000 per bag instead of 250 000)
    bagSalePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Maintained automatically via WAC on every stock entry/sale
    averageCostPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Stock quantities ──────────────────────────────────────
    // For 'unit' products: how many individual units are in stock
    stockQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    // For 'weight' products: total kg in stock (includes kg represented by bags)
    stockWeightKg: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Whether this product supports bag-level sales with a discounted bag price
    hasBags: {
      type: Boolean,
      default: false,
    },
    // Optional bag tracking for weight products
    // e.g. 100 bags × 50 kg/bag = 5000 kg total
    bagsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    kgPerBag: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Inventory value ───────────────────────────────────────
    // Total book value of current stock (used for reports and WAC updates)
    totalStockValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Low-stock threshold ───────────────────────────────────
    lowStockThreshold: {
      type: Number,
      default: 0,
    },

    // ── Sales counter ─────────────────────────────────────────
    // Incremented on each sale line, decremented on void. Used for POS sort.
    soldCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Indexes for common lookups
productSchema.index({ name: 'text', sku: 'text' }); // text search
productSchema.index({ isActive: 1 });
productSchema.index({ type: 1 });
productSchema.index({ category: 1 });

module.exports = mongoose.model('Product', productSchema);
