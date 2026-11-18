'use strict';

function matchingStringType(column, Sequelize) {
  const match = column.COLUMN_TYPE.match(/^(varchar|char)\((\d+)\)/i);
  if (!match) {
    throw new Error(`Unsupported referenced key type: ${column.COLUMN_TYPE}`);
  }

  const length = Number(match[2]);
  return match[1].toLowerCase() === 'char'
    ? Sequelize.CHAR(length)
    : Sequelize.STRING(length);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const [keyColumns] = await queryInterface.sequelize.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'employees' AND COLUMN_NAME = 'id')
           OR (TABLE_NAME = 'companies' AND COLUMN_NAME = 'id'))`
    );
    const employeeId = keyColumns.find((column) => column.TABLE_NAME === 'employees');
    const companyId = keyColumns.find((column) => column.TABLE_NAME === 'companies');
    if (!employeeId || !companyId) {
      throw new Error('Could not inspect employees.id and companies.id before creating payroll components');
    }

    await queryInterface.createTable('employee_payroll_components', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      employee_id: { type: matchingStringType(employeeId, Sequelize), allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
      company_id: { type: matchingStringType(companyId, Sequelize), allowNull: false, references: { model: 'companies', key: 'id' }, onDelete: 'CASCADE' },
      component_id: { type: Sequelize.STRING, allowNull: true },
      name: { type: Sequelize.STRING, allowNull: false },
      type: { type: Sequelize.ENUM('allowance', 'deduction'), allowNull: false },
      amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    }, {
      charset: employeeId.CHARACTER_SET_NAME,
      collate: employeeId.COLLATION_NAME,
    });
    await queryInterface.addIndex('employee_payroll_components', ['employee_id']);
    const [employees] = await queryInterface.sequelize.query('SELECT id, company_id, allowance FROM employees WHERE allowance > 0');
    const now = new Date();
    if (employees.length) await queryInterface.bulkInsert('employee_payroll_components', employees.map(e => ({
      id: require('crypto').randomUUID(), employee_id: e.id, company_id: e.company_id,
      name: 'Tunjangan Jabatan', type: 'allowance', amount: e.allowance,
      is_active: true, created_at: now, updated_at: now,
    })));
    await queryInterface.removeColumn('employees', 'allowance');
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'allowance', { type: Sequelize.DECIMAL(14, 2), defaultValue: 0 });
    await queryInterface.dropTable('employee_payroll_components');
  },
};
