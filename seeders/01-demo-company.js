'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    // Companies
    await queryInterface.bulkInsert('companies', [{
      id: 'comp-sua-untung-abadi',
      name: 'CV. SUA UNTUNG ABADI',
      phone: '+62 85178523827',
      address: 'Jl. Ratu Teratai No.C1 no 43, RT.4/RW.13, Duri Kepa, Kec. Kb. Jeruk, Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11520',
      email: 'suauntungabadi@gmail.com',
      logo: null,
      is_default: 1,
      created_at: now,
      updated_at: now,
    }], { ignoreDuplicates: true });

    // Try to create admin user - hash at runtime
    try {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('admin123', 12);
      await queryInterface.bulkInsert('users', [{
        id: 'user-admin',
        username: 'admin',
        email: 'admin@suauntungabadi.local',
        password_hash: hash,
        display_name: 'Administrator',
        role: 'ADMIN',
        active_company_id: 'comp-sua-untung-abadi',
        created_at: now,
        updated_at: now,
      }], { ignoreDuplicates: true });

      // HR user
      const hrHash = await bcrypt.hash('hr123', 12);
      await queryInterface.bulkInsert('users', [{
        id: 'user-hr',
        username: 'hr',
        email: 'hr@suauntungabadi.local',
        password_hash: hrHash,
        display_name: 'HR Manager',
        role: 'HR',
        active_company_id: 'comp-sua-untung-abadi',
        created_at: now,
        updated_at: now,
      }], { ignoreDuplicates: true });
    } catch (e) {
      console.warn('[seed] bcrypt not available or user insert failed', e.message);
    }

    // App Settings
    await queryInterface.bulkInsert('app_settings', [{
      id: uuidv4(),
      company_id: 'comp-sua-untung-abadi',
      company_name: 'CV. SUA UNTUNG ABADI',
      company_address: 'Jl. Ratu Teratai No.C1 no 43, RT.4/RW.13, Duri Kepa, Kec. Kb. Jeruk, Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11520',
      company_phone: '+62 85178523827',
      company_email: 'suauntungabadi@gmail.com',
      company_logo: null,
      normal_start: '09:00',
      normal_end: '18:00',
      overtime_start: '18:30',
      late_penalty_per_minute: 1000,
      late_penalty_max_minutes: 30,
      yellow_card_penalty: 30000,
      yellow_card_step: 5000,
      red_card_penalty: 150000,
      card_rules: JSON.stringify([
        { id: 'rule-1', minLateDays: 5, op: 'gte', cardType: 'red', cardCount: 1, label: 'Minimal 5 kali (≥ 5 kali)' },
        { id: 'rule-2', minLateDays: 10, op: 'gte', cardType: 'red', cardCount: 2, label: 'Minimal 10 kali (≥ 10 kali)' }
      ]),
      max_overtime_minutes: 240,
      overtime_rate_per_hour: 9000,
      holiday_multiplier: 1.4,
      work_days: JSON.stringify({ "0":false,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true }),
      target_day_method: 'AUTO',
      manual_target_days: 26,
      deduct_holidays_from_target: 1,
      holidays: JSON.stringify([]),
      off_employees: JSON.stringify([]),
      attendance_radius: 100,
      attendance_geofencing_enabled: 1,
      attendance_strict_mode: 0,
      master_penalties: JSON.stringify([
        { id: 'pen-1', name: 'Terlambat Ringan', description: 'Terlambat 5–15 menit tanpa keterangan', point: 10, category: 'ringan' },
        { id: 'pen-2', name: 'Terlambat Sedang', description: 'Terlambat 16–30 menit atau keterlambatan berulang', point: 25, category: 'sedang' },
        { id: 'pen-3', name: 'Terlambat Berat / Alpha', description: 'Terlambat >30 menit atau tidak hadir tanpa izin', point: 50, category: 'berat' },
      ]),
      master_rewards: JSON.stringify([
        { id: 'rew-1', name: 'Kehadiran Sempurna', description: 'Hadir penuh tanpa keterlambatan selama 1 bulan', point: 20 },
        { id: 'rew-2', name: 'Lembur Produktif', description: 'Menyelesaikan lembur melebihi target', point: 15 },
      ]),
      point_default: 0,
      yellow_card_point: 10,
      red_card_point: 30,
      yellow_to_red_threshold: 3,
      point_reset_day: 1,
      point_reset_enabled: 1,
      active_period_key: '2026-07',
      created_at: now,
      updated_at: now,
    }], { ignoreDuplicates: true });

    // Departments
    const deps = ['WAREHOUSE','Finance & Tax','HR','Operational','Management'];
    for (const name of deps) {
      await queryInterface.bulkInsert('departments', [{
        id: uuidv4(),
        company_id: 'comp-sua-untung-abadi',
        name,
        is_active: 1,
        created_at: now,
        updated_at: now,
      }], { ignoreDuplicates: true });
    }

    // Demo employees (3) - fallback if no employees exist
    const empCount = await queryInterface.sequelize.query('SELECT COUNT(*) as cnt FROM employees WHERE company_id="comp-sua-untung-abadi"', { type: Sequelize.QueryTypes.SELECT });
    if (empCount[0].cnt === 0) {
      await queryInterface.bulkInsert('employees', [
        {
          id: 'EMP-0001',
          company_id: 'comp-sua-untung-abadi',
          full_name: 'MICHAEL ADRIAN',
          department: 'Management',
          job_title: 'Direktur',
          employment_status: 'Active',
          base_salary: 8500000,
          daily_salary: 300000,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'EMP-0002',
          company_id: 'comp-sua-untung-abadi',
          full_name: 'Budi Santoso',
          department: 'WAREHOUSE',
          job_title: 'Staf Gudang',
          employment_status: 'Active',
          base_salary: 1755000,
          daily_salary: 85000,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'EMP-0003',
          company_id: 'comp-sua-untung-abadi',
          full_name: 'Siti Rahayu',
          department: 'Finance & Tax',
          job_title: 'Staff Finance',
          employment_status: 'Active',
          base_salary: 2500000,
          daily_salary: 100000,
          created_at: now,
          updated_at: now,
        },
      ], { ignoreDuplicates: true });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('employees', { company_id: 'comp-sua-untung-abadi' });
    await queryInterface.bulkDelete('departments', { company_id: 'comp-sua-untung-abadi' });
    await queryInterface.bulkDelete('app_settings', { company_id: 'comp-sua-untung-abadi' });
    await queryInterface.bulkDelete('users', { id: ['user-admin','user-hr'] });
    await queryInterface.bulkDelete('companies', { id: 'comp-sua-untung-abadi' });
  }
};
