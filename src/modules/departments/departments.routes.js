const express = require('express');
const ctrl = require('./departments.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, authorize('ADMIN','HR'), ctrl.create);
router.get('/:id', authenticate, ctrl.getOne);
router.patch('/:id', authenticate, authorize('ADMIN','HR'), ctrl.update);
router.delete('/:id', authenticate, authorize('ADMIN','HR'), ctrl.remove);
router.post('/auto-seed', authenticate, authorize('ADMIN','HR'), ctrl.autoSeed);

// contract-types nested but separate routes mounted same router prefix differently
module.exports = router;
