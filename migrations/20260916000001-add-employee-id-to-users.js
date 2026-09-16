'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'users';
    try {
      await queryInterface.addColumn(table, 'employee_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Link to employees.id — user email is integrated with employees.email',
      });
      console.log('[migration 20260916000001] added employee_id to users');
    } catch (e) {
      if (e.message && e.message.includes('Duplicate column')) {
        console.warn('[migration 20260916000001] employee_id already exists, skip');
      } else {
        console.warn('[migration 20260916000001] skip addColumn employee_id:', e.message);
      }
    }
    try {
      await queryInterface.addIndex(table, ['employee_id'], { name: 'users_employee_id_idx' });
    } catch (e) {
      console.warn('[migration 20260916000001] skip addIndex users_employee_id_idx:', e.message);
    }
  },

  async down(queryInterface) {
    try { await queryInterface.removeIndex('users', 'users_employee_id_idx'); } catch (e) { console.warn('[migration down 20260916000001] removeIndex:', e.message); }
    try { await queryInterface.removeColumn('users', 'employee_id'); } catch (e) { console.warn('[migration down 20260916000001] removeColumn:', e.message); }
  },
};
