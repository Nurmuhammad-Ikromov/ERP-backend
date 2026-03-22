'use strict';

const { body } = require('express-validator');

const addStockRules = [
  body('productId').notEmpty().isMongoId().withMessage('Valid productId is required'),
  body('unitCostPrice')
    .isFloat({ min: 0 })
    .withMessage('unitCostPrice must be a non-negative number'),
  body('entryType').optional().isIn(['purchase', 'correction', 'initial']),
  body('quantityAdded').optional().isFloat({ min: 0 }),
  body('weightKgAdded').optional().isFloat({ min: 0 }),
  body('bagsAdded').optional().isInt({ min: 0 }),
  body('kgPerBag').optional().isFloat({ min: 0 }),
  body('totalCost').optional().isFloat({ min: 0 }),
  body('newSalePrice').optional().isFloat({ min: 0 }).withMessage('newSalePrice must be a positive number'),
  body('newBagSalePrice').optional().isFloat({ min: 0 }).withMessage('newBagSalePrice must be a positive number'),
  body('supplier').optional().trim().isLength({ max: 200 }),
  body('note').optional().trim().isLength({ max: 500 }),
  body('date').optional().isISO8601().withMessage('date must be a valid ISO 8601 date'),
];

module.exports = { addStockRules };
