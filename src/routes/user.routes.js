'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createUserRules, updateUserRules, updateStatusRules, resetPasswordRules } = require('../validators/user.validator');

router.use(authenticate, authorize('admin'));

router.get('/', ctrl.list);
router.post('/', createUserRules, validate, ctrl.create);
router.patch('/:id', updateUserRules, validate, ctrl.update);
router.patch('/:id/status', updateStatusRules, validate, ctrl.updateStatus);
router.post('/:id/reset-password', resetPasswordRules, validate, ctrl.resetPassword);
router.post('/:id/impersonate', ctrl.impersonate);

module.exports = router;
