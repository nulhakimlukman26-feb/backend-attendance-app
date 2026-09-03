'use strict';
module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define('Department', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    code: DataTypes.STRING,
    description: DataTypes.TEXT,
    head: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, { tableName: 'departments', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','name'] },
  ]});
  return Department;
};
