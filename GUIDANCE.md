# FRONTEND GUIDANCE — Implementing Every API

Backend: Express + MySQL (`/api/v1`). Interactive reference: `http://localhost:3000/api-docs`
(raw JSON: `/api-docs.json`, spec source: `src/config/swagger.js`).

This doc tells a frontend dev **exactly** how to call every endpoint:
base client, auth, company scoping, the period-filter system, then module-by-module
wiring with request/response shapes and snippets.

---

## 0. Conventions (apply to ALL calls)

| Concern | Rule |
|---|---|
| Base URL | `import.meta.env.VITE_API_BASE_URL \|\| '/api/v1'` (dev: `http://localhost:3000/api/v1`; add `'/api': 'http://localhost:3000'` to `vite.config.js` proxy) |
| Envelope | Success: `{ ok: true, data: {...}, meta?: {...} }` → **always read `json.data`**. Error: `{ ok: false, error: { code, message, details? } }` → throw `error.message`, use `error.code` for branching |
| Auth header | `Authorization: Bearer <accessToken>` on every call except `POST /auth/login`, `POST /auth/refresh` |
| Cookies | `credentials: 'include'` on every call (httpOnly `refreshToken` cookie) |
| Company scope | Every company-scoped call must send **one** of: `?companyId=` query, `companyId` body field, or `x-company-id` header. Server fallback order: `body/query → JWT companyId → x-company-id`. Recommended: set `x-company-id` globally from the active-company store |
| Dates | `YYYY-MM-DD` strings; months `YYYY-MM`. Never send `Date` objects (stringify to ISO date first) |
| Pagination | `?page=&limit=` (limit max 100, default 20). List returns `meta: { total, page, limit, totalPages, hasNext, hasPrev }`. Exception: `GET /attendance/records` uses `?limit=&offset=` and returns `data: { records, total, limit, offset }` |
| Roles | `ADMIN` all · `HR` everything except user-admin/backup-import/archive-delete/settings-reset · `MANAGER` read + evaluations create · `STAFF` own data. Gate write-buttons in UI by `user.role`; server still enforces (expect `403 FORBIDDEN`) |
| Rate limits | Login `20/min`, attendance upload `20/hour` → on `429`, show "coba lagi nanti" |

### 0.1 Base client (copy-paste)

```js
// src/core/apiClient.js
const API = import.meta.env.VITE_API_BASE_URL || '/api/v1';

let activeCompanyId = localStorage.getItem('activeCompanyId') || '';
export const setActiveCompanyId = (id) => {
  activeCompanyId = id || '';
  id ? localStorage.setItem('activeCompanyId', id) : localStorage.removeItem('activeCompanyId');
};

async function raw(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = localStorage.getItem('accessToken');
    if (t) headers.Authorization = `Bearer ${t}`;
    if (activeCompanyId) headers['x-company-id'] = activeCompanyId;
  }
  const res = await fetch(`${API}${path}`, {
    method, headers, credentials: 'include',
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });
  // Swagger UI for shape reference: /api-docs
  const json = await res.json().catch(() => ({ ok: false, error: { code: 'BAD_JSON' } }));
  return { res, json };
}

export async function api(path, opts = {}, _retried = false) {
  let { res, json } = await raw(path, opts);
  if (res.status === 401 && opts.auth !== false && !_retried) {
    const r = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      localStorage.setItem('accessToken', j.data.accessToken);
      return api(path, opts, true);
    }
    // refresh failed → force logout
    localStorage.removeItem('accessToken');
    window.location.hash = '#/login';
    throw new Error('Sesi berakhir, silakan login kembali');
  }
  if (!json.ok) {
    const err = new Error(json.error?.message || `Request failed (${res.status})`);
    err.code = json.error?.code; err.details = json.error?.details; err.status = res.status;
    throw err;
  }
  return json.data; // ← always unwrap here
}

// Usage: const { employees } = await api('/employees?q=budi&page=1');
```

### 0.2 Error-code handling cheat sheet

```js
try { await api('/employees', { method: 'POST', body: {...} }); }
catch (e) {
  switch (e.code) {
    case 'VALIDATION_ERROR': showFormErrors(e.details); break;   // 400, details: [{path, message}]
    case 'PERIOD_NOT_FOUND': showEmptyState(`Periode belum ada — upload file dulu`); break; // 404
    case 'INVALID_CREDENTIALS': toast('Username atau password salah'); break;
    case 'FORBIDDEN': toast('Tidak punya akses'); break;
    case 'RATE_LIMIT': toast('Terlalu banyak percobaan, coba lagi nanti'); break;
    case 'DUPLICATE': toast('ID sudah ada'); break;
    case 'NO_FILE': case 'PARSE_ERROR': case 'NO_DATA': toast(e.message); break;
    default: toast(e.message);
  }
}
```

---

## 1. Auth (`/auth`) — do this first

Login response seeds everything else. Persist `accessToken` (memory or localStorage) and `user`.

| Action | Call | Notes |
|---|---|---|
| Login | `POST /auth/login` `{ username|email, password }` (username **atau** email) → `{ accessToken, user }` | Sets 2 `refreshToken` cookies automatically. Rate-limited 20/min |
| Me (on app boot) | `GET /auth/me` → `{ user }` | If 401 even after refresh → redirect to login |
| Refresh | `POST /auth/refresh` (cookie; or body `{ refreshToken }`) → `{ accessToken }` | Handled inside `api()` — never call manually except on boot |
| Logout | `POST /auth/logout` → `{ message }` | Then clear `accessToken` + route to login |
| Register user | `POST /auth/register` (ADMIN only) `{ username*, password* (min 3), email, displayName, role, activeCompanyId }` → `201 { user }` | Admin/user-management page |
| Update profile | `PATCH /auth/me` `{ displayName }` or `{ password, currentPassword }` (both required for password change) → `{ user }` | |

```js
// stores/auth.js
export async function login(username, password) {
  const { accessToken, user } = await api('/auth/login', {
    method: 'POST', auth: false, body: { username, password },
  });
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('user', JSON.stringify(user));
  // After login: fetch companies, set active company (see §2)
  return user;
}
export const can = (user, ...roles) => roles.includes(user?.role);
```

---

## 2. Companies (`/companies`) + active-company pattern

Every other module is scoped by company. App boot sequence:

```
login → GET /companies → pick active (user.activeCompanyId || companies[0] / isDefault)
      → POST /companies/:id/activate → setActiveCompanyId(id) → load settings + periods
```

| Action | Call |
|---|---|
| List | `GET /companies` → `{ companies }` |
| Create (ADMIN/HR) | `POST /companies` `{ name*, phone, address, email, logo, isDefault }` → `201 { company }` |
| Detail | `GET /companies/:id` → `{ company }` |
| Update (ADMIN/HR) | `PATCH /companies/:id` (same fields) → `{ company }` |
| Delete (ADMIN) | `DELETE /companies/:id` → blocked if last company |
| Activate | `POST /companies/:id/activate` → sets `users.active_company_id` server-side; **also call `setActiveCompanyId(id)` locally** |
| Logo (ADMIN/HR) | `POST /companies/:id/logo` multipart `logo` file → `{ company/logoUrl }` (stored to R2) |

Company switcher must re-fetch: settings (§6), periods (§4), employees (§3), and clear per-company caches.

---

## 3. Employees (`/employees`)

| Action | Call |
|---|---|
| List/search | `GET /employees?companyId=&q=&status=&department=&page=&limit=` → `{ employees }` + `meta` (`q` matches name/id/email) |
| Create (ADMIN/HR) | `POST /employees` full employee object (`companyId*`; omit `id` → auto `EMP-XXXX`) → `201 { employee }` |
| Bulk import (ADMIN/HR) | `POST /employees/import` multipart `file` (.xlsx, header row containing "Nama") + `companyId` → `{ imported, totalRows }` |
| Detail | `GET /employees/:id` → `{ employee }` (tenure/probation derived client-side) |
| Update (ADMIN/HR) | `PATCH /employees/:id` (partial; dates accept ISO or `DD/MM/YYYY`) → `{ employee }` |
| Delete (ADMIN/HR) | `DELETE /employees/:id` |
| Resign / Reactivate (ADMIN/HR) | `POST /employees/:id/resign` · `POST /employees/:id/reactivate` → `{ employee }` |
| Evaluations alias | `GET /employees/:id/evaluations` → `{ evaluations }` |

Employee form fields (all optional except `fullName`+`companyId`): `attendanceAliases[]`, `department` (default `WAREHOUSE`), `jobTitle` (default `Staf`), `email`, `phone`, `birthPlace`, `birthDate`, `joinDate`, `employmentStatus`, `wfhEnabled`, `baseSalary` (default 1755000), `dailySalary` (85000), `overtimeRate` (9000), `allowance`, `payrollType`, `photo`, `notes`, + bank/NIK/BPJS/shift/supervisor/workLocation fields.

```js
// multipart import
const fd = new FormData();
fd.append('file', xlsxFile); fd.append('companyId', activeCompanyId);
const { imported, totalRows } = await api('/employees/import', { method: 'POST', isForm: true, body: fd });
```

---

## 4. Attendance (`/attendance`) — the core flow

### 4.1 Upload pipeline (ADMIN/HR)

```
Upload.jsx: file input → POST /attendance/upload (multipart `file` + companyId)
  → { periodKey, label, employeeCount, recordCount, warnings, fileUrl, period }
  → warnings[] shown as yellow banner (status WARNING) · then refresh periods list + summary
```

- Missing employees are **auto-created as stubs** (`EMP-XXXX`, alias = parsed name) — refresh employee list after upload.
- Re-uploading the same month **replaces** its records (upsert). Rate limit 20/hour.
- `fileUrl` is null when R2 is not configured — treat as optional.

### 4.2 Periods & records (read path)

| Action | Call |
|---|---|
| List periods | `GET /attendance/periods` → `{ periods: [{ key, label, fileName, fileUrl, periodStart, periodEnd, recordCount }] }` (deduped, newest first) — drives MonthPicker |
| Picker options | `GET /attendance/period-options` → `{ options: [{ value, label, key }] }` |
| Period detail | `GET /attendance/periods/:key` (`:key` = `YYYY-MM` or `DAY_YYYY-MM-DD` → resolves to month, optional `?date=` narrowing) → `{ period, records, filter }` |
| Summary (server truth) | `GET /attendance/periods/:key/summary` + filter query (§4.4) → `{ summary: { periodKey, label, totalEmployees, totalRecords, statusBreakdown, byEmployee[] }, period, recordsCount, filter }` |
| Activate period | `PATCH /attendance/periods/:key/activate` `{ companyId }` → `{ activePeriodKey }` (persist picker selection) |
| Delete (ADMIN/HR) | `DELETE /attendance/periods/:key` (month key only) |
| Flat records | `GET /attendance/records?periodKey=&employeeId=&department=&dateFrom=&dateTo=&limit(≤500, def 100)=&offset=` → `{ records, total, limit, offset, filter }` — use for tables with own pagination |
| Upload logs | `GET /attendance/upload-logs` → `{ logs }` (latest 100) · `DELETE /attendance/upload-logs/:id` (ADMIN/HR) |

### 4.3 Manual overrides (ADMIN/HR)

| Action | Call |
|---|---|
| Create | `POST /attendance/manual-override` `{ empName*, date*, checkIn, checkOut, reason, rawIn, rawOut, companyId }` → also patches that date's `attendance_records` |
| List | `GET /attendance/manual-overrides?periodKey=` → `{ overrides, filter }` |
| Revert | `DELETE /attendance/manual-override?empName=&date=` (query **or** JSON body) |

### 4.4 ★ Period-filter system (used by attendance, KPI, points, discipline, analytics)

One `PeriodPicker` value drives all of these. Serialize it to query like this:

```js
// src/core/periodQuery.js — single serializer for every filter-aware GET
export function toPeriodQuery(f) {
  if (!f || f.type === 'ALL') return { periodKey: 'ALL' };   // unfiltered sentinel
  switch (f.type) {
    case 'MONTH':  return { periodKey: f.key };              // '2026-07'
    case 'DAY':    return { periodKey: f.key };              // 'DAY_2026-07-15'
    case 'YEAR':   return { periodKey: `YEAR_${f.year}` };   // or { year: 2026 }
    case 'WEEK':   return { startDate: f.startDate, endDate: f.endDate };
    case 'PRESET': return { preset: f.preset };              // YESTERDAY|LAST_7_DAYS|LAST_30_DAYS|LAST_3_MONTHS|LAST_6_MONTHS
  }
}
// GET /attendance/periods/2026-07/summary?periodKey=DAY_2026-07-15
// GET /kpi/scores?employeeId=E&{...toPeriodQuery(filter)}
```

Rules & gotchas:
- `periodKey=ALL` = explicitly unfiltered (supported by summary/records/scores/points/discipline).
- `DAY_` keys auto-normalize to their month for **payroll calculate, KPI scores, evaluations** (monthly granularity). `YEAR_/WEEK_/PRESET_` are **rejected (400)** by `POST /payroll/calculate` — normalize to `YYYY-MM` client-side before calling.
- Missing month period → `404 PERIOD_NOT_FOUND` — render the "empty period" state (MonthPicker `--empty` pattern), not a generic error.
- Every filter-aware response echoes `filter` — store it to label the view (`summary.label`).

---

## 5. Cards (`/cards`)

Simple CRUD over yellow/red overrides: `GET /cards` → `{ cards }` · `POST /cards` (ADMIN/HR) `{ employeeId|empName, yellow, red, note, companyId }` (upsert) → `{ card }` · `DELETE /cards/:id` (ADMIN/HR).

---

## 6. Settings (`/settings`)

Load once per active company, cache, and feed every calculation preview.

| Action | Call |
|---|---|
| Get | `GET /settings?companyId=` → `{ settings }` (merged defaults) |
| Save (ADMIN/HR) | `PUT /settings` full settings + `companyId` → `{ settings }` (validate ranges client-side first: `holidayMultiplier` ~1.4, `attendanceRadius` 10–5000) |
| Reset (ADMIN) | `POST /settings/reset` `{ companyId }` → defaults |
| Email | `POST /settings/test-email` (ADMIN/HR) `{ to, companyId }` · `GET /settings/email-from?companyId=` → `{ from }` |

---

## 7. Masters: Departments / ContractTypes / Allowances / Components

Identical CRUD pattern (`GET /` list, `POST /` create, `GET|PATCH|DELETE /:id`), all ADMIN/HR for writes:

- `GET|POST /departments`, `GET|PATCH|DELETE /departments/:id`, plus `POST /departments/auto-seed` `{ companyId }` (seed from attendance data — call once after first upload if list is empty)
- `GET|POST /contract-types`, `GET|PATCH|DELETE /contract-types/:id`
- `GET /position-allowances` → `{ positionAllowances }` · `POST /position-allowances` (upsert) `{ jobTitle, amount, companyId }` · `DELETE /position-allowances/:id`
- `GET /payroll-components?type=` → `{ payrollComponents }` · `POST /payroll-components` `{ name, type, amount, companyId }` · `PATCH|DELETE /payroll-components/:id`

---

## 8. Payroll (`/payroll`)

Monthly granularity only — normalize filter to `YYYY-MM` first (§4.4).

| Step | Call |
|---|---|
| 1 Preview (not persisted) | `POST /payroll/calculate` `{ periodKey*, employeeId*, manualAdjustments: [{amount, note}], payrollNote, companyId }` → `{ payroll: { present, incomplete, gross, deductions, net, breakdown } }` |
| 2 Finalize (ADMIN/HR) | `POST /payroll/snapshots` `{ periodKey*, employeeId*, payload* (= step-1 result), companyId }` → `{ snapshot, created }` |
| 3 List | `GET /payroll/snapshots?periodKey=` → `{ snapshots }` · single: `GET /payroll/snapshots/:periodKey/:employeeId` → `{ snapshot }` |
| 4 Archive slip (ADMIN/HR) | `POST /payroll/archive` `{ periodKey*, employeeId*, payload*, periodLabel, fullName, department, jobTitle, companyId }` (id = `SLIP-<period>-<emp>`) → `{ archive, created }` |
| 5 Archives | `GET /payroll/archives?periodKey=&employeeId=` → `{ archives }` · `DELETE /payroll/archives/:id` (**ADMIN** only) |

UI flow: per-employee "Hitung" → preview modal (editable adjustments) → "Simpan snapshot" → "Arsipkan slip" → print from archive payload.

---

## 9. THR (`/thr`)

| Action | Call |
|---|---|
| Settings | `GET /thr/settings` (auto-creates) → `{ settings }` · `PUT /thr/settings` (ADMIN/HR) `{ wageBasisType: AVERAGE_WAGE_NON_BONUS|BASIC_PLUS_FIXED_ALLOWANCE|BASIC_ONLY, applicableYear 2000–2100, holidayDate, companyPolicyMultiplier, companyMinimumTHR, ... }` → `{ settings, meta: { wageBasisChanged } }` (if `wageBasisChanged`, re-run calculations) · `POST /thr/settings/reset` (ADMIN) |
| Calculate | `GET /thr/calculate?year=&employeeId=*` → `{ thr: { tenureMonths, baseAmount, finalAmount, adjustment, status } }` (<12 mo proportional, ≥12 mo full) |
| Adjustments (ADMIN/HR) | `POST /thr/adjustments` `{ year*, employeeId*, adjustmentAmount*, reason, note }` → `{ adjustment, created }` · list `GET /thr/adjustments?year=` → `{ adjustments }` · `DELETE /thr/adjustments/:year/:employeeId` |
| Payments | `GET /thr/payments?year=` → `{ payments }` · `PUT /thr/payments` (ADMIN/HR) `{ year*, employeeId*, status: PAID|UNPAID, paymentMethod, notes }` → `{ payment }` (PAID stamps `paidAt`) |
| Audit | `GET /thr/audit-logs?year=&employeeId=` → `{ logs }` (render under adjustments/payments) |

---

## 10. KPI (`/kpi`)

| Action | Call |
|---|---|
| Masters | `GET /kpi/masters?department=&jobTitle=` → `{ masters }` · `POST /kpi/masters` (ADMIN/HR) → `201 { master }` · `PATCH|DELETE /kpi/masters/:id` (ADMIN/HR) |
| Config | `GET /kpi/config` → `{ config }` · `PUT /kpi/config` (ADMIN/HR) `{ veryGoodMin, goodMin, fairMin, labels, companyId }` |
| Scores | `GET /kpi/scores?employeeId=&periodKey=` (periodKey: `YYYY-MM`/`DAY_*`→month/`YEAR_*`/range/`ALL`; 404 if month missing) → `{ scores, filter }` · `POST /kpi/scores` (ADMIN/HR) `{ employeeId*, periodKey* (YYYY-MM), kpiId*, actualValue, scorePoin, companyId }` (period must exist) · `POST /kpi/scores/batch` `{ scores[] }` (bulk save from matrix editor) · `POST /kpi/scores/custom` (custom metric, `isCustom: true`, `customMeta`) · `DELETE /kpi/scores/:employeeId/:periodKey/:kpiId` |
| Evaluate | `POST /kpi/evaluate` `{ employeeId, periodKey (YYYY-MM), companyId }` → `{ overallScore, grade, scoresCount }` (weight-averaged; 404 `NO_SCORES` if empty) |
| Assign | `POST /kpi/assigned` — **placeholder**, returns echo; use `/scores/batch` instead |

---

## 11. Discipline (`/discipline`)

| Action | Call |
|---|---|
| List | `GET /discipline?employeeId=&cardType=&status=&severity=&periodKey=` → `{ disciplines, filter }` (`severity`: Ringan|Sedang|Berat; `status`: Aktif|Selesai|Kedaluwarsa) |
| Create (ADMIN/HR) | `POST /discipline` `{ date*, violationType*, employeeId, employeeName, severity, cardType, description, status, companyId }` → `201 { discipline }` |
| Detail/Update/Delete | `GET /discipline/:id` · `PATCH /discipline/:id` (ADMIN/HR, e.g. resolve → `status: Selesai`) · `DELETE /discipline/:id` (ADMIN/HR) |
| Metrics | `GET /discipline/:employeeId/metrics?periodKey=` → `{ metrics: { total, bySeverity, byStatus, activeCount }, records }` (employee header card) |

---

## 12. Leave (`/leave`)

| Action | Call |
|---|---|
| List | `GET /leave?employeeId=&type(CUTI|SAKIT|IZIN)=&status=` → `{ leaves }` |
| Create | multipart (has file) **or** JSON `{ type*, startDate*, endDate*, employeeId, employeeName, paidType (PAID|UNPAID), reason, companyId }` → `201 { leave }` (always `PENDING`; `totalDays` auto-computed inclusive) |
| Approve/Reject (ADMIN/HR) | `PATCH /leave/:id` `{ status: APPROVED|REJECTED, ... }` → `{ leave }` |
| Delete (ADMIN/HR) | `DELETE /leave/:id` |
| Quota/Summary | `GET /leave/:employeeId/quota?year=` → `{ quota (12), used, remaining, year }` · `GET /leave/:employeeId/summary?periodKey=` → `{ summary: { total, byType, byStatus, totalDays }, leaves }` |

```js
// with attachment file:
const fd = new FormData();
Object.entries({ type:'SAKIT', startDate, endDate, employeeId }).forEach(([k,v])=>fd.append(k,v));
if (file) fd.append('attachment', file);
await api('/leave', { method:'POST', isForm:true, body: fd });
```

---

## 13. Points (`/points`)

Formula: `monthlyPoint = reward − penalty` (server-computed; don't recompute client-side).

| Action | Call |
|---|---|
| Transactions | `GET /points/transactions?employeeId=&cardType=&periodKey=` → `{ transactions, filter }` · `POST /points/transactions` (ADMIN/HR) `{ employeeId*, type* (penalty|reward), point*, employeeName, masterId, name, category, cardType (yellow|red), description, date, companyId }` → `201 { transaction }` · `PATCH|DELETE /points/transactions/:id` (ADMIN/HR) |
| Status/Report | `GET /points/status/:employeeId?periodKey=` → `{ penalty, reward, monthlyPoint, yellow, red, yellowCardPoint, redCardPoint, transactions }` (defaults to current month when no filter) · `GET /points/report/:employeeId` (same + `generatedAt`, chronological) |
| Period keys | `GET /points/periods` → `{ periods: ['2026-07', ...] }` |

---

## 14. Evaluations (`/evaluations`)

`GET /evaluations?employeeId=` → `{ evaluations }` · `POST /evaluations` (ADMIN/HR/MANAGER) `{ employeeId, periodKey, overallScore, decision: Lulus|Perpanjang Probation|Tidak Lulus, notes, evaluator, evaluationDate, nextEvaluationDate, payload, companyId }` (upsert) · `GET /evaluations/:id` · `DELETE /evaluations/:id` (ADMIN/HR). Pair with `GET /employees/:id/evaluations` for the employee-detail tab.

---

## 15. SOP (`/sops`) & Regulations (`/regulations`)

- SOP: `GET /sops` → `{ sops }` · `POST /sops` (ADMIN/HR) `{ title, content, department, companyId }` → `201` · `GET|PATCH|DELETE /sops/:id` (writes ADMIN/HR).
- Regulations: `GET /regulations` → `{ regulations }` · `PUT /regulations` (ADMIN/HR) `{ title, content (HTML), companyId }` (upsert — render with sanitized HTML) · `DELETE /regulations/:id` (ADMIN/HR).

---

## 16. Analytics (`/analytics`)

Read-only, all filter-aware (`?periodKey=` + `toPeriodQuery(filter)`, `+?department=`):

| View | Call | Response |
|---|---|---|
| Overview | `GET /analytics/overview` | aggregates |
| By department | `GET /analytics/by-department` | per-dept breakdown |
| By employee | `GET /analytics/by-employee/:id` | `{ stats: { total, hadir, tidakHadir, tidakLengkap }, records, period }` |
| Calendar | `GET /analytics/calendar` | grid cells |

---

## 17. Backup (`/backup`)

- Export (any auth): `GET /backup/export?companyId=` → `{ version, exportedAt, companyId, data: { companies, employees, ... } }` → `download JSON` button.
- Import (**ADMIN** only): `POST /backup/import` body = export payload (`{ data }` or raw tables) → `{ message, imported }` (transactional; confirm-dialog + refetch everything after).

---

## 18. Migration from localStorage (one-shot)

The old app persisted 32 `attendance-calc-*` keys locally. Migration path:

1. Keep `exportBackupJSON()` shape from `historyStore` as the file format.
2. Reshape keys → `POST /backup/import` payload tables (mapping table in `BACKEND.md` §5.1).
3. Import with an ADMIN account, verify counts via `GET /backup/export`, then flip the app to API mode and keep localStorage as offline cache only (theme stays client-only).

---

## 19. Implementation checklist (per page)

- [ ] `apiClient` + refresh + `x-company-id` + error-code mapping (§0)
- [ ] Login/boot: login → companies → activate → settings + periods (§1, §2, §6)
- [ ] PeriodPicker → `toPeriodQuery` shared serializer (§4.4)
- [ ] Upload page: multipart, warnings banner, post-upload refetch (§4.1)
- [ ] Employees CRUD + xlsx import + resign/reactivate (§3)
- [ ] Summary/dashboard via `/periods/:key/summary` (§4.2)
- [ ] Manual overrides UI (§4.3) + cards (§5)
- [ ] Payroll 5-step flow with YYYY-MM normalization (§8)
- [ ] THR settings/calculate/adjust/pay/audit (§9)
- [ ] KPI masters/config/scores-batch/evaluate (§10)
- [ ] Discipline + metrics, Leave + quota, Points status (§11–13)
- [ ] Evaluations, SOP, Regulations, Analytics, Backup export/import (§14–17)
- [ ] Role-gate write actions (`can(user,'ADMIN','HR')` etc.); handle 403 gracefully
- [ ] `404 PERIOD_NOT_FOUND` → empty-period CTA everywhere (not an error toast)
- [ ] `VITE_API_BASE_URL` + dev proxy in `vite.config.js`
