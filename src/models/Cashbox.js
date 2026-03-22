'use strict';

const mongoose = require('mongoose');

/**
 * Singleton cashbox document. Exactly one record exists in the DB.
 * Holds the persistent cash and card balances that carry over day to day.
 */
const cashboxSchema = new mongoose.Schema(
  {
    currentBalance: { type: Number, default: 0, min: 0 },
    cardBalance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Static helper: get the singleton, creating it if it does not exist yet.
cashboxSchema.statics.getOrCreate = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({ currentBalance: 0 });
  }
  return doc;
};

module.exports = mongoose.model('Cashbox', cashboxSchema);
