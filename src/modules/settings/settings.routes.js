const express = require('express');
const ctrl = require('./settings.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();

router.get('/', authenticate, ctrl.get);
router.put('/', authenticate, authorize('ADMIN','HR'), ctrl.upsert);
router.post('/reset', authenticate, authorize('ADMIN'), ctrl.reset);

module.exports = router;
