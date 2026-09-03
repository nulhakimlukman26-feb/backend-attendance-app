const express = require('express');
const ctrl = require('./analytics.controller');
const { authenticate } = require('../../middleware/auth');
const { validatePeriodQuery } = require('../../middleware/validate');
const router = express.Router();

router.get('/overview', authenticate, validatePeriodQuery, ctrl.overview);
router.get('/by-department', authenticate, validatePeriodQuery, ctrl.byDepartment);
router.get('/by-employee/:id', authenticate, validatePeriodQuery, ctrl.byEmployee);
router.get('/calendar', authenticate, validatePeriodQuery, ctrl.calendar);

module.exports = router;
