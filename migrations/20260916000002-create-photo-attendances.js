'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.createTable('photo_attendances', {
        id: { type: Sequelize.STRING, primaryKey: true },
        company_id: { type: Sequelize.STRING, allowNull: false },
        employee_id: { type: Sequelize.STRING, allowNull: false },
        employee_name: { type: Sequelize.STRING, allowNull: true },
        type: { type: Sequelize.ENUM('CHECK_IN', 'CHECK_OUT'), allowNull: false, defaultValue: 'CHECK_IN' },
        date: { type: Sequelize.DATEONLY, allowNull: false },
        time: { type: Sequelize.STRING, allowNull: true },
        photo_url: { type: Sequelize.TEXT, allowNull: true },
        latitude: { type: Sequelize.DOUBLE, allowNull: false },
        longitude: { type: Sequelize.DOUBLE, allowNull: false },
        distance_meters: { type: Sequelize.INTEGER, allowNull: true },
        inside_geofence: { type: Sequelize.BOOLEAN, allowNull: true },
        status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
        submitted_by: { type: Sequelize.STRING, allowNull: true },
        verified_by: { type: Sequelize.STRING, allowNull: true },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        verify_note: { type: Sequelize.TEXT, allowNull: true },
        note: { type: Sequelize.STRING, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
      }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
      console.log('[migration 20260916000002] created photo_attendances');
    } catch (e) {
      if (e.message && e.message.includes('already exists')) {
        console.warn('[migration 20260916000002] photo_attendances already exists, skip');
        return;
      }
      throw e;
    }
    const addIdx = async (fields, name, unique) => {
      try {
        await queryInterface.addIndex('photo_attendances', fields, { name, unique: !!unique });
      } catch (e) { console.warn(`[migration 20260916000002] skip addIndex ${name}:`, e.message); }
    };
    await addIdx(['company_id', 'status'], 'photo_att_company_status_idx');
    await addIdx(['company_id', 'employee_id', 'date'], 'photo_att_company_emp_date_idx');
    await addIdx(['company_id', 'date'], 'photo_att_company_date_idx');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('photo_attendances');
  },
};
