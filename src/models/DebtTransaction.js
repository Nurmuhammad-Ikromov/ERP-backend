'use strict';

const mongoose = require('mongoose');

const debtTransactionSchema = new mongoose.Schema(
  {
    debtAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DebtAccount',
      required: true,
      index: true,
    },
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
    },
    type: {
      type: String,
      enum: ['created', 'payment', 'correction'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Running balance snapshot after this transaction
    balanceAfter: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', null],
      default: null,
    },
    receiptNumber: { type: String, default: null },
    note: { type: String, maxlength: 500 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    date: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

debtTransactionSchema.index({ debtAccount: 1, date: -1 });

module.exports = mongoose.model('DebtTransaction', debtTransactionSchema);
