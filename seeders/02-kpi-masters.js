'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const masters = [
      { id: 'KPI-WH-001', department: 'WAREHOUSE', job_title: 'Staf Gudang', name: 'Akurasi Stok', description: 'Akurasi pencatatan stok harian', target: 98, unit: '%', weight: 30, assessment_method: 'System', data_source: 'WMS', status: 'Aktif', is_default: 1, is_auto_attendance: 0, sop_ids: JSON.stringify([]), created_at: now, updated_at: now },
      { id: 'KPI-WH-002', department: 'WAREHOUSE', job_title: 'Staf Gudang', name: 'Kehadiran', description: 'Tingkat kehadiran bulanan', target: 100, unit: '%', weight: 25, assessment_method: 'Attendance', data_source: 'Absensi', status: 'Aktif', is_default: 1, is_auto_attendance: 1, sop_ids: JSON.stringify([]), created_at: now, updated_at: now },
      { id: 'KPI-FN-001', department: 'Finance & Tax', job_title: 'Staff Finance', name: 'Ketepatan Laporan', description: 'Ketepatan waktu laporan keuangan', target: 100, unit: '%', weight: 35, assessment_method: 'Manager Review', data_source: 'Manual', status: 'Aktif', is_default: 1, is_auto_attendance: 0, sop_ids: JSON.stringify([]), created_at: now, updated_at: now },
    ];
    await queryInterface.bulkInsert('kpi_masters', masters, { ignoreDuplicates: true });
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('kpi_masters', { id: ['KPI-WH-001','KPI-WH-002','KPI-FN-001'] });
  }
};
