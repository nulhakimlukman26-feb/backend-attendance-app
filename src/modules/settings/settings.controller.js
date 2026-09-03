const db = require('../../models');
const { z } = require('zod');

// Helpers for SMTP/notification validation and sanitization
const emailSchema = z.string().email('Format email tidak valid').max(254);
function isValidEmail(v) {
  if (v === '' || v == null) return true; // allow empty to clear
  try { emailSchema.parse(v); return true; } catch { return false; }
}
function sanitizeSettingsForResponse(settingsJson) {
  // Hide smtpPass, expose smtpPassSet & smtpConfigured flags
  const out = { ...settingsJson };
  const hasPass = !!settingsJson.smtpPass;
  if (hasPass) out.smtpPass = '***';
  out.smtpPassSet = hasPass;
  out.smtpConfigured = !!(settingsJson.smtpHost && settingsJson.smtpUser && settingsJson.smtpPass);
  return out;
}
const ALLOWED_UPSERT_FIELDS = new Set([
  'companyName','companyAddress','companyPhone','companyEmail','companyLogo',
  'normalStart','normalEnd','overtimeStart','latePenaltyPerMinute','latePenaltyMaxMinutes',
  'yellowCardPenalty','yellowCardStep','redCardPenalty','cardRules','maxOvertimeMinutes',
  'overtimeRatePerHour','holidayMultiplier','workDays','targetDayMethod','manualTargetDays',
  'deductHolidaysFromTarget','holidays','offEmployees','attendanceRadius','attendanceGeofencingEnabled',
  'attendanceStrictMode','officeLatitude','officeLongitude','officeLocationName',
  'masterPenalties','masterRewards','pointDefault','yellowCardPoint','redCardPoint',
  'yellowToRedThreshold','pointResetDay','pointResetEnabled','activePeriodKey',
  // Notification From + SMTP per-company (user-configurable)
  'notificationFromEmail','notificationFromName','smtpHost','smtpPort','smtpSecure','smtpUser','smtpPass',
]);

const DEFAULT_SETTINGS = {
  companyName: 'CV. SUA UNTUNG ABADI',
  companyAddress: 'Jl. Ratu Teratai No.C1 no 43, RT.4/RW.13, Duri Kepa, Kec. Kb. Jeruk, Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11520',
  companyPhone: '+62 85178523827',
  companyEmail: 'suauntungabadi@gmail.com',
  companyLogo: '',
  normalStart: '09:00',
  normalEnd: '18:00',
  overtimeStart: '18:30',
  latePenaltyPerMinute: 1000,
  latePenaltyMaxMinutes: 30,
  yellowCardPenalty: 30000,
  yellowCardStep: 5000,
  redCardPenalty: 150000,
  cardRules: [
    { id: 'rule-1', minLateDays: 5, op: 'gte', cardType: 'red', cardCount: 1, label: 'Minimal 5 kali (≥ 5 kali)' },
    { id: 'rule-2', minLateDays: 10, op: 'gte', cardType: 'red', cardCount: 2, label: 'Minimal 10 kali (≥ 10 kali)' }
  ],
  maxOvertimeMinutes: 240,
  overtimeRatePerHour: 9000,
  holidayMultiplier: 1.4,
  workDays: { "0":false,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true },
  targetDayMethod: 'AUTO',
  manualTargetDays: 26,
  deductHolidaysFromTarget: true,
  holidays: [],
  offEmployees: [],
  attendanceRadius: 100,
  attendanceGeofencingEnabled: true,
  attendanceStrictMode: false,
  officeLatitude: '',
  officeLongitude: '',
  officeLocationName: '',
  masterPenalties: [
    { id: 'pen-1', name: 'Terlambat Ringan', description: 'Terlambat 5–15 menit tanpa keterangan', point: 10, category: 'ringan' },
    { id: 'pen-2', name: 'Terlambat Sedang', description: 'Terlambat 16–30 menit atau keterlambatan berulang', point: 25, category: 'sedang' },
    { id: 'pen-3', name: 'Terlambat Berat / Alpha', description: 'Terlambat >30 menit atau tidak hadir tanpa izin', point: 50, category: 'berat' },
    { id: 'pen-4', name: 'Pelanggaran SOP', description: 'Tidak mengikuti SOP warehouse / operasional', point: 30, category: 'sedang' },
  ],
  masterRewards: [
    { id: 'rew-1', name: 'Kehadiran Sempurna', description: 'Hadir penuh tanpa keterlambatan selama 1 bulan', point: 20 },
    { id: 'rew-2', name: 'Lembur Produktif', description: 'Menyelesaikan lembur melebihi target', point: 15 },
    { id: 'rew-3', name: 'Inisiatif & Disiplin', description: 'Memberi contoh kedisiplinan bagi tim', point: 10 },
  ],
  pointDefault: 0,
  yellowCardPoint: 10,
  redCardPoint: 30,
  yellowToRedThreshold: 3,
  pointResetDay: 1,
  pointResetEnabled: true,
  // Notification From + SMTP per-company — empty means fallback to companyEmail / ENV
  notificationFromEmail: '',
  notificationFromName: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
};

exports.get = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib'}});
    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if (!setting) {
      // auto-create with defaults
      setting = await db.AppSetting.create({ companyId, ...DEFAULT_SETTINGS });
    }
    // Merge defaults for missing fields
    const merged = { ...DEFAULT_SETTINGS, ...setting.toJSON() };
    const sanitized = sanitizeSettingsForResponse(merged);
    res.json({ ok:true, data:{ settings: sanitized }});
  } catch(e){ next(e); }
};

exports.upsert = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib'}});
    // Validate ranges
    const { latePenaltyPerMinute, holidayMultiplier, attendanceRadius } = req.body;
    if (latePenaltyPerMinute !== undefined && (latePenaltyPerMinute < 0 || latePenaltyPerMinute > 100000)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'latePenaltyPerMinute 0..100000'}});
    if (holidayMultiplier !== undefined && (holidayMultiplier < 1 || holidayMultiplier > 3)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'holidayMultiplier 1..3'}});
    if (attendanceRadius !== undefined && (attendanceRadius < 10 || attendanceRadius > 5000)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'attendanceRadius 10..5000'}});
    // Validate notification From + SMTP
    const { notificationFromEmail, notificationFromName, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = req.body;
    if (notificationFromEmail !== undefined && !isValidEmail(notificationFromEmail)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'notificationFromEmail format tidak valid'}});
    if (notificationFromName !== undefined && String(notificationFromName).length > 100) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'notificationFromName max 100 karakter'}});
    if (smtpHost !== undefined && smtpHost !== '' && String(smtpHost).length > 255) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'smtpHost max 255 karakter'}});
    if (smtpPort !== undefined && smtpPort !== '' && smtpPort !== null) {
      const p = Number(smtpPort);
      if (!Number.isInteger(p) || p < 1 || p > 65535) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'smtpPort harus 1..65535'}});
    }
    if (smtpSecure !== undefined && typeof smtpSecure !== 'boolean') return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'smtpSecure harus boolean'}});
    if (smtpUser !== undefined && smtpUser !== '' && String(smtpUser).length > 254) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'smtpUser max 254 karakter'}});
    if (smtpUser !== undefined && smtpUser !== '' && !isValidEmail(smtpUser) && !String(smtpUser).includes('@')) {
      // allow non-email users (some SMTP uses username), but if contains @ must be valid email
    }
    if (smtpPass !== undefined && String(smtpPass).length > 512) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'smtpPass max 512 karakter'}});

    // Whitelist + filter out masked pass placeholder
    const payload = {};
    for (const key of Object.keys(req.body)) {
      if (!ALLOWED_UPSERT_FIELDS.has(key)) continue;
      if (key === 'smtpPass' && req.body[key] === '***') continue; // don't overwrite with masked placeholder
      payload[key] = req.body[key];
    }

    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if (!setting) {
      const createData = { companyId, ...DEFAULT_SETTINGS, ...payload };
      // Ensure smtpPort is integer
      if (createData.smtpPort !== undefined) createData.smtpPort = createData.smtpPort === '' ? null : Number(createData.smtpPort);
      setting = await db.AppSetting.create(createData);
    } else {
      // Coerce types
      if (payload.smtpPort !== undefined) payload.smtpPort = payload.smtpPort === '' ? null : Number(payload.smtpPort);
      Object.assign(setting, payload);
      await setting.save();
    }
    const sanitized = sanitizeSettingsForResponse({ ...DEFAULT_SETTINGS, ...setting.toJSON() });
    res.json({ ok:true, data:{ settings: sanitized }});
  } catch(e){ next(e); }
};

exports.reset = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR'}});
    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if (!setting) setting = await db.AppSetting.create({ companyId, ...DEFAULT_SETTINGS });
    else { Object.assign(setting, DEFAULT_SETTINGS); await setting.save(); }
    const sanitized = sanitizeSettingsForResponse({ ...DEFAULT_SETTINGS, ...setting.toJSON() });
    res.json({ ok:true, data:{ settings: sanitized }});
  } catch(e){ next(e); }
};

exports.testEmail = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib'}});
    const { to } = req.body;
    if (!to || !isValidEmail(to)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'to email tidak valid'}});
    const setting = await db.AppSetting.findOne({ where:{ companyId }});
    if (!setting) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND', message:'Settings belum ada, simpan SMTP dulu'}});
    // Use email util with per-company SMTP
    const { sendMailForCompany } = require('../../utils/email');
    const info = await sendMailForCompany(companyId, {
      to,
      subject: 'Test Email — Attendance App',
      html: `<p>Halo,</p><p>Ini adalah <b>test email</b> dari <b>${setting.companyName || 'Attendance App'}</b>.</p><p>Jika kamu menerima email ini, konfigurasi SMTP per-company berhasil.</p><p><small>From: ${setting.notificationFromEmail || setting.smtpUser || setting.companyEmail} | Host: ${setting.smtpHost}:${setting.smtpPort}</small></p>`,
      text: `Test email dari ${setting.companyName || 'Attendance App'} — konfigurasi SMTP berhasil.`,
    });
    res.json({ ok:true, data:{ message:'Test email terkirim', messageId: info.messageId, previewUrl: info.previewUrl || null }});
  } catch(e){
    // Nodemailer errors -> 400 with details
    const msg = e.message || 'Gagal mengirim test email';
    const code = e.code || 'SMTP_ERROR';
    return res.status(400).json({ ok:false, error:{ code, message: msg, details: e.response || undefined }});
  }
};

module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
