'use strict';

const { body } = require('express-validator');

const takeOutRules = [
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a positive number'),
  body('note').optional().trim().isLength({ max: 500 }),
];

const closeDayRules = [
  body('note').optional().trim().isLength({ max: 500 }),
];

module.exports = { takeOutRules, closeDayRules };
