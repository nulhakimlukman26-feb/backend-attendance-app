'use strict';
// Photo-based attendance check-in/out with GPS + admin verification.
module.exports = (sequelize, DataTypes) => {
  const PhotoAttendance = sequelize.define('PhotoAttendance', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    employeeName: { type: DataTypes.STRING, field: 'employee_name' },
    type: { type: DataTypes.ENUM('CHECK_IN', 'CHECK_OUT'), allowNull: false, defaultValue: 'CHECK_IN' },
    date: { type: DataTypes.DATEONLY, allowNull: false, comment: 'Attendance date (Asia/Jakarta)' },
    time: { type: DataTypes.STRING, comment: 'Capture time HH:mm (Asia/Jakarta)' },
    photoUrl: { type: DataTypes.TEXT, field: 'photo_url', comment: 'R2 URL of the selfie (null when R2 unconfigured)' },
    latitude: { type: DataTypes.DOUBLE, allowNull: false },
    longitude: { type: DataTypes.DOUBLE, allowNull: false },
    distanceMeters: { type: DataTypes.INTEGER, field: 'distance_meters', comment: 'Haversine distance to office (null when office coords unset)' },
    insideGeofence: { type: DataTypes.BOOLEAN, field: 'inside_geofence', comment: 'Whether within attendanceRadius (null when not computable)' },
    status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
    submittedBy: { type: DataTypes.STRING, field: 'submitted_by', comment: 'User id that submitted' },
    verifiedBy: { type: DataTypes.STRING, field: 'verified_by' },
    verifiedAt: { type: DataTypes.DATE, field: 'verified_at' },
    verifyNote: { type: DataTypes.TEXT, field: 'verify_note' },
    note: { type: DataTypes.STRING, comment: 'Optional note from employee' },
  }, {
    tableName: 'photo_attendances',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['company_id', 'status'] },
      { fields: ['company_id', 'employee_id', 'date'] },
      { fields: ['company_id', 'date'] },
    ],
  });
  PhotoAttendance.associate = (m) => {
    if (m.Company) PhotoAttendance.belongsTo(m.Company, { foreignKey: 'company_id' });
    if (m.Employee) PhotoAttendance.belongsTo(m.Employee, { foreignKey: 'employee_id', as: 'employee' });
  };
  return PhotoAttendance;
};
