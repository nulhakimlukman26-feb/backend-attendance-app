'use strict';
module.exports = (sequelize, DataTypes) => {
  const KpiMaster = sequelize.define('KpiMaster', {
    id: { type: DataTypes.STRING, primaryKey: true },
    department: DataTypes.STRING,
    jobTitle: { type: DataTypes.STRING, field: 'job_title' },
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    target: DataTypes.FLOAT,
    unit: DataTypes.STRING,
    weight: DataTypes.FLOAT,
    assessmentMethod: { type: DataTypes.STRING, field: 'assessment_method' },
    dataSource: { type: DataTypes.STRING, field: 'data_source' },
    status: DataTypes.STRING,
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_default' },
    isAutoAttendance: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_auto_attendance' },
    sopIds: { type: DataTypes.JSON, field: 'sop_ids', defaultValue: [] },
  }, { tableName: 'kpi_masters', underscored: true, timestamps: true });
  return KpiMaster;
};
