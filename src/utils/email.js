const nodemailer = require('nodemailer');
const db = require('../models');

/**
 * Resolve SMTP config with fallback hierarchy:
 * 1) AppSetting per-company (smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass)
 * 2) ENV global (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS)
 * Returns null if not configured.
 */
async function resolveSmtpConfig(companyId) {
  let setting = null;
  if (companyId) {
    try { setting = await db.AppSetting.findOne({ where: { companyId }}); } catch {}
  }
  // Prefer per-company if host+user+pass present
  if (setting && setting.smtpHost && setting.smtpUser && setting.smtpPass) {
    return {
      host: setting.smtpHost,
      port: Number(setting.smtpPort) || 587,
      secure: !!setting.smtpSecure,
      auth: { user: setting.smtpUser, pass: setting.smtpPass },
      fromEmail: setting.notificationFromEmail || setting.smtpUser || setting.companyEmail || process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: setting.notificationFromName || setting.companyName || 'Attendance App',
      source: 'company',
    };
  }
  // Fallback to ENV
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      fromEmail: (setting && setting.notificationFromEmail) || process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: (setting && setting.notificationFromName) || process.env.SMTP_FROM_NAME || 'Attendance App',
      source: 'env',
    };
  }
  // No config but allow notificationFromEmail override even without SMTP? still need host.
  // If user set notificationFromEmail but no SMTP host, we can't send -> return with missing flag.
  if (setting && setting.notificationFromEmail) {
    return {
      host: setting.smtpHost || process.env.SMTP_HOST || null,
      port: Number(setting.smtpPort || process.env.SMTP_PORT) || 587,
      secure: !!(setting.smtpSecure || String(process.env.SMTP_SECURE) === 'true'),
      auth: setting.smtpUser && setting.smtpPass ? { user: setting.smtpUser, pass: setting.smtpPass } : (process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : null),
      fromEmail: setting.notificationFromEmail,
      fromName: setting.notificationFromName || setting.companyName || 'Attendance App',
      source: 'partial',
    };
  }
  return null;
}

function createTransport(smtpConfig) {
  if (!smtpConfig || !smtpConfig.host) {
    const err = new Error('SMTP belum dikonfigurasi. Isi SMTP Host/User/Pass di Settings (per-company) atau ENV.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  if (!smtpConfig.auth || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
    const err = new Error('SMTP auth belum lengkap (user/pass wajib).');
    err.code = 'SMTP_AUTH_MISSING';
    throw err;
  }
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure, // true for 465, false for 587
    auth: smtpConfig.auth,
    // Optional: allow self-signed in dev
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  });
}

/**
 * Build From header respecting user setting.
 * Priority: notificationFromEmail -> smtpUser -> companyEmail -> ENV -> fallback
 */
function buildFromHeader(smtpConfig) {
  const email = smtpConfig.fromEmail;
  const name = smtpConfig.fromName || 'Attendance App';
  if (!email) return undefined;
  // Format: "Name <email>"
  return name ? `"${name.replace(/"/g, '\\"')}" <${email}>` : email;
}

/**
 * Send mail using per-company config.
 * @param {string} companyId
 * @param {{to:string|string[], subject:string, html?:string, text?:string, cc?:string, bcc?:string, attachments?:Array, replyTo?:string}} mail
 */
async function sendMailForCompany(companyId, mail) {
  const smtpConfig = await resolveSmtpConfig(companyId);
  if (!smtpConfig) {
    const err = new Error('SMTP belum dikonfigurasi untuk company ini. Atur di Settings > Email Notification.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const transporter = createTransport(smtpConfig);
  // Verify in non-production? skip verify to avoid extra latency, but we can optionally verify once.
  // await transporter.verify();

  const from = buildFromHeader(smtpConfig);
  const info = await transporter.sendMail({
    from,
    to: mail.to,
    cc: mail.cc,
    bcc: mail.bcc,
    replyTo: mail.replyTo || from,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments,
  });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response, previewUrl: nodemailer.getTestMessageUrl(info) || null };
}

/**
 * Convenience: send to single recipient with resolved companyId from settings or fallback.
 */
async function sendNotificationEmail({ companyId, to, subject, html, text, cc, bcc }) {
  return sendMailForCompany(companyId, { to, subject, html, text, cc, bcc });
}

/**
 * Get current From address for a company (for preview/UI)
 */
async function getFromAddressForCompany(companyId) {
  const cfg = await resolveSmtpConfig(companyId);
  if (!cfg) return null;
  return { from: buildFromHeader(cfg), email: cfg.fromEmail, name: cfg.fromName, smtpConfigured: !!(cfg.host && cfg.auth), source: cfg.source };
}

module.exports = { resolveSmtpConfig, createTransport, buildFromHeader, sendMailForCompany, sendNotificationEmail, getFromAddressForCompany };
