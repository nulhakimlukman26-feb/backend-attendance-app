'use strict';
module.exports = (sequelize, DataTypes) => {
  const UploadLog = sequelize.define('UploadLog', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    fileName: { type: DataTypes.STRING, field: 'file_name' },
    fileSize: { type: DataTypes.INTEGER, field: 'file_size' },
    periodKey: { type: DataTypes.STRING, field: 'period_key' },
    periodLabel: { type: DataTypes.STRING, field: 'period_label' },
    employeeCount: { type: DataTypes.INTEGER, field: 'employee_count' },
    recordCount: { type: DataTypes.INTEGER, field: 'record_count' },
    status: { type: DataTypes.ENUM('SUCCESS','WARNING','FAILED'), defaultValue: 'SUCCESS' },
    note: DataTypes.TEXT,
    uploadedBy: { type: DataTypes.STRING, field: 'uploaded_by' },
  }, { tableName: 'upload_logs', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' });
  return UploadLog;
};
