'use strict';

const mongoose = require('mongoose');

/**
 * One DebtAccount per unique customer (keyed by phone number).
 * Aggregates their running balance.
 */
const debtAccountSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: 200,
    },
    customerPhone: {
      type: String,
      required: [true, 'Customer phone is required'],
      trim: true,
      maxlength: 20,
      index: true,
    },
    currency: {
      type: String,
      enum: ['UZS', 'USD'],
      default: 'UZS',
    },
    totalDebt: { type: Number, default: 0, min: 0 },   // cumulative debt created
    totalPaid: { type: Number, default: 0, min: 0 },   // cumulative payments
    balance: { type: Number, default: 0 },              // totalDebt - totalPaid (may be negative if overpaid)
    isActive: { type: Boolean, default: true },
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DebtAccount', debtAccountSchema);
