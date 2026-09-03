const express = require('express');
const ctrl = require('./companies.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const router = express.Router();

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, authorize('ADMIN','HR'), ctrl.create);
router.get('/:id', authenticate, ctrl.getOne);
router.patch('/:id', authenticate, authorize('ADMIN','HR'), ctrl.update);
router.delete('/:id', authenticate, authorize('ADMIN'), ctrl.remove);
router.post('/:id/activate', authenticate, ctrl.activate);
router.post('/:id/logo', authenticate, authorize('ADMIN','HR'), upload.single('logo'), ctrl.uploadLogo);

module.exports = router;
