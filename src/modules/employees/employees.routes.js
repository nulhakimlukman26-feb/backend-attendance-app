const express = require('express');
const ctrl = require('./employees.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const router = express.Router();

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, authorize('ADMIN','HR'), ctrl.create);
router.post('/import', authenticate, authorize('ADMIN','HR'), upload.single('file'), ctrl.importXlsx);
router.get('/:id', authenticate, ctrl.getOne);
router.patch('/:id', authenticate, authorize('ADMIN','HR'), ctrl.update);
router.delete('/:id', authenticate, authorize('ADMIN','HR'), ctrl.remove);
router.post('/:id/resign', authenticate, authorize('ADMIN','HR'), ctrl.resign);
router.post('/:id/reactivate', authenticate, authorize('ADMIN','HR'), ctrl.reactivate);
router.get('/:id/evaluations', authenticate, ctrl.getEvaluations);

module.exports = router;
