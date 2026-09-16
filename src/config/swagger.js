/**
 * OpenAPI 3.0 specification for the Attendance Calculator backend.
 *
 * Served via swagger-ui-express:
 *   - UI   : GET /api-docs
 *   - JSON : GET /api-docs.json
 *
 * The spec is generated from a static object (not JSDoc scanning) so it
 * stays accurate without annotating every route file. When adding a new
 * endpoint, add the path entry here following the existing pattern.
 */
const swaggerJSDoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Attendance Calculator API — CV. SUA UNTUNG ABADI',
    version: '1.0.0',
    description: [
      'Backend for Attendance Calculator (Express + MySQL2 + Sequelize + bcrypt + multer + R2).',
      '',
      'Base URL: `/api/v1`. All responses use the envelope `{ ok: true, data, meta }`',
      'or `{ ok: false, error: { code, message, details } }`.',
      '',
      'Auth: `Authorization: Bearer <accessToken>` (access 15m). Refresh via httpOnly',
      '`refreshToken` cookie. Send `companyId` as query/body or `x-company-id` header',
      'for company-scoped endpoints.',
    ].join('\n'),
  },
  servers: [
    { url: 'http://localhost:3000/api/v1', description: 'Local dev' },
    { url: '/api/v1', description: 'Same-origin (proxied)' },
  ],
  tags: [
    { name: 'Health', description: 'Health checks' },
    { name: 'Auth', description: 'bcrypt + JWT login, refresh, session' },
    { name: 'Users', description: 'User accounts linked to employees (email integrated with employees.email). Writes ADMIN only, read ADMIN/HR' },
    { name: 'Companies', description: 'Multi-company master' },
    { name: 'Employees', description: 'Employee registry + xlsx import' },
    { name: 'Attendance', description: 'Upload pipeline, periods, records, manual overrides' },
    { name: 'PhotoAttendance', description: 'Selfie + GPS check-in/out with geofence, admin verification queue' },
    { name: 'Cards', description: 'Yellow/red card overrides' },
    { name: 'Settings', description: 'Per-company app settings' },
    { name: 'Departments', description: 'Departments master' },
    { name: 'ContractTypes', description: 'Contract types master' },
    { name: 'PositionAllowances', description: 'Position allowances' },
    { name: 'PayrollComponents', description: 'Payroll component definitions' },
    { name: 'Payroll', description: 'Calculate, snapshots, payslip archives' },
    { name: 'THR', description: 'THR settings, calculation, adjustments, payments' },
    { name: 'KPI', description: 'KPI masters, config, scores, evaluation' },
    { name: 'Discipline', description: 'Discipline / sanction records' },
    { name: 'Leave', description: 'Leave requests (CUTI/SAKIT/IZIN)' },
    { name: 'Points', description: 'Point ledger (penalty/reward)' },
    { name: 'Evaluations', description: 'Probation evaluations' },
    { name: 'SOP', description: 'SOP catalog' },
    { name: 'Regulations', description: 'Per-company regulation HTML' },
    { name: 'Analytics', description: 'Aggregates over attendance records' },
    { name: 'Backup', description: 'Full export / transactional import' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      CompanyIdQuery: {
        in: 'query', name: 'companyId', schema: { type: 'string' },
        description: 'Company scope (fallback: JWT companyId / x-company-id header).',
      },
      CompanyIdHeader: {
        in: 'header', name: 'x-company-id', schema: { type: 'string' },
        description: 'Alternative company scope header.',
      },
      PeriodKeyQuery: {
        in: 'query', name: 'periodKey', schema: { type: 'string' },
        description: 'Period filter: `YYYY-MM`, `DAY_YYYY-MM-DD`, `YEAR_YYYY`, `WEEK_...`, `PRESET_...`, or `ALL`.',
      },
      PageQuery: { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
      LimitQuery: { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
    },
    schemas: {
      Envelope: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          data: { type: 'object', description: 'Payload (shape varies per endpoint).' },
          meta: { type: 'object', description: 'Pagination / extra meta.' },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Validasi gagal' },
              details: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          username: { type: 'string' },
          email: { type: 'string' },
          displayName: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'HR', 'MANAGER', 'STAFF'] },
          activeCompanyId: { type: 'string' },
          employeeId: { type: 'string', description: 'Linked employees.id — email must match employees.email' },
        },
      },
      Company: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          phone: { type: 'string' },
          address: { type: 'string' },
          email: { type: 'string' },
          logo: { type: 'string', description: 'R2 URL' },
          isDefault: { type: 'boolean' },
        },
      },
      Employee: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'EMP-0001' },
          companyId: { type: 'string' },
          fullName: { type: 'string' },
          attendanceAliases: { type: 'array', items: { type: 'string' } },
          department: { type: 'string', example: 'WAREHOUSE' },
          jobTitle: { type: 'string', example: 'Staf' },
          email: { type: 'string' },
          phone: { type: 'string' },
          birthPlace: { type: 'string' },
          birthDate: { type: 'string', format: 'date' },
          joinDate: { type: 'string', format: 'date' },
          employmentStatus: { type: 'string', example: 'Active' },
          wfhEnabled: { type: 'boolean' },
          baseSalary: { type: 'number', example: 1755000 },
          dailySalary: { type: 'number', example: 85000 },
          overtimeRate: { type: 'number', example: 9000 },
          allowance: { type: 'number' },
          payrollType: { type: 'string', example: 'Monthly' },
          photo: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      AttendancePeriod: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          companyId: { type: 'string' },
          key: { type: 'string', example: '2026-07' },
          label: { type: 'string', example: 'Juli 2026' },
          fileName: { type: 'string' },
          fileUrl: { type: 'string' },
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          uploadedBy: { type: 'string' },
        },
      },
      AttendanceRecord: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          periodId: { type: 'string' },
          companyId: { type: 'string' },
          employeeId: { type: 'string' },
          date: { type: 'string', format: 'date' },
          checkIn: { type: 'string', example: '09:00' },
          checkOut: { type: 'string', example: '18:00' },
          rawTimestamps: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', example: 'Hadir' },
          dataStatus: { type: 'string', example: 'No Data' },
          isManualOverride: { type: 'boolean' },
          manualReason: { type: 'string' },
        },
      },
      PhotoCheckin: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          companyId: { type: 'string' },
          employeeId: { type: 'string' },
          employeeName: { type: 'string' },
          type: { type: 'string', enum: ['CHECK_IN', 'CHECK_OUT'] },
          date: { type: 'string', format: 'date' },
          time: { type: 'string', example: '08:55' },
          photoUrl: { type: 'string', description: 'R2 URL (null when R2 unconfigured).' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          distanceMeters: { type: 'integer', description: 'Haversine distance to office (null when office unset).' },
          insideGeofence: { type: 'boolean' },
          status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
          submittedBy: { type: 'string' },
          verifiedBy: { type: 'string' },
          verifiedAt: { type: 'string', format: 'date-time' },
          verifyNote: { type: 'string' },
          note: { type: 'string' },
        },
      },
      Leave: {
        type: 'object',
        properties: {
          employeeId: { type: 'string' },
          employeeName: { type: 'string' },
          type: { type: 'string', enum: ['CUTI', 'SAKIT', 'IZIN'] },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          paidType: { type: 'string', enum: ['PAID', 'UNPAID'], default: 'PAID' },
          reason: { type: 'string' },
          attachment: { type: 'string', description: 'R2 URL (or multipart `attachment` file on create).' },
          status: { type: 'string', enum: ['APPROVED', 'PENDING', 'REJECTED'] },
        },
      },
      Discipline: {
        type: 'object',
        properties: {
          employeeId: { type: 'string' },
          employeeName: { type: 'string' },
          date: { type: 'string', format: 'date' },
          violationType: { type: 'string' },
          severity: { type: 'string', enum: ['Ringan', 'Sedang', 'Berat'] },
          cardType: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['Aktif', 'Selesai', 'Kedaluwarsa'] },
          resolvedDate: { type: 'string', format: 'date' },
        },
      },
      PointTransaction: {
        type: 'object',
        properties: {
          employeeId: { type: 'string' },
          employeeName: { type: 'string' },
          type: { type: 'string', enum: ['penalty', 'reward'] },
          masterId: { type: 'string' },
          name: { type: 'string' },
          point: { type: 'integer' },
          category: { type: 'string' },
          cardType: { type: 'string', enum: ['yellow', 'red'] },
          description: { type: 'string' },
          date: { type: 'string', format: 'date' },
        },
      },
      KpiMaster: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          department: { type: 'string' },
          jobTitle: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          target: { type: 'number' },
          unit: { type: 'string' },
          weight: { type: 'number' },
          assessmentMethod: { type: 'string' },
          dataSource: { type: 'string' },
          status: { type: 'string' },
        },
      },
      KpiScore: {
        type: 'object',
        required: ['employeeId', 'periodKey', 'kpiId'],
        properties: {
          employeeId: { type: 'string' },
          periodKey: { type: 'string', example: '2026-07', description: 'YYYY-MM (DAY_ prefix auto-normalized to month).' },
          kpiId: { type: 'string' },
          actualValue: { type: 'number' },
          scorePoin: { type: 'number' },
          isCustom: { type: 'boolean' },
          customMeta: { type: 'object' },
          companyId: { type: 'string' },
        },
      },
    },
  },
  paths: {
    // ── Health ──────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'], summary: 'Health check (root)',
        security: [],
        responses: { 200: { description: 'OK' } },
      },
    },
    // ── Auth ────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Create user (bootstrap)',
        description: 'Requires ADMIN. Body: username*, password* (min 3), email, displayName, role, activeCompanyId.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['username', 'password'],
                properties: {
                  username: { type: 'string' }, email: { type: 'string' },
                  password: { type: 'string' }, displayName: { type: 'string' },
                  role: { type: 'string', enum: ['ADMIN', 'HR', 'MANAGER', 'STAFF'] },
                  activeCompanyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created → { user }' },
          400: { description: 'VALIDATION_ERROR' },
          401: { description: 'NO_TOKEN / FORBIDDEN' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Login (username OR email) → accessToken + httpOnly refresh cookie',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['password'],
                properties: {
                  username: { type: 'string', description: 'Username atau email — salah satu dari username/email wajib diisi.' },
                  email: { type: 'string', description: 'Alternatif dari username.' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK → { accessToken, user }' },
          400: { description: 'VALIDATION_ERROR' },
          401: { description: 'INVALID_CREDENTIALS' },
          429: { description: 'RATE_LIMIT (20/min)' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'], summary: 'Rotate access token via refresh cookie/body',
        security: [],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { refreshToken: { type: 'string', description: 'Fallback if cookie absent.' } } },
            },
          },
        },
        responses: {
          200: { description: 'OK → { accessToken }' },
          401: { description: 'NO_REFRESH / EXPIRED' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'], summary: 'Logout (revoke session, clear cookie)',
        security: [],
        responses: { 200: { description: 'OK → { message }' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'], summary: 'Current user',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK → { user }' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['Auth'], summary: 'Update displayName / password (needs currentPassword)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { displayName: { type: 'string' }, password: { type: 'string' }, currentPassword: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { user }' }, 401: { description: 'INVALID_CREDENTIALS' } },
      },
    },
    // ── Users ─────────────────────────────────────────────
    '/users': {
      get: {
        tags: ['Users'], summary: 'List users + search + pagination (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Search username/displayName/email.' },
          { in: 'query', name: 'role', schema: { type: 'string', enum: ['ADMIN', 'HR', 'MANAGER', 'STAFF'] } },
          { in: 'query', name: 'companyId', schema: { type: 'string' }, description: 'Filter by activeCompanyId.' },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
          { $ref: '#/components/parameters/PageQuery' },
          { $ref: '#/components/parameters/LimitQuery' },
        ],
        responses: { 200: { description: 'OK → { users }, meta { page, limit, total }' } },
      },
      post: {
        tags: ['Users'], summary: 'Create user linked to employee (ADMIN)',
        description: 'employeeId* required. Email is integrated with employees.email: omit `email` to inherit it, or send one that matches — otherwise 400 EMAIL_MISMATCH. displayName defaults to employee fullName, activeCompanyId defaults to employee company.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['username', 'password', 'employeeId'],
                properties: {
                  username: { type: 'string' }, password: { type: 'string' },
                  email: { type: 'string' }, displayName: { type: 'string' },
                  role: { type: 'string', enum: ['ADMIN', 'HR', 'MANAGER', 'STAFF'] },
                  activeCompanyId: { type: 'string' }, employeeId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created → { user }' },
          400: { description: 'EMAIL_MISMATCH / EMAIL_REQUIRED' },
          404: { description: 'EMPLOYEE_NOT_FOUND / COMPANY_NOT_FOUND' },
          409: { description: 'USERNAME_EXISTS / EMAIL_EXISTS / EMPLOYEE_ALREADY_LINKED' },
        },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'], summary: 'User detail incl. linked employee (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { user }' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['Users'], summary: 'Update user (ADMIN). Email change must stay in sync with linked employee email',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  displayName: { type: 'string' }, email: { type: 'string' },
                  role: { type: 'string', enum: ['ADMIN', 'HR', 'MANAGER', 'STAFF'] },
                  activeCompanyId: { type: 'string' }, employeeId: { type: 'string' },
                  password: { type: 'string', description: 'Admin reset (no current password needed).' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { user }' }, 400: { description: 'EMAIL_MISMATCH / CANNOT_DEMOTE_SELF' } },
      },
      delete: {
        tags: ['Users'], summary: 'Delete user, revoke sessions (ADMIN, not self, not last ADMIN)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' }, 400: { description: 'CANNOT_DELETE_SELF / LAST_ADMIN' } },
      },
    },
    '/users/{id}/reset-password': {
      post: {
        tags: ['Users'], summary: 'Reset password + revoke sessions (ADMIN)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['newPassword'], properties: { newPassword: { type: 'string' } } },
            },
          },
        },
        responses: { 200: { description: 'OK → { message }' }, 404: { description: 'NOT_FOUND' } },
      },
    },
    // ── Companies ───────────────────────────────────────────
    '/companies': {
      get: {
        tags: ['Companies'], summary: 'List companies',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK → { companies }' } },
      },
      post: {
        tags: ['Companies'], summary: 'Create company (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['name'],
                properties: {
                  name: { type: 'string' }, phone: { type: 'string' },
                  address: { type: 'string' }, email: { type: 'string' },
                  logo: { type: 'string' }, isDefault: { type: 'boolean' },
                  companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created → { company }' }, 403: { description: 'FORBIDDEN' } },
      },
    },
    '/companies/{id}': {
      get: {
        tags: ['Companies'], summary: 'Company detail',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { company }' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['Companies'], summary: 'Update company (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Company' } } } },
        responses: { 200: { description: 'OK → { company }' } },
      },
      delete: {
        tags: ['Companies'], summary: 'Delete company (ADMIN, blocked if last)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/companies/{id}/activate': {
      post: {
        tags: ['Companies'], summary: 'Set active company for current user',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { user/activeCompany }' } },
      },
    },
    '/companies/{id}/logo': {
      post: {
        tags: ['Companies'], summary: 'Upload company logo (ADMIN/HR, multipart → R2)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: { 200: { description: 'OK → { company/logoUrl }' } },
      },
    },
    // ── Employees ───────────────────────────────────────────
    '/employees': {
      get: {
        tags: ['Employees'], summary: 'List + search + pagination',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Search fullName/id/email.' },
          { in: 'query', name: 'status', schema: { type: 'string' }, description: 'employmentStatus filter.' },
          { in: 'query', name: 'department', schema: { type: 'string' } },
          { $ref: '#/components/parameters/PageQuery' },
          { $ref: '#/components/parameters/LimitQuery' },
        ],
        responses: { 200: { description: 'OK → { employees }, meta { page, limit, total }' } },
      },
      post: {
        tags: ['Employees'], summary: 'Create employee (ADMIN/HR, auto EMP-XXXX)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } },
        },
        responses: { 201: { description: 'Created → { employee }' }, 409: { description: 'DUPLICATE id' } },
      },
    },
    '/employees/import': {
      post: {
        tags: ['Employees'], summary: 'Bulk import from .xlsx (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object', required: ['file'],
                properties: { file: { type: 'string', format: 'binary' }, companyId: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { imported, totalRows }' }, 400: { description: 'NO_FILE / PARSE_ERROR / NO_DATA' } },
      },
    },
    '/employees/{id}': {
      get: {
        tags: ['Employees'], summary: 'Employee detail',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { employee }' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['Employees'], summary: 'Update employee (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
        responses: { 200: { description: 'OK → { employee }' } },
      },
      delete: {
        tags: ['Employees'], summary: 'Hard delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/employees/{id}/resign': {
      post: {
        tags: ['Employees'], summary: 'Mark Resigned (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { employee }' } },
      },
    },
    '/employees/{id}/reactivate': {
      post: {
        tags: ['Employees'], summary: 'Re-activate (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { employee }' } },
      },
    },
    '/employees/{id}/evaluations': {
      get: {
        tags: ['Employees'], summary: 'Evaluations alias for employee',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { evaluations }' } },
      },
    },
    // ── Attendance ──────────────────────────────────────────
    '/attendance/upload': {
      post: {
        tags: ['Attendance'], summary: 'Upload .xlsx → parse, upsert period+records, R2 (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object', required: ['file'],
                properties: { file: { type: 'string', format: 'binary' }, companyId: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK → { periodKey, label, employeeCount, recordCount, warnings, fileUrl, period }' },
          400: { description: 'NO_FILE / PARSE_ERROR / VALIDATION_ERROR' },
          429: { description: 'RATE_LIMIT (20/hour)' },
        },
      },
    },
    '/attendance/periods': {
      get: {
        tags: ['Attendance'], summary: 'List periods (deduped, newest first)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { periods[] }' } },
      },
    },
    '/attendance/periods/{key}': {
      get: {
        tags: ['Attendance'], summary: 'Period detail + records (supports DAY_ prefix → month, filter query)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'key', required: true, schema: { type: 'string' }, description: 'YYYY-MM or DAY_YYYY-MM-DD.' },
          { $ref: '#/components/parameters/CompanyIdQuery' },
        ],
        responses: { 200: { description: 'OK → { period, records, filter }' }, 404: { description: 'PERIOD_NOT_FOUND' } },
      },
      delete: {
        tags: ['Attendance'], summary: 'Delete period + cascade records (ADMIN/HR, YYYY-MM only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'key', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/attendance/periods/{key}/summary': {
      get: {
        tags: ['Attendance'], summary: 'Server summary (unified period filter: periodKey/type/date/range/year/preset)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'key', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
          { in: 'query', name: 'type', schema: { type: 'string', enum: ['MONTH', 'DAY', 'WEEK', 'YEAR', 'PRESET'] } },
          { in: 'query', name: 'date', schema: { type: 'string' } },
          { in: 'query', name: 'startDate', schema: { type: 'string' } },
          { in: 'query', name: 'endDate', schema: { type: 'string' } },
          { in: 'query', name: 'year', schema: { type: 'integer' } },
          { in: 'query', name: 'preset', schema: { type: 'string', enum: ['YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_3_MONTHS', 'LAST_6_MONTHS'] } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → { summary, period, recordsCount, filter }' }, 404: { description: 'PERIOD_NOT_FOUND' } },
      },
    },
    '/attendance/periods/{key}/activate': {
      patch: {
        tags: ['Attendance'], summary: 'Set app_settings.active_period_key',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { companyId: { type: 'string' } } } } } },
        responses: { 200: { description: 'OK → { activePeriodKey, parsed }' } },
      },
    },
    '/attendance/records': {
      get: {
        tags: ['Attendance'], summary: 'Flat records query (periodKey/employeeId/department/date range, paged)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
          { in: 'query', name: 'department', schema: { type: 'string' } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 100 } },
          { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'OK → { records, total, limit, offset, filter }' } },
      },
    },
    '/attendance/period-options': {
      get: {
        tags: ['Attendance'], summary: 'Light { value, label, key } options for pickers',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { options[] }' } },
      },
    },
    '/attendance/manual-override': {
      post: {
        tags: ['Attendance'], summary: 'Create manual check-in/out override (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['empName', 'date'],
                properties: {
                  empName: { type: 'string' }, date: { type: 'string', format: 'date' },
                  checkIn: { type: 'string' }, checkOut: { type: 'string' },
                  reason: { type: 'string' }, rawIn: { type: 'string' }, rawOut: { type: 'string' },
                  companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { override }' } },
      },
      delete: {
        tags: ['Attendance'], summary: 'Revert override { empName, date } (ADMIN/HR, query or body)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'empName', schema: { type: 'string' } },
          { in: 'query', name: 'date', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/attendance/manual-overrides': {
      get: {
        tags: ['Attendance'], summary: 'List overrides (period-filtered)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }, { $ref: '#/components/parameters/PeriodKeyQuery' }],
        responses: { 200: { description: 'OK → { overrides, filter }' } },
      },
    },
    '/attendance/upload-logs': {
      get: {
        tags: ['Attendance'], summary: 'Upload audit logs (latest 100)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { logs }' } },
      },
    },
    '/attendance/upload-logs/{id}': {
      delete: {
        tags: ['Attendance'], summary: 'Delete upload log (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    // ── Photo attendance (selfie + GPS + admin verify) ────
    '/attendance/photo-checkin': {
      post: {
        tags: ['PhotoAttendance'], summary: 'Submit selfie + GPS check-in/out (any role; STAFF locked to own employee)',
        description: 'Multipart `photo` (JPG/PNG/WEBP ≤5MB) + `latitude*`, `longitude*`, `type` (CHECK_IN|CHECK_OUT, default CHECK_IN), `date` (YYYY-MM-DD, default today Asia/Jakarta), `employeeId` (ADMIN/HR only, STAFF forced to self), `note`, `companyId`. Geofence evaluated from Settings (radius/strict/office coords): outside + strict → 422 OUT_OF_GEOFENCE. Rate limit 30/hour.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object', required: ['photo', 'latitude', 'longitude'],
                properties: {
                  photo: { type: 'string', format: 'binary' },
                  latitude: { type: 'number', example: -6.1754 },
                  longitude: { type: 'number', example: 106.8272 },
                  type: { type: 'string', enum: ['CHECK_IN', 'CHECK_OUT'] },
                  date: { type: 'string', example: '2026-09-16' },
                  employeeId: { type: 'string' }, note: { type: 'string' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created → { checkin (PENDING), geofence { distanceMeters, insideGeofence, radiusMeters }, warnings }' },
          400: { description: 'PHOTO_REQUIRED / INVALID_PHOTO / VALIDATION_ERROR' },
          403: { description: 'ACCOUNT_NOT_LINKED / FORBIDDEN (STAFF other employee)' },
          409: { description: 'DUPLICATE_PENDING (masih ada pengajuan berjalan) / ALREADY_CHECKED_IN (sudah disetujui — hanya REJECTED yang boleh diajukan ulang)' },
          422: { description: 'OUT_OF_GEOFENCE (strict mode)' },
          429: { description: 'RATE_LIMIT (30/hour)' },
        },
      },
    },
    '/attendance/photo-checkins': {
      get: {
        tags: ['PhotoAttendance'], summary: 'Verification queue (?status=&type=&employeeId=&dateFrom=&dateTo=, paged; STAFF own only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] } },
          { in: 'query', name: 'type', schema: { type: 'string', enum: ['CHECK_IN', 'CHECK_OUT'] } },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string' } },
          { $ref: '#/components/parameters/PageQuery' },
          { $ref: '#/components/parameters/LimitQuery' },
        ],
        responses: { 200: { description: 'OK → { checkins }, meta { page, limit, total }' } },
      },
    },
    '/attendance/photo-checkins/{id}': {
      get: {
        tags: ['PhotoAttendance'], summary: 'Photo check-in detail (STAFF own only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { checkin }' }, 404: { description: 'NOT_FOUND' } },
      },
      delete: {
        tags: ['PhotoAttendance'], summary: 'Delete record (ADMIN/HR, R2 file retained)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/attendance/photo-checkins/{id}/verify': {
      post: {
        tags: ['PhotoAttendance'], summary: 'Admin verify APPROVED|REJECTED (ADMIN/HR; APPROVED always lands in attendance_records)',
        description: 'APPROVED auto-creates the YYYY-MM period + day row when missing (status follows xlsx rule: both sides Hadir/Valid, single side Data Tidak Lengkap), then sets checkIn/checkOut + override flag. REJECTED writes nothing to attendance tables.',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['decision'],
                properties: { decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, note: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK → { checkin, integrated }' },
          409: { description: 'ALREADY_VERIFIED' },
        },
      },
    },
    // ── Cards ───────────────────────────────────────────────
    '/cards': {
      get: {
        tags: ['Cards'], summary: 'List employee cards',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { cards }' } },
      },
      post: {
        tags: ['Cards'], summary: 'Upsert card { employeeId/empName, yellow, red, note } (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  employeeId: { type: 'string' }, empName: { type: 'string' },
                  yellow: { type: 'integer' }, red: { type: 'integer' },
                  note: { type: 'string' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { card }' } },
      },
    },
    '/cards/{id}': {
      delete: {
        tags: ['Cards'], summary: 'Delete card (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    // ── Settings ────────────────────────────────────────────
    '/settings': {
      get: {
        tags: ['Settings'], summary: 'Load merged defaults + per-company app_settings',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { settings }' } },
      },
      put: {
        tags: ['Settings'], summary: 'Upsert settings (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  companyId: { type: 'string' },
                  normalStart: { type: 'string', example: '09:00' },
                  normalEnd: { type: 'string', example: '18:00' },
                  latePenaltyPerMinute: { type: 'integer' },
                  holidayMultiplier: { type: 'number', example: 1.4 },
                  attendanceRadius: { type: 'integer' },
                },
                description: 'Full app_settings shape accepted (passthrough).',
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { settings }' } },
      },
    },
    '/settings/reset': {
      post: {
        tags: ['Settings'], summary: 'Reset to DEFAULT_SETTINGS (ADMIN)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { companyId: { type: 'string' } } } } } },
        responses: { 200: { description: 'OK → { settings }' } },
      },
    },
    '/settings/test-email': {
      post: {
        tags: ['Settings'], summary: 'Send test email (ADMIN/HR). Body { to, companyId }',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { to: { type: 'string' }, companyId: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Sent' } },
      },
    },
    '/settings/email-from': {
      get: {
        tags: ['Settings'], summary: 'Resolved From address for company',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { from }' } },
      },
    },
    // ── Departments / Contract types ────────────────────────
    '/departments': {
      get: {
        tags: ['Departments'], summary: 'List departments',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { departments }' } },
      },
      post: {
        tags: ['Departments'], summary: 'Create department (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, companyId: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/departments/{id}': {
      get: {
        tags: ['Departments'], summary: 'Department detail',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['Departments'], summary: 'Update department (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'OK' } },
      },
      delete: {
        tags: ['Departments'], summary: 'Delete department (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/departments/auto-seed': {
      post: {
        tags: ['Departments'], summary: 'Auto-seed departments from attendance data (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { companyId: { type: 'string' } } } } } },
        responses: { 200: { description: 'Seeded' } },
      },
    },
    '/contract-types': {
      get: {
        tags: ['ContractTypes'], summary: 'List contract types',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { contractTypes }' } },
      },
      post: {
        tags: ['ContractTypes'], summary: 'Create contract type (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, companyId: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/contract-types/{id}': {
      get: {
        tags: ['ContractTypes'], summary: 'Contract type detail',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['ContractTypes'], summary: 'Update (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'OK' } },
      },
      delete: {
        tags: ['ContractTypes'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    // ── Allowances / components ─────────────────────────────
    '/position-allowances': {
      get: {
        tags: ['PositionAllowances'], summary: 'List position allowances',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { positionAllowances }' } },
      },
      post: {
        tags: ['PositionAllowances'], summary: 'Upsert { jobTitle, amount } (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { jobTitle: { type: 'string' }, amount: { type: 'number' }, companyId: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/position-allowances/{id}': {
      delete: {
        tags: ['PositionAllowances'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/payroll-components': {
      get: {
        tags: ['PayrollComponents'], summary: 'List payroll components (?type=)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }, { in: 'query', name: 'type', schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { payrollComponents }' } },
      },
      post: {
        tags: ['PayrollComponents'], summary: 'Create (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, amount: { type: 'number' }, companyId: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/payroll-components/{id}': {
      patch: {
        tags: ['PayrollComponents'], summary: 'Update (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'OK → { payrollComponent }' } },
      },
      delete: {
        tags: ['PayrollComponents'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    // ── Payroll ─────────────────────────────────────────────
    '/payroll/calculate': {
      post: {
        tags: ['Payroll'], summary: 'Calculate (not persisted). Monthly YYYY-MM only (DAY_ normalized)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['periodKey', 'employeeId'],
                properties: {
                  periodKey: { type: 'string', example: '2026-07' },
                  employeeId: { type: 'string' },
                  manualAdjustments: { type: 'array', items: { type: 'object', properties: { amount: { type: 'number' }, note: { type: 'string' } } } },
                  payrollNote: { type: 'string' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { payroll }' }, 404: { description: 'EMPLOYEE_NOT_FOUND / PERIOD_NOT_FOUND' } },
      },
    },
    '/payroll/snapshots': {
      get: {
        tags: ['Payroll'], summary: 'List snapshots (?periodKey=)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }, { in: 'query', name: 'periodKey', schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { snapshots }' } },
      },
      post: {
        tags: ['Payroll'], summary: 'Persist snapshot (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['periodKey', 'employeeId', 'payload'],
                properties: {
                  periodKey: { type: 'string' }, employeeId: { type: 'string' },
                  payload: { type: 'object' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { snapshot, created }' } },
      },
    },
    '/payroll/snapshots/{periodKey}/{employeeId}': {
      get: {
        tags: ['Payroll'], summary: 'Single snapshot',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'periodKey', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
        ],
        responses: { 200: { description: 'OK → { snapshot }' }, 404: { description: 'NOT_FOUND' } },
      },
    },
    '/payroll/archive': {
      post: {
        tags: ['Payroll'], summary: 'Archive payslip → id SLIP-<period>-<emp> (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['periodKey', 'employeeId', 'payload'],
                properties: {
                  periodKey: { type: 'string' }, periodLabel: { type: 'string' },
                  employeeId: { type: 'string' }, fullName: { type: 'string' },
                  department: { type: 'string' }, jobTitle: { type: 'string' },
                  payload: { type: 'object' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { archive, created }' } },
      },
    },
    '/payroll/archives': {
      get: {
        tags: ['Payroll'], summary: 'List archives (?periodKey=&employeeId=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'periodKey', schema: { type: 'string' } },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → { archives }' } },
      },
    },
    '/payroll/archives/{id}': {
      delete: {
        tags: ['Payroll'], summary: 'Delete archive (ADMIN)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    // ── THR ─────────────────────────────────────────────────
    '/thr/settings': {
      get: {
        tags: ['THR'], summary: 'Get thr_settings (auto-create enabled)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { settings }' } },
      },
      put: {
        tags: ['THR'], summary: 'Upsert THR settings (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  companyId: { type: 'string' },
                  enabled: { type: 'boolean' },
                  wageBasisType: { type: 'string', enum: ['AVERAGE_WAGE_NON_BONUS', 'BASIC_PLUS_FIXED_ALLOWANCE', 'BASIC_ONLY'] },
                  applicableYear: { type: 'integer' },
                  holidayDate: { type: 'string', format: 'date' },
                  companyPolicyMultiplier: { type: 'number' },
                  companyMinimumTHR: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { settings, meta: { wageBasisChanged } }' } },
      },
    },
    '/thr/settings/reset': {
      post: {
        tags: ['THR'], summary: 'Reset THR settings (ADMIN)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { companyId: { type: 'string' } } } } } },
        responses: { 200: { description: 'OK → { settings }' } },
      },
    },
    '/thr/calculate': {
      get: {
        tags: ['THR'], summary: 'THR per-employee (?year=&employeeId=*)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'year', schema: { type: 'integer' } },
          { in: 'query', name: 'employeeId', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → { thr: { employeeId, year, tenureMonths, baseAmount, finalAmount, adjustment, status } }' } },
      },
    },
    '/thr/adjustments': {
      get: {
        tags: ['THR'], summary: 'List adjustments (?year=)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }, { in: 'query', name: 'year', schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK → { adjustments }' } },
      },
      post: {
        tags: ['THR'], summary: 'Upsert adjustment + audit log (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['year', 'employeeId', 'adjustmentAmount'],
                properties: {
                  year: { type: 'integer' }, employeeId: { type: 'string' },
                  adjustmentAmount: { type: 'number' }, reason: { type: 'string' },
                  note: { type: 'string' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { adjustment, created }' } },
      },
    },
    '/thr/adjustments/{year}/{employeeId}': {
      delete: {
        tags: ['THR'], summary: 'Delete adjustment + audit log (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'year', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/thr/payments': {
      get: {
        tags: ['THR'], summary: 'List payments (?year=)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }, { in: 'query', name: 'year', schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK → { payments }' } },
      },
      put: {
        tags: ['THR'], summary: 'Update payment status + audit log (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['year', 'employeeId', 'status'],
                properties: {
                  year: { type: 'integer' }, employeeId: { type: 'string' },
                  status: { type: 'string', enum: ['PAID', 'UNPAID'] },
                  paymentMethod: { type: 'string' }, notes: { type: 'string' },
                  companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { payment }' } },
      },
    },
    '/thr/audit-logs': {
      get: {
        tags: ['THR'], summary: 'Audit logs (?year=&employeeId=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'year', schema: { type: 'integer' } },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → { logs }' } },
      },
    },
    // ── KPI ─────────────────────────────────────────────────
    '/kpi/masters': {
      get: {
        tags: ['KPI'], summary: 'List masters (?department=&jobTitle=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'department', schema: { type: 'string' } },
          { in: 'query', name: 'jobTitle', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → { masters }' } },
      },
      post: {
        tags: ['KPI'], summary: 'Create master (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/KpiMaster' } } } },
        responses: { 201: { description: 'Created → { master }' } },
      },
    },
    '/kpi/masters/{id}': {
      patch: {
        tags: ['KPI'], summary: 'Update master (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/KpiMaster' } } } },
        responses: { 200: { description: 'OK → { master }' } },
      },
      delete: {
        tags: ['KPI'], summary: 'Delete master (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/kpi/config': {
      get: {
        tags: ['KPI'], summary: 'Get kpi_config (auto-create)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { config }' } },
      },
      put: {
        tags: ['KPI'], summary: 'Upsert config { veryGoodMin, goodMin, fairMin, labels } (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  companyId: { type: 'string' }, veryGoodMin: { type: 'number' },
                  goodMin: { type: 'number' }, fairMin: { type: 'number' },
                  labels: { type: 'object' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { config }' } },
      },
    },
    '/kpi/scores': {
      get: {
        tags: ['KPI'], summary: 'List scores (?employeeId=&periodKey= YYYY-MM/DAY_/YEAR_/ALL)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
        ],
        responses: { 200: { description: 'OK → { scores, filter }' }, 404: { description: 'PERIOD_NOT_FOUND' } },
      },
      post: {
        tags: ['KPI'], summary: 'Upsert score (ADMIN/HR, period must exist)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/KpiScore' } } } },
        responses: { 200: { description: 'OK → { score }' }, 404: { description: 'PERIOD_NOT_FOUND' } },
      },
    },
    '/kpi/scores/batch': {
      post: {
        tags: ['KPI'], summary: 'Batch upsert { scores[] } (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['scores'],
                properties: { scores: { type: 'array', items: { $ref: '#/components/schemas/KpiScore' } }, companyId: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { scores }' } },
      },
    },
    '/kpi/scores/custom': {
      post: {
        tags: ['KPI'], summary: 'Upsert custom metric (isCustom=true, ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/KpiScore' } } } },
        responses: { 200: { description: 'OK → { score }' } },
      },
    },
    '/kpi/scores/{employeeId}/{periodKey}/{kpiId}': {
      delete: {
        tags: ['KPI'], summary: 'Delete score (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'periodKey', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'kpiId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/kpi/evaluate': {
      post: {
        tags: ['KPI'], summary: 'Weighted evaluation → overallScore + grade',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', properties: { employeeId: { type: 'string' }, periodKey: { type: 'string' }, companyId: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { overallScore, grade, scoresCount }' }, 404: { description: 'NO_SCORES' } },
      },
    },
    '/kpi/assigned': {
      post: {
        tags: ['KPI'], summary: 'Assign placeholder (ADMIN/HR — use /scores/batch)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'OK → { message, assigned }' } },
      },
    },
    // ── Discipline ──────────────────────────────────────────
    '/discipline': {
      get: {
        tags: ['Discipline'], summary: 'List (?employeeId=&cardType=&status=&severity=&periodKey=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
          { in: 'query', name: 'cardType', schema: { type: 'string' } },
          { in: 'query', name: 'status', schema: { type: 'string' } },
          { in: 'query', name: 'severity', schema: { type: 'string' } },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
        ],
        responses: { 200: { description: 'OK → { disciplines, filter }' } },
      },
      post: {
        tags: ['Discipline'], summary: 'Create (ADMIN/HR, date* + violationType*)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Discipline' } } } },
        responses: { 201: { description: 'Created → { discipline }' } },
      },
    },
    '/discipline/{id}': {
      get: {
        tags: ['Discipline'], summary: 'Detail',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { discipline }' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['Discipline'], summary: 'Update (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Discipline' } } } },
        responses: { 200: { description: 'OK → { discipline }' } },
      },
      delete: {
        tags: ['Discipline'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/discipline/{employeeId}/metrics': {
      get: {
        tags: ['Discipline'], summary: 'Per-employee metrics (totals by severity/status)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
        ],
        responses: { 200: { description: 'OK → { metrics, records, filter }' } },
      },
    },
    // ── Leave ───────────────────────────────────────────────
    '/leave': {
      get: {
        tags: ['Leave'], summary: 'List (?employeeId=&type=&status=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
          { in: 'query', name: 'type', schema: { type: 'string', enum: ['CUTI', 'SAKIT', 'IZIN'] } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['APPROVED', 'PENDING', 'REJECTED'] } },
        ],
        responses: { 200: { description: 'OK → { leaves }' } },
      },
      post: {
        tags: ['Leave'], summary: 'Create (multipart attachment → R2, or JSON). type*/startDate*/endDate*',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  employeeId: { type: 'string' }, employeeName: { type: 'string' },
                  type: { type: 'string', enum: ['CUTI', 'SAKIT', 'IZIN'] },
                  startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' },
                  paidType: { type: 'string', enum: ['PAID', 'UNPAID'] },
                  reason: { type: 'string' },
                  attachment: { type: 'string', format: 'binary' },
                  companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created → { leave } (status PENDING)' } },
      },
    },
    '/leave/{id}': {
      patch: {
        tags: ['Leave'], summary: 'Update (ADMIN/HR, e.g. status approve/reject)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Leave' } } } },
        responses: { 200: { description: 'OK → { leave }' } },
      },
      delete: {
        tags: ['Leave'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/leave/{employeeId}/quota': {
      get: {
        tags: ['Leave'], summary: 'Annual CUTI quota (?year=, default 12)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'year', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'OK → { quota, used, remaining, year }' } },
      },
    },
    '/leave/{employeeId}/summary': {
      get: {
        tags: ['Leave'], summary: 'Summary by type/status (?periodKey=YYYY-MM)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'periodKey', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → { summary, leaves }' } },
      },
    },
    // ── Points ──────────────────────────────────────────────
    '/points/transactions': {
      get: {
        tags: ['Points'], summary: 'List transactions (?employeeId=&cardType=&periodKey=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
          { in: 'query', name: 'cardType', schema: { type: 'string' } },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
        ],
        responses: { 200: { description: 'OK → { transactions, filter }' } },
      },
      post: {
        tags: ['Points'], summary: 'Create transaction (ADMIN/HR, employeeId*/type*/point*)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PointTransaction' } } } },
        responses: { 201: { description: 'Created → { transaction }' } },
      },
    },
    '/points/transactions/{id}': {
      patch: {
        tags: ['Points'], summary: 'Update transaction (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PointTransaction' } } } },
        responses: { 200: { description: 'OK → { transaction }' } },
      },
      delete: {
        tags: ['Points'], summary: 'Delete transaction (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/points/status/{employeeId}': {
      get: {
        tags: ['Points'], summary: 'Monthly point status (monthlyPoint = reward − penalty)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
        ],
        responses: { 200: { description: 'OK → { penalty, reward, monthlyPoint, yellow, red }' } },
      },
    },
    '/points/report/{employeeId}': {
      get: {
        tags: ['Points'], summary: 'Monthly report + transactions',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
        ],
        responses: { 200: { description: 'OK → { penalty, reward, monthlyPoint, transactions }' } },
      },
    },
    '/points/periods': {
      get: {
        tags: ['Points'], summary: 'Distinct YYYY-MM keys from transactions',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { periods[] }' } },
      },
    },
    // ── Evaluations ─────────────────────────────────────────
    '/evaluations': {
      get: {
        tags: ['Evaluations'], summary: 'List (?employeeId=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { in: 'query', name: 'employeeId', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → { evaluations }' } },
      },
      post: {
        tags: ['Evaluations'], summary: 'Create/update (ADMIN/HR/MANAGER)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  employeeId: { type: 'string' }, periodKey: { type: 'string' },
                  overallScore: { type: 'number' },
                  decision: { type: 'string', enum: ['Lulus', 'Perpanjang Probation', 'Tidak Lulus'] },
                  notes: { type: 'string' }, evaluator: { type: 'string' },
                  evaluationDate: { type: 'string', format: 'date' },
                  nextEvaluationDate: { type: 'string', format: 'date' },
                  payload: { type: 'object' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { evaluation }' } },
      },
    },
    '/evaluations/{id}': {
      get: {
        tags: ['Evaluations'], summary: 'Detail',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { evaluation }' }, 404: { description: 'NOT_FOUND' } },
      },
      delete: {
        tags: ['Evaluations'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    // ── SOP / Regulations ───────────────────────────────────
    '/sops': {
      get: {
        tags: ['SOP'], summary: 'List SOPs',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { sops }' } },
      },
      post: {
        tags: ['SOP'], summary: 'Create SOP (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' }, content: { type: 'string' },
                  department: { type: 'string' }, companyId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created → { sop }' } },
      },
    },
    '/sops/{id}': {
      get: {
        tags: ['SOP'], summary: 'Detail',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK → { sop }' }, 404: { description: 'NOT_FOUND' } },
      },
      patch: {
        tags: ['SOP'], summary: 'Update (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'OK → { sop }' } },
      },
      delete: {
        tags: ['SOP'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/regulations': {
      get: {
        tags: ['Regulations'], summary: 'List regulations',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { regulations }' } },
      },
      put: {
        tags: ['Regulations'], summary: 'Upsert per-company HTML (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { title: { type: 'string' }, content: { type: 'string' }, companyId: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { regulation }' } },
      },
    },
    '/regulations/{id}': {
      delete: {
        tags: ['Regulations'], summary: 'Delete (ADMIN/HR)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    // ── Analytics ───────────────────────────────────────────
    '/analytics/overview': {
      get: {
        tags: ['Analytics'], summary: 'Aggregates (?periodKey=/filter, ?department=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
          { in: 'query', name: 'department', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK → aggregates' } },
      },
    },
    '/analytics/by-department': {
      get: {
        tags: ['Analytics'], summary: 'Per-department breakdown',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }, { $ref: '#/components/parameters/PeriodKeyQuery' }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/analytics/by-employee/{id}': {
      get: {
        tags: ['Analytics'], summary: 'Per-employee stats + records',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
        ],
        responses: { 200: { description: 'OK → { stats, records, period }' } },
      },
    },
    '/analytics/calendar': {
      get: {
        tags: ['Analytics'], summary: 'Calendar grid (?department=)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/CompanyIdQuery' },
          { $ref: '#/components/parameters/PeriodKeyQuery' },
          { in: 'query', name: 'department', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    // ── Backup ──────────────────────────────────────────────
    '/backup/export': {
      get: {
        tags: ['Backup'], summary: 'Dump all tables (?companyId=)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CompanyIdQuery' }],
        responses: { 200: { description: 'OK → { version, exportedAt, companyId, data }' } },
      },
    },
    '/backup/import': {
      post: {
        tags: ['Backup'], summary: 'Transactional upsert of export payload (ADMIN)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'object', description: 'Export envelope `data` (or raw tables object).' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK → { message, imported }' } },
      },
    },
  },
};

const options = {
  definition: swaggerDefinition,
  apis: [], // static spec above; add JSDoc globs here if annotating routes later
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = { swaggerSpec, swaggerDefinition };
