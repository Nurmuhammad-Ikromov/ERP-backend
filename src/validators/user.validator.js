'use strict';

const { body } = require('express-validator');

const createUserRules = [
  body('fullName').trim().notEmpty().withMessage('fullName is required'),
  body('username')
    .trim()
    .notEmpty()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/),
  body('password').notEmpty().isLength({ min: 6 }),
  body('role').optional().isIn(['admin', 'seller']),
];

const updateUserRules = [
  body('fullName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('username')
    .optional()
    .trim()
    .notEmpty()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('username can only contain letters, numbers, and underscores'),
  body('password').optional().isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'seller']),
];

const updateStatusRules = [
  body('isActive').isBoolean().withMessage('isActive must be true or false'),
];

module.exports = { createUserRules, updateUserRules, updateStatusRules };
