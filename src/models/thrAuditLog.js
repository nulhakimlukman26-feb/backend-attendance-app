'use strict';
module.exports = (sequelize, DataTypes) => {
  const ThrAuditLog = sequelize.define('ThrAuditLog', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    year: DataTypes.INTEGER,
    employeeId: { type: DataTypes.STRING, field: 'employee_id' },
    type: { type: DataTypes.ENUM('MANUAL_ADJUSTMENT','REMOVE_ADJUSTMENT','PAYMENT_STATUS_UPDATE'), allowNull: false },
    detail: DataTypes.JSON,
    modifiedBy: { type: DataTypes.STRING, field: 'modified_by' },
  }, { tableName: 'thr_audit_logs', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' });
  return ThrAuditLog;
};
