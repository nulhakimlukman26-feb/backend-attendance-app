'use strict';
module.exports = (sequelize, DataTypes) => {
  const ManualAttendanceOverride = sequelize.define('ManualAttendanceOverride', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, field: 'employee_id' },
    empName: { type: DataTypes.STRING, allowNull: false, field: 'emp_name' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    checkIn: { type: DataTypes.STRING, field: 'check_in' },
    checkOut: { type: DataTypes.STRING, field: 'check_out' },
    rawIn: { type: DataTypes.STRING, field: 'raw_in' },
    rawOut: { type: DataTypes.STRING, field: 'raw_out' },
    reason: DataTypes.STRING,
    createdBy: { type: DataTypes.STRING, field: 'created_by' },
  }, { tableName: 'manual_attendance_overrides', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','emp_name','date'] },
    { fields: ['company_id'] },
  ]});
  return ManualAttendanceOverride;
};
