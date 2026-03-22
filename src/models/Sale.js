'use strict';

const mongoose = require('mongoose');

/**
 * SaleItem is embedded inside Sale for atomicity.
 * We snapshot product name and type so reports remain accurate
 * even if a product is later renamed or archived.
 */
const saleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productNameSnapshot: { type: String, required: true },
    productTypeSnapshot: { type: String, enum: ['unit', 'weight'], required: true },

    // Quantity fields — only the applicable one is set
    quantity: { type: Number, default: 0 },    // unit products
    weightKg: { type: Number, default: 0 },    // weight products (kg consumed)
    bagsCount: { type: Number, default: 0 },   // if sold in full bags

    // Pricing snapshot at time of sale
    unitPrice: { type: Number, required: true, min: 0 },
    costPriceSnapshot: { type: Number, default: 0 }, // WAC at time of sale (for profit calc)
    lineTotal: { type: Number, required: true, min: 0 },
    // profit = lineTotal - (costPriceSnapshot * (quantity || weightKg))
    profitSnapshot: { type: Number, default: 0 },
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Customer info (required for debt sales) ───────────────
    customerName: { type: String, trim: true, maxlength: 200 },
    customerPhone: { type: String, trim: true, maxlength: 20 },

    // ── Payment ───────────────────────────────────────────────
    // cash  → increases cashbox balance
    // card  → recorded in reports only, does not touch cashbox
    // debt  → recorded in reports only, does not touch cashbox
    paymentType: {
      type: String,
      enum: ['cash', 'card', 'debt'],
      required: true,
    },
    currency: {
      type: String,
      enum: ['UZS', 'USD'],
      default: 'UZS',
    },

    // ── Items ─────────────────────────────────────────────────
    items: {
      type: [saleItemSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'A sale must have at least one item',
      },
    },

    // ── Totals ────────────────────────────────────────────────
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    // Pre-computed total profit for this sale (sum of item profitSnapshots)
    totalProfit: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    debtAmount: { type: Number, default: 0, min: 0 },

    // Reference to the DebtAccount record (set when paymentType = debt)
    debtAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DebtAccount',
    },

    note: { type: String, maxlength: 500 },
    saleDate: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

saleSchema.index({ saleDate: -1 });
saleSchema.index({ seller: 1, saleDate: -1 });
saleSchema.index({ paymentType: 1, saleDate: -1 });

module.exports = mongoose.model('Sale', saleSchema);
