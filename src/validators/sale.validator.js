'use strict';

const { body } = require('express-validator');

const createSaleRules = [
  body('paymentType')
    .optional()
    .isIn(['cash', 'card', 'debt', 'mixed'])
    .withMessage('paymentType must be cash, card, debt, or mixed'),
  body('currency').optional().isIn(['UZS', 'USD']),
  body('items')
    .isArray({ min: 1 })
    .withMessage('items must be a non-empty array'),
  body().custom((value) => {
    const hasPaymentInfo =
      value.paymentType != null ||
      value.cashPaid != null ||
      value.cardPaid != null ||
      value.debtAmount != null;

    if (!hasPaymentInfo) {
      throw new Error('payment information is required');
    }
    return true;
  }),
  body('items.*.productId')
    .notEmpty()
    .isMongoId()
    .withMessage('Each item must have a valid productId'),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }),
  body('items.*.quantity').optional().isFloat({ min: 0 }),
  body('items.*.weightKg').optional().isFloat({ min: 0 }),
  body('items.*.amountMoney').optional().isFloat({ min: 0 }),
  body('items.*.bagsCount').optional().isInt({ min: 0 }),
  body('cashPaid').optional().isFloat({ min: 0 }),
  body('cardPaid').optional().isFloat({ min: 0 }),
  body('debtAmount').optional().isFloat({ min: 0 }),
  body('paidAmount').optional().isFloat({ min: 0 }),
  body('customerName').optional().trim().isLength({ max: 200 }),
  body('customerPhone').optional().trim().isLength({ max: 20 }),
  body('note').optional().trim().isLength({ max: 500 }),
  body('saleDate').optional().isISO8601(),
];

module.exports = { createSaleRules };
