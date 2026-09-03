const express = require('express');
const ctrl = require('./evaluations.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();
router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, authorize('ADMIN','HR','MANAGER'), ctrl.upsert);
router.get('/:id', authenticate, ctrl.getOne);
router.delete('/:id', authenticate, authorize('ADMIN','HR'), ctrl.remove);
module.exports = router;
