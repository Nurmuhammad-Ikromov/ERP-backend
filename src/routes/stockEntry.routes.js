'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/stockEntry.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { addStockRules } = require('../validators/stockEntry.validator');

router.use(authenticate);

// Admin-only: add stock entries
router.post('/', authorize('admin'), addStockRules, validate, ctrl.add);

// Admin and kassir can view stock entries (sklad kirim/chiqim ko'rish)
router.get('/', authorize('admin', 'seller'), ctrl.list);
router.get('/product/:productId', authorize('admin', 'seller'), ctrl.listByProduct);
router.get('/:id', authorize('admin', 'seller'), ctrl.getOne);

module.exports = router;
