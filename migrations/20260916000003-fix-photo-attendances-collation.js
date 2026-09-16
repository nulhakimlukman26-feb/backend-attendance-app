'use strict';

/**
 * Align photo_attendances charset/collation with the rest of the schema
 * (utf8mb4 / utf8mb4_unicode_ci, see src/config/database.js), otherwise
 * JOINs against employees/companies fail with "Illegal mix of collations".
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE photo_attendances CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    console.log('[migration 20260916000003] photo_attendances converted to utf8mb4_unicode_ci');
  },

  async down() {
    // No-op: collation change is not reverted.
  },
};
