const express = require('express');
const ctrl = require('./kpi.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validatePeriodQuery } = require('../../middleware/validate');
const router = express.Router();

router.get('/masters', authenticate, ctrl.listMasters);
router.post('/masters', authenticate, authorize('ADMIN','HR'), ctrl.createMaster);
router.patch('/masters/:id', authenticate, authorize('ADMIN','HR'), ctrl.updateMaster);
router.delete('/masters/:id', authenticate, authorize('ADMIN','HR'), ctrl.deleteMaster);

router.get('/config', authenticate, ctrl.getConfig);
router.put('/config', authenticate, authorize('ADMIN','HR'), ctrl.upsertConfig);

router.get('/scores', authenticate, validatePeriodQuery, ctrl.listScores);
router.post('/scores', authenticate, authorize('ADMIN','HR'), ctrl.upsertScore);
router.post('/scores/batch', authenticate, authorize('ADMIN','HR'), ctrl.batchUpsert);
router.post('/scores/custom', authenticate, authorize('ADMIN','HR'), ctrl.createCustom);
router.delete('/scores/:employeeId/:periodKey/:kpiId', authenticate, authorize('ADMIN','HR'), ctrl.deleteScore);

router.post('/evaluate', authenticate, ctrl.evaluate);
router.post('/assigned', authenticate, authorize('ADMIN','HR'), ctrl.assignList); // placeholder

module.exports = router;
