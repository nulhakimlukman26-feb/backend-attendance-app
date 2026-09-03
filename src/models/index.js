const fs = require('fs');
const path = require('path');
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const db = {};

const files = fs.readdirSync(__dirname).filter(f => f !== 'index.js' && f.endsWith('.js'));

for (const file of files) {
  const model = require(path.join(__dirname, file))(sequelize, DataTypes);
  db[model.name] = model;
}

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) db[modelName].associate(db);
});

db.sequelize = sequelize;
db.Sequelize = require('sequelize');

module.exports = db;
