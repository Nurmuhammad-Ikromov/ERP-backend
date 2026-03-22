'use strict';

const mongoose = require('mongoose');

const stockEntrySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    entryType: {
      type: String,
      enum: ['purchase', 'correction', 'initial'],
      default: 'purchase',
    },

    // ── Quantities added (only the relevant field used per product type) ──
    quantityAdded: { type: Number, default: 0, min: 0 }, // unit products
    weightKgAdded: { type: Number, default: 0, min: 0 }, // weight products (net kg)
    bagsAdded: { type: Number, default: 0, min: 0 },     // optional bag count added
    kgPerBagSnapshot: { type: Number, default: 0 },      // snapshot at time of entry

    // ── Cost ──────────────────────────────────────────────────
    unitCostPrice: {
      type: Number,
      required: [true, 'Unit cost price is required'],
      min: 0,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0,
    },

    // ── Sale price change snapshot (if price was updated on this entry) ──
    salePriceBefore: { type: Number, default: 0 },
    salePriceAfter: { type: Number, default: 0 },
    bagSalePriceBefore: { type: Number, default: 0 },
    bagSalePriceAfter: { type: Number, default: 0 },

    // ── Snapshots after this entry (for audit trail) ──────────
    stockAfter: { type: Number, default: 0 },         // unit qty or kg after entry
    stockValueAfter: { type: Number, default: 0 },

    // ── Meta ──────────────────────────────────────────────────
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    supplier: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    note: {
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

stockEntrySchema.index({ product: 1, date: -1 });

module.exports = mongoose.model('StockEntry', stockEntrySchema);
