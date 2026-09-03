const db = require('../../models');
const { parseAttendanceFile } = require('../../utils/attendanceParser');
const { uploadToR2 } = require('../../utils/r2Upload');
const { Op } = require('sequelize');

// Helper: generate summary similar to src/core/summaryGen.js (simplified server truth)
// For now we compute basic aggregates; detailed calc can be expanded later.
function generateServerSummary(period, records, employees, settings) {
  const totalRecords = records.length;
  const byStatus = records.reduce((acc,r)=>{ acc[r.status]=(acc[r.status]||0)+1; return acc;},{});
  const byEmployee = {};
  for (const r of records) {
    if (!byEmployee[r.employeeId]) byEmployee[r.employeeId] = { employeeId:r.employeeId, hadir:0, tidakHadir:0, tidakLengkap:0 };
    if (r.status==='Hadir') byEmployee[r.employeeId].hadir++;
    else if (r.status==='Data Tidak Lengkap') byEmployee[r.employeeId].tidakLengkap++;
    else byEmployee[r.employeeId].tidakHadir++;
  }
  return {
    periodKey: period.key,
    label: period.label,
    totalEmployees: employees.length,
    totalRecords,
    statusBreakdown: byStatus,
    byEmployee: Object.values(byEmployee),
    generatedAt: new Date().toISOString(),
  };
}

function keyFromPeriod(periodStart, periodEnd) {
  if (!periodStart) return null;
  const d = new Date(periodStart);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:{code:'NO_FILE', message:'File .xlsx wajib'}});
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib (header x-company-id atau body companyId)'}});

    const company = await db.Company.findByPk(companyId);
    if (!company) return res.status(404).json({ ok:false, error:{code:'COMPANY_NOT_FOUND'}});

    const parsed = parseAttendanceFile(req.file.buffer, req.file.originalname);
    if (parsed.error && parsed.employees.length===0) {
      await db.UploadLog.create({
        companyId, fileName: req.file.originalname, fileSize: req.file.size,
        periodKey: 'unknown', periodLabel: 'unknown', employeeCount:0, recordCount:0,
        status:'FAILED', note: parsed.warnings.join('; '), uploadedBy: req.user.sub,
      });
      return res.status(400).json({ ok:false, error:{code:'PARSE_ERROR', message: parsed.warnings.join('; ')}});
    }

    const periodStart = parsed.period.start;
    const periodEnd = parsed.period.end;
    const periodKey = keyFromPeriod(periodStart, periodEnd) || `unknown-${Date.now()}`;
    const label = periodStart ? `${periodStart.toLocaleDateString('id-ID',{month:'long', year:'numeric'})}` : parsed.fileName;

    // Ensure employees exist (auto create minimal if not found)
    const employeeMap = new Map(); // name lower -> employeeId
    for (const emp of parsed.employees) {
      const name = emp.name.trim();
      const lower = name.toLowerCase();
      let existing = await db.Employee.findOne({ where:{ companyId, fullName: name }});
      if (!existing) {
        // Try case-insensitive
        existing = await db.Employee.findOne({ where:{ companyId, fullName: { [Op.like]: name } }});
      }
      if (!existing) {
        // Also check aliases
        const all = await db.Employee.findAll({ where:{ companyId }});
        for (const a of all) {
          const aliases = (a.attendanceAliases||[]).map(x=>String(x).toLowerCase());
          if (aliases.includes(lower) || String(a.fullName).toLowerCase()===lower) { existing=a; break; }
        }
      }
      if (!existing) {
        // Auto-create stub employee
        const count = await db.Employee.count({ where:{ companyId }});
        const newId = `EMP-${String(count+1).padStart(4,'0')}`;
        existing = await db.Employee.create({
          id: newId, companyId, fullName: name, department: emp.department||'WAREHOUSE',
          attendanceAliases: [name],
        });
      }
      employeeMap.set(lower, existing.id);
      // Also map by userId if provided
      if (emp.userId) employeeMap.set(String(emp.userId).toLowerCase(), existing.id);
    }

    // Transaction: upsert period + bulk records
    const t = await db.sequelize.transaction();
    try {
      let period = await db.AttendancePeriod.findOne({ where:{ companyId, key: periodKey }, transaction:t });
      if (period) {
        period.fileName = req.file.originalname;
        period.periodStart = periodStart ? periodStart.toISOString().slice(0,10) : period.periodStart;
        period.periodEnd = periodEnd ? periodEnd.toISOString().slice(0,10) : period.periodEnd;
        period.label = label;
        await period.save({ transaction:t });
        await db.AttendanceRecord.destroy({ where:{ periodId: period.id }, transaction:t });
      } else {
        period = await db.AttendancePeriod.create({
          companyId, key: periodKey, label, fileName: req.file.originalname,
          periodStart: periodStart? periodStart.toISOString().slice(0,10): null,
          periodEnd: periodEnd? periodEnd.toISOString().slice(0,10): null,
          uploadedBy: req.user.sub,
        }, { transaction:t });
      }

      // Build records
      const recordsToCreate=[];
      for (const emp of parsed.employees) {
        const eid = employeeMap.get(emp.name.trim().toLowerCase());
        if (!eid) continue;
        for (const rec of emp.records) {
          recordsToCreate.push({
            periodId: period.id,
            companyId,
            employeeId: eid,
            date: rec.date.toISOString().slice(0,10),
            checkIn: rec.checkIn,
            checkOut: rec.checkOut,
            rawTimestamps: rec.rawTimestamps,
            status: rec.status,
            dataStatus: rec.dataStatus,
          });
        }
      }

      if (recordsToCreate.length>0) {
        await db.AttendanceRecord.bulkCreate(recordsToCreate, { transaction:t });
      }

      // R2 upload (outside but before commit? keep inside for atomic, but R2 is external - do after DB but before commit note)
      let fileUrl = null;
      try {
        const key = `attendance/${companyId}/${periodKey}.xlsx`;
        fileUrl = await uploadToR2(req.file.buffer, key, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        if (fileUrl) { period.fileUrl = fileUrl; await period.save({ transaction:t }); }
      } catch (r2e) {
        console.warn('[r2] upload failed', r2e.message);
      }

      const hasWarnings = parsed.warnings.length>0;
      const status = hasWarnings ? 'WARNING' : 'SUCCESS';
      await db.UploadLog.create({
        companyId, fileName: req.file.originalname, fileSize: req.file.size,
        periodKey, periodLabel: label, employeeCount: parsed.employees.length,
        recordCount: recordsToCreate.length, status, note: parsed.warnings.join('; ')||null,
        uploadedBy: req.user.sub,
      }, { transaction:t });

      await t.commit();

      res.json({
        ok:true,
        data:{
          periodKey, label, employeeCount: parsed.employees.length,
          recordCount: recordsToCreate.length, warnings: parsed.warnings, fileUrl,
          period: { id: period.id, key: period.key, label: period.label, periodStart: period.periodStart, periodEnd: period.periodEnd, fileUrl: period.fileUrl },
        },
      });
    } catch(txErr){
      await t.rollback();
      throw txErr;
    }
  } catch(e){ next(e); }
};

exports.listPeriods = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={}; if(companyId) where.companyId=companyId;
    const periods = await db.AttendancePeriod.findAll({ where, order:[['period_start','DESC']], include:[{ model: db.AttendanceRecord, attributes:['id'] }] });
    // Map to history list shape
    const list = periods.map(p=>({ key:p.key, label:p.label, fileName:p.fileName, fileUrl:p.fileUrl, periodStart:p.periodStart, periodEnd:p.periodEnd, recordCount: p.AttendanceRecords?.length||0 }));
    res.json({ ok:true, data:{ periods:list }});
  } catch(e){ next(e); }
};

exports.getPeriod = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={ key:req.params.key }; if(companyId) where.companyId=companyId;
    const period = await db.AttendancePeriod.findOne({ where });
    if(!period) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND', message:'Periode tidak ditemukan'}});
    const records = await db.AttendanceRecord.findAll({ where:{ periodId: period.id }, include:[{ model: db.Employee, attributes:['id','fullName','department']}], order:[['date','ASC'],['employee_id','ASC']] });
    res.json({ ok:true, data:{ period, records }});
  } catch(e){ next(e); }
};

exports.getSummary = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={ key:req.params.key }; if(companyId) where.companyId=companyId;
    const period = await db.AttendancePeriod.findOne({ where });
    if(!period) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    const records = await db.AttendanceRecord.findAll({ where:{ periodId: period.id }});
    const employees = await db.Employee.findAll({ where:{ companyId: period.companyId }});
    let settings=null;
    try{ settings = await db.AppSetting.findOne({ where:{ companyId: period.companyId }});}catch{}
    const summary = generateServerSummary(period, records, employees, settings);
    res.json({ ok:true, data:{ summary, period, recordsCount: records.length }});
  } catch(e){ next(e); }
};

exports.activatePeriod = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const key = req.params.key;
    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if(!setting) setting = await db.AppSetting.create({ companyId, activePeriodKey:key });
    else { setting.activePeriodKey=key; await setting.save(); }
    res.json({ ok:true, data:{ activePeriodKey:key }});
  } catch(e){ next(e); }
};

exports.deletePeriod = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={ key:req.params.key }; if(companyId) where.companyId=companyId;
    const period = await db.AttendancePeriod.findOne({ where });
    if(!period) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    await period.destroy();
    res.json({ ok:true, data:{ message:'Deleted'}});
  } catch(e){ next(e); }
};

exports.listRecords = async (req, res, next) => {
  try {
    const where={};
    if(req.query.companyId||req.user.companyId) where.companyId = req.query.companyId||req.user.companyId;
    if(req.query.periodKey){
      const period = await db.AttendancePeriod.findOne({ where:{ key:req.query.periodKey, companyId: where.companyId }});
      if(period) where.periodId = period.id;
    }
    if(req.query.employeeId) where.employeeId = req.query.employeeId;
    if(req.query.dateFrom||req.query.dateTo){
      where.date={};
      if(req.query.dateFrom) where.date[Op.gte]=req.query.dateFrom;
      if(req.query.dateTo) where.date[Op.lte]=req.query.dateTo;
    }
    const records = await db.AttendanceRecord.findAll({ where, order:[['date','ASC']], limit: Math.min(parseInt(req.query.limit||'100'),500) });
    res.json({ ok:true, data:{ records }});
  } catch(e){ next(e); }
};

exports.periodOptions = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={}; if(companyId) where.companyId=companyId;
    const periods = await db.AttendancePeriod.findAll({ where, order:[['period_start','DESC']], attributes:['key','label','periodStart','periodEnd'] });
    const options = periods.map(p=>({ value:p.key, label:p.label, key:p.key }));
    res.json({ ok:true, data:{ options }});
  } catch(e){ next(e); }
};

exports.createOverride = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.user.companyId || req.headers['x-company-id'];
    const { empName, date, checkIn, checkOut, reason, rawIn, rawOut } = req.body;
    if(!empName||!date) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'empName dan date wajib'}});
    // Find employee
    let employeeId=null;
    const emp = await db.Employee.findOne({ where:{ companyId, fullName: empName }});
    if(emp) employeeId=emp.id;
    const override = await db.ManualAttendanceOverride.upsert({
      companyId, employeeId, empName, date, checkIn, checkOut, rawIn, rawOut, reason, createdBy: req.user.sub,
    });
    // Also update attendance_records if period exists for that date
    const периодs = await db.AttendancePeriod.findAll({ where:{ companyId }});
    for(const p of периодs){
      const rec = await db.AttendanceRecord.findOne({ where:{ periodId:p.id, employeeId, date }});
      if(rec){ rec.checkIn=checkIn; rec.checkOut=checkOut; rec.isManualOverride=true; rec.manualReason=reason; await rec.save(); }
    }
    res.json({ ok:true, data:{ override }});
  } catch(e){ next(e); }
};

exports.deleteOverride = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.body.companyId || req.user.companyId || req.headers['x-company-id'];
    const { empName, date } = req.query.companyId ? req.query : req.body;
    if(!empName||!date) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR'}});
    await db.ManualAttendanceOverride.destroy({ where:{ companyId, empName, date }});
    res.json({ ok:true, data:{ message:'Deleted'}});
  } catch(e){ next(e); }
};

exports.listOverrides = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={}; if(companyId) where.companyId=companyId;
    if(req.query.periodKey){
      // filter by date range of period if needed - simple fallback: return all
    }
    const overrides = await db.ManualAttendanceOverride.findAll({ where, order:[['date','DESC']]});
    res.json({ ok:true, data:{ overrides }});
  } catch(e){ next(e); }
};

exports.listUploadLogs = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={}; if(companyId) where.companyId=companyId;
    const logs = await db.UploadLog.findAll({ where, order:[['created_at','DESC']], limit:100 });
    res.json({ ok:true, data:{ logs }});
  } catch(e){ next(e); }
};

exports.deleteUploadLog = async (req, res, next) => {
  try {
    const log = await db.UploadLog.findByPk(req.params.id);
    if(!log) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    await log.destroy();
    res.json({ ok:true, data:{ message:'Deleted'}});
  } catch(e){ next(e); }
};
