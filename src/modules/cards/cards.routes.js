const express = require('express');
const ctrl = require('./cards.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();
router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, authorize('ADMIN','HR'), ctrl.upsert);
router.delete('/:id', authenticate, authorize('ADMIN','HR'), ctrl.remove);
module.exports = router;
