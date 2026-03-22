'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/debt.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { repaymentRules } = require('../validators/debt.validator');

router.use(authenticate);

router.get('/summary', authorize('admin'), ctrl.summary);
router.get('/customers', ctrl.listCustomers);
router.get('/customers/:id', ctrl.getCustomer);
router.get('/history/:customerId', ctrl.history);
router.get('/customers/:customerId/history', ctrl.history);
router.post('/repayment', authorize('admin', 'seller'), repaymentRules, validate, ctrl.repayment);

module.exports = router;
