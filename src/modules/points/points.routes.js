const express = require('express');
const ctrl = require('./points.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validatePeriodQuery } = require('../../middleware/validate');
const router = express.Router();

router.get('/transactions', authenticate, validatePeriodQuery, ctrl.listTransactions);
router.post('/transactions', authenticate, authorize('ADMIN','HR'), ctrl.createTransaction);
router.patch('/transactions/:id', authenticate, authorize('ADMIN','HR'), ctrl.updateTransaction);
router.delete('/transactions/:id', authenticate, authorize('ADMIN','HR'), ctrl.deleteTransaction);
router.get('/status/:employeeId', authenticate, validatePeriodQuery, ctrl.status);
router.get('/report/:employeeId', authenticate, validatePeriodQuery, ctrl.report);
router.get('/periods', authenticate, ctrl.periods);

module.exports = router;
