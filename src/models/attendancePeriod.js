'use strict';
module.exports = (sequelize, DataTypes) => {
  const AttendancePeriod = sequelize.define('AttendancePeriod', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    key: { type: DataTypes.STRING, allowNull: false },
    label: DataTypes.STRING,
    fileName: { type: DataTypes.STRING, field: 'file_name' },
    fileUrl: { type: DataTypes.TEXT, field: 'file_url' },
    periodStart: { type: DataTypes.DATEONLY, field: 'period_start' },
    periodEnd: { type: DataTypes.DATEONLY, field: 'period_end' },
    uploadedBy: { type: DataTypes.STRING, field: 'uploaded_by' },
  }, { tableName: 'attendance_periods', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','key'] }
  ]});
  AttendancePeriod.associate = (m) => {
    AttendancePeriod.belongsTo(m.Company, { foreignKey: 'company_id' });
    AttendancePeriod.hasMany(m.AttendanceRecord, { foreignKey: 'period_id', onDelete: 'CASCADE' });
  };
  return AttendancePeriod;
};
