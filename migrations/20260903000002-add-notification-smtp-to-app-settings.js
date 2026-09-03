'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'app_settings';
    const add = async (col, def) => {
      try {
        await queryInterface.addColumn(table, col, def);
        console.log(`[migration 20260903000002] added ${col}`);
      } catch (e) {
        if (e.message && e.message.includes('Duplicate column')) {
          console.warn(`[migration 20260903000002] ${col} already exists, skip`);
        } else {
          console.warn(`[migration 20260903000002] skip addColumn ${col}:`, e.message);
        }
      }
    };
    await add('notification_from_email', { type: Sequelize.STRING, allowNull: true, comment: 'From address for outgoing notifications (per-company)' });
    await add('notification_from_name', { type: Sequelize.STRING, allowNull: true, comment: 'Display name for From header' });
    await add('smtp_host', { type: Sequelize.STRING, allowNull: true, comment: 'SMTP host, e.g. smtp.gmail.com' });
    await add('smtp_port', { type: Sequelize.INTEGER, allowNull: true, comment: 'SMTP port, e.g. 587 or 465' });
    await add('smtp_secure', { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false, comment: 'true for 465 (SSL)' });
    await add('smtp_user', { type: Sequelize.STRING, allowNull: true, comment: 'SMTP auth user' });
    await add('smtp_pass', { type: Sequelize.STRING, allowNull: true, comment: 'SMTP password / app password' });
  },

  async down(queryInterface) {
    const table = 'app_settings';
    const cols = ['notification_from_email','notification_from_name','smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass'];
    for (const col of cols) {
      try { await queryInterface.removeColumn(table, col); } catch (e) { console.warn('[migration down 20260903000002]', col, e.message); }
    }
  },
};
