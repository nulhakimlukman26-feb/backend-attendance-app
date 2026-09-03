'use strict';
module.exports = (sequelize, DataTypes) => {
  const KpiConfig = sequelize.define('KpiConfig', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'company_id' },
    veryGoodMin: { type: DataTypes.INTEGER, defaultValue: 90, field: 'very_good_min' },
    goodMin: { type: DataTypes.INTEGER, defaultValue: 80, field: 'good_min' },
    fairMin: { type: DataTypes.INTEGER, defaultValue: 70, field: 'fair_min' },
    labels: { type: DataTypes.JSON, defaultValue: { veryGood: 'Sangat Baik', good: 'Baik', fair: 'Cukup', poor: 'Kurang' } },
  }, { tableName: 'kpi_configs', underscored: true, timestamps: true });
  return KpiConfig;
};
