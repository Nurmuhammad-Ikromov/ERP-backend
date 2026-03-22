'use strict';

const mongoose = require('mongoose');

/**
 * Lightweight audit trail for important actions.
 * Kept simple — not a full event-sourcing system.
 */
const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    action: {
      type: String,
      required: true,
      maxlength: 100,
      // e.g. 'SALE_CREATED', 'STOCK_ENTRY', 'DEBT_REPAID', 'USER_CREATED'
    },
    entity: { type: String, maxlength: 50 },   // 'Sale', 'Product', etc.
    entityId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: mongoose.Schema.Types.Mixed }, // arbitrary JSON snapshot
    ip: { type: String, maxlength: 50 },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ entity: 1, entityId: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
