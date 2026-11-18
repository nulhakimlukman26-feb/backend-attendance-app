'use strict';
module.exports = (sequelize, DataTypes) => {
  const EmployeePayrollComponent = sequelize.define('EmployeePayrollComponent', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('allowance', 'deduction'), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  }, { tableName: 'employee_payroll_components', underscored: true, timestamps: true });
  EmployeePayrollComponent.associate = (m) => EmployeePayrollComponent.belongsTo(m.Employee, { foreignKey: 'employee_id' });
  return EmployeePayrollComponent;
};
