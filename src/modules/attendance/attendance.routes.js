const express = require('express');
const ctrl = require('./attendance.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const rateLimit = require('express-rate-limit');
const { validatePeriodQuery } = require('../../middleware/validate');

const router = express.Router();

const uploadLimiter = rateLimit({
  windowMs: 60*60*1000,
  max: 20,
  message: { ok:false, error:{code:'RATE_LIMIT', message:'Batas upload tercapai, coba lagi nanti'}},
});

router.post('/upload', authenticate, authorize('ADMIN','HR'), uploadLimiter, upload.single('file'), ctrl.upload);
router.get('/periods', authenticate, validatePeriodQuery, ctrl.listPeriods);
router.get('/periods/:key/summary', authenticate, validatePeriodQuery, ctrl.getSummary);
router.get('/periods/:key', authenticate, validatePeriodQuery, ctrl.getPeriod);
router.patch('/periods/:key/activate', authenticate, ctrl.activatePeriod);
router.delete('/periods/:key', authenticate, authorize('ADMIN','HR'), ctrl.deletePeriod);
router.get('/records', authenticate, validatePeriodQuery, ctrl.listRecords);
router.get('/period-options', authenticate, validatePeriodQuery, ctrl.periodOptions);
router.post('/manual-override', authenticate, authorize('ADMIN','HR'), ctrl.createOverride);
router.delete('/manual-override', authenticate, authorize('ADMIN','HR'), ctrl.deleteOverride);
router.get('/manual-overrides', authenticate, validatePeriodQuery, ctrl.listOverrides);
router.get('/upload-logs', authenticate, ctrl.listUploadLogs);
router.delete('/upload-logs/:id', authenticate, authorize('ADMIN','HR'), ctrl.deleteUploadLog);

module.exports = router;
