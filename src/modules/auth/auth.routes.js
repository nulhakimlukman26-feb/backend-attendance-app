const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { ok:false, error:{code:'RATE_LIMIT', message:'Terlalu banyak percobaan login, coba lagi nanti'}},
  standardHeaders: true, legacyHeaders: false,
});

router.post('/register', authenticate, authorize('ADMIN'), ctrl.register);
router.post('/login', loginLimiter, ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.patch('/me', authenticate, ctrl.updateMe);

module.exports = router;
