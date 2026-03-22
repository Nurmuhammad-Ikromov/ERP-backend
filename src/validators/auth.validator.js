'use strict';

const { body } = require('express-validator');

const registerRules = [
  body('fullName').trim().notEmpty().withMessage('fullName is required').isLength({ max: 100 }),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('username is required')
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('username can only contain letters, numbers, and underscores'),
  body('password')
    .notEmpty()
    .withMessage('password is required')
    .isLength({ min: 6 })
    .withMessage('password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'seller']).withMessage('role must be admin or seller'),
];

const loginRules = [
  body('username').trim().notEmpty().withMessage('username is required'),
  body('password').notEmpty().withMessage('password is required'),
];

module.exports = { registerRules, loginRules };
