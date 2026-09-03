const express = require('express');
const ctrl = require('./backup.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();

router.get('/export', authenticate, ctrl.exportData);
router.post('/import', authenticate, authorize('ADMIN'), ctrl.importData);

module.exports = router;
