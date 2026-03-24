'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/printer.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

// Check printer status
router.get('/status', ctrl.status);

// Test print (admin only recommended, but keeping it simple)
router.get('/test', ctrl.testPrint);

// Print receipt from raw receipt object (sent by frontend)
router.post('/receipt', ctrl.print);

// Reprint by sale ID (fetches from DB, formats, prints)
router.post('/receipt-by-sale/:saleId', ctrl.printBySaleId);

module.exports = router;
