const express = require('express');
const ctrl = require('./leave.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const router = express.Router();

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, upload.single('attachment'), ctrl.create);
router.patch('/:id', authenticate, authorize('ADMIN','HR'), ctrl.update);
router.delete('/:id', authenticate, authorize('ADMIN','HR'), ctrl.remove);
router.get('/:employeeId/quota', authenticate, ctrl.quota);
router.get('/:employeeId/summary', authenticate, ctrl.summary);

module.exports = router;
