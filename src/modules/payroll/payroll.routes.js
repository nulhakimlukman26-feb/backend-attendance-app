const express = require('express');
const ctrl = require('./payroll.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();

router.post('/calculate', authenticate, ctrl.calculate);
router.post('/snapshots', authenticate, authorize('ADMIN','HR'), ctrl.createSnapshot);
router.get('/snapshots', authenticate, ctrl.listSnapshots);
router.get('/snapshots/:periodKey/:employeeId', authenticate, ctrl.getSnapshot);
router.post('/archive', authenticate, authorize('ADMIN','HR'), ctrl.archivePayslip);
router.get('/archives', authenticate, ctrl.listArchives);
router.delete('/archives/:id', authenticate, authorize('ADMIN'), ctrl.deleteArchive);

module.exports = router;
