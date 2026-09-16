'use strict';
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    email: { type: DataTypes.STRING, unique: true, allowNull: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false, field: 'password_hash' },
    displayName: { type: DataTypes.STRING, field: 'display_name' },
    role: { type: DataTypes.ENUM('ADMIN','HR','MANAGER','STAFF'), defaultValue: 'STAFF' },
    activeCompanyId: { type: DataTypes.STRING, field: 'active_company_id' },
    // Link to the employee record. The user email is integrated with the
    // employee email (single source of truth = employees.email).
    employeeId: { type: DataTypes.STRING, allowNull: true, field: 'employee_id' },
  }, { tableName: 'users', underscored: true, timestamps: true });
  User.associate = (m) => {
    User.belongsTo(m.Company, { foreignKey: 'active_company_id', as: 'activeCompany' });
    User.hasMany(m.Session, { foreignKey: 'user_id' });
    if (m.Employee) User.belongsTo(m.Employee, { foreignKey: 'employee_id', as: 'employee' });
  };
  return User;
};
