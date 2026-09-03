'use strict';
module.exports = (sequelize, DataTypes) => {
  const Company = sequelize.define('Company', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    phone: DataTypes.STRING,
    address: DataTypes.TEXT,
    email: DataTypes.STRING,
    logo: DataTypes.TEXT,
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_default' },
  }, { tableName: 'companies', underscored: true, timestamps: true });
  Company.associate = (m) => {
    Company.hasMany(m.Employee, { foreignKey: 'company_id' });
    Company.hasMany(m.AttendancePeriod, { foreignKey: 'company_id' });
    Company.hasMany(m.Department, { foreignKey: 'company_id' });
    Company.hasOne(m.AppSetting, { foreignKey: 'company_id' });
  };
  return Company;
};
