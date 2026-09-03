'use strict';
module.exports = (sequelize, DataTypes) => {
  const AppSetting = sequelize.define('AppSetting', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'company_id' },
    companyName: { type: DataTypes.STRING, field: 'company_name' },
    companyAddress: { type: DataTypes.TEXT, field: 'company_address' },
    companyPhone: { type: DataTypes.STRING, field: 'company_phone' },
    companyEmail: { type: DataTypes.STRING, field: 'company_email' },
    companyLogo: { type: DataTypes.TEXT, field: 'company_logo' },
    normalStart: { type: DataTypes.STRING, defaultValue: '09:00', field: 'normal_start' },
    normalEnd: { type: DataTypes.STRING, defaultValue: '18:00', field: 'normal_end' },
    overtimeStart: { type: DataTypes.STRING, defaultValue: '18:30', field: 'overtime_start' },
    latePenaltyPerMinute: { type: DataTypes.INTEGER, defaultValue: 1000, field: 'late_penalty_per_minute' },
    latePenaltyMaxMinutes: { type: DataTypes.INTEGER, defaultValue: 30, field: 'late_penalty_max_minutes' },
    yellowCardPenalty: { type: DataTypes.INTEGER, defaultValue: 30000, field: 'yellow_card_penalty' },
    yellowCardStep: { type: DataTypes.INTEGER, defaultValue: 5000, field: 'yellow_card_step' },
    redCardPenalty: { type: DataTypes.INTEGER, defaultValue: 150000, field: 'red_card_penalty' },
    cardRules: { type: DataTypes.JSON, field: 'card_rules', defaultValue: [] },
    maxOvertimeMinutes: { type: DataTypes.INTEGER, defaultValue: 240, field: 'max_overtime_minutes' },
    overtimeRatePerHour: { type: DataTypes.INTEGER, defaultValue: 9000, field: 'overtime_rate_per_hour' },
    holidayMultiplier: { type: DataTypes.FLOAT, defaultValue: 1.4, field: 'holiday_multiplier' },
    workDays: { type: DataTypes.JSON, field: 'work_days', defaultValue: { "0":false,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true } },
    targetDayMethod: { type: DataTypes.STRING, defaultValue: 'AUTO', field: 'target_day_method' },
    manualTargetDays: { type: DataTypes.INTEGER, defaultValue: 26, field: 'manual_target_days' },
    deductHolidaysFromTarget: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'deduct_holidays_from_target' },
    holidays: { type: DataTypes.JSON, defaultValue: [] },
    offEmployees: { type: DataTypes.JSON, field: 'off_employees', defaultValue: [] },
    attendanceRadius: { type: DataTypes.INTEGER, defaultValue: 100, field: 'attendance_radius' },
    attendanceGeofencingEnabled: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'attendance_geofencing_enabled' },
    attendanceStrictMode: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'attendance_strict_mode' },
    officeLatitude: { type: DataTypes.STRING, field: 'office_latitude' },
    officeLongitude: { type: DataTypes.STRING, field: 'office_longitude' },
    officeLocationName: { type: DataTypes.STRING, field: 'office_location_name' },
    masterPenalties: { type: DataTypes.JSON, field: 'master_penalties', defaultValue: [] },
    masterRewards: { type: DataTypes.JSON, field: 'master_rewards', defaultValue: [] },
    pointDefault: { type: DataTypes.INTEGER, defaultValue: 0, field: 'point_default' },
    yellowCardPoint: { type: DataTypes.INTEGER, defaultValue: 10, field: 'yellow_card_point' },
    redCardPoint: { type: DataTypes.INTEGER, defaultValue: 30, field: 'red_card_point' },
    yellowToRedThreshold: { type: DataTypes.INTEGER, defaultValue: 3, field: 'yellow_to_red_threshold' },
    pointResetDay: { type: DataTypes.INTEGER, defaultValue: 1, field: 'point_reset_day' },
    pointResetEnabled: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'point_reset_enabled' },
    activePeriodKey: { type: DataTypes.STRING, field: 'active_period_key' },
  }, { tableName: 'app_settings', underscored: true, timestamps: true });
  AppSetting.associate = (m) => {
    AppSetting.belongsTo(m.Company, { foreignKey: 'company_id' });
  };
  return AppSetting;
};
