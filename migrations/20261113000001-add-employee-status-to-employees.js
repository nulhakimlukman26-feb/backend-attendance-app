'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('employees', 'employee_status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'Aktif',
      });
    } catch (e) {
      if (e.message && e.message.includes('Duplicate column')) {
        console.warn('[migration 20261113000001] employee_status already exists, skip');
        return;
      }
      throw e;
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('employees', 'employee_status');
    } catch (e) {
      console.warn('[migration down 20261113000001] remove employee_status:', e.message);
    }
  },
};
