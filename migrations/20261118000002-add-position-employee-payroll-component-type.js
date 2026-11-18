'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('employee_payroll_components', 'type', {
      type: Sequelize.ENUM('allowance', 'deduction', 'position'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE employee_payroll_components SET type = 'allowance' WHERE type = 'position'",
    );
    await queryInterface.changeColumn('employee_payroll_components', 'type', {
      type: Sequelize.ENUM('allowance', 'deduction'),
      allowNull: false,
    });
  },
};
