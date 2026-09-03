const db = require('../../models');

const DEFAULT_SETTINGS = {
  companyName: 'CV. SUA UNTUNG ABADI',
  companyAddress: 'Jl. Ratu Teratai No.C1 no 43, RT.4/RW.13, Duri Kepa, Kec. Kb. Jeruk, Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11520',
  companyPhone: '+62 85178523827',
  companyEmail: 'suauntungabadi@gmail.com',
  companyLogo: '',
  normalStart: '09:00',
  normalEnd: '18:00',
  overtimeStart: '18:30',
  latePenaltyPerMinute: 1000,
  latePenaltyMaxMinutes: 30,
  yellowCardPenalty: 30000,
  yellowCardStep: 5000,
  redCardPenalty: 150000,
  cardRules: [
    { id: 'rule-1', minLateDays: 5, op: 'gte', cardType: 'red', cardCount: 1, label: 'Minimal 5 kali (≥ 5 kali)' },
    { id: 'rule-2', minLateDays: 10, op: 'gte', cardType: 'red', cardCount: 2, label: 'Minimal 10 kali (≥ 10 kali)' }
  ],
  maxOvertimeMinutes: 240,
  overtimeRatePerHour: 9000,
  holidayMultiplier: 1.4,
  workDays: { "0":false,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true },
  targetDayMethod: 'AUTO',
  manualTargetDays: 26,
  deductHolidaysFromTarget: true,
  holidays: [],
  offEmployees: [],
  attendanceRadius: 100,
  attendanceGeofencingEnabled: true,
  attendanceStrictMode: false,
  officeLatitude: '',
  officeLongitude: '',
  officeLocationName: '',
  masterPenalties: [
    { id: 'pen-1', name: 'Terlambat Ringan', description: 'Terlambat 5–15 menit tanpa keterangan', point: 10, category: 'ringan' },
    { id: 'pen-2', name: 'Terlambat Sedang', description: 'Terlambat 16–30 menit atau keterlambatan berulang', point: 25, category: 'sedang' },
    { id: 'pen-3', name: 'Terlambat Berat / Alpha', description: 'Terlambat >30 menit atau tidak hadir tanpa izin', point: 50, category: 'berat' },
    { id: 'pen-4', name: 'Pelanggaran SOP', description: 'Tidak mengikuti SOP warehouse / operasional', point: 30, category: 'sedang' },
  ],
  masterRewards: [
    { id: 'rew-1', name: 'Kehadiran Sempurna', description: 'Hadir penuh tanpa keterlambatan selama 1 bulan', point: 20 },
    { id: 'rew-2', name: 'Lembur Produktif', description: 'Menyelesaikan lembur melebihi target', point: 15 },
    { id: 'rew-3', name: 'Inisiatif & Disiplin', description: 'Memberi contoh kedisiplinan bagi tim', point: 10 },
  ],
  pointDefault: 0,
  yellowCardPoint: 10,
  redCardPoint: 30,
  yellowToRedThreshold: 3,
  pointResetDay: 1,
  pointResetEnabled: true,
};

exports.get = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib'}});
    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if (!setting) {
      // auto-create with defaults
      setting = await db.AppSetting.create({ companyId, ...DEFAULT_SETTINGS });
    }
    // Merge defaults for missing fields
    const merged = { ...DEFAULT_SETTINGS, ...setting.toJSON() };
    res.json({ ok:true, data:{ settings: merged }});
  } catch(e){ next(e); }
};

exports.upsert = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib'}});
    // Validate ranges
    const { latePenaltyPerMinute, holidayMultiplier, attendanceRadius } = req.body;
    if (latePenaltyPerMinute !== undefined && (latePenaltyPerMinute < 0 || latePenaltyPerMinute > 100000)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'latePenaltyPerMinute 0..100000'}});
    if (holidayMultiplier !== undefined && (holidayMultiplier < 1 || holidayMultiplier > 3)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'holidayMultiplier 1..3'}});
    if (attendanceRadius !== undefined && (attendanceRadius < 10 || attendanceRadius > 5000)) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'attendanceRadius 10..5000'}});
    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if (!setting) setting = await db.AppSetting.create({ companyId, ...req.body });
    else { Object.assign(setting, req.body); await setting.save(); }
    res.json({ ok:true, data:{ settings: setting }});
  } catch(e){ next(e); }
};

exports.reset = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR'}});
    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if (!setting) setting = await db.AppSetting.create({ companyId, ...DEFAULT_SETTINGS });
    else { Object.assign(setting, DEFAULT_SETTINGS); await setting.save(); }
    res.json({ ok:true, data:{ settings: setting }});
  } catch(e){ next(e); }
};

module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
