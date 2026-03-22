'use strict';

const { body } = require('express-validator');

const createSaleRules = [
  body('paymentType')
    .isIn(['cash', 'card', 'debt'])
    .withMessage('paymentType must be cash, card, or debt'),
  body('currency').optional().isIn(['UZS', 'USD']),
  body('items')
    .isArray({ min: 1 })
    .withMessage('items must be a non-empty array'),
  body('items.*.productId')
    .notEmpty()
    .isMongoId()
    .withMessage('Each item must have a valid productId'),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }),
  body('items.*.quantity').optional().isFloat({ min: 0 }),
  body('items.*.weightKg').optional().isFloat({ min: 0 }),
  body('items.*.amountMoney').optional().isFloat({ min: 0 }),
  body('items.*.bagsCount').optional().isInt({ min: 0 }),
  body('paidAmount').optional().isFloat({ min: 0 }),
  body('customerName').optional().trim().isLength({ max: 200 }),
  body('customerPhone').optional().trim().isLength({ max: 20 }),
  body('note').optional().trim().isLength({ max: 500 }),
  body('saleDate').optional().isISO8601(),
];

module.exports = { createSaleRules };
