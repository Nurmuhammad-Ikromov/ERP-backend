'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/cashLog.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { takeOutRules, closeDayRules } = require('../validators/cashLog.validator');

router.use(authenticate, authorize('admin'));

router.get('/today', ctrl.today);
router.post('/take-out', takeOutRules, validate, ctrl.takeOut);
router.post('/close-day', closeDayRules, validate, ctrl.closeDay);
router.get('/range', ctrl.range);

module.exports = router;
