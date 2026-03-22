'use strict';

const mongoose = require('mongoose');

/**
 * One record per calendar day.
 * dateKey is a YYYY-MM-DD string used as the unique identifier.
 *
 * Cash flow logic:
 *   closingRemaining = openingCarryAmount + totalCashSales + totalDebtRepayments - cashTakenOut
 *   Next day's openingCarryAmount = previous day's closingRemaining
 *
 * Note: card and debt sales are tracked here for daily reporting
 * but they do NOT affect the cashbox balance.
 */
const dailyCashLogSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String, // 'YYYY-MM-DD'
      required: true,
      unique: true,
      index: true,
    },
    date: { type: Date, required: true },

    // Cash carried over from previous day's closingRemaining
    openingCarryAmount: { type: Number, default: 0, min: 0 },

    // Totals accumulated during the day (updated when sales are recorded)
    totalCashSales: { type: Number, default: 0, min: 0 },
    totalCardSales: { type: Number, default: 0, min: 0 },
    totalDebtSales: { type: Number, default: 0, min: 0 },

    // Cash received from debt repayments
    totalDebtRepayments: { type: Number, default: 0, min: 0 },

    // Each time admin takes cash out of the cashbox
    cashTakenOut: { type: Number, default: 0, min: 0 },

    // Each time admin withdraws from card balance
    cardTakenOut: { type: Number, default: 0, min: 0 },

    // Computed when day is closed
    closingRemaining: { type: Number, default: 0 },

    isClosed: { type: Boolean, default: false },
    closedAt: { type: Date },
    note: { type: String, maxlength: 500 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyCashLog', dailyCashLogSchema);
