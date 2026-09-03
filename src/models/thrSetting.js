'use strict';
module.exports = (sequelize, DataTypes) => {
  const ThrSetting = sequelize.define('ThrSetting', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'company_id' },
    enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    regulationType: { type: DataTypes.STRING, field: 'regulation_type' },
    applicableYear: { type: DataTypes.INTEGER, field: 'applicable_year' },
    holidayId: { type: DataTypes.STRING, field: 'holiday_id' },
    holidayName: { type: DataTypes.STRING, field: 'holiday_name' },
    holidayDate: { type: DataTypes.DATEONLY, field: 'holiday_date' },
    paymentDeadlineDays: { type: DataTypes.INTEGER, field: 'payment_deadline_days' },
    wageBasisType: { type: DataTypes.STRING, field: 'wage_basis_type' },
    companyPolicyMultiplier: { type: DataTypes.FLOAT, field: 'company_policy_multiplier' },
    companyMinimumTHR: { type: DataTypes.DECIMAL(14,2), field: 'company_minimum_thr' },
    includePieceRateBonus: { type: DataTypes.BOOLEAN, field: 'include_piece_rate_bonus' },
    notes: DataTypes.TEXT,
  }, { tableName: 'thr_settings', underscored: true, timestamps: true });
  ThrSetting.associate = (m) => { ThrSetting.belongsTo(m.Company, { foreignKey: 'company_id' }); };
  return ThrSetting;
};
