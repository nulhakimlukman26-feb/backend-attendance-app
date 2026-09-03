const express = require('express');
const ctrl = require('./analytics.controller');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();

router.get('/overview', authenticate, ctrl.overview);
router.get('/by-department', authenticate, ctrl.byDepartment);
router.get('/by-employee/:id', authenticate, ctrl.byEmployee);
router.get('/calendar', authenticate, ctrl.calendar);

module.exports = router;
