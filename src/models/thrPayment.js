'use strict';
module.exports = (sequelize, DataTypes) => {
  const ThrPayment = sequelize.define('ThrPayment', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    year: { type: DataTypes.INTEGER, allowNull: false },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    status: { type: DataTypes.ENUM('PAID','UNPAID'), defaultValue: 'UNPAID' },
    paidAt: { type: DataTypes.DATE, field: 'paid_at' },
    paymentMethod: { type: DataTypes.STRING, field: 'payment_method' },
    notes: DataTypes.TEXT,
    updatedBy: { type: DataTypes.STRING, field: 'updated_by' },
  }, { tableName: 'thr_payments', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','year','employee_id'] },
  ]});
  return ThrPayment;
};
