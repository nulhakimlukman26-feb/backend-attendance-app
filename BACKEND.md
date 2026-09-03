# BACKEND — Attendance Calculator (CV. SUA UNTUNG ABADI)

> **Status:** Frontend-only (Vite + React, `localStorage`-persisted). No backend exists yet.
> This document is the **backend specification / implementation blueprint** for migrating the app to your real stack: **Express + MySQL2 + Sequelize + bcrypt + multer + Cloudflare R2**.
> App entry: `src/App.jsx:1` · Router: `src/App.jsx:55` · Mock auth ceiling: `src/core/authStore.js:22`

---

## Table of Contents

1. [Overview & Current State](#1-overview--current-state)
2. [Goals of the Backend](#2-goals-of-the-backend)
3. [Proposed Architecture](#3-proposed-architecture)
4. [Tech Stack (Your Stack)](#4-tech-stack-your-stack)
5. [Data Model — localStorage → MySQL](#5-data-model--localstorage--mysql)
6. [Database Schema — Sequelize + MySQL2](#6-database-schema--sequelize--mysql2)
7. [API Specification](#7-api-specification)
8. [Auth & Authorization (bcrypt + JWT)](#8-auth--authorization-bcrypt--jwt)
9. [File Upload & Attendance Pipeline (multer + R2)](#9-file-upload--attendance-pipeline-multer--r2)
10. [Calculation Engines — Client vs Server](#10-calculation-engines--client-vs-server)
11. [Environment Variables](#11-environment-variables)
12. [Backend Project Structure (Express + Sequelize)](#12-backend-project-structure-express--sequelize)
13. [Frontend Integration / Migration Plan](#13-frontend-integration--migration-plan)
14. [Security, Validation & Compliance](#14-security-validation--compliance)
15. [Deployment](#15-deployment)
16. [Seeding & Backup/Restore](#16-seeding--backuprestore)
17. [Roadmap / Phases](#17-roadmap--phases)

---

## 1. Overview & Current State

| Concern | Current Implementation |
|---|---|
| **Frontend** | Vite `^8.2.0` + React `^19.2.8`, hash routing `src/App.jsx:55`, SPA rewrite `vercel.json:1` |
| **Persistence** | 32 `localStorage` keys under `attendance-calc-*` + `attendanceTheme` — see §5 |
| **Auth** | Mock only — any non-empty creds pass `src/core/authStore.js:16`, token `mock-${Date.now()}` |
| **Attendance ingest** | Client parses `.xlsx` via `xlsx` in `src/core/fileParser.js:1`, then `generateSummary` `src/core/summaryGen.js` |
| **Calculations** | Pure JS engines: `src/core/attendanceCalc.js:1`, `src/core/payrollEngine.js:1`, `src/core/thrEngine.js`, `src/core/analyticsEngine.js` |
| **Exports** | `src/core/excelExport.js`, `src/core/csvExport.js`, `src/core/clipboardExport.js` |
| **Theme / Settings** | `src/core/settings.js:1`, `src/core/theme.js` |

**Problem:** No multi-user, no real auth, data lost on cache clear, no audit trail, no role enforcement.

---

## 2. Goals of the Backend

1.  **Real authentication** — `bcrypt` + JWT access (15m) + httpOnly refresh cookie (7d), RBAC.
2.  **Centralized persistence** — MySQL (via `mysql2` + `sequelize`) replacing every `localStorage` key.
3.  **Multi-tenant / multi-company** — `companies` table already modeled `src/core/companyStore.js:6`.
4.  **Auditable** — immutable logs for manual overrides, payroll snapshots, THR adjustments, discipline.
5.  **Server-side validation** — single source of truth for attendance rules, card sanctions, payroll.
6.  **File pipeline** — `multer` (memory) → `xlsx` parse → MySQL bulk + `upload_logs` + raw `.xlsx` to Cloudflare R2.
7.  **Offline-safe migration** — one-shot import of existing `localStorage` backup `src/core/historyStore.js:751`.

---

## 3. Proposed Architecture

```
[Browser / React App] ── HTTPS /api/v1 ──> [Express.js API]
                                              │
                         ┌────────────────────┼────────────────────┐
                         │                    │                    │
                    [Auth (bcrypt/JWT)]  [Attendance Service]  [Payroll / KPI / THR / ...]
                         │                    │                    │
                         └────────────────────┼────────────────────┘
                                              │
                                      [MySQL 8 (mysql2 + Sequelize)]
                                      [Cloudflare R2 — S3 API] (raw .xlsx + exports + backups)
                                      [Optional Redis] — rate-limit/cache
```

**Deploy:** Single Express monolith. Works on VPS, Railway, Fly, or Vercel (`api/` serverless) with external MySQL (PlanetScale / Railway / VPS MySQL).

**Client boundary:** Keep calculation engines client-side initially for fast preview, progressively move payroll/finalization to server.

---

## 4. Tech Stack (Your Stack)

| Layer | Choice | Version / Notes |
|---|---|---|
| Runtime | **Express** | `^4.18` + `cors`, `helmet`, `morgan`, `express-rate-limit` |
| DB driver | **mysql2** | `^3.x` — promise API |
| ORM | **Sequelize** | `^6.35` + `sequelize-cli` for migrations/seeders |
| Auth | **bcrypt** (`^5.1`) + **jsonwebtoken** (`^9.x`) | Hash `12 rounds`, access 15m / refresh 7d httpOnly |
| Upload | **multer** | `memoryStorage`, `fileFilter: xlsx only`, `limits: 10MB` |
| Storage | **Cloudflare R2** | S3-compatible via `@aws-sdk/client-s3` |
| Excel | **xlsx** | Reuse `src/core/fileParser.js:1` on server |
| Validation | **zod** (or `joi`) | Mirrors `src/core/validator.js:1` |
| Env | **dotenv** | `backend/.env` |
| Testing | **vitest + supertest** | `src/core/tests.js:1` has no framework today |

Install backend:

```bash
mkdir backend && cd backend
npm init -y
npm i express mysql2 sequelize sequelize-cli jsonwebtoken bcrypt multer @aws-sdk/client-s3 dotenv cors helmet morgan express-rate-limit zod xlsx
npm i -D nodemon
npx sequelize-cli init
```

---

## 5. Data Model — localStorage → MySQL

### 5.1 Complete `localStorage` Key Inventory

| # | localStorage Key | Source File | Domain | MySQL Table |
|---|---|---|---|---|
| 1 | `attendance-auth` | `src/core/authStore.js:1` | Auth session | `users` + `sessions` |
| 2 | `attendance-calc-settings` | `src/core/settings.js:1` | Global settings | `app_settings` (per `company_id`) |
| 3 | `attendance-calc-employee-master` | `src/core/employeeStore.js:5` | Employee registry | `employees` |
| 4 | `attendance-calc-monthly-history` | `src/core/historyStore.js:5` | Monthly parsed datasets | `attendance_periods` + `attendance_records` |
| 5 | `attendance-calc-active-period` | `src/core/historyStore.js:6` | Active period pointer | `app_settings.active_period_key` |
| 6 | `attendance-calc-upload-logs` | `src/core/historyStore.js:87` | Upload audit | `upload_logs` |
| 7 | `attendance-calc-cards` | `src/App.jsx:72`, `src/core/historyStore.js:215` | Yellow/Red card overrides | `employee_cards` |
| 8 | `attendance-calc-companies` | `src/core/companyStore.js:3` | Companies | `companies` |
| 9 | `attendance-calc-active-company-id` | `src/core/companyStore.js:4` | Active company | `users.active_company_id` / `app_settings` |
| 10 | `attendance-calc-payroll-snapshots` | `src/core/payrollEngine.js:3` | Payroll per period | `payroll_snapshots` |
| 11 | `attendance-calc-payslip-archives` | `src/core/payrollEngine.js:181` | Archived payslips | `payslip_archives` |
| 12 | `attendance-calc-thr-settings` | `src/core/thrStore.js:6` | THR config | `thr_settings` |
| 13 | `attendance-calc-thr-snapshots` | `src/core/thrStore.js:7` | THR snapshots | `thr_snapshots` |
| 14 | `attendance-calc-thr-adjustments` | `src/core/thrStore.js:8` | THR manual adjustments | `thr_adjustments` |
| 15 | `attendance-calc-thr-history` | `src/core/thrStore.js:9` | THR audit log | `thr_audit_logs` |
| 16 | `attendance-calc-thr-payments` | `src/core/thrStore.js:10` | THR payment status | `thr_payments` |
| 17 | `attendance-calc-kpi-masters` | `src/core/kpiStore.js:1` | KPI master templates | `kpi_masters` |
| 18 | `attendance-calc-kpi-config` | `src/core/kpiStore.js:2` | KPI scoring config | `kpi_configs` |
| 19 | `attendance-calc-kpi-scores` | `src/core/kpiStore.js:3` | KPI scores + custom | `kpi_scores` |
| 20 | `attendance-calc-kpi-jobdesks` | `src/core/kpiStore.js:4` | Legacy jobdesk | folded into `kpi_scores` |
| 21 | `attendance-calc-discipline-records` | `src/core/disciplineStore.js:7` | Discipline/sanctions | `discipline_records` |
| 22 | `attendance-calc-leave-records` | `src/core/leaveStore.js:3` | Leave requests | `leave_records` |
| 23 | `attendance-calc-departments` | `src/core/departmentStore.js:6` | Departments | `departments` |
| 24 | `attendance-calc-contract-types` | `src/core/departmentStore.js:7` | Contract types | `contract_types` |
| 25 | `attendance-calc-position-allowances-v2` | `src/core/positionAllowanceStore.js:6` | Position allowances | `position_allowances` |
| 26 | `attendance-calc-payroll-components` | `src/core/payrollComponentStore.js:6` | Payroll defs | `payroll_components` |
| 27 | `attendance-calc-manual-edits` | `src/core/manualAttendanceStore.js:4` | Manual check-in/out | `manual_attendance_overrides` |
| 28 | `attendance-calc-point-transactions` | `src/core/pointStore.js:3` | Point ledger | `point_transactions` |
| 29 | `attendance-calc-evaluations` | `src/core/evaluationStore.js:6` | Probation evaluations | `evaluations` |
| 30 | `attendance-calc-sops` | `src/core/sopStore.js:1` | SOP catalog | `sops` |
| 31 | `attendance-calc-regulations-*` | `src/core/regulationsStore.js:1` | Regulations HTML | `regulations` |
| 32 | `attendanceTheme` | `src/core/theme.js` | UI theme | **stay client-only** |

### 5.2 Core Entities & Relationships (Sequelize associations)

```
Company 1──* Employee
Company 1──* Department
Company 1──* AttendancePeriod 1──* AttendanceRecord
Employee 1──* AttendanceRecord
Employee 1──* ManualAttendanceOverride
Employee 1──* DisciplineRecord
Employee 1──* LeaveRecord
Employee 1──* PointTransaction
Employee 1──* Evaluation
Employee 1──* KpiScore
Company 1──1 AppSetting / ThrSetting / KpiConfig
```

Every table has `company_id` FK (except global `companies`/`sops`). All queries scope `WHERE company_id = req.user.activeCompanyId`.

---

## 6. Database Schema — Sequelize + MySQL2

### 6.1 Sequelize init

```bash
npx sequelize-cli init
# creates config/config.json, models/, migrations/, seeders/
```

`config/config.js` (use `mysql2` + `dotenv`):

```js
require('dotenv').config();
module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    logging: false,
    timezone: '+07:00',
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    logging: false,
    timezone: '+07:00',
  }
};
```

Create DB:

```bash
npx sequelize-cli db:create
```

### 6.2 Models — `backend/models/*.js`

Use `DataTypes.JSON` (MySQL 5.7+ / 8.x supports native JSON). Sequelize handles it as `JSON` column.

#### `companies`

```js
// models/company.js
'use strict';
module.exports = (sequelize, DataTypes) => {
  const Company = sequelize.define('Company', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    phone: DataTypes.STRING,
    address: DataTypes.TEXT,
    email: DataTypes.STRING,
    logo: DataTypes.TEXT, // R2 URL after migration (was base64 in settings)
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_default' },
  }, { tableName: 'companies', underscored: true, timestamps: true });
  Company.associate = (m) => {
    Company.hasMany(m.Employee, { foreignKey: 'company_id' });
    Company.hasMany(m.AttendancePeriod, { foreignKey: 'company_id' });
  };
  return Company;
};
```

#### `users` + `sessions`

```js
// models/user.js
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    email: { type: DataTypes.STRING, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false, field: 'password_hash' },
    displayName: { type: DataTypes.STRING, field: 'display_name' },
    role: { type: DataTypes.ENUM('ADMIN','HR','MANAGER','STAFF'), defaultValue: 'STAFF' },
    activeCompanyId: { type: DataTypes.STRING, field: 'active_company_id' },
  }, { tableName: 'users', underscored: true, timestamps: true });
  return User;
};

// models/session.js — optional if using opaque refresh tokens
module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define('Session', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.STRING, allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING, allowNull: false, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE, field: 'expires_at' },
  }, { tableName: 'sessions', underscored: true, updatedAt: false });
  return Session;
};
```

#### `employees`

```js
// models/employee.js
module.exports = (sequelize, DataTypes) => {
  const Employee = sequelize.define('Employee', {
    id: { type: DataTypes.STRING, primaryKey: true }, // EMP-0001 — keep human id
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    fullName: { type: DataTypes.STRING, allowNull: false, field: 'full_name' },
    attendanceAliases: { type: DataTypes.JSON, field: 'attendance_aliases', defaultValue: [] },
    department: { type: DataTypes.STRING, defaultValue: 'WAREHOUSE' },
    jobTitle: { type: DataTypes.STRING, defaultValue: 'Staf', field: 'job_title' },
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    birthPlace: { type: DataTypes.STRING, field: 'birth_place' },
    birthDate: { type: DataTypes.DATEONLY, field: 'birth_date' },
    joinDate: { type: DataTypes.DATEONLY, field: 'join_date' },
    employmentStatus: { type: DataTypes.STRING, defaultValue: 'Active', field: 'employment_status' },
    wfhEnabled: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'wfh_enabled' },
    probationStartDate: { type: DataTypes.DATEONLY, field: 'probation_start_date' },
    probationEndDate: { type: DataTypes.DATEONLY, field: 'probation_end_date' },
    contractEndDate: { type: DataTypes.DATEONLY, field: 'contract_end_date' },
    bankName: { type: DataTypes.STRING, field: 'bank_name' },
    bankAccountNumber: { type: DataTypes.STRING, field: 'bank_account_number' },
    bankAccountHolder: { type: DataTypes.STRING, field: 'bank_account_holder' },
    nik: DataTypes.STRING,
    npwp: DataTypes.STRING,
    bpjsKesehatan: { type: DataTypes.STRING, field: 'bpjs_kesehatan' },
    bpjsKetenagakerjaan: { type: DataTypes.STRING, field: 'bpjs_ketenagakerjaan' },
    shift: { type: DataTypes.STRING, defaultValue: 'Normal' },
    supervisor: DataTypes.STRING,
    workLocation: { type: DataTypes.STRING, defaultValue: 'Kantor Pusat', field: 'work_location' },
    baseSalary: { type: DataTypes.DECIMAL(14,2), defaultValue: 1755000, field: 'base_salary' },
    dailySalary: { type: DataTypes.DECIMAL(14,2), defaultValue: 85000, field: 'daily_salary' },
    overtimeRate: { type: DataTypes.DECIMAL(14,2), defaultValue: 9000, field: 'overtime_rate' },
    allowance: { type: DataTypes.DECIMAL(14,2), defaultValue: 0 },
    payrollType: { type: DataTypes.STRING, defaultValue: 'Monthly', field: 'payroll_type' },
    photo: DataTypes.TEXT, // R2 URL
    notes: DataTypes.TEXT,
  }, { tableName: 'employees', underscored: true, timestamps: true, indexes: [
    { fields: ['company_id'] }, { fields: ['full_name'] }
  ]});
  Employee.associate = (m) => {
    Employee.belongsTo(m.Company, { foreignKey: 'company_id' });
    Employee.hasMany(m.AttendanceRecord, { foreignKey: 'employee_id' });
  };
  return Employee;
};
```

#### `app_settings` (per company, mirrors `src/core/settings.js:3`)

```js
// models/appSetting.js
module.exports = (sequelize, DataTypes) => {
  const AppSetting = sequelize.define('AppSetting', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'company_id' },
    companyName: { type: DataTypes.STRING, field: 'company_name' },
    companyAddress: { type: DataTypes.TEXT, field: 'company_address' },
    companyPhone: { type: DataTypes.STRING, field: 'company_phone' },
    companyEmail: { type: DataTypes.STRING, field: 'company_email' },
    companyLogo: { type: DataTypes.TEXT, field: 'company_logo' },
    normalStart: { type: DataTypes.STRING, defaultValue: '09:00', field: 'normal_start' },
    normalEnd: { type: DataTypes.STRING, defaultValue: '18:00', field: 'normal_end' },
    overtimeStart: { type: DataTypes.STRING, defaultValue: '18:30', field: 'overtime_start' },
    latePenaltyPerMinute: { type: DataTypes.INTEGER, defaultValue: 1000, field: 'late_penalty_per_minute' },
    latePenaltyMaxMinutes: { type: DataTypes.INTEGER, defaultValue: 30, field: 'late_penalty_max_minutes' },
    yellowCardPenalty: { type: DataTypes.INTEGER, defaultValue: 30000, field: 'yellow_card_penalty' },
    yellowCardStep: { type: DataTypes.INTEGER, defaultValue: 5000, field: 'yellow_card_step' },
    redCardPenalty: { type: DataTypes.INTEGER, defaultValue: 150000, field: 'red_card_penalty' },
    cardRules: { type: DataTypes.JSON, field: 'card_rules', defaultValue: [] },
    maxOvertimeMinutes: { type: DataTypes.INTEGER, defaultValue: 240, field: 'max_overtime_minutes' },
    overtimeRatePerHour: { type: DataTypes.INTEGER, defaultValue: 9000, field: 'overtime_rate_per_hour' },
    holidayMultiplier: { type: DataTypes.FLOAT, defaultValue: 1.4, field: 'holiday_multiplier' },
    workDays: { type: DataTypes.JSON, field: 'work_days', defaultValue: { "0":false,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true } },
    targetDayMethod: { type: DataTypes.STRING, defaultValue: 'AUTO', field: 'target_day_method' },
    manualTargetDays: { type: DataTypes.INTEGER, defaultValue: 26, field: 'manual_target_days' },
    deductHolidaysFromTarget: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'deduct_holidays_from_target' },
    holidays: { type: DataTypes.JSON, defaultValue: [] },
    offEmployees: { type: DataTypes.JSON, field: 'off_employees', defaultValue: [] },
    attendanceRadius: { type: DataTypes.INTEGER, defaultValue: 100, field: 'attendance_radius' },
    attendanceGeofencingEnabled: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'attendance_geofencing_enabled' },
    attendanceStrictMode: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'attendance_strict_mode' },
    officeLatitude: { type: DataTypes.STRING, field: 'office_latitude' },
    officeLongitude: { type: DataTypes.STRING, field: 'office_longitude' },
    officeLocationName: { type: DataTypes.STRING, field: 'office_location_name' },
    masterPenalties: { type: DataTypes.JSON, field: 'master_penalties', defaultValue: [] },
    masterRewards: { type: DataTypes.JSON, field: 'master_rewards', defaultValue: [] },
    pointDefault: { type: DataTypes.INTEGER, defaultValue: 0, field: 'point_default' },
    yellowCardPoint: { type: DataTypes.INTEGER, defaultValue: 10, field: 'yellow_card_point' },
    redCardPoint: { type: DataTypes.INTEGER, defaultValue: 30, field: 'red_card_point' },
    yellowToRedThreshold: { type: DataTypes.INTEGER, defaultValue: 3, field: 'yellow_to_red_threshold' },
    pointResetDay: { type: DataTypes.INTEGER, defaultValue: 1, field: 'point_reset_day' },
    pointResetEnabled: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'point_reset_enabled' },
    activePeriodKey: { type: DataTypes.STRING, field: 'active_period_key' },
  }, { tableName: 'app_settings', underscored: true, timestamps: true });
  return AppSetting;
};
```

#### `attendance_periods` + `attendance_records`

```js
// models/attendancePeriod.js
module.exports = (sequelize, DataTypes) => {
  const AttendancePeriod = sequelize.define('AttendancePeriod', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    key: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM
    label: DataTypes.STRING, // "Juli 2026"
    fileName: { type: DataTypes.STRING, field: 'file_name' },
    fileUrl: { type: DataTypes.TEXT, field: 'file_url' }, // R2 URL
    periodStart: { type: DataTypes.DATEONLY, field: 'period_start' },
    periodEnd: { type: DataTypes.DATEONLY, field: 'period_end' },
    uploadedBy: { type: DataTypes.STRING, field: 'uploaded_by' },
  }, { tableName: 'attendance_periods', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','key'] }
  ]});
  AttendancePeriod.associate = (m) => {
    AttendancePeriod.belongsTo(m.Company, { foreignKey: 'company_id' });
    AttendancePeriod.hasMany(m.AttendanceRecord, { foreignKey: 'period_id', onDelete: 'CASCADE' });
  };
  return AttendancePeriod;
};

// models/attendanceRecord.js
module.exports = (sequelize, DataTypes) => {
  const AttendanceRecord = sequelize.define('AttendanceRecord', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    periodId: { type: DataTypes.STRING, allowNull: false, field: 'period_id' },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    checkIn: { type: DataTypes.STRING, field: 'check_in' }, // HH:mm
    checkOut: { type: DataTypes.STRING, field: 'check_out' },
    rawTimestamps: { type: DataTypes.JSON, field: 'raw_timestamps', defaultValue: [] },
    status: { type: DataTypes.STRING, defaultValue: 'Tidak Hadir' },
    dataStatus: { type: DataTypes.STRING, defaultValue: 'No Data', field: 'data_status' },
    isManualOverride: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_manual_override' },
    manualReason: { type: DataTypes.STRING, field: 'manual_reason' },
  }, { tableName: 'attendance_records', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['period_id','employee_id','date'] },
    { fields: ['employee_id','date'] }
  ]});
  return AttendanceRecord;
};
```

#### Remaining tables — condensed pattern

All follow same `sequelize.define` style. Key columns:

```js
// upload_logs
{ id: UUID, companyId, fileName, fileSize, periodKey, periodLabel, employeeCount, recordCount, status: ENUM('SUCCESS','WARNING','FAILED'), note: TEXT, uploadedBy, createdAt }

// employee_cards  (attendance-calc-cards)
{ id: UUID, companyId, employeeId, empName, yellow: INT, red: INT, note: TEXT, isUserTouched: BOOLEAN }

// payroll_snapshots
{ id: UUID, companyId, periodKey, employeeId, payload: JSON, finalizedBy, createdAt } // unique company_id+periodKey+employeeId

// payslip_archives
{ id: STRING PK "SLIP-YYYY-MM-EMP-0001", companyId, periodKey, periodLabel, employeeId, fullName, department, jobTitle, payload: JSON, isPrinted: BOOLEAN, archivedAt }

// thr_settings
{ id: UUID, companyId UNIQUE, enabled, regulationType, applicableYear, holidayId, holidayName, holidayDate: DATEONLY, paymentDeadlineDays, wageBasisType, companyPolicyMultiplier: FLOAT, companyMinimumTHR: DECIMAL(14,2), includePieceRateBonus, notes }

// thr_adjustments / thr_payments / thr_audit_logs
{ id: UUID, companyId, year: INT, employeeId, adjustmentAmount: DECIMAL, reason, note, modifiedBy, modifiedAt } // unique company+year+employee
{ id: UUID, companyId, year, employeeId, status: ENUM('PAID','UNPAID'), paidAt, paymentMethod, notes, updatedBy }
{ id: UUID, companyId, year, employeeId, type: ENUM('MANUAL_ADJUSTMENT','REMOVE_ADJUSTMENT','PAYMENT_STATUS_UPDATE'), detail: JSON, timestamp }

// kpi_masters (global, no company_id — or add if multi-tenant templates differ)
{ id: STRING PK, department, jobTitle, name, description, target: FLOAT, unit, weight: FLOAT, assessmentMethod, dataSource, status, isDefault: BOOLEAN, isAutoAttendance: BOOLEAN, sopIds: JSON }

// kpi_configs (per company)
{ id: UUID, companyId UNIQUE, veryGoodMin: 90, goodMin: 80, fairMin: 70, labels: JSON }

// kpi_scores
{ id: UUID, companyId, employeeId, periodKey, kpiId, actualValue: FLOAT, scorePoin: FLOAT, isCustom: BOOLEAN, customMeta: JSON } // unique company+employee+period+kpiId

// discipline_records — src/core/disciplineStore.js:9
{ id: UUID, companyId, employeeId, employeeName, date: DATEONLY, violationType, severity: ENUM('Ringan','Sedang','Berat'), cardType, description: TEXT, createdBy, status: ENUM('Aktif','Selesai','Kedaluwarsa'), resolvedDate: DATEONLY }

// leave_records
{ id: UUID, companyId, employeeId, employeeName, type: ENUM('CUTI','SAKIT','IZIN'), startDate: DATEONLY, endDate: DATEONLY, totalDays: INT, paidType: ENUM('PAID','UNPAID'), reason, attachment: TEXT (R2 URL), status: ENUM('APPROVED','PENDING','REJECTED') }

// point_transactions
{ id: UUID, companyId, employeeId, employeeName, type: ENUM('penalty','reward'), masterId, name, point: INT, category, cardType: ENUM('yellow','red'), description, date: DATEONLY }

// evaluations
{ id: UUID, companyId, employeeId, periodKey, overallScore: FLOAT, decision: ENUM('Lulus','Perpanjang Probation','Tidak Lulus'), notes: TEXT, evaluator, evaluationDate: DATEONLY, nextEvaluationDate: DATEONLY, payload: JSON }

// sops / regulations / departments / contract_types / position_allowances / payroll_components / manual_attendance_overrides
// — see §5.1 for localStorage origins; all include company_id FK
```

### 6.3 Migrations

```bash
# generate
npx sequelize-cli migration:generate --name create-companies
npx sequelize-cli migration:generate --name create-employees
# ... one per table

# run
npx sequelize-cli db:migrate

# undo
npx sequelize-cli db:migrate:undo

# seed
npx sequelize-cli seed:generate --name demo-company
npx sequelize-cli db:seed:all
```

Generate migrations via `sequelize.define` sync for dev:

```js
// for quick dev only
await sequelize.sync({ alter: true });
```

Prefer explicit migrations for production.

### 6.4 Associations file

```js
// models/index.js (generated by sequelize-cli, extend)
const db = {};
// ... init
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) db[modelName].associate(db);
});
db.sequelize = sequelize;
db.Sequelize = Sequelize;
module.exports = db;
```

---

## 7. API Specification

Base URL: `/api/v1` · Auth: `Authorization: Bearer <accessToken>` (httpOnly refresh via cookie `refreshToken`)

All responses envelope:
```json
{ "ok": true, "data": {}, "meta": {} }
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
```

### 7.1 Auth — `src/core/authStore.js:16`

| Method | Path | Description | Access |
|---|---|---|---|
| `POST` | `/auth/register` | Create user (admin bootstrap) | ADMIN |
| `POST` | `/auth/login` | `{username,password}` → `{accessToken, user}` + set `refreshToken` cookie | public |
| `POST` | `/auth/refresh` | Rotate access via httpOnly cookie | cookie |
| `POST` | `/auth/logout` | Clear cookie, revoke `sessions` row | auth |
| `GET` | `/auth/me` | Current user | auth |
| `PATCH` | `/auth/me` | Update displayName/password (bcrypt re-hash) | auth |

`bcrypt` 12 rounds. Access 15 min, Refresh 7 days in `sessions`.

### 7.2 Companies — `src/core/companyStore.js:6`

| Method | Path | Description |
|---|---|---|
| `GET` | `/companies` | List |
| `POST` | `/companies` | Create `{name,phone,address,email,logo}` — logo may be `multipart` → R2 |
| `GET` | `/companies/:id` | Detail |
| `PATCH` | `/companies/:id` | Update |
| `DELETE` | `/companies/:id` | Delete (block if last) |
| `POST` | `/companies/:id/activate` | Set `users.active_company_id` for current user |

Roles: ADMIN/HR write; others read.

### 7.3 Employees — `src/core/employeeStore.js:7`

| Method | Path | Description |
|---|---|---|
| `GET` | `/employees?companyId=&q=&status=&department=&page=&limit=` | List + search + pagination (`findAndCountAll`) |
| `POST` | `/employees` | Create (auto `EMP-XXXX` via `generateNextEmployeeId` logic) |
| `POST` | `/employees/import` | Bulk import — `multer` `.xlsx` `Template_Master_Data_Karyawan.xlsx` → `bulkCreate` |
| `GET` | `/employees/:id` | Detail + tenure/probation `src/core/employeeStore.js:640` |
| `PATCH` | `/employees/:id` | Update (salary history → keep audit in `payload` or separate `salary_histories` table) |
| `DELETE` | `/employees/:id` | Hard delete |
| `POST` | `/employees/:id/resign` | `employmentStatus=Resigned` `src/core/employeeStore.js:322` |
| `POST` | `/employees/:id/reactivate` | Re-activate |
| `GET` | `/employees/:id/evaluations` | Alias |

Validation: `joinDate` via `parseExcelDate` `src/core/employeeStore.js:423` ported to server `zod`.

### 7.4 Attendance — `src/core/fileParser.js:4` + `src/core/historyStore.js:5`

| Method | Path | Description |
|---|---|---|
| `POST` | `/attendance/upload` | `multer` `file` (.xlsx) → parse server, create period + records, upload raw to R2 |
| `GET` | `/attendance/periods` | List periods `getHistoryList()` `src/core/historyStore.js:186` |
| `GET` | `/attendance/periods/:key` | Period detail + records |
| `GET` | `/attendance/periods/:key/summary` | Server `generateSummary()` output (attendanceCalc + analytics) |
| `PATCH` | `/attendance/periods/:key/activate` | Set `app_settings.active_period_key` `src/core/historyStore.js:79` |
| `DELETE` | `/attendance/periods/:key` | Delete period (cascade records) `src/core/historyStore.js:731` |
| `GET` | `/attendance/records?periodKey=&employeeId=&dateFrom=&dateTo=` | Flat records query |
| `GET` | `/attendance/period-options` | `getAvailablePeriodOptions()` `src/core/historyStore.js:392` |
| `POST` | `/attendance/manual-override` | `{empName,date,checkIn,checkOut,reason}` `src/core/manualAttendanceStore.js:74` |
| `DELETE` | `/attendance/manual-override` | `{empName,date}` revert `src/core/manualAttendanceStore.js:125` |
| `GET` | `/attendance/manual-overrides?periodKey=` | List overrides |
| `GET` | `/attendance/upload-logs` | `upload_logs` |
| `DELETE` | `/attendance/upload-logs/:id` | Delete log |

**Upload flow** — see §9.

### 7.5 Settings — `src/core/settings.js:3`

| Method | Path | Description |
|---|---|---|
| `GET` | `/settings?companyId=` | Load merged defaults + per-company `app_settings` |
| `PUT` | `/settings` | Upsert (validate ranges: `latePenaltyPerMinute`, `holidayMultiplier:1.4`, `attendanceRadius 10..5000`) `src/core/settings.js:82` |
| `POST` | `/settings/reset` | Reset to `DEFAULT_SETTINGS` `src/core/settings.js:280` |

Keep migration: old `pointMax/pointMin` cleanup `src/core/settings.js:189`.

### 7.6 Departments & Contract Types — `src/core/departmentStore.js:6`

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/departments` | CRUD |
| `GET/PATCH/DELETE` | `/departments/:id` | — |
| `POST` | `/departments/auto-seed` | `autoSeedDepartmentsFromAttendance()` |
| `GET/POST` | `/contract-types` | CRUD |
| `GET/PATCH/DELETE` | `/contract-types/:id` | — |

### 7.7 Position Allowances — `src/core/positionAllowanceStore.js:6`

| Method | Path | Description |
|---|---|---|
| `GET` | `/position-allowances` | List |
| `POST` | `/position-allowances` | Upsert `{jobTitle, amount}` |
| `DELETE` | `/position-allowances/:id` | Delete |

### 7.8 Payroll Components — `src/core/payrollComponentStore.js:6`

| Method | Path | Description |
|---|---|---|
| `GET` | `/payroll-components` | List |
| `POST` | `/payroll-components` | Create |
| `PATCH/DELETE` | `/payroll-components/:id` | Update/Delete |

### 7.9 Payroll Engine — `src/core/payrollEngine.js:29`

| Method | Path | Description |
|---|---|---|
| `POST` | `/payroll/calculate` | `{periodKey, employeeId, manualAdjustments, payrollNote}` → `calculateEmployeePayroll()` (not persisted) |
| `POST` | `/payroll/snapshots` | Persist `payroll_snapshots` `src/core/payrollEngine.js:166` |
| `GET` | `/payroll/snapshots?periodKey=` | List |
| `GET` | `/payroll/snapshots/:periodKey/:employeeId` | Single |
| `POST` | `/payroll/archive` | `archivePayslip()` `src/core/payrollEngine.js:204` |
| `GET` | `/payroll/archives?periodKey=&employeeId=` | List `payslip_archives` |
| `DELETE` | `/payroll/archives/:id` | Delete |

### 7.10 THR — `src/core/thrStore.js:12` + `src/core/thrEngine.js`

| Method | Path | Description |
|---|---|---|
| `GET/PUT` | `/thr/settings` | `thr_settings` |
| `POST` | `/thr/settings/reset` | Reset |
| `GET` | `/thr/calculate?year=&employeeId=` | THR per-employee |
| `POST` | `/thr/adjustments` | `thr_adjustments` |
| `DELETE` | `/thr/adjustments/:year/:employeeId` | — |
| `GET` | `/thr/payments?year=` / `PUT` | `thr_payments` `updateTHRPaymentStatus` |
| `GET` | `/thr/audit-logs?year=&employeeId=` | `thr_audit_logs` |

Presets: `THR_HOLIDAY_PRESETS` `src/core/thrStore.js:12`.

### 7.11 KPI — `src/core/kpiStore.js:18`

| Method | Path | Description |
|---|---|---|
| `GET` | `/kpi/masters?department=&jobTitle=` | `getKPIMastersByJobTitle()` `src/core/kpiStore.js:631` |
| `POST/PATCH/DELETE` | `/kpi/masters` | CRUD `deleteKPIMaster` |
| `GET/PUT` | `/kpi/config` | `kpi_configs` |
| `GET` | `/kpi/scores?employeeId=&periodKey=` | `kpi_scores` |
| `POST` | `/kpi/scores` | `saveEmployeeKPIMetricScore / saveBatch…` `src/core/kpiStore.js:703` |
| `POST` | `/kpi/scores/custom` | Custom metric `customMeta` JSON |
| `POST` | `/kpi/assigned` | Assigned KPI list (store as JSON in a `kpi_scores` helper or new `kpi_assigned` table) |
| `DELETE` | `/kpi/scores/:employeeId/:periodKey/:kpiId` | `removeKPIMetricFromEmployee` |
| `POST` | `/kpi/evaluate` | `evaluateEmployeeKPI()` |

### 7.12 Discipline — `src/core/disciplineStore.js:37`

| Method | Path | Description |
|---|---|---|
| `GET` | `/discipline?employeeId=&status=&severity=` | List |
| `POST` | `/discipline` | Create |
| `GET/PATCH/DELETE` | `/discipline/:id` | CRUD |
| `GET` | `/discipline/:employeeId/metrics` | `computeDisciplineMetrics()` `src/core/disciplineStore.js:144` |

Enums: `SEVERITY_LEVELS`, `SANCTION_TYPES`, `STATUS_TYPES` `src/core/disciplineStore.js:9`.

### 7.13 Leave — `src/core/leaveStore.js:5`

| Method | Path | Description |
|---|---|---|
| `GET` | `/leave?employeeId=&type=&status=&periodKey=` | List |
| `POST` | `/leave` | Create (attachment via `multer` → R2) |
| `PATCH/DELETE` | `/leave/:id` | Update/Delete |
| `GET` | `/leave/:employeeId/quota` | `calculateEmployeeLeaveQuota` |
| `GET` | `/leave/:employeeId/summary?periodKey=` | `getLeaveSummaryForEmployee` |

### 7.14 Points — `src/core/pointStore.js:3`

| Method | Path | Description |
|---|---|---|
| `GET` | `/points/transactions?employeeId=&periodKey=` | Filtered |
| `POST` | `/points/transactions` | Create |
| `PATCH/DELETE` | `/points/transactions/:id` | Update/Delete |
| `GET` | `/points/status/:employeeId?periodKey=` | `getEmployeePointStatus()` `src/core/pointStore.js:295` |
| `GET` | `/points/report/:employeeId?periodKey=` | `getEmployeeMonthlyReport()` `src/core/pointStore.js:232` |
| `GET` | `/points/periods` | `getAvailablePeriodKeys()` |

Formula: `monthlyPoint = 0 - penalty + reward` `src/core/pointStore.js:202`.

### 7.15 Evaluations — `src/core/evaluationStore.js:6`

| Method | Path | Description |
|---|---|---|
| `GET` | `/evaluations?employeeId=` | List |
| `POST` | `/evaluations` | Create/update |
| `GET/DELETE` | `/evaluations/:id` | Detail/Delete |

### 7.16 SOP & Regulations — `src/core/sopStore.js:1`, `src/core/regulationsStore.js:1`

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/sops` | CRUD |
| `GET/PATCH/DELETE` | `/sops/:id` | — |
| `GET/PUT/DELETE` | `/regulations?companyId=` | Per-company HTML |

### 7.17 Analytics — `src/core/analyticsEngine.js`

| Method | Path | Description |
|---|---|---|
| `GET` | `/analytics/overview?periodKey=` | Aggregates |
| `GET` | `/analytics/by-department?periodKey=` | Per-dept |
| `GET` | `/analytics/by-employee/:id?periodKey=` | Per-employee |
| `GET` | `/analytics/calendar?periodKey=` | Calendar grid |

### 7.18 Backup / Restore — `src/core/historyStore.js:751`

| Method | Path | Description |
|---|---|---|
| `GET` | `/backup/export` | Dump all tables → `exportBackupJSON()` shape |
| `POST` | `/backup/import` | `importBackupJSON()` transactional upsert (Sequelize transaction) |

---

## 8. Auth & Authorization (bcrypt + JWT)

### 8.1 Current

```js
// src/core/authStore.js:22 — Mock
// token: `mock-${Date.now()}`, any non-empty creds pass
```

### 8.2 Target — Express + bcrypt

```js
// utils/hash.js
const bcrypt = require('bcrypt');
exports.hashPassword = (plain) => bcrypt.hash(plain, 12);
exports.comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// controllers/authController.js
const jwt = require('jsonwebtoken');
const { hashPassword, comparePassword } = require('../utils/hash');
const { User, Session } = require('../models');
const crypto = require('crypto');

exports.login = async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user || !(await comparePassword(password, user.passwordHash)))
    return res.status(401).json({ ok:false, error:{ code:'INVALID_CREDENTIALS', message:'Username atau password salah' }});

  const accessToken = jwt.sign(
    { sub: user.id, role: user.role, companyId: user.activeCompanyId },
    process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m' }
  );
  const refreshRaw = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
  await Session.create({ userId: user.id, tokenHash, expiresAt: new Date(Date.now()+7*24*60*60*1000) });

  res.cookie('refreshToken', refreshRaw, {
    httpOnly: true, secure: process.env.NODE_ENV==='production',
    sameSite: 'Strict', maxAge: 7*24*60*60*1000, path: '/api/v1/auth'
  });
  res.json({ ok:true, data:{ accessToken, user:{ id:user.id, username:user.username, displayName:user.displayName, role:user.role }}});
};

exports.refresh = async (req, res) => {
  const raw = req.cookies.refreshToken;
  if (!raw) return res.status(401).json({ ok:false, error:{code:'NO_REFRESH'}});
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const session = await Session.findOne({ where:{ tokenHash: hash }});
  if (!session || session.expiresAt < new Date()) return res.status(401).json({ ok:false, error:{code:'EXPIRED'}});
  const user = await User.findByPk(session.userId);
  const accessToken = jwt.sign({ sub:user.id, role:user.role, companyId:user.activeCompanyId }, process.env.JWT_SECRET, { expiresIn:'15m' });
  res.json({ ok:true, data:{ accessToken }});
};
```

Middleware:

```js
// middleware/auth.js
const jwt = require('jsonwebtoken');
exports.authenticate = (req,res,next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ ok:false, error:{ code:'NO_TOKEN' }});
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.user = payload; next();
  } catch { return res.status(401).json({ ok:false, error:{ code:'INVALID_TOKEN' }}); }
};
exports.authorize = (...roles) => (req,res,next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ ok:false, error:{ code:'FORBIDDEN' }});
```

* **Roles:** `ADMIN` (all), `HR` (attendance/manual/leave/discipline/KPI/THR/payroll calc), `MANAGER` (read+approve), `STAFF` (own data only).
* **Company scoping:** All Sequelize queries add `where: { companyId: req.user.companyId }` or `req.headers['x-company-id']` validated.

### 8.3 Frontend change

```js
// src/core/apiClient.js
const API = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export async function api(path, { method='GET', body, auth=true }={}) {
  const headers = { 'Content-Type':'application/json' };
  if (auth) headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body?JSON.stringify(body):undefined, credentials:'include' });
  if (res.status===401 && auth) {
    const r = await fetch(`${API}/auth/refresh`, { method:'POST', credentials:'include' });
    if (r.ok) { const j=await r.json(); localStorage.setItem('accessToken', j.data.accessToken); return api(path,{method,body,auth}); }
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}
```

---

## 9. File Upload & Attendance Pipeline (multer + R2)

### 9.1 Multer (memory)

```js
// middleware/upload.js
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            || file.originalname.endsWith('.xlsx');
    cb(ok ? null : new Error('Hanya file .xlsx yang diterima'), ok);
  }
});
module.exports = upload; // usage: upload.single('file')
```

### 9.2 Cloudflare R2 (S3 API)

```js
// config/r2.js
const { S3Client } = require('@aws-sdk/client-s3');
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
module.exports = r2;

// utils/r2Upload.js
const { PutObjectCommand } = require('@aws-sdk/client-s3');
async function uploadToR2(buffer, key, contentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `${process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET}.r2.dev`}/${key}`;
}
```

### 9.3 Flow

```
Client Upload.jsx ──POST /api/v1/attendance/upload (multipart, field "file")──> Express
    |  { file: .xlsx }                                                      |  upload.single('file') (multer memory)
    |                                                                       |  XLSX.read(buffer) -> parseAttendanceFile() src/core/fileParser.js:4
    |                                                                       |  validate period + employees (>0 else 400)
    |  <── { periodKey, label, employeeCount, warnings, fileUrl } ──        |  sequelize.transaction: upsert attendance_periods + bulkCreate attendance_records
    |                                                                       |  UploadLog.create({ status: warnings.length?'WARNING':'SUCCESS' })
    |                                                                       |  uploadToR2(buffer, `attendance/${companyId}/${periodKey}.xlsx`)
```

Duplicate `companyId+key` unique → second upload for same month = update (upsert) with audit note.

Server reuses `parseAttendanceFile()` extracted to `backend/utils/attendanceParser.js` (copy of `src/core/fileParser.js:4`).

---

## 10. Calculation Engines — Client vs Server

| Engine | Keep client? | Server responsibility |
|---|---|---|
| `src/core/attendanceCalc.js:122` `processDayRecord` | ✅ instant preview | ✅ re-run on upload to persist canonical totals in `attendance_records` / summary view |
| `src/core/summaryGen.js` | ✅ preview | ✅ final `GET /attendance/periods/:key/summary` as source of truth |
| `src/core/payrollEngine.js:29` | ✅ draft | ✅ snapshot finalization must be server (money) — transactional `payroll_snapshots` |
| `src/core/thrEngine.js` | — | ✅ server (legal payout) |
| `src/core/analyticsEngine.js` | optional | ✅ server aggregates (`GROUP BY department`, Sequelize `fn`) |

Phase 1: server persists raw records; client still does `generateSummary`. Phase 2: server exposes summary endpoint.

---

## 11. Environment Variables

`backend/.env` (copy from `backend/.env.example`):

```
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173

# MySQL (mysql2)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=yourpassword
DB_NAME=attendance_app
# Or single URL fallback if you prefer
# DATABASE_URL=mysql://root:pass@127.0.0.1:3306/attendance_app

JWT_SECRET=replace-with-64-hex-random
JWT_REFRESH_SECRET=replace-with-64-hex-random
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_EXPIRES=7d
BCRYPT_ROUNDS=12

# Cloudflare R2
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=attendance-app
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

Frontend `.env`:

```
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_APP_TITLE="Attendance Calculator — Perhitungan Absensi Karyawan"
```

Dev proxy `vite.config.js:1`:

```js
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } }
});
```

---

## 12. Backend Project Structure (Express + Sequelize)

```
backend/
├── src/
│   ├── index.js                # Express app: helmet, cors, morgan, json, cookieParser, routes
│   ├── app.js                  # createApp() — mounts /api/v1/*
│   ├── config/
│   │   ├── database.js         # Sequelize instance (mysql2)
│   │   ├── r2.js               # S3Client for R2
│   │   └── env.js              # zod env validation
│   ├── middleware/
│   │   ├── auth.js             # authenticate + authorize (JWT)
│   │   ├── validate.js         # zod body/query validator
│   │   ├── upload.js           # multer memoryStorage (xlsx, 10MB)
│   │   └── errorHandler.js     # global error handler
│   ├── models/
│   │   ├── index.js            # sequelize-cli generated, associations
│   │   ├── company.js
│   │   ├── user.js
│   │   ├── session.js
│   │   ├── employee.js
│   │   ├── attendancePeriod.js
│   │   ├── attendanceRecord.js
│   │   ├── manualAttendanceOverride.js
│   │   ├── uploadLog.js
│   │   ├── appSetting.js
│   │   ├── department.js
│   │   ├── contractType.js
│   │   ├── positionAllowance.js
│   │   ├── payrollComponent.js
│   │   ├── payrollSnapshot.js
│   │   ├── payslipArchive.js
│   │   ├── thrSetting.js
│   │   ├── thrAdjustment.js
│   │   ├── thrPayment.js
│   │   ├── thrAuditLog.js
│   │   ├── kpiMaster.js
│   │   ├── kpiConfig.js
│   │   ├── kpiScore.js
│   │   ├── disciplineRecord.js
│   │   ├── leaveRecord.js
│   │   ├── pointTransaction.js
│   │   ├── evaluation.js
│   │   ├── sop.js
│   │   ├── regulation.js
│   │   └── employeeCard.js
│   ├── modules/
│   │   ├── auth/auth.routes.js
│   │   ├── auth/auth.controller.js
│   │   ├── auth/auth.service.js   # bcrypt + jwt + sessions
│   │   ├── employees/...
│   │   ├── attendance/
│   │   │   ├── attendance.routes.js
│   │   │   ├── attendance.controller.js
│   │   │   ├── attendance.service.js
│   │   │   └── attendanceParser.js # copy of src/core/fileParser.js:4
│   │   ├── payroll/
│   │   ├── thr/
│   │   ├── kpi/
│   │   ├── discipline/
│   │   ├── leave/
│   │   ├── points/
│   │   ├── companies/
│   │   ├── settings/
│   │   └── backup/
│   ├── utils/
│   │   ├── hash.js               # bcrypt wrappers
│   │   ├── r2Upload.js           # PutObjectCommand helper
│   │   ├── formatter.js          # shared src/core/formatter.js
│   │   └── pagination.js         # { page, limit } -> { offset, limit }
│   └── seeders/                  # or top-level seeders/
├── config/
│   └── config.js                 # sequelize-cli env config (uses mysql2)
├── migrations/                   # npx sequelize-cli migration:generate ...
├── seeders/                      # npx sequelize-cli seed:generate ...
├── .env.example
├── .sequelizerc
└── package.json
```

`.sequelizerc`:

```js
const path = require('path');
module.exports = {
  'config': path.resolve('config', 'config.js'),
  'models-path': path.resolve('src/models'),
  'seeders-path': path.resolve('seeders'),
  'migrations-path': path.resolve('migrations')
};
```

Run:

```bash
npm run dev        # nodemon src/index.js
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
```

`src/index.js` skeleton:

```js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { sequelize } = require('./models');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
app.use('/api/v1/companies', require('./modules/companies/companies.routes'));
app.use('/api/v1/employees', require('./modules/employees/employees.routes'));
app.use('/api/v1/attendance', require('./modules/attendance/attendance.routes'));
// ... mount others

app.use(require('./middleware/errorHandler'));

sequelize.authenticate().then(() => console.log('MySQL connected (mysql2)'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on :${PORT}`));
```

---

## 13. Frontend Integration / Migration Plan

### 13.1 API Client

Create `src/core/apiClient.js`:

```js
const API = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export async function api(path, { method='GET', body, auth=true, isForm=false }={}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
    credentials: 'include'
  });
  if (res.status===401 && auth) {
    const r = await fetch(`${API}/auth/refresh`, { method:'POST', credentials:'include' });
    if (r.ok) { const j=await r.json(); localStorage.setItem('accessToken', j.data.accessToken); return api(path,{method,body,auth,isForm}); }
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'API error');
  return json.data;
}
// upload helper (multer expects FormData)
export const uploadAttendance = (file) => {
  const fd = new FormData(); fd.append('file', file);
  return api('/attendance/upload', { method:'POST', body: fd, isForm: true });
};
```

### 13.2 Store-by-store replacement

| Store | Change |
|---|---|
| `src/core/authStore.js` | `login/logout/isAuthenticated` → `api('/auth/...')` with `bcrypt` server check |
| `src/core/employeeStore.js` | `loadEmployees()` → `api('/employees')`; keep `parseExcelDate` as shared util |
| `src/core/historyStore.js` | `saveMonthlyHistory` → `uploadAttendance(file)`; `loadHistoryMap` → `GET /attendance/periods` |
| `src/core/manualAttendanceStore.js` | `saveManualOverride` → `POST /attendance/manual-override` |
| `src/core/settings.js` | `loadSettings/saveSettings` → `GET/PUT /settings` |
| `src/core/payrollEngine.js` | Calc stays client, snapshots → `POST /payroll/snapshots` |
| Others | Same: local CRUD → `api(...)`; keep `if (!VITE_API_BASE_URL) fallback to localStorage` feature flag |

### 13.3 Demo dataset

`src/core/historyStore.js:648` `getInitialDemoDataset()` → move to `seeders/demo-attendance.js` (creates `attendance_periods 2026-07` + `attendance_records`). Frontend `buildInitialState()` `src/App.jsx:67` should `GET /attendance/periods` instead.

### 13.4 Import templates

`public/Template/Template_Master_Data_Karyawan.xlsx` → `POST /employees/import` (`multer` + `xlsx` + `bulkCreate`).

---

## 14. Security, Validation & Compliance

* **Validation:** `zod` schemas mirroring `src/core/validator.js:1`. Reject `salary<0`, `dates` via `parseExcelDate` range 1970–2050, `overtime<=240`.
* **bcrypt:** `BCRYPT_ROUNDS=12` (env). Never log `passwordHash`.
* **Rate limiting:** `express-rate-limit` on `/auth/login` (5/min/IP) + `/attendance/upload` (10/hr).
* **CORS:** `CORS_ORIGIN` strict; `credentials: true`.
* **Upload:** only `.xlsx`, max 10 MB, `multer` `fileFilter`; scan `magic bytes` server-side.
* **R2:** private bucket, signed URL if needed; public URL only for exports if required.
* **PII:** `nik/npwp/bank` — consider `AES-256` column encryption or restrict roles.
* **Audit:** every write to `manual_attendance_overrides`, `payroll_snapshots`, `thr_adjustments`, `discipline_records` appends `updatedBy` from JWT.

---

## 15. Deployment

### 15.1 Backend (Express + MySQL2)

* **VPS / Railway / Fly / Render:**
  ```bash
  npm ci --omit=dev
  npx sequelize-cli db:migrate   # or sequelize.sync({ alter: true }) dev only
  npx sequelize-cli db:seed:all
  node src/index.js
  ```
  Docker:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev
  COPY . .
  EXPOSE 3000
  CMD ["node", "src/index.js"]
  ```

* **MySQL:** Create DB `attendance_app` on same host or managed (PlanetScale, Railway MySQL). Ensure `mysql2` can connect; run `npx sequelize-cli db:create` first.

### 15.2 Frontend

Existing `vercel.json:1` SPA rewrite stays. Add `VITE_API_BASE_URL` env in Vercel dashboard pointing to backend URL.

```
vercel --prod   # frontend (Vite)
# backend env set on host (R2 + DB vars)
```

### 15.3 CI

```yaml
- run: npm ci && npm test
- run: npx sequelize-cli db:migrate
- run: npm run build
```

---

## 16. Seeding & Backup/Restore

### 16.1 Seed (sequelize-cli)

```bash
npx sequelize-cli seed:generate --name demo-company
npx sequelize-cli seed:generate --name kpi-masters
```

`seeders/demo-company.js`:

```js
'use strict';
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('companies', [{
      id: 'comp-sua-untung-abadi',
      name: 'CV. SUA UNTUNG ABADI',
      phone: '+62 85178523827',
      address: 'Jl. Ratu Teratai No.C1 ...',
      email: 'suauntungabadi@gmail.com',
      is_default: 1, created_at: new Date(), updated_at: new Date()
    }]);
    // employees, departments, kpi_masters via DEFAULT_KPI_MASTERS src/core/kpiStore.js:18
    // attendance_periods 2026-07 via getInitialDemoDataset() src/core/historyStore.js:648
  },
  async down(q) { await q.bulkDelete('companies', { id: 'comp-sua-untung-abadi' }); }
};
```

Also seed an ADMIN:

```js
const { hashPassword } = require('../src/utils/hash');
await queryInterface.bulkInsert('users', [{
  id: 'user-admin', username: 'admin', password_hash: await hashPassword('admin123'),
  display_name: 'Admin', role: 'ADMIN', created_at: new Date(), updated_at: new Date()
}]);
```

### 16.2 Backup/Restore

* Export: `GET /backup/export` — Sequelize `findAll` all tables → same shape as `exportBackupJSON()` `src/core/historyStore.js:751` (`monthlyHistory`, `employees`, `settings`, `cards`).
* Import: `POST /backup/import` — `sequelize.transaction` + `bulkCreate(..., { updateOnDuplicate: [...] })` mirroring `importBackupJSON()` `src/core/historyStore.js:781`.

---

## 17. Roadmap / Phases

| Phase | Scope | Effort |
|---|---|---|
| **P0 — Auth + Employees + Settings + Companies** | `users`, `sessions` (bcrypt/JWT), `employees`, `app_settings`, `companies` — unblock real login `src/App.jsx:100` | 3–5 days |
| **P1 — Attendance core** | `attendance_periods/records`, `multer+xlsx+R2` upload, manual overrides, `upload_logs` | 4–6 days |
| **P2 — Payroll & THR** | `payroll_snapshots`, `payslip_archives`, `thr_*` — money-critical `src/core/payrollEngine.js:29` | 5–7 days |
| **P3 — KPI/Discipline/Leave/Points/Evaluations** | Remaining HR modules | 5–7 days |
| **P4 — Server calc + analytics** | Move `generateSummary` to `GET /attendance/periods/:key/summary`, Sequelize aggregates | 3–4 days |
| **P5 — R2 + exports** | R2 for raw Excel + styled exports `src/core/excelExport.js`, signed URLs | 2–3 days |
| **P6 — Hardening** | Rate limit, audit, tests, seed, backup compat, deploy MySQL+R2 | 3–4 days |

**Total estimated:** 25–36 dev-days for full parity.

---

## References

* `PROJECT_AUDIT.md:1` — full repo audit (LOC, deps, routing, risks)
* `package.json:1` — deps (`xlsx`, `xlsx-js-style`, `fflate`, `react`)
* `src/App.jsx:95` — app state composition & hash routing
* `src/core/settings.js:82` — settings migration & defaults
* `src/core/attendanceCalc.js:122` — attendance business rules
* `src/core/payrollEngine.js:29` — payroll formula
* `src/core/pointStore.js:202` — point formula `0 - penalty + reward`
* `src/core/fileParser.js:1` — Excel parse logic to reuse at `backend/src/modules/attendance/attendanceParser.js`
* `src/core/authStore.js:22` — mock ceiling to replace with bcrypt+JWT

> Next step: `npx sequelize-cli init` then copy `config/config.js` (mysql2) from §6.1. Create `models/company.js` + `models/employee.js` first, run `npx sequelize-cli db:migrate`, then wire P0 auth routes (bcrypt). Keep frontend on `localStorage` behind `if (!VITE_API_BASE_URL)` flag until backend is ready.
