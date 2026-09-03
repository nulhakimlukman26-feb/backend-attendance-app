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
  }, { tableName: 'users', underscored: true, timestamps: true });
  User.associate = (m) => {
    User.belongsTo(m.Company, { foreignKey: 'active_company_id', as: 'activeCompany' });
    User.hasMany(m.Session, { foreignKey: 'user_id' });
  };
  return User;
};
