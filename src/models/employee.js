'use strict';
module.exports = (sequelize, DataTypes) => {
  const Employee = sequelize.define('Employee', {
    id: { type: DataTypes.STRING, primaryKey: true },
    companyId: { type: DataTypes.STRING, allowNull: false, field: 'company_id' },
    fullName: { type: DataTypes.STRING, allowNull: false, field: 'full_name' },
    attendanceAliases: { type: DataTypes.JSON, field: 'attendance_aliases', defaultValue: [] },
    department: { type: DataTypes.STRING, defaultValue: 'WAREHOUSE' },
    jobTitle: { type: DataTypes.STRING, defaultValue: 'Staf', field: 'job_title' },
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    birthPlace: { type: DataTypes.STRING, field: 'birth_place' },
    birthDate: { type: DataTypes.DATEONLY, field: 'birth_date' },
    joinDate: { type: DataTypes.DATEONLY, field: 'join_date' },
    employmentStatus: { type: DataTypes.STRING, defaultValue: 'Active', field: 'employment_status' },
    wfhEnabled: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'wfh_enabled' },
    probationStartDate: { type: DataTypes.DATEONLY, field: 'probation_start_date' },
    probationEndDate: { type: DataTypes.DATEONLY, field: 'probation_end_date' },
    contractEndDate: { type: DataTypes.DATEONLY, field: 'contract_end_date' },
    bankName: { type: DataTypes.STRING, field: 'bank_name' },
    bankAccountNumber: { type: DataTypes.STRING, field: 'bank_account_number' },
    bankAccountHolder: { type: DataTypes.STRING, field: 'bank_account_holder' },
    nik: DataTypes.STRING,
    npwp: DataTypes.STRING,
    bpjsKesehatan: { type: DataTypes.STRING, field: 'bpjs_kesehatan' },
    bpjsKetenagakerjaan: { type: DataTypes.STRING, field: 'bpjs_ketenagakerjaan' },
    shift: { type: DataTypes.STRING, defaultValue: 'Normal' },
    supervisor: DataTypes.STRING,
    workLocation: { type: DataTypes.STRING, defaultValue: 'Kantor Pusat', field: 'work_location' },
    baseSalary: { type: DataTypes.DECIMAL(14,2), defaultValue: 1755000, field: 'base_salary' },
    dailySalary: { type: DataTypes.DECIMAL(14,2), defaultValue: 85000, field: 'daily_salary' },
    overtimeRate: { type: DataTypes.DECIMAL(14,2), defaultValue: 9000, field: 'overtime_rate' },
    allowance: { type: DataTypes.DECIMAL(14,2), defaultValue: 0 },
    payrollType: { type: DataTypes.STRING, defaultValue: 'Monthly', field: 'payroll_type' },
    photo: DataTypes.TEXT,
    notes: DataTypes.TEXT,
  }, { tableName: 'employees', underscored: true, timestamps: true, indexes: [
    { fields: ['company_id'] }, { fields: ['full_name'] }
  ]});
  Employee.associate = (m) => {
    Employee.belongsTo(m.Company, { foreignKey: 'company_id' });
    Employee.hasMany(m.AttendanceRecord, { foreignKey: 'employee_id' });
  };
  return Employee;
};
