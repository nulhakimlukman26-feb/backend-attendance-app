const express = require('express');
const ctrl = require('./points.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();

router.get('/transactions', authenticate, ctrl.listTransactions);
router.post('/transactions', authenticate, authorize('ADMIN','HR'), ctrl.createTransaction);
router.patch('/transactions/:id', authenticate, authorize('ADMIN','HR'), ctrl.updateTransaction);
router.delete('/transactions/:id', authenticate, authorize('ADMIN','HR'), ctrl.deleteTransaction);
router.get('/status/:employeeId', authenticate, ctrl.status);
router.get('/report/:employeeId', authenticate, ctrl.report);
router.get('/periods', authenticate, ctrl.periods);

module.exports = router;
