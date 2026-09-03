'use strict';
module.exports = (sequelize, DataTypes) => {
  const EmployeeCard = sequelize.define('EmployeeCard', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, field: 'employee_id' },
    empName: { type: DataTypes.STRING, field: 'emp_name' },
    yellow: { type: DataTypes.INTEGER, defaultValue: 0 },
    red: { type: DataTypes.INTEGER, defaultValue: 0 },
    note: DataTypes.TEXT,
    isUserTouched: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_user_touched' },
  }, { tableName: 'employee_cards', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','emp_name'] },
  ]});
  return EmployeeCard;
};
