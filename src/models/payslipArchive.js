'use strict';
module.exports = (sequelize, DataTypes) => {
  const PayslipArchive = sequelize.define('PayslipArchive', {
    id: { type: DataTypes.STRING, primaryKey: true },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    periodKey: { type: DataTypes.STRING, allowNull: false, field: 'period_key' },
    periodLabel: { type: DataTypes.STRING, field: 'period_label' },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    fullName: { type: DataTypes.STRING, field: 'full_name' },
    department: DataTypes.STRING,
    jobTitle: { type: DataTypes.STRING, field: 'job_title' },
    payload: { type: DataTypes.JSON, allowNull: false },
    isPrinted: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_printed' },
    archivedAt: { type: DataTypes.DATE, field: 'archived_at' },
  }, { tableName: 'payslip_archives', underscored: true, timestamps: true });
  return PayslipArchive;
};
