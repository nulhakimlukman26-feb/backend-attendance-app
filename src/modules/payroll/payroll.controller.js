const db = require('../../models');

// Simplified payroll calculation - mirrors src/core/payrollEngine.js:29 logic (money finalization kept server)
// For full parity, this should integrate attendanceCalc + settings cardRules.
// Here we provide a working baseline that can be extended stepwise.
function calculateEmployeePayroll({ employee, records, settings, manualAdjustments=[], payrollNote }) {
  const present = records.filter(r=>r.status==='Hadir').length;
  const incomplete = records.filter(r=>r.status==='Data Tidak Lengkap').length;
  const baseSalary = parseFloat(employee.baseSalary)||1755000;
  const dailySalary = parseFloat(employee.dailySalary)||85000;
  const allowance = parseFloat(employee.allowance)||0;
  // Basic: proportional
  const totalDays = records.length || 26;
  const effectiveDays = present + incomplete*0.5;
  const gross = (effectiveDays/totalDays)*baseSalary + allowance;
  const adjustments = manualAdjustments.reduce((s,a)=>s+ (parseFloat(a.amount)||0),0);
  const deductions = 0; // TODO card penalties via settings
  const net = gross + adjustments - deductions;
  return {
    employeeId: employee.id,
    fullName: employee.fullName,
    periodLabel: `${present} hadir / ${totalDays} hari`,
    baseSalary, dailySalary, allowance,
    present, incomplete, totalDays, effectiveDays,
    gross: Math.round(gross),
    adjustments: manualAdjustments,
    deductions,
    net: Math.round(net),
    payrollNote: payrollNote||null,
    breakdown: { present, incomplete, gross, net, baseSalary, allowance },
    calculatedAt: new Date().toISOString(),
  };
}

exports.calculate = async(req,res,next)=>{
  try{
    let { periodKey, employeeId, manualAdjustments, payrollNote } = req.body;
    const companyId = req.body.companyId || req.user.companyId || req.headers['x-company-id'];
    if(!periodKey || !employeeId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'periodKey dan employeeId wajib'}});
    // Normalize DAY_ prefix to month (MonthPicker.jsx:18 fallback, frontend MonthPicker emits MONTH even for DAY)
    if (periodKey) {
      const { parsePrefixedKey } = require('../../utils/periodFilter');
      const parsed = parsePrefixedKey(periodKey);
      if (parsed.type === 'DAY') periodKey = parsed.monthKey;
      if (periodKey && !/^\d{4}-\d{2}$/.test(periodKey)) {
        // For YEAR/WEEK/PRESET we cannot calculate payroll (monthly granularity) — return 400
        if (['YEAR','WEEK','PRESET'].includes(parsed.type)) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message:'Payroll hanya mendukung periode bulanan (YYYY-MM) atau DAY_ prefix yang dinormalisasi' }});
      }
    }
    const employee = await db.Employee.findByPk(employeeId);
    if(!employee) return res.status(404).json({ ok:false, error:{code:'EMPLOYEE_NOT_FOUND'}});
    const period = await db.AttendancePeriod.findOne({ where:{ companyId, key: periodKey }});
    if (!period) return res.status(404).json({ ok:false, error:{ code:'PERIOD_NOT_FOUND', message:`Periode ${periodKey} tidak ditemukan` }});
    const records = await db.AttendanceRecord.findAll({ where:{ periodId: period.id, employeeId }});
    const settings = await db.AppSetting.findOne({ where:{ companyId }});
    const result = calculateEmployeePayroll({ employee, records, settings: settings?.toJSON(), manualAdjustments: manualAdjustments||[], payrollNote });
    res.json({ ok:true, data:{ payroll: result }});
  }catch(e){ next(e); }
};

exports.createSnapshot = async(req,res,next)=>{
  try{
    const { periodKey, employeeId, payload } = req.body;
    const companyId = req.body.companyId || req.user.companyId;
    if(!periodKey||!employeeId||!payload) return res.status(400).json({ok:false, error:{code:'VALIDATION_ERROR'}});
    const [snapshot, created] = await db.PayrollSnapshot.upsert({ companyId, periodKey, employeeId, payload, finalizedBy: req.user.sub });
    res.json({ ok:true, data:{ snapshot, created }});
  }catch(e){ next(e); }
};

exports.listSnapshots = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const where={}; if(companyId) where.companyId=companyId; if(req.query.periodKey) where.periodKey=req.query.periodKey;
    const snapshots=await db.PayrollSnapshot.findAll({ where, order:[['created_at','DESC']]});
    res.json({ ok:true, data:{ snapshots }});
  }catch(e){ next(e); }
};

exports.getSnapshot = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const snap=await db.PayrollSnapshot.findOne({ where:{ companyId, periodKey:req.params.periodKey, employeeId:req.params.employeeId }});
    if(!snap) return res.status(404).json({ok:false, error:{code:'NOT_FOUND'}});
    res.json({ ok:true, data:{ snapshot: snap }});
  }catch(e){ next(e); }
};

exports.archivePayslip = async(req,res,next)=>{
  try{
    const { periodKey, periodLabel, employeeId, fullName, department, jobTitle, payload } = req.body;
    const companyId=req.body.companyId||req.user.companyId;
    if(!periodKey||!employeeId||!payload) return res.status(400).json({ok:false, error:{code:'VALIDATION_ERROR'}});
    const id=`SLIP-${periodKey}-${employeeId}`;
    const [archive, created]= await db.PayslipArchive.upsert({ id, companyId, periodKey, periodLabel, employeeId, fullName, department, jobTitle, payload, archivedAt: new Date() });
    res.json({ok:true, data:{ archive, created }});
  }catch(e){ next(e); }
};

exports.listArchives = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId; const where={}; if(companyId) where.companyId=companyId; if(req.query.periodKey) where.periodKey=req.query.periodKey; if(req.query.employeeId) where.employeeId=req.query.employeeId;
    const archives=await db.PayslipArchive.findAll({ where, order:[['created_at','DESC']]});
    res.json({ok:true,data:{archives}});
  }catch(e){next(e);}
};

exports.deleteArchive = async(req,res,next)=>{
  try{ const a=await db.PayslipArchive.findByPk(req.params.id); if(!a) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); await a.destroy(); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);}
};
