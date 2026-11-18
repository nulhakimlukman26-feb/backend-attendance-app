'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_payroll_components', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      employee_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
      company_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'companies', key: 'id' }, onDelete: 'CASCADE' },
      component_id: { type: Sequelize.STRING, allowNull: true },
      name: { type: Sequelize.STRING, allowNull: false },
      type: { type: Sequelize.ENUM('allowance', 'deduction'), allowNull: false },
      amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('employee_payroll_components', ['employee_id']);
    const [employees] = await queryInterface.sequelize.query('SELECT id, company_id, allowance FROM employees WHERE allowance > 0');
    const now = new Date();
    if (employees.length) await queryInterface.bulkInsert('employee_payroll_components', employees.map(e => ({
      id: Sequelize.literal('gen_random_uuid()'), employee_id: e.id, company_id: e.company_id,
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
