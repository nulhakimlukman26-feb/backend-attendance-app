'use strict';
module.exports = (sequelize, DataTypes) => {
  const Sop = sequelize.define('Sop', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, field: 'company_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    code: DataTypes.STRING,
    category: DataTypes.STRING,
    version: DataTypes.STRING,
    description: DataTypes.TEXT,
    content: DataTypes.TEXT,
    fileUrl: { type: DataTypes.TEXT, field: 'file_url' },
    status: { type: DataTypes.ENUM('Aktif','Draft','Arsip'), defaultValue: 'Aktif' },
  }, { tableName: 'sops', underscored: true, timestamps: true });
  return Sop;
};
