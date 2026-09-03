require('dotenv').config();
const createApp = require('./app');
const db = require('./models');
const { validateEnv } = require('./config/env');

validateEnv();

const app = createApp();
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('✅ MySQL connected (mysql2) —', process.env.DB_HOST, process.env.DB_NAME);

    // Auto-sync in development if DB empty (creates tables if not exist)
    // For production prefer `npx sequelize-cli db:migrate`
    if (process.env.NODE_ENV !== 'production' && process.env.AUTO_SYNC === 'true') {
      await db.sequelize.sync({ alter: true });
      console.log('✅ DB synced (alter)');
    }

    app.listen(PORT, () => {
      console.log(`🚀 API on http://localhost:${PORT} — /api/v1/health`);
      console.log(`   CORS_ORIGIN=${process.env.CORS_ORIGIN}`);
      console.log(`   R2 configured: ${!!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID)}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    // Still start server without DB for health checks (optional)
    app.listen(PORT, () => {
      console.log(`⚠️  API on :${PORT} (DB not connected) — ${err.message}`);
    });
  }
}

start();

module.exports = app;
