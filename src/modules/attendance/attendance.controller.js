const db = require('../../models');
const { parseAttendanceFile } = require('../../utils/attendanceParser');
const { uploadToR2 } = require('../../utils/r2Upload');
const { Op } = require('sequelize');
const {
  resolvePeriodFilter,
  parsePrefixedKey,
  applyDateWhere,
  endOfMonth,
} = require('../../utils/periodFilter');

// Helper: generate summary similar to src/core/summaryGen.js (simplified server truth)
// For now we compute basic aggregates; detailed calc can be expanded later.
function generateServerSummary(period, records, employees, settings, filterMeta) {
  const { calcDay, zeroTotals, addTotals, settingsOrDefaults } = require('../../utils/attendanceCalc');
  const totalRecords = records.length;
  const byStatus = records.reduce((acc,r)=>{ acc[r.status]=(acc[r.status]||0)+1; return acc;},{});
  const rateByEmployee = {};
  for (const e of employees || []) {
    const plain = e && typeof e.toJSON === 'function' ? e.toJSON() : e;
    if (plain && plain.id !== undefined) rateByEmployee[plain.id] = plain.overtimeRate;
  }
  const byEmployee = {};
  let totals = zeroTotals();
  for (const r of records) {
    if (!byEmployee[r.employeeId]) byEmployee[r.employeeId] = { employeeId:r.employeeId, hadir:0, tidakHadir:0, tidakLengkap:0, ...zeroTotals() };
    if (r.status==='Hadir') byEmployee[r.employeeId].hadir++;
    else if (r.status==='Data Tidak Lengkap') byEmployee[r.employeeId].tidakLengkap++;
    else byEmployee[r.employeeId].tidakHadir++;
    const day = calcDay({ checkIn: r.checkIn, checkOut: r.checkOut }, settings, { overtimeRate: rateByEmployee[r.employeeId] });
    byEmployee[r.employeeId] = { ...byEmployee[r.employeeId], ...addTotals(byEmployee[r.employeeId], day) };
    totals = addTotals(totals, day);
  }
  const cfg = settingsOrDefaults(settings);
  return {
    periodKey: period ? period.key : (filterMeta?.key || filterMeta?.periodKey || null),
    label: period ? period.label : (filterMeta?.label || null),
    filter: filterMeta || null,
    totalEmployees: employees.length,
    totalRecords,
    statusBreakdown: byStatus,
    byEmployee: Object.values(byEmployee),
    lateOvertime: totals,
    thresholds: {
      normalStart: cfg.normalStart,
      overtimeStart: cfg.overtimeStart,
      latePenaltyPerMinute: cfg.latePenaltyPerMinute,
      latePenaltyMaxMinutes: cfg.latePenaltyMaxMinutes,
      maxOvertimeMinutes: cfg.maxOvertimeMinutes,
      overtimeRatePerHour: cfg.overtimeRatePerHour,
    },
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
    // Map to history list shape — deduped and sorted descending (supports MonthPicker.jsx dedupe fallback)
    const seen = new Set();
    const list = [];
    for (const p of periods) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      list.push({ key:p.key, label:p.label, fileName:p.fileName, fileUrl:p.fileUrl, periodStart:p.periodStart, periodEnd:p.periodEnd, recordCount: p.AttendanceRecords?.length||0 });
    }
    res.json({ ok:true, data:{ periods:list }});
  } catch(e){ next(e); }
};

exports.getPeriod = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    // Support prefixed keys: DAY_2026-07-15 etc should resolve to underlying month period for detail view
    // Apply same resolution as PeriodPicker -> MonthPicker normalisation
    const rawKey = req.params.key;
    const parsedKey = parsePrefixedKey(rawKey);
    let lookupKey = rawKey;
    let filterDate = null;
    if (parsedKey.type === 'DAY') {
      lookupKey = parsedKey.monthKey;
      filterDate = parsedKey.date;
    } else if (parsedKey.type === 'YEAR' || parsedKey.type === 'PRESET' || parsedKey.type === 'WEEK') {
      // For year/preset/week there is no single month period; return aggregated via query filtering instead
      // Fall through to filtered records path below
      lookupKey = null;
    }
    if (lookupKey) {
      const where={ key:lookupKey }; if(companyId) where.companyId=companyId;
      const period = await db.AttendancePeriod.findOne({ where });
      if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${rawKey} tidak ditemukan`}});
      let recordsWhere = { periodId: period.id };
      if (filterDate) recordsWhere.date = filterDate;
      // Also support additional query filters (startDate/endDate etc) if provided
      const filter = resolvePeriodFilter(req.query, {});
      if (!filter.isEmpty && !filter.isAll && !filter.isInvalid && filter.dateFrom) {
        // If filter has date range overlapping this period, narrow recordsWhere
        if (filter.dateFrom === filter.dateTo) recordsWhere.date = filter.dateFrom;
        else recordsWhere.date = { [Op.gte]: filter.dateFrom, [Op.lte]: filter.dateTo };
      }
      const records = await db.AttendanceRecord.findAll({ where: recordsWhere, include:[{ model: db.Employee, attributes:['id','fullName','department']}], order:[['date','ASC'],['employee_id','ASC']] });
      res.json({ ok:true, data:{ period, records, filter: filterDate ? { type:'DAY', date: filterDate, key: rawKey } : null }});
      return;
    }
    // Non-month keys: filter records directly by date range across all periods
    const filter = resolvePeriodFilter({ periodKey: rawKey, ...req.query }, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    const where={ companyId };
    applyDateWhere(where, 'date', filter);
    // Try to include period info if possible: find periods overlapping range
    const records = await db.AttendanceRecord.findAll({ where, include:[{ model: db.Employee, attributes:['id','fullName','department']}], order:[['date','ASC']], limit: Math.min(parseInt(req.query.limit||'200'), 1000) });
    // Find representative period if WEEK/YEAR etc: latest period overlapping
    let period = null;
    if (records.length>0) {
      period = await db.AttendancePeriod.findOne({ where:{ id: records[0].periodId }});
    }
    res.json({ ok:true, data:{ period, records, filter }});
  } catch(e){ next(e); }
};

exports.getSummary = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    // Unified filter: route :key + query params (type, date, startDate, endDate, year, preset, periodKey etc)
    // Frontend may call GET /attendance/periods/:key/summary?filter=... or via applyPeriodFilter cfg as query
    const filter = resolvePeriodFilter(req.query, req.params);
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message, details: filter.error.errors }});
    if (filter.isAll) {
      // Unfiltered summary across all periods for company
      const records = await db.AttendanceRecord.findAll({ where:{ companyId }});
      const employees = await db.Employee.findAll({ where:{ companyId }});
      let settings=null; try{ settings = await db.AppSetting.findOne({ where:{ companyId }});}catch{}
      const summary = generateServerSummary({ key:'ALL', label:'Semua Periode' }, records, employees, settings, filter);
      return res.json({ ok:true, data:{ summary, period: null, recordsCount: records.length, filter }});
    }
    // If filter empty and no route key, fallback to activePeriodKey or latest period
    let effectiveFilter = filter;
    if (filter.isEmpty && !req.params.key) {
      // No filter provided — try activePeriodKey
      let setting=null; try{ setting = await db.AppSetting.findOne({ where:{ companyId }});}catch{}
      if (setting?.activePeriodKey) {
        effectiveFilter = resolvePeriodFilter({ periodKey: setting.activePeriodKey }, {});
      }
    }
    // Handle each type
    if (effectiveFilter.isEmpty) {
      // Still empty — fallback to original behaviour: try route key as period lookup
      const where={ key:req.params.key }; if(companyId) where.companyId=companyId;
      const period = await db.AttendancePeriod.findOne({ where });
      if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${req.params.key} tidak ditemukan`}});
      const records = await db.AttendanceRecord.findAll({ where:{ periodId: period.id }});
      const employees = await db.Employee.findAll({ where:{ companyId: period.companyId }});
      let settings=null; try{ settings = await db.AppSetting.findOne({ where:{ companyId: period.companyId }});}catch{}
      const summary = generateServerSummary(period, records, employees, settings, effectiveFilter);
      return res.json({ ok:true, data:{ summary, period, recordsCount: records.length, filter: effectiveFilter }});
    }

    // Now effectiveFilter has type
    const f = effectiveFilter;
    if (f.type === 'MONTH') {
      const period = await db.AttendancePeriod.findOne({ where:{ companyId, key: f.monthKey }});
      if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${f.monthKey} tidak ditemukan`}});
      const records = await db.AttendanceRecord.findAll({ where:{ periodId: period.id }});
      const employees = await db.Employee.findAll({ where:{ companyId }});
      let settings=null; try{ settings = await db.AppSetting.findOne({ where:{ companyId }});}catch{}
      const summary = generateServerSummary(period, records, employees, settings, f);
      return res.json({ ok:true, data:{ summary, period, recordsCount: records.length, filter: f }});
    }
    if (f.type === 'DAY') {
      const monthKey = f.monthKey;
      const period = await db.AttendancePeriod.findOne({ where:{ companyId, key: monthKey }});
      if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${monthKey} tidak ditemukan`}});
      const records = await db.AttendanceRecord.findAll({ where:{ periodId: period.id, date: f.date }});
      const employees = await db.Employee.findAll({ where:{ companyId }});
      let settings=null; try{ settings = await db.AppSetting.findOne({ where:{ companyId }});}catch{}
      const summary = generateServerSummary(period, records, employees, settings, f);
      // Override periodKey/label to reflect day
      summary.periodKey = f.key;
      summary.label = f.label;
      summary.date = f.date;
      return res.json({ ok:true, data:{ summary, period, recordsCount: records.length, filter: f }});
    }
    if (f.type === 'WEEK' || f.type === 'PRESET') {
      // Cross-period range: query records by date range across all company's periods
      const where={ companyId }; applyDateWhere(where, 'date', f);
      const records = await db.AttendanceRecord.findAll({ where, order:[['date','ASC']] });
      const employees = await db.Employee.findAll({ where:{ companyId }});
      let settings=null; try{ settings = await db.AppSetting.findOne({ where:{ companyId }});}catch{}
      // Find representative period if possible (first overlapping)
      let period=null;
      if (records.length>0) period = await db.AttendancePeriod.findOne({ where:{ id: records[0].periodId }});
      // If no records but we still have a date range, still return empty summary (200) but with filter
      const summary = generateServerSummary(period || { key: f.key, label: f.label }, records, employees, settings, f);
      summary.periodKey = f.key;
      summary.label = f.label;
      summary.dateFrom = f.dateFrom;
      summary.dateTo = f.dateTo;
      return res.json({ ok:true, data:{ summary, period, recordsCount: records.length, filter: f }});
    }
    if (f.type === 'YEAR') {
      const where={ companyId }; applyDateWhere(where, 'date', f);
      const records = await db.AttendanceRecord.findAll({ where });
      const employees = await db.Employee.findAll({ where:{ companyId }});
      let settings=null; try{ settings = await db.AppSetting.findOne({ where:{ companyId }});}catch{}
      let period=null; // no single month
      const summary = generateServerSummary({ key: f.key, label: f.label }, records, employees, settings, f);
      summary.periodKey = f.key;
      summary.label = f.label;
      summary.year = f.year;
      return res.json({ ok:true, data:{ summary, period, recordsCount: records.length, filter: f }});
    }
    // Fallback
    return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Filter tidak didukung'}});
  } catch(e){ next(e); }
};

exports.activatePeriod = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const rawKey = req.params.key;
    // Validate key length and prefix support (VARCHAR 32)
    if (!rawKey || rawKey.length > 32) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Key periode terlalu panjang (max 32)'}});
    // Allow MONTH, DAY_, YEAR_, PRESET_, WEEK_ or unknown- prefix fallback
    const parsed = parsePrefixedKey(rawKey);
    // Still allow unknown fallback keys like unknown-timestamp; just store as-is
    let setting = await db.AppSetting.findOne({ where:{ companyId }});
    if(!setting) setting = await db.AppSetting.create({ companyId, activePeriodKey:rawKey });
    else { setting.activePeriodKey=rawKey; await setting.save(); }
    res.json({ ok:true, data:{ activePeriodKey:rawKey, parsed }});
  } catch(e){ next(e); }
};

exports.deletePeriod = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    // Support prefixed delete: if DAY_ etc, resolve to month
    const rawKey = req.params.key;
    const parsed = parsePrefixedKey(rawKey);
    let lookupKey = rawKey;
    if (parsed.type === 'DAY') lookupKey = parsed.monthKey;
    else if (parsed.type === 'YEAR' || parsed.type === 'PRESET' || parsed.type === 'WEEK') {
      // For non-month keys, delete all periods overlapping range? Instead treat as no-op for now
      return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Gunakan key YYYY-MM untuk hapus periode'}});
    }
    const where={ key:lookupKey }; if(companyId) where.companyId=companyId;
    const period = await db.AttendancePeriod.findOne({ where });
    if(!period) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    await period.destroy();
    res.json({ ok:true, data:{ message:'Deleted'}});
  } catch(e){ next(e); }
};

exports.listRecords = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    // Unified period filter resolution (supports periodKey, type+date, type+startDate/endDate, preset, year, dateFrom/dateTo)
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    const where={};
    if(companyId) where.companyId=companyId;
    if (filter.isAll) {
      // No date filtering
    } else if (!filter.isEmpty) {
      if (filter.type === 'MONTH') {
        const period = await db.AttendancePeriod.findOne({ where:{ key: filter.monthKey, companyId }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${filter.monthKey} tidak ditemukan`}});
        where.periodId = period.id;
      } else if (filter.type === 'DAY') {
        // If legacy ?periodKey=DAY_... plus employeeId etc, try to find period but also filter by date
        const period = await db.AttendancePeriod.findOne({ where:{ key: filter.monthKey, companyId }});
        if(period) where.periodId = period.id;
        else {
          // No period found but we still can filter by date directly
          // Return 404 to match KPI behaviour for consistent UX
          return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${filter.monthKey} tidak ditemukan`}});
        }
        where.date = filter.date;
      } else if (filter.type === 'YEAR' || filter.type === 'WEEK' || filter.type === 'PRESET') {
        applyDateWhere(where, 'date', filter);
        // Optionally also constrain by overlapping periods if needed (skip for simplicity)
      }
    } else {
      // Legacy fallback: no unified filter, use old query keys directly
      if(req.query.periodKey){
        // Old behaviour handled above, but if isEmpty we still check legacy periodKey without prefix parsing
        // This path already covered by resolvePeriodFilter, so noop
      }
      if(req.query.dateFrom||req.query.dateTo){
        where.date={};
        if(req.query.dateFrom) where.date[Op.gte]=req.query.dateFrom;
        if(req.query.dateTo) where.date[Op.lte]=req.query.dateTo;
      }
    }
    // Additional legacy fields
    if(req.query.employeeId) where.employeeId = req.query.employeeId;
    // Support department filter via employee join if needed — for payroll/generic we keep simple
    // Support explicit ?department= filter: filter records by employee department
    if(req.query.department){
      // Find employees in that department
      const emps = await db.Employee.findAll({ where:{ companyId, department: req.query.department }, attributes:['id'] });
      const ids = emps.map(e=>e.id);
      if(ids.length===0) return res.json({ ok:true, data:{ records: [], filter }});
      where.employeeId = where.employeeId ? where.employeeId : { [Op.in]: ids };
      if (where.employeeId && typeof where.employeeId === 'string') {
        // if already set to specific employee + department mismatch, handle intersection
        if(!ids.includes(where.employeeId)) return res.json({ ok:true, data:{ records: [], filter }});
      }
      if (where.employeeId && where.employeeId[Op.in]) {
        // already set
      }
    }
    // Legacy dateFrom/dateTo already handled via applyDateWhere; but ensure direct query overrides
    if (!where.date && (req.query.dateFrom||req.query.dateTo)) {
      where.date={};
      if(req.query.dateFrom) where.date[Op.gte]=req.query.dateFrom;
      if(req.query.dateTo) where.date[Op.lte]=req.query.dateTo;
    }
    const limit = Math.min(parseInt(req.query.limit||'100'),500);
    const offset = parseInt(req.query.offset||'0',10) || 0;
    const { count, rows } = await db.AttendanceRecord.findAndCountAll({ where, order:[['date','ASC']], limit, offset });
    res.json({ ok:true, data:{ records: rows, total: count, limit, offset, filter: filter.isEmpty ? null : filter }});
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
    const filter = resolvePeriodFilter(req.query, {});
    if (!filter.isEmpty && !filter.isAll && !filter.isInvalid) {
      applyDateWhere(where, 'date', filter);
    }
    const overrides = await db.ManualAttendanceOverride.findAll({ where, order:[['date','DESC']]});
    res.json({ ok:true, data:{ overrides, filter: filter.isEmpty ? null : filter }});
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
