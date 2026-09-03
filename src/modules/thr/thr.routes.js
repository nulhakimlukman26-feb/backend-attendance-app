const express = require('express');
const ctrl = require('./thr.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();

router.get('/settings', authenticate, ctrl.getSettings);
router.put('/settings', authenticate, authorize('ADMIN','HR'), ctrl.upsertSettings);
router.post('/settings/reset', authenticate, authorize('ADMIN'), ctrl.resetSettings);
router.get('/calculate', authenticate, ctrl.calculate);
router.post('/adjustments', authenticate, authorize('ADMIN','HR'), ctrl.upsertAdjustment);
router.delete('/adjustments/:year/:employeeId', authenticate, authorize('ADMIN','HR'), ctrl.deleteAdjustment);
router.get('/adjustments', authenticate, ctrl.listAdjustments);
router.get('/payments', authenticate, ctrl.listPayments);
router.put('/payments', authenticate, authorize('ADMIN','HR'), ctrl.updatePayment);
router.get('/audit-logs', authenticate, ctrl.listAuditLogs);

module.exports = router;
