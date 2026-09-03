'use strict';
module.exports = (sequelize, DataTypes) => {
  const AttendanceRecord = sequelize.define('AttendanceRecord', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    periodId: { type: DataTypes.STRING, allowNull: false, field: 'period_id' },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    checkIn: { type: DataTypes.STRING, field: 'check_in' },
    checkOut: { type: DataTypes.STRING, field: 'check_out' },
    rawTimestamps: { type: DataTypes.JSON, field: 'raw_timestamps', defaultValue: [] },
    status: { type: DataTypes.STRING, defaultValue: 'Tidak Hadir' },
    dataStatus: { type: DataTypes.STRING, defaultValue: 'No Data', field: 'data_status' },
    isManualOverride: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_manual_override' },
    manualReason: { type: DataTypes.STRING, field: 'manual_reason' },
  }, { tableName: 'attendance_records', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['period_id','employee_id','date'] },
    { fields: ['employee_id','date'] },
    { fields: ['company_id'] },
  ]});
  AttendanceRecord.associate = (m) => {
    AttendanceRecord.belongsTo(m.AttendancePeriod, { foreignKey: 'period_id' });
    AttendanceRecord.belongsTo(m.Employee, { foreignKey: 'employee_id' });
    AttendanceRecord.belongsTo(m.Company, { foreignKey: 'company_id' });
  };
  return AttendanceRecord;
};
