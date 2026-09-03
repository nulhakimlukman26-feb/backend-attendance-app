const express = require('express');
const ctrl = require('./settings.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const router = express.Router();

router.get('/', authenticate, ctrl.get);
router.put('/', authenticate, authorize('ADMIN','HR'), ctrl.upsert);
router.post('/reset', authenticate, authorize('ADMIN'), ctrl.reset);
router.post('/test-email', authenticate, authorize('ADMIN','HR'), ctrl.testEmail);
router.get('/email-from', authenticate, async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const { getFromAddressForCompany } = require('../../utils/email');
    const data = await getFromAddressForCompany(companyId);
    res.json({ ok:true, data });
  } catch(e){ next(e); }
});

module.exports = router;
