const jwt = require('jsonwebtoken');

exports.authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: { code: 'NO_TOKEN', message: 'Token tidak ditemukan' } });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: { code: 'INVALID_TOKEN', message: 'Token tidak valid atau kedaluwarsa' } });
  }
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ ok: false, error: { code: 'NO_TOKEN' } });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Akses ditolak' } });
  }
  next();
};

// Optional: extract companyId from JWT or header, validate exists
exports.companyScope = (req, res, next) => {
  const companyId = req.user?.companyId || req.headers['x-company-id'] || req.query.companyId || req.body?.companyId;
  if (companyId) req.companyId = companyId;
  else if (req.user?.companyId) req.companyId = req.user.companyId;
  next();
};
