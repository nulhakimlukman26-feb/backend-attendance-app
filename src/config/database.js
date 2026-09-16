require('dotenv').config();
const { Sequelize } = require('sequelize');

const dbName = process.env.DB_NAME || 'attendance_app';
const dbUser = process.env.DB_USER || 'root';
const dbPass = process.env.DB_PASS || 'root';
const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbPort = parseInt(process.env.DB_PORT || '3306', 10);

let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    logging: false,
    timezone: '+07:00',
    dialectOptions: { dateStrings: true, typeCast: true },
    define: { underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  });
} else {
  sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    logging: false,
    timezone: '+07:00',
    dialectOptions: { dateStrings: true, typeCast: true, connectTimeout: 10000 },
    pool: { max: 5, min: 0, acquire: 10000, idle: 10000 },
    define: { underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  });
}

module.exports = sequelize;
