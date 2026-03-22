'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/cashbox.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { withdrawRules } = require('../validators/cashbox.validator');

router.use(authenticate);

// Kassir can view kassa/card summary and transactions (without withdrawal info — filtered in controller)
router.get('/summary', authorize('admin', 'seller'), ctrl.summary);
router.get('/transactions', authorize('admin', 'seller'), ctrl.transactions);

// Admin-only: withdrawal operations
router.get('/withdrawals', authorize('admin'), ctrl.withdrawals);
router.post('/withdraw', authorize('admin'), withdrawRules, validate, ctrl.withdraw);
router.get('/card-withdrawals', authorize('admin'), ctrl.cardWithdrawals);
router.post('/card-withdraw', authorize('admin'), withdrawRules, validate, ctrl.withdrawCard);

module.exports = router;
