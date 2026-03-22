'use strict';

const { body } = require('express-validator');

const withdrawRules = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('amount must be a positive number greater than 0'),
  body('note').optional().trim().isLength({ max: 500 }),
];

module.exports = { withdrawRules };
