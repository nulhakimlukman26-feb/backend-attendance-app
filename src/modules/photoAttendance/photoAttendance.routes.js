const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('./photoAttendance.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const photoUpload = require('../../middleware/photoUpload');

const router = express.Router();

const checkinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { ok: false, error: { code: 'RATE_LIMIT', message: 'Batas absensi foto tercapai, coba lagi nanti' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Employee submits selfie + GPS (any authenticated role; STAFF locked to own employee).
// Auto-approved: recorded and integrated into attendance_records immediately.
router.post('/photo-checkin', authenticate, checkinLimiter, photoUpload.single('photo'), ctrl.checkin);
// Photo attendance list (STAFF sees own only).
router.get('/photo-checkins', authenticate, ctrl.list);
router.get('/photo-checkins/:id', authenticate, ctrl.getOne);
// Admin/HR can change a photo submission between approved and rejected states.
router.post('/photo-checkins/bulk-verify', authenticate, authorize('ADMIN', 'HR'), validate(ctrl.bulkVerifySchema), ctrl.bulkVerify);
router.post('/photo-checkins/:id/verify', authenticate, authorize('ADMIN', 'HR'), validate(ctrl.verifySchema), ctrl.verify);
router.delete('/photo-checkins/:id', authenticate, authorize('ADMIN', 'HR'), ctrl.remove);

module.exports = router;
