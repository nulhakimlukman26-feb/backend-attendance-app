const express = require('express');
const ctrl = require('./payrollComponents.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();
router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, authorize('ADMIN','HR'), ctrl.create);
router.patch('/:id', authenticate, authorize('ADMIN','HR'), ctrl.update);
router.delete('/:id', authenticate, authorize('ADMIN','HR'), ctrl.remove);
module.exports = router;
