'use strict';

const mongoose = require('mongoose');

/**
 * Full audit trail of every cashbox balance change.
 * Created on: cash sale, withdrawal, or manual adjustment.
 */
const cashboxTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['sale_cash', 'withdrawal', 'adjustment', 'debt_repayment', 'card_sale', 'card_withdrawal', 'card_debt_repayment'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    relatedSale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
    },
    relatedWithdrawal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashWithdrawal',
    },
    relatedDebtTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DebtTransaction',
    },
    relatedCardWithdrawal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CardWithdrawal',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

cashboxTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CashboxTransaction', cashboxTransactionSchema);
