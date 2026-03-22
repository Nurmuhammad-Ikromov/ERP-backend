'use strict';

const { body } = require('express-validator');

const repaymentRules = [
  body('debtAccountId').notEmpty().isMongoId().withMessage('Valid debtAccountId is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a positive number'),
  body('paymentMethod').optional().isIn(['cash', 'card']).withMessage('paymentMethod must be cash or card'),
  body('isCorrection').optional().isBoolean(),
  body('note').optional().trim().isLength({ max: 500 }),
];

module.exports = { repaymentRules };
