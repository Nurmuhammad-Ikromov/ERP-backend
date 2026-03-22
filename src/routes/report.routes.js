'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/report.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

router.use(authenticate);

// Admin and seller can see low-stock products
router.get('/low-stock', authorize('admin', 'seller'), ctrl.lowStock);

// Admin-only reports
router.use(authorize('admin'));

router.get('/dashboard', ctrl.dashboard);
router.get('/inventory', ctrl.inventory);
router.get('/sales-by-product', ctrl.salesByProduct);
router.get('/sales-by-seller', ctrl.salesBySeller);
router.get('/debts', ctrl.debtsReport);
router.get('/daily', ctrl.dailyReport);
router.get('/monthly', ctrl.monthlyReport);
router.get('/yearly', ctrl.yearlyReport);
router.get('/profit-by-product', ctrl.profitByProduct);
router.get('/top-profitable', ctrl.topProfitableProducts);

module.exports = router;
