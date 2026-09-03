'use strict';
module.exports = (sequelize, DataTypes) => {
  const Evaluation = sequelize.define('Evaluation', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    employeeId: { type: DataTypes.STRING, allowNull: false, field: 'employee_id' },
    periodKey: { type: DataTypes.STRING, field: 'period_key' },
    overallScore: { type: DataTypes.FLOAT, field: 'overall_score' },
    decision: { type: DataTypes.ENUM('Lulus','Perpanjang Probation','Tidak Lulus'), allowNull: true },
    notes: DataTypes.TEXT,
    evaluator: DataTypes.STRING,
    evaluationDate: { type: DataTypes.DATEONLY, field: 'evaluation_date' },
    nextEvaluationDate: { type: DataTypes.DATEONLY, field: 'next_evaluation_date' },
    payload: DataTypes.JSON,
  }, { tableName: 'evaluations', underscored: true, timestamps: true });
  return Evaluation;
};
