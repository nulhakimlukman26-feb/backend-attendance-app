'use strict';
module.exports = (sequelize, DataTypes) => {
  const ThrAdjustment = sequelize.define('ThrAdjustment', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    year: { type: DataTypes.INTEGER, allowNull: false },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    adjustmentAmount: { type: DataTypes.DECIMAL(14,2), allowNull: false, field: 'adjustment_amount' },
    reason: DataTypes.STRING,
    note: DataTypes.TEXT,
    modifiedBy: { type: DataTypes.STRING, field: 'modified_by' },
  }, { tableName: 'thr_adjustments', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','year','employee_id'] },
  ]});
  return ThrAdjustment;
};
