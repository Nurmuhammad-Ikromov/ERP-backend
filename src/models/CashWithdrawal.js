'use strict';

const mongoose = require('mongoose');

/**
 * Persistent record of every cash withdrawal made by admin.
 * Never deleted — full historical audit trail.
 */
const cashWithdrawalSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    note: { type: String, trim: true, maxlength: 500 },
    withdrawnBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    withdrawnAt: { type: Date, default: Date.now, index: true },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

cashWithdrawalSchema.index({ withdrawnAt: -1 });

module.exports = mongoose.model('CashWithdrawal', cashWithdrawalSchema);
