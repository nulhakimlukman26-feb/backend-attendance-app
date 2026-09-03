'use strict';
module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define('Session', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.STRING, allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING, allowNull: false, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE, field: 'expires_at' },
  }, { tableName: 'sessions', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' });
  Session.associate = (m) => {
    Session.belongsTo(m.User, { foreignKey: 'user_id' });
  };
  return Session;
};
