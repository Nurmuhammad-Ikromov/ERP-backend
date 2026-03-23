'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/sale.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createSaleRules } = require('../validators/sale.validator');

router.use(authenticate);

// Both admin and seller can create sales and view them
router.post('/', createSaleRules, validate, ctrl.create);
router.get('/', ctrl.list);
router.get('/daily-summary', ctrl.dailySummary);
router.get('/monthly-summary', ctrl.monthlySummary);
router.get('/yearly-summary', ctrl.yearlySummary);
router.get('/:id', ctrl.getOne);
router.get('/:id/receipt', ctrl.getReceipt);

module.exports = router;
