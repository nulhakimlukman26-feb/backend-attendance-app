const { Op } = require('sequelize');
const db = require('../../models');
const { hashPassword } = require('../../utils/hash');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { sanitizeUser } = require('../auth/auth.service');

const USER_INCLUDE = (models) => {
  const include = [];
  if (models.Company) {
    include.push({ model: models.Company, as: 'activeCompany', attributes: ['id', 'name'] });
  }
  if (models.Employee) {
    include.push({
      model: models.Employee,
      as: 'employee',
      attributes: ['id', 'fullName', 'email', 'department', 'jobTitle', 'employmentStatus', 'companyId'],
    });
  }
  return include;
};

const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * Resolve the employee link for a user write.
 *
 * Integration rule (single source of truth = employees.email):
 * - the employee record must exist,
 * - when `email` is supplied and the employee already has an email, both must
 *   match (otherwise 400 EMAIL_MISMATCH),
 * - when `email` is omitted, it is inherited from the employee record,
 * - when the employee has no email yet, the supplied email is propagated back
 *   to the employee record so both stay integrated.
 *
 * Returns `{ employee, email }` or sends the error response and returns null.
 */
async function resolveEmployeeLink(req, res, { employeeId, email }) {
  const employee = await db.Employee.findByPk(employeeId);
  if (!employee) {
    res.status(404).json({ ok: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Data employee tidak ditemukan' } });
    return null;
  }
  const inputEmail = email ? String(email).trim() : '';
  if (inputEmail && employee.email && !sameEmail(inputEmail, employee.email)) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'EMAIL_MISMATCH',
        message: `Email user (${inputEmail}) harus sama dengan email employee (${employee.email})`,
      },
    });
    return null;
  }
  const finalEmail = inputEmail || (employee.email ? String(employee.email).trim() : '');
  if (!finalEmail) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'EMAIL_REQUIRED',
        message: 'Email wajib diisi — lengkapi email pada data employee atau kirim field email',
      },
    });
    return null;
  }
  // Keep both sides integrated when the employee record has no email yet.
  if (!employee.email) {
    employee.email = finalEmail;
    await employee.save();
  }
  return { employee, email: finalEmail };
}

async function assertCompanyExists(req, res, companyId) {
  if (!companyId) return true;
  const company = await db.Company.findByPk(companyId);
  if (!company) {
    res.status(404).json({ ok: false, error: { code: 'COMPANY_NOT_FOUND', message: 'Perusahaan tidak ditemukan' } });
    return false;
  }
  return true;
}

exports.list = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.role) where.role = req.query.role;
    if (req.query.companyId) where.activeCompanyId = req.query.companyId;
    if (req.query.employeeId) where.employeeId = req.query.employeeId;
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      where[Op.or] = [
        { username: { [Op.like]: q } },
        { displayName: { [Op.like]: q } },
        { email: { [Op.like]: q } },
      ];
    }
    const { page, limit, offset } = parsePagination(req.query);
    const { count, rows } = await db.User.findAndCountAll({
      where,
      attributes: { exclude: ['passwordHash'] },
      include: USER_INCLUDE(db),
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
    res.json({ ok: true, data: { users: rows }, meta: paginationMeta(count, page, limit) });
  } catch (e) { next(e); }
};

exports.getOne = async (req, res, next) => {
  try {
    const user = await db.User.findByPk(req.params.id, {
      attributes: { exclude: ['passwordHash'] },
      include: USER_INCLUDE(db),
    });
    if (!user) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User tidak ditemukan' } });
    res.json({ ok: true, data: { user } });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { username, password, email, displayName, role, activeCompanyId, employeeId } = req.body;

    const link = await resolveEmployeeLink(req, res, { employeeId, email });
    if (!link) return; // response already sent

    const existingUsername = await db.User.findOne({ where: { username } });
    if (existingUsername) {
      return res.status(409).json({ ok: false, error: { code: 'USERNAME_EXISTS', message: 'Username sudah digunakan' } });
    }
    const existingLink = await db.User.findOne({ where: { employeeId: link.employee.id } });
    if (existingLink) {
      return res.status(409).json({ ok: false, error: { code: 'EMPLOYEE_ALREADY_LINKED', message: 'Employee ini sudah memiliki akun user' } });
    }
    const existingEmail = await db.User.findOne({ where: { email: link.email } });
    if (existingEmail) {
      return res.status(409).json({ ok: false, error: { code: 'EMAIL_EXISTS', message: 'Email sudah digunakan user lain' } });
    }

    const companyId = activeCompanyId || link.employee.companyId;
    if (!(await assertCompanyExists(req, res, companyId))) return;

    const passwordHash = await hashPassword(password);
    const user = await db.User.create({
      username,
      email: link.email,
      passwordHash,
      displayName: displayName || link.employee.fullName || username,
      role: role || 'STAFF',
      activeCompanyId: companyId || null,
      employeeId: link.employee.id,
    });
    const created = await db.User.findByPk(user.id, {
      attributes: { exclude: ['passwordHash'] },
      include: USER_INCLUDE(db),
    });
    res.status(201).json({ ok: true, data: { user: created || sanitizeUser(user) } });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const user = await db.User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User tidak ditemukan' } });

    const { displayName, email, role, activeCompanyId, employeeId, password } = req.body;

    // Re-link to another employee (email is re-validated against the new record).
    if (employeeId !== undefined && employeeId !== user.employeeId) {
      if (!employeeId) {
        user.employeeId = null;
      } else {
        const occupied = await db.User.findOne({
          where: { employeeId, id: { [Op.ne]: user.id } },
        });
        if (occupied) {
          return res.status(409).json({ ok: false, error: { code: 'EMPLOYEE_ALREADY_LINKED', message: 'Employee ini sudah memiliki akun user' } });
        }
        const link = await resolveEmployeeLink(req, res, { employeeId, email: email !== undefined ? email : user.email });
        if (!link) return;
        user.employeeId = link.employee.id;
        user.email = link.email;
      }
    }

    // Email change on the currently linked employee must stay integrated.
    if (email !== undefined && (employeeId === undefined || employeeId === user.employeeId)) {
      if (user.employeeId) {
        const employee = await db.Employee.findByPk(user.employeeId);
        if (!employee) {
          return res.status(404).json({ ok: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Data employee tertaut tidak ditemukan' } });
        }
        if (employee.email && !sameEmail(email, employee.email)) {
          return res.status(400).json({
            ok: false,
            error: {
              code: 'EMAIL_MISMATCH',
              message: `Email user (${email}) harus sama dengan email employee (${employee.email})`,
            },
          });
        }
        if (!employee.email) {
          employee.email = String(email).trim();
          await employee.save();
        }
        user.email = String(email).trim();
      } else {
        // Legacy account without employee link — free email change.
        user.email = String(email).trim();
      }
      const clash = await db.User.findOne({ where: { email: user.email, id: { [Op.ne]: user.id } } });
      if (clash) {
        return res.status(409).json({ ok: false, error: { code: 'EMAIL_EXISTS', message: 'Email sudah digunakan user lain' } });
      }
    }

    if (role !== undefined && role !== user.role) {
      if (user.id === req.user.sub && user.role === 'ADMIN' && role !== 'ADMIN') {
        return res.status(400).json({ ok: false, error: { code: 'CANNOT_DEMOTE_SELF', message: 'Tidak dapat menurunkan role akun sendiri' } });
      }
      user.role = role;
    }
    if (displayName !== undefined) user.displayName = displayName;
    if (activeCompanyId !== undefined) {
      if (!(await assertCompanyExists(req, res, activeCompanyId))) return;
      user.activeCompanyId = activeCompanyId || null;
    }
    if (password !== undefined) user.passwordHash = await hashPassword(password);

    await user.save();
    const updated = await db.User.findByPk(user.id, {
      attributes: { exclude: ['passwordHash'] },
      include: USER_INCLUDE(db),
    });
    res.json({ ok: true, data: { user: updated || sanitizeUser(user) } });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const user = await db.User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User tidak ditemukan' } });
    if (user.id === req.user.sub) {
      return res.status(400).json({ ok: false, error: { code: 'CANNOT_DELETE_SELF', message: 'Tidak dapat menghapus akun sendiri' } });
    }
    if (user.role === 'ADMIN') {
      const adminCount = await db.User.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return res.status(400).json({ ok: false, error: { code: 'LAST_ADMIN', message: 'Tidak dapat menghapus admin terakhir' } });
      }
    }
    await db.Session.destroy({ where: { userId: user.id } });
    await user.destroy();
    res.json({ ok: true, data: { message: 'User dihapus' } });
  } catch (e) { next(e); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const user = await db.User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User tidak ditemukan' } });
    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();
    // Revoke all sessions so the new password takes effect everywhere.
    await db.Session.destroy({ where: { userId: user.id } });
    res.json({ ok: true, data: { message: `Password user ${user.username} berhasil direset` } });
  } catch (e) { next(e); }
};
