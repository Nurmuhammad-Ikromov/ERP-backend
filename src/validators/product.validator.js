'use strict';

const { body } = require('express-validator');

const createProductRules = [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 200 }),
  body('type').custom((value, { req }) => {
    const t = value || req.body.productType;
    if (!t) throw new Error('type is required');
    if (!['unit', 'weight'].includes(t)) throw new Error('type must be unit or weight');
    return true;
  }),
  body('salePrice').isFloat({ min: 0 }).withMessage('salePrice must be a positive number'),
  body('sku').optional().trim().isLength({ max: 50 }),
  body('barcode').optional().trim().isLength({ max: 100 }),
  body('category').optional().trim().isLength({ max: 100 }),
  body('unitLabel').optional().trim().isLength({ max: 30 }),
  body('hasBags').optional().isBoolean(),
  body('bagSalePrice').optional().isFloat({ min: 0 }),
  body('kgPerBag').optional().isFloat({ min: 0 }),
  body('bagsCount').optional().isInt({ min: 0 }),
  body('lowStockThreshold').optional().isFloat({ min: 0 }),
  body('notes').optional().trim().isLength({ max: 500 }),
];

const updateProductRules = [
  body('name').optional().trim().notEmpty().isLength({ max: 200 }),
  body('salePrice').optional().isFloat({ min: 0 }),
  body('sku').optional().trim().isLength({ max: 50 }),
  body('barcode').optional().trim(),
  body('category').optional().trim().isLength({ max: 100 }),
  body('unitLabel').optional().trim().isLength({ max: 30 }),
  body('hasBags').optional().isBoolean(),
  body('bagSalePrice').optional().isFloat({ min: 0 }),
  body('kgPerBag').optional().isFloat({ min: 0 }),
  body('lowStockThreshold').optional().isFloat({ min: 0 }),
  body('notes').optional().trim().isLength({ max: 500 }),
];

module.exports = { createProductRules, updateProductRules };
