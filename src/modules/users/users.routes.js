const express = require('express');
const ctrl = require('./users.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { createUserSchema, updateUserSchema, resetPasswordSchema } = require('./users.validation');

const router = express.Router();

// Read: ADMIN + HR. Writes + password reset: ADMIN only.
// (Self-service profile/password stays on PATCH /auth/me.)
router.get('/', authenticate, authorize('ADMIN', 'HR'), ctrl.list);
router.post('/', authenticate, authorize('ADMIN'), validate(createUserSchema), ctrl.create);
router.get('/:id', authenticate, authorize('ADMIN', 'HR'), ctrl.getOne);
router.patch('/:id', authenticate, authorize('ADMIN'), validate(updateUserSchema), ctrl.update);
router.delete('/:id', authenticate, authorize('ADMIN'), ctrl.remove);
router.post('/:id/reset-password', authenticate, authorize('ADMIN'), validate(resetPasswordSchema), ctrl.resetPassword);

module.exports = router;
