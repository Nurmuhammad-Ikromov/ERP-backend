'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { registerRules, loginRules } = require('../validators/auth.validator');
const { authorize } = require('../middlewares/role.middleware');

// First admin can be created via /register (admin-only after initial seed)
// In production, seed the first admin and restrict this endpoint.
router.post('/register', authenticate, authorize('admin'), registerRules, validate, ctrl.register);
router.post('/login', loginRules, validate, ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.post('/logout', authenticate, ctrl.logout);

module.exports = router;
