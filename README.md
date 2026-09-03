# Attendance Backend — CV. SUA UNTUNG ABADI

Express + MySQL2 + Sequelize + bcrypt + multer + Cloudflare R2

> Spec: `BACKEND.md` (migrates 32 `localStorage` keys → MySQL)

## Quick Start

```bash
npm install
cp .env.example .env   # edit DB_HOST/DB_PASS/JWT_SECRET
# Create DB
npx sequelize-cli db:create
# Dev auto-sync (creates tables if not exist)
AUTO_SYNC=true npm run dev
# OR migrations (prod)
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
npm run dev
# health
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/health
```

Default seeded users: `admin/admin123` (ADMIN), `hr/hr123` (HR), company `comp-sua-untung-abadi`.

## Env

See `.env.example` (§11 BACKEND.md). Required: `DB_HOST/DB_USER/DB_PASS/DB_NAME`, `JWT_SECRET`. R2 optional — if empty, uploads skip R2 gracefully.

## Auth

- `POST /api/v1/auth/login` `{username,password}` → `{accessToken,user}` + httpOnly `refreshToken` cookie
- `POST /api/v1/auth/refresh` (cookie)
- `GET  /api/v1/auth/me` (Bearer)
- `PATCH /api/v1/auth/me`

All responses: `{ ok:true, data }` or `{ ok:false, error:{code,message,details} }`.

## Core Routes

| Domain | Base |
|---|---|
| Auth | `/api/v1/auth` |
| Companies | `/api/v1/companies` |
| Employees | `/api/v1/employees` (+ `POST /import` xlsx) |
| Attendance | `/api/v1/attendance` (`POST /upload` multer memory→xlsx parse→MySQL bulk + R2) |
| Cards | `/api/v1/cards` |
| Settings | `/api/v1/settings` |
| Departments/Contracts | `/api/v1/departments`, `/api/v1/contract-types` |
| PositionAllowances | `/api/v1/position-allowances` |
| Payroll | `/api/v1/payroll`, `/api/v1/payroll-components` |
| THR | `/api/v1/thr` |
| KPI | `/api/v1/kpi` |
| Discipline | `/api/v1/discipline` |
| Leave | `/api/v1/leave` |
| Points | `/api/v1/points` |
| Evaluations | `/api/v1/evaluations` |
| SOP/Regulations | `/api/v1/sops`, `/api/v1/regulations` |
| Analytics | `/api/v1/analytics` |
| Backup | `/api/v1/backup/export` + `/import` |

Company scoping: every table has `company_id`; query with `?companyId=` or header `x-company-id` or JWT `companyId`.

## Upload Flow (§9)

```
Client → POST /attendance/upload (multipart file=.xlsx)
 → multer memory 10MB → parseAttendanceFile() (port src/core/fileParser.js)
 → sequelize.transaction upsert periods + bulk attendance_records
 → UploadLog + R2 PutObject `attendance/{companyId}/{periodKey}.xlsx`
```

## Deploy

```bash
npm ci --omit=dev
npx sequelize-cli db:migrate
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
CMD ["node","src/index.js"]
```

Frontend `.env`: `VITE_API_BASE_URL=http://localhost:3000/api/v1` + `vite.config.js` proxy `/api` → `http://localhost:3000`.

## Frontend Migration

Replace `src/core/authStore.js:22` mock → `src/core/apiClient.js` (§8.3). Keep `if (!VITE_API_BASE_URL) fallback localStorage`.

## Security

- bcrypt 12 rounds, JWT 15m / refresh 7d httpOnly Strict
- helmet, cors strict, morgan, rate-limit login 20/min, upload 20/hr
- zod validation, multer xlsx filter, 10MB limit
- PII (nik/npwp) restrict roles; audit `updatedBy` from JWT
