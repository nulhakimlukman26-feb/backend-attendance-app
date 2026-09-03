'use strict';
module.exports = (sequelize, DataTypes) => {
  const DisciplineRecord = sequelize.define('DisciplineRecord', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, field: 'employee_id' },
    employeeName: { type: DataTypes.STRING, field: 'employee_name' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    violationType: { type: DataTypes.STRING, field: 'violation_type' },
    severity: { type: DataTypes.ENUM('Ringan','Sedang','Berat'), defaultValue: 'Ringan' },
    cardType: { type: DataTypes.STRING, field: 'card_type' },
    description: DataTypes.TEXT,
    createdBy: { type: DataTypes.STRING, field: 'created_by' },
    status: { type: DataTypes.ENUM('Aktif','Selesai','Kedaluwarsa'), defaultValue: 'Aktif' },
    resolvedDate: { type: DataTypes.DATEONLY, field: 'resolved_date' },
  }, { tableName: 'discipline_records', underscored: true, timestamps: true });
  return DisciplineRecord;
};
