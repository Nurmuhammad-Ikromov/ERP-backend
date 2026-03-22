'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/product.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createProductRules, updateProductRules } = require('../validators/product.validator');

router.use(authenticate);

// Both roles can search and view products
router.get('/search', ctrl.search);
router.get('/barcode/:barcode', ctrl.getByBarcode);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);

// Admin-only mutations
router.post('/', authorize('admin'), createProductRules, validate, ctrl.create);
router.patch('/:id', authorize('admin'), updateProductRules, validate, ctrl.update);
router.patch('/:id/archive', authorize('admin'), ctrl.archive);

module.exports = router;
