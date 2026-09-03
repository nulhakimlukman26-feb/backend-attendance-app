const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { hashPassword, comparePassword } = require('../../utils/hash');
const db = require('../../models');

async function register({ username, email, password, displayName, role, activeCompanyId }) {
  const existing = await db.User.findOne({ where: { username } });
  if (existing) throw Object.assign(new Error('Username sudah digunakan'), { status: 409, code: 'USERNAME_EXISTS' });
  const passwordHash = await hashPassword(password);
  const user = await db.User.create({ username, email: email || null, passwordHash, displayName: displayName || username, role: role || 'STAFF', activeCompanyId: activeCompanyId || null });
  return sanitizeUser(user);
}

async function login({ username, password }) {
  const user = await db.User.findOne({ where: { username } });
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw Object.assign(new Error('Username atau password salah'), { status: 401, code: 'INVALID_CREDENTIALS' });
  }
  const payload = { sub: user.id, username: user.username, role: user.role, companyId: user.activeCompanyId };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m' });
  const refreshRaw = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.Session.create({ userId: user.id, tokenHash, expiresAt });
  return { accessToken, refreshRaw, user: sanitizeUser(user) };
}

async function refresh(refreshRaw) {
  const tokenHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
  const session = await db.Session.findOne({ where: { tokenHash } });
  if (!session || new Date(session.expiresAt) < new Date()) throw Object.assign(new Error('Refresh token tidak valid atau kedaluwarsa'), { status: 401, code: 'EXPIRED' });
  const user = await db.User.findByPk(session.userId);
  if (!user) throw Object.assign(new Error('User tidak ditemukan'), { status: 401, code: 'USER_NOT_FOUND' });
  const payload = { sub: user.id, username: user.username, role: user.role, companyId: user.activeCompanyId };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m' });
  return { accessToken, user: sanitizeUser(user) };
}

async function logout(refreshRaw) {
  if (!refreshRaw) return;
  const tokenHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
  await db.Session.destroy({ where: { tokenHash } });
}

function sanitizeUser(u) {
  const plain = u.toJSON ? u.toJSON() : u;
  delete plain.passwordHash;
  return plain;
}

module.exports = { register, login, refresh, logout, sanitizeUser };
