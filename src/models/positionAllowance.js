'use strict';
module.exports = (sequelize, DataTypes) => {
  const PositionAllowance = sequelize.define('PositionAllowance', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    jobTitle: { type: DataTypes.STRING, allowNull: false, field: 'job_title' },
    amount: { type: DataTypes.DECIMAL(14,2), allowNull: false, defaultValue: 0 },
    description: DataTypes.TEXT,
  }, { tableName: 'position_allowances', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','job_title'] },
  ]});
  return PositionAllowance;
};
