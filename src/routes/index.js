'use strict';

const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/products', require('./product.routes'));
router.use('/stock-entries', require('./stockEntry.routes'));
router.use('/sales', require('./sale.routes'));
router.use('/debts', require('./debt.routes'));
router.use('/cash-log', require('./cashLog.routes'));
router.use('/cashbox', require('./cashbox.routes'));
router.use('/reports', require('./report.routes'));

module.exports = router;
