'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Widen active_period_key from CHAR(7)/VARCHAR(7) to VARCHAR(32) to support
    // unified PeriodFilter prefixes: DAY_YYYY-MM-DD, YEAR_YYYY, PRESET_*, WEEK_*
    // See BACKEND.md §6.2 + changelog §18.3 #2
    try {
      await queryInterface.changeColumn('app_settings', 'active_period_key', {
        type: Sequelize.STRING(32),
        allowNull: true,
        comment: 'Canonical active period key including prefixes: YYYY-MM, DAY_YYYY-MM-DD, YEAR_YYYY, PRESET_*, WEEK_*',
      });
    } catch (e) {
      // Table may not exist yet in fresh DB with AUTO_SYNC - ignore
      console.warn('[migration 20260903000001] skip changeColumn app_settings.active_period_key:', e.message);
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.changeColumn('app_settings', 'active_period_key', {
        type: Sequelize.STRING(7),
        allowNull: true,
      });
    } catch (e) {
      console.warn('[migration down 20260903000001]', e.message);
    }
  },
};
