const db = require('../../models');
const { Op } = require('sequelize');
const { resolvePeriodFilter, applyDateWhere } = require('../../utils/periodFilter');

function buildPeriodWhere(companyId, filter) {
  // Returns { where, period, filter } where where is for AttendanceRecord
  // For MONTH/DAY we resolve to periodId; for WEEK/YEAR/PRESET we use date range directly
}

exports.overview = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    // Department filter (Dashboard.jsx now sends selectedDepartment outside overview guard)
    const department = req.query.department || req.query.dept;
    let period=null;
    const where={ companyId };
    let filterMeta = filter.isEmpty ? null : filter;
    if (!filter.isEmpty && !filter.isAll) {
      if (filter.type === 'MONTH') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${filter.monthKey} tidak ditemukan`}});
        where.periodId = period.id;
      } else if (filter.type === 'DAY') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${filter.monthKey} tidak ditemukan`}});
        where.periodId = period.id;
        where.date = filter.date;
      } else if (['WEEK','YEAR','PRESET'].includes(filter.type)) {
        applyDateWhere(where, 'date', filter);
        // Optionally find a representative period for label
        if (where.date) {
          // try to find overlapping period for UI label fallback
          const rec = await db.AttendanceRecord.findOne({ where, attributes:['periodId'] });
          if (rec?.periodId) period = await db.AttendancePeriod.findByPk(rec.periodId);
        }
      }
    } else if (filter.isAll) {
      // no period filtering
    } else {
      // Legacy fallback: if filter empty but periodKey supplied as simple YYYY-MM? already handled above via resolve
      // If no filter at all, leave where as company only (all periods)
    }
    // Apply department filter if provided — honour even in individual mode
    if (department) {
      const emps = await db.Employee.findAll({ where:{ companyId, department }, attributes:['id'] });
      const ids = emps.map(e=>e.id);
      if (ids.length===0) {
        return res.json({ok:true,data:{ overview:{ totalEmployees:0, totalRecords:0, hadir:0, tidakHadir:0, tidakLengkap:0, totalPeriods: await db.AttendancePeriod.count({ where:{ companyId }}), periodKey: filter.periodKey||null, periodLabel: period?.label||null, department, filter: filterMeta }}});
      }
      where.employeeId = { [Op.in]: ids };
    }
    // Total employees should respect department if filtered
    const totalEmployeesWhere = { companyId };
    if (department) totalEmployeesWhere.department = department;
    const totalEmployees=await db.Employee.count({ where: totalEmployeesWhere });
    const totalRecords=await db.AttendanceRecord.count({ where });
    const hadir=await db.AttendanceRecord.count({ where:{ ...where, status:'Hadir' }});
    const tidakHadir=await db.AttendanceRecord.count({ where:{ ...where, status:'Tidak Hadir' }});
    const tidakLengkap=await db.AttendanceRecord.count({ where:{ ...where, status:'Data Tidak Lengkap' }});
    const totalPeriods=await db.AttendancePeriod.count({ where:{ companyId }});
    // Resolve periodKey/Label for response
    let responsePeriodKey = filter.periodKey || filter.key || req.query.periodKey || null;
    if (filter.isAll) responsePeriodKey = 'ALL';
    else if (!responsePeriodKey && period) responsePeriodKey = period.key;
    res.json({ok:true,data:{ overview:{ totalEmployees, totalRecords, hadir, tidakHadir, tidakLengkap, totalPeriods, periodKey: responsePeriodKey, periodLabel: period?.label||filter.label||null, department: department||null, filter: filterMeta }}});
  }catch(e){next(e);}
};

exports.byDepartment = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    let period=null;
    const where={ companyId };
    if (!filter.isEmpty && !filter.isAll) {
      if (filter.type === 'MONTH') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${filter.monthKey} tidak ditemukan`}});
        where.periodId=period.id;
      } else if (filter.type === 'DAY') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND'}});
        where.periodId=period.id; where.date=filter.date;
      } else if (['WEEK','YEAR','PRESET'].includes(filter.type)) {
        applyDateWhere(where, 'date', filter);
      }
    }
    // If specific department queried, we could filter but endpoint aggregates all departments by default
    // Still support ?department= to narrow aggregation (consistent with overview)
    const deptFilter = req.query.department;
    const employees=await db.Employee.findAll({ where: deptFilter ? { companyId, department: deptFilter } : { companyId }, attributes:['id','department'] });
    const deptMap={};
    for(const e of employees) deptMap[e.id]=e.department||'Unknown';
    const records=await db.AttendanceRecord.findAll({where});
    const agg={};
    for(const r of records){
      const dept=deptMap[r.employeeId]; if(!dept) continue; // filtered out by dept
      if(!agg[dept]) agg[dept]={ department:dept, total:0, hadir:0, tidakHadir:0, tidakLengkap:0 };
      agg[dept].total++;
      if(r.status==='Hadir') agg[dept].hadir++;
      else if(r.status==='Tidak Hadir') agg[dept].tidakHadir++;
      else agg[dept].tidakLengkap++;
    }
    res.json({ok:true,data:{ byDepartment: Object.values(agg), filter: filter.isEmpty? null: filter, period }});
  }catch(e){next(e);}
};

exports.byEmployee = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const employeeId=req.params.id;
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    const where={ companyId, employeeId };
    let period=null;
    if (!filter.isEmpty && !filter.isAll) {
      if (filter.type === 'MONTH') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND', message:`Periode ${filter.monthKey} tidak ditemukan`}});
        where.periodId=period.id;
      } else if (filter.type === 'DAY') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND'}});
        where.periodId=period.id; where.date=filter.date;
      } else if (['WEEK','YEAR','PRESET'].includes(filter.type)) {
        applyDateWhere(where, 'date', filter);
      }
    }
    // Department filter honour even in individual mode (Dashboard.jsx)
    if (req.query.department) {
      const emp = await db.Employee.findOne({ where:{ id: employeeId, companyId }});
      if (emp && emp.department !== req.query.department) {
        return res.json({ok:true,data:{ employeeId, periodKey: filter.periodKey||req.query.periodKey||null, filter: filter.isEmpty?null:filter, stats:{ total:0, hadir:0, tidakHadir:0, tidakLengkap:0 }, records:[] }});
      }
    }
    const records=await db.AttendanceRecord.findAll({where, order:[['date','ASC']]});
    const stats={ total: records.length, hadir: records.filter(r=>r.status==='Hadir').length, tidakHadir: records.filter(r=>r.status==='Tidak Hadir').length, tidakLengkap: records.filter(r=>r.status==='Data Tidak Lengkap').length };
    res.json({ok:true,data:{ employeeId, periodKey: filter.periodKey||req.query.periodKey||period?.key||null, filter: filter.isEmpty?null:filter, stats, records, period }});
  }catch(e){next(e);}
};

exports.calendar = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    const where={ companyId };
    let period=null;
    if (!filter.isEmpty && !filter.isAll) {
      if (filter.type === 'MONTH') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND'}});
        where.periodId=period.id;
      } else if (filter.type === 'DAY') {
        period = await db.AttendancePeriod.findOne({where:{ companyId, key: filter.monthKey }});
        if(!period) return res.status(404).json({ ok:false, error:{code:'PERIOD_NOT_FOUND'}});
        where.periodId=period.id; where.date=filter.date;
      } else {
        applyDateWhere(where, 'date', filter);
      }
    }
    if (req.query.department) {
      const emps = await db.Employee.findAll({ where:{ companyId, department: req.query.department }, attributes:['id'] });
      const ids = emps.map(e=>e.id);
      if (ids.length===0) return res.json({ok:true,data:{ calendar: [], period, filter: filter.isEmpty?null:filter }});
      where.employeeId = { [Op.in]: ids };
    }
    const records=await db.AttendanceRecord.findAll({where, include:[{model:db.Employee, attributes:['fullName']}]});
    // Group by date
    const byDate={};
    for(const r of records){
      const d=r.date;
      if(!byDate[d]) byDate[d]={ date:d, hadir:0, tidakHadir:0, tidakLengkap:0 };
      if(r.status==='Hadir') byDate[d].hadir++;
      else if(r.status==='Tidak Hadir') byDate[d].tidakHadir++;
      else byDate[d].tidakLengkap++;
    }
    res.json({ok:true,data:{ calendar: Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date)), period, filter: filter.isEmpty?null:filter }});
  }catch(e){next(e);}
};
