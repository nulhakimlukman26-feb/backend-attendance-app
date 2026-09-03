'use strict';
module.exports = (sequelize, DataTypes) => {
  const LeaveRecord = sequelize.define('LeaveRecord', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, field: 'employee_id' },
    employeeName: { type: DataTypes.STRING, field: 'employee_name' },
    type: { type: DataTypes.ENUM('CUTI','SAKIT','IZIN'), allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'start_date' },
    endDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'end_date' },
    totalDays: { type: DataTypes.INTEGER, field: 'total_days' },
    paidType: { type: DataTypes.ENUM('PAID','UNPAID'), defaultValue: 'PAID', field: 'paid_type' },
    reason: DataTypes.TEXT,
    attachment: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('APPROVED','PENDING','REJECTED'), defaultValue: 'PENDING' },
  }, { tableName: 'leave_records', underscored: true, timestamps: true });
  return LeaveRecord;
};
