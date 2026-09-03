'use strict';
module.exports = (sequelize, DataTypes) => {
  const PayrollSnapshot = sequelize.define('PayrollSnapshot', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING(191), allowNull: false, field: 'company_id' },
    periodKey: { type: DataTypes.STRING(191), allowNull: false, field: 'period_key' },
    employeeId: { type: DataTypes.STRING(191), allowNull: false, field: 'employee_id' },
    payload: { type: DataTypes.JSON, allowNull: false },
    finalizedBy: { type: DataTypes.STRING, field: 'finalized_by' },
  }, { tableName: 'payroll_snapshots', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','period_key','employee_id'] },
  ]});
  return PayrollSnapshot;
};
