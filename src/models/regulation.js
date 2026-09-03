'use strict';
module.exports = (sequelize, DataTypes) => {
  const Regulation = sequelize.define('Regulation', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    title: DataTypes.STRING,
    category: DataTypes.STRING,
    content: DataTypes.TEXT,
    html: DataTypes.TEXT,
    version: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, { tableName: 'regulations', underscored: true, timestamps: true, indexes: [
    { fields: ['company_id'] },
  ]});
  return Regulation;
};
