const { z } = require('zod');
const { Op } = require('sequelize');
const db = require('../../models');
const { uploadToR2 } = require('../../utils/r2Upload');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { haversineMeters, isValidLatitude, isValidLongitude, parseCoord } = require('../../utils/geo');

const TYPES = ['CHECK_IN', 'CHECK_OUT'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const verifySchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(500).optional(),
});

function jakartaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function jakartaTime() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
}

function resolveCompanyId(req) {
  return (req.body && req.body.companyId) || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
}

// Minimal magic-bytes check (multer already filters mime + extension).
function photoMagicOk(buffer, mimetype) {
  if (!buffer || buffer.length < 12) return false;
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

function photoExt(mimetype) {
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/webp') return 'webp';
  return 'jpg';
}

// STAFF may only act on their own linked employee. Returns employeeId or sends error.
async function resolveSubmitEmployee(req, res, companyId) {
  if (req.user.role !== 'STAFF') {
    if (req.body.employeeId) return String(req.body.employeeId);
    const me = await db.User.findByPk(req.user.sub, { attributes: ['employeeId'] });
    if (me && me.employeeId) return me.employeeId;
    res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'employeeId wajib diisi' } });
    return null;
  }
  const me = await db.User.findByPk(req.user.sub, { attributes: ['employeeId'] });
  const linked = me && me.employeeId ? String(me.employeeId) : null;
  if (!linked) {
    res.status(403).json({ ok: false, error: { code: 'ACCOUNT_NOT_LINKED', message: 'Akun belum tertaut ke data employee' } });
    return null;
  }
  if (req.body.employeeId && String(req.body.employeeId) !== linked) {
    res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Hanya dapat absen untuk diri sendiri' } });
    return null;
  }
  return linked;
}

exports.checkin = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: { code: 'PHOTO_REQUIRED', message: 'Foto selfie wajib diunggah (field photo)' } });
    if (!photoMagicOk(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_PHOTO', message: 'File foto tidak valid/rusak' } });
    }

    const latitude = parseCoord(req.body.latitude);
    const longitude = parseCoord(req.body.longitude);
    if (latitude === null || !isValidLatitude(latitude) || longitude === null || !isValidLongitude(longitude)) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'latitude (-90..90) dan longitude (-180..180) wajib valid' } });
    }

    const type = String(req.body.type || 'CHECK_IN').toUpperCase();
    if (!TYPES.includes(type)) return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'type harus CHECK_IN atau CHECK_OUT' } });

    const date = req.body.date ? String(req.body.date) : jakartaToday();
    if (!DATE_RE.test(date)) return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'date harus format YYYY-MM-DD' } });

    const companyId = resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'companyId wajib' } });

    const employeeId = await resolveSubmitEmployee(req, res, companyId);
    if (!employeeId) return; // response already sent

    const employee = await db.Employee.findByPk(employeeId);
    if (!employee) return res.status(404).json({ ok: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Data employee tidak ditemukan' } });
    if (String(employee.companyId) !== String(companyId)) {
      return res.status(400).json({ ok: false, error: { code: 'COMPANY_MISMATCH', message: 'Employee bukan bagian dari perusahaan ini' } });
    }

    // Duplicate rule: same employee + date + type may only be resubmitted
    // when all previous submissions were REJECTED. PENDING or APPROVED blocks.
    const existing = await db.PhotoAttendance.findOne({
      where: { companyId, employeeId, date, type, status: { [Op.in]: ['PENDING', 'APPROVED'] } },
    });
    if (existing) {
      if (existing.status === 'PENDING') {
        return res.status(409).json({ ok: false, error: { code: 'DUPLICATE_PENDING', message: `Sudah ada ${type} PENDING pada ${date} — tunggu verifikasi admin` } });
      }
      return res.status(409).json({ ok: false, error: { code: 'ALREADY_CHECKED_IN', message: `Sudah ada ${type} yang disetujui pada ${date}` } });
    }

    // Geofence evaluation against company settings (before storing anything).
    const setting = await db.AppSetting.findOne({ where: { companyId } });
    const enabled = setting ? !!setting.attendanceGeofencingEnabled : true;
    const strict = setting ? !!setting.attendanceStrictMode : false;
    const radius = setting && setting.attendanceRadius ? parseInt(setting.attendanceRadius, 10) : 100;
    const officeLat = setting ? parseFloat(setting.officeLatitude) : NaN;
    const officeLng = setting ? parseFloat(setting.officeLongitude) : NaN;
    const officeSet = Number.isFinite(officeLat) && Number.isFinite(officeLng);
    const warnings = [];
    let distanceMeters = null;
    let insideGeofence = null;
    if (enabled && officeSet) {
      distanceMeters = Math.round(haversineMeters(latitude, longitude, officeLat, officeLng));
      insideGeofence = distanceMeters <= radius;
      if (!insideGeofence && strict) {
        return res.status(422).json({
          ok: false,
          error: {
            code: 'OUT_OF_GEOFENCE',
            message: `Di luar radius kantor (${distanceMeters}m > ${radius}m) — mode ketat aktif`,
          },
        });
      }
    } else if (enabled && !officeSet) {
      warnings.push('Lokasi kantor belum dikonfigurasi di Settings — geofence dilewati');
    }

    const key = `attendance-photos/${companyId}/${date}/${employeeId}-${type}-${Date.now()}.${photoExt(req.file.mimetype)}`;
    const photoUrl = await uploadToR2(req.file.buffer, key, req.file.mimetype);
    if (!photoUrl) warnings.push('R2 belum dikonfigurasi — foto tidak tersimpan permanen');

    const checkin = await db.PhotoAttendance.create({
      companyId,
      employeeId,
      employeeName: employee.fullName,
      type,
      date,
      time: jakartaTime(),
      photoUrl,
      latitude,
      longitude,
      distanceMeters,
      insideGeofence,
      status: 'PENDING',
      submittedBy: req.user.sub,
      note: req.body.note ? String(req.body.note).slice(0, 255) : null,
    });

    res.status(201).json({
      ok: true,
      data: {
        checkin,
        geofence: {
          distanceMeters,
          insideGeofence,
          radiusMeters: radius,
          strictMode: strict,
          office: officeSet
            ? { latitude: officeLat, longitude: officeLng, name: setting.officeLocationName || null }
            : null,
        },
        warnings,
      },
    });
  } catch (e) { next(e); }
};

exports.list = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where = {};
    if (companyId) where.companyId = companyId;
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.type) where.type = String(req.query.type).toUpperCase();
    if (req.query.employeeId) where.employeeId = req.query.employeeId;
    if (req.query.dateFrom || req.query.dateTo) {
      where.date = {};
      if (req.query.dateFrom) where.date[Op.gte] = req.query.dateFrom;
      if (req.query.dateTo) where.date[Op.lte] = req.query.dateTo;
    }
    // STAFF sees only their own submissions.
    if (req.user.role === 'STAFF') {
      const me = await db.User.findByPk(req.user.sub, { attributes: ['employeeId'] });
      if (!me || !me.employeeId) return res.json({ ok: true, data: { checkins: [] }, meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false } });
      where.employeeId = me.employeeId;
    }
    const { page, limit, offset } = parsePagination(req.query);
    const { count, rows } = await db.PhotoAttendance.findAndCountAll({
      where,
      include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'fullName', 'department', 'jobTitle'] }],
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      limit,
      offset,
    });
    res.json({ ok: true, data: { checkins: rows }, meta: paginationMeta(count, page, limit) });
  } catch (e) { next(e); }
};

exports.getOne = async (req, res, next) => {
  try {
    const rec = await db.PhotoAttendance.findByPk(req.params.id, {
      include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'fullName', 'department', 'jobTitle', 'email'] }],
    });
    if (!rec) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Data absensi foto tidak ditemukan' } });
    if (req.user.role === 'STAFF') {
      const me = await db.User.findByPk(req.user.sub, { attributes: ['employeeId'] });
      if (!me || String(me.employeeId) !== String(rec.employeeId)) {
        return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Akses ditolak' } });
      }
    }
    res.json({ ok: true, data: { checkin: rec } });
  } catch (e) { next(e); }
};

exports.verify = async (req, res, next) => {
  try {
    const rec = await db.PhotoAttendance.findByPk(req.params.id);
    if (!rec) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Data absensi foto tidak ditemukan' } });
    if (rec.status !== 'PENDING') {
      return res.status(409).json({ ok: false, error: { code: 'ALREADY_VERIFIED', message: `Sudah diverifikasi (${rec.status})` } });
    }
    const { decision, note } = req.body;
    rec.status = decision;
    rec.verifiedBy = req.user.sub;
    rec.verifiedAt = new Date();
    rec.verifyNote = note || null;

    // On approval, patch the day's attendance_records row (if the period exists),
    // mirroring manual-override behavior so summaries pick it up.
    let integrated = false;
    if (decision === 'APPROVED') {
      const periodKey = String(rec.date).slice(0, 7); // YYYY-MM
      const period = await db.AttendancePeriod.findOne({ where: { companyId: rec.companyId, key: periodKey } });
      if (period) {
        const row = await db.AttendanceRecord.findOne({
          where: { periodId: period.id, employeeId: rec.employeeId, date: rec.date },
        });
        if (row) {
          const hhmm = rec.time || jakartaTime();
          if (rec.type === 'CHECK_IN') row.checkIn = hhmm;
          else row.checkOut = hhmm;
          row.isManualOverride = true;
          row.manualReason = `Foto ${rec.type} terverifikasi`;
          await row.save();
          integrated = true;
        }
      }
    }
    await rec.save();
    res.json({ ok: true, data: { checkin: rec, integrated } });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const rec = await db.PhotoAttendance.findByPk(req.params.id);
    if (!rec) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Data absensi foto tidak ditemukan' } });
    await rec.destroy();
    res.json({ ok: true, data: { message: 'Deleted (file foto di R2 dipertahankan)' } });
  } catch (e) { next(e); }
};

module.exports.verifySchema = verifySchema;
