'use strict';
module.exports = (sequelize, DataTypes) => {
  const PointTransaction = sequelize.define('PointTransaction', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, field: 'employee_id' },
    employeeName: { type: DataTypes.STRING, field: 'employee_name' },
    type: { type: DataTypes.ENUM('penalty','reward'), allowNull: false },
    masterId: { type: DataTypes.STRING, field: 'master_id' },
    name: DataTypes.STRING,
    point: { type: DataTypes.INTEGER, allowNull: false },
    category: DataTypes.STRING,
    cardType: { type: DataTypes.ENUM('yellow','red'), field: 'card_type' },
    description: DataTypes.TEXT,
    date: { type: DataTypes.DATEONLY, allowNull: false },
  }, { tableName: 'point_transactions', underscored: true, timestamps: true });
  return PointTransaction;
};
