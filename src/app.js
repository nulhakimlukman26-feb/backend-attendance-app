require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./config/swagger');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s=>s.trim()) : true,
    credentials: true,
  }));
  app.use(morgan('dev'));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Swagger — OpenAPI docs (no auth required)
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Attendance API — Swagger',
    swaggerOptions: { persistAuthorization: true },
  }));

  // Health check
  app.get('/health', (req, res) => res.json({ ok:true, data:{ status:'ok', uptime: process.uptime(), version: '1.0.0' }}));
  app.get('/api/v1/health', (req, res) => res.json({ ok:true, data:{ status:'ok' }}));

  // Mount routes
  app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
  app.use('/api/v1/companies', require('./modules/companies/companies.routes'));
  app.use('/api/v1/employees', require('./modules/employees/employees.routes'));
  app.use('/api/v1/attendance', require('./modules/attendance/attendance.routes'));
  app.use('/api/v1/cards', require('./modules/cards/cards.routes'));
  app.use('/api/v1/settings', require('./modules/settings/settings.routes'));
  app.use('/api/v1/departments', require('./modules/departments/departments.routes'));
  app.use('/api/v1/contract-types', require('./modules/departments/contractTypes.routes'));
  app.use('/api/v1/position-allowances', require('./modules/payroll/positionAllowances.routes'));
  app.use('/api/v1/payroll-components', require('./modules/payroll/payrollComponents.routes'));
  app.use('/api/v1/payroll', require('./modules/payroll/payroll.routes'));
  app.use('/api/v1/thr', require('./modules/thr/thr.routes'));
  app.use('/api/v1/kpi', require('./modules/kpi/kpi.routes'));
  app.use('/api/v1/discipline', require('./modules/discipline/discipline.routes'));
  app.use('/api/v1/leave', require('./modules/leave/leave.routes'));
  app.use('/api/v1/points', require('./modules/points/points.routes'));
  app.use('/api/v1/evaluations', require('./modules/evaluations/evaluations.routes'));
  app.use('/api/v1/sops', require('./modules/sop/sop.routes'));
  app.use('/api/v1/regulations', require('./modules/regulations/regulations.routes'));
  app.use('/api/v1/analytics', require('./modules/analytics/analytics.routes'));
  app.use('/api/v1/backup', require('./modules/backup/backup.routes'));

  // 404
  app.use((req, res) => {
    res.status(404).json({ ok:false, error:{ code:'NOT_FOUND', message:`Route ${req.method} ${req.path} tidak ditemukan` }});
  });

  // Error handler
  app.use(require('./middleware/errorHandler'));

  return app;
}

module.exports = createApp;
