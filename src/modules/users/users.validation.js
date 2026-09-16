const { z } = require('zod');

const RoleEnum = z.enum(['ADMIN', 'HR', 'MANAGER', 'STAFF']);

// On create the account MUST be linked to an employee record.
// Email is integrated with the employee email: when `email` is supplied it
// must equal the linked employee's email; when omitted it is inherited from
// the employee. (Legacy bootstrap admins via POST /auth/register are exempt.)
const createUserSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter').max(50),
  password: z.string().min(3, 'Password minimal 3 karakter').max(100),
  email: z.string().email('Format email tidak valid').max(100).optional(),
  displayName: z.string().max(100).optional(),
  role: RoleEnum.optional().default('STAFF'),
  activeCompanyId: z.string().max(36).optional(),
  employeeId: z.string().min(1, 'employeeId wajib diisi').max(36),
});

const updateUserSchema = z.object({
  displayName: z.string().max(100).optional(),
  email: z.string().email('Format email tidak valid').max(100).optional(),
  role: RoleEnum.optional(),
  activeCompanyId: z.string().max(36).nullable().optional(),
  employeeId: z.string().max(36).nullable().optional(),
  // Admin reset without knowing the old password (unlike PATCH /auth/me).
  password: z.string().min(3, 'Password minimal 3 karakter').max(100).optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'Minimal satu field harus diisi' });

const resetPasswordSchema = z.object({
  newPassword: z.string().min(3, 'Password minimal 3 karakter').max(100),
});

module.exports = { RoleEnum, createUserSchema, updateUserSchema, resetPasswordSchema };
