'use strict';

const { body } = require('express-validator');

const createUserRules = [
  body('fullName').trim().notEmpty().withMessage('fullName is required'),
  body('username').trim().notEmpty().isLength({ min: 1, max: 50 }),
  body('password').notEmpty(),
  body('role').optional().isIn(['admin', 'seller']),
];

const updateUserRules = [
  body('fullName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('username').optional().trim().notEmpty().isLength({ min: 1, max: 50 }),
  body('password').optional(),
  body('role').optional().isIn(['admin', 'seller']),
];

const updateStatusRules = [
  body('isActive').isBoolean().withMessage('isActive must be true or false'),
];

const resetPasswordRules = [
  body('newPassword')
    .notEmpty().withMessage('newPassword is required')
    .isLength({ min: 4 }).withMessage('newPassword must be at least 4 characters'),
];

module.exports = { createUserRules, updateUserRules, updateStatusRules, resetPasswordRules };
