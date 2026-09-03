'use strict';
module.exports = (sequelize, DataTypes) => {
  const ContractType = sequelize.define('ContractType', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    code: DataTypes.STRING,
    description: DataTypes.TEXT,
    durationMonths: { type: DataTypes.INTEGER, field: 'duration_months' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, { tableName: 'contract_types', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','name'] },
  ]});
  return ContractType;
};
