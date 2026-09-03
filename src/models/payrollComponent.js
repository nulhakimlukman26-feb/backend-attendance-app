'use strict';
module.exports = (sequelize, DataTypes) => {
  const PayrollComponent = sequelize.define('PayrollComponent', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    code: DataTypes.STRING,
    type: { type: DataTypes.ENUM('earning','deduction','position'), defaultValue: 'earning' },
    amount: { type: DataTypes.DECIMAL(14,2), defaultValue: 0 },
    isTaxable: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_taxable' },
    isFixed: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_fixed' },
    description: DataTypes.TEXT,
    formula: DataTypes.TEXT,
  }, { tableName: 'payroll_components', underscored: true, timestamps: true });
  return PayrollComponent;
};
