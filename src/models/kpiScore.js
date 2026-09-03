'use strict';
module.exports = (sequelize, DataTypes) => {
  const KpiScore = sequelize.define('KpiScore', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING(191), allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING(191), allowNull: false, field: 'employee_id' },
    periodKey: { type: DataTypes.STRING(191), allowNull: false, field: 'period_key' },
    kpiId: { type: DataTypes.STRING(191), allowNull: false, field: 'kpi_id' },
    actualValue: { type: DataTypes.FLOAT, field: 'actual_value' },
    scorePoin: { type: DataTypes.FLOAT, field: 'score_poin' },
    isCustom: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_custom' },
    customMeta: { type: DataTypes.JSON, field: 'custom_meta' },
  }, { tableName: 'kpi_scores', underscored: true, timestamps: true, indexes: [
    { unique: true, fields: ['company_id','employee_id','period_key','kpi_id'] },
  ]});
  return KpiScore;
};
