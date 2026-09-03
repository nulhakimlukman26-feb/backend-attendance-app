const authService = require('./auth.service');
const db = require('../../models');
const { hashPassword, comparePassword } = require('../../utils/hash');

exports.register = async (req, res, next) => {
  try {
    const { username, email, password, displayName, role, activeCompanyId } = req.body;
    if (!username || !password) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Username dan password wajib diisi'}});
    if (password.length < 3) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Password minimal 3 karakter'}});
    const user = await authService.register({ username, email, password, displayName, role, activeCompanyId });
    res.status(201).json({ ok:true, data:{ user }});
  } catch(e){ next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Username dan password wajib diisi'}});
    const { accessToken, refreshRaw, user } = await authService.login({ username, password });
    res.cookie('refreshToken', refreshRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7*24*60*60*1000,
      path: '/api/v1/auth',
    });
    // Also set broader path for refresh convenience
    res.cookie('refreshToken', refreshRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7*24*60*60*1000,
      path: '/',
    });
    res.json({ ok:true, data:{ accessToken, user }});
  } catch(e){ next(e); }
};

exports.refresh = async (req, res, next) => {
  try {
    const raw = req.cookies.refreshToken || req.body.refreshToken;
    if (!raw) return res.status(401).json({ ok:false, error:{code:'NO_REFRESH', message:'Refresh token tidak ditemukan'}});
    const { accessToken } = await authService.refresh(raw);
    res.json({ ok:true, data:{ accessToken }});
  } catch(e){ next(e); }
};

exports.logout = async (req, res, next) => {
  try {
    const raw = req.cookies.refreshToken;
    await authService.logout(raw);
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    res.clearCookie('refreshToken', { path: '/' });
    res.json({ ok:true, data:{ message:'Logout berhasil' }});
  } catch(e){ next(e); }
};

exports.me = async (req, res, next) => {
  try {
    const user = await db.User.findByPk(req.user.sub, { attributes:{exclude:['passwordHash']}});
    if (!user) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND', message:'User tidak ditemukan'}});
    res.json({ ok:true, data:{ user }});
  } catch(e){ next(e); }
};

exports.updateMe = async (req, res, next) => {
  try {
    const user = await db.User.findByPk(req.user.sub);
    if (!user) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    const { displayName, password, currentPassword } = req.body;
    if (displayName) user.displayName = displayName;
    if (password) {
      if (!currentPassword) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Password saat ini wajib diisi'}});
      const ok = await comparePassword(currentPassword, user.passwordHash);
      if (!ok) return res.status(401).json({ ok:false, error:{code:'INVALID_CREDENTIALS', message:'Password saat ini salah'}});
      user.passwordHash = await hashPassword(password);
    }
    await user.save();
    const sanitized = authService.sanitizeUser(user);
    res.json({ ok:true, data:{ user: sanitized }});
  } catch(e){ next(e); }
};
