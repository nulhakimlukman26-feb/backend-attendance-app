const db = require('../../models');

exports.getSettings = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId; let s=await db.ThrSetting.findOne({where:{companyId}}); if(!s) s=await db.ThrSetting.create({ companyId, enabled:true, applicableYear: new Date().getFullYear() }); res.json({ok:true,data:{settings:s}});}catch(e){next(e);} };
exports.upsertSettings = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.user.companyId; let s=await db.ThrSetting.findOne({where:{companyId}}); if(!s) s=await db.ThrSetting.create({ companyId, ...req.body }); else { Object.assign(s, req.body); await s.save(); } res.json({ok:true,data:{settings:s}});}catch(e){next(e);} };
exports.resetSettings = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.query.companyId||req.user.companyId; let s=await db.ThrSetting.findOne({where:{companyId}}); if(!s) s=await db.ThrSetting.create({ companyId, enabled:true }); else { await s.destroy(); s=await db.ThrSetting.create({ companyId, enabled:true, applicableYear:new Date().getFullYear()}); } res.json({ok:true,data:{settings:s}});}catch(e){next(e);} };

function calcTHR({ employee, tenureMonths, baseSalary }) {
  // Simplified THR: <12 months proportional, >=12 full (UU 6/2016)
  if (tenureMonths >= 12) return baseSalary;
  return Math.round((tenureMonths/12)*baseSalary);
}

exports.calculate = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const year = parseInt(req.query.year||new Date().getFullYear(),10);
    const employeeId=req.query.employeeId;
    if(!employeeId) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'employeeId wajib'}});
    const emp=await db.Employee.findByPk(employeeId);
    if(!emp) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}});
    const settings=await db.ThrSetting.findOne({where:{companyId}});
    const joinDate=emp.joinDate? new Date(emp.joinDate): new Date();
    const thrDate = settings?.holidayDate ? new Date(settings.holidayDate) : new Date(year, 5, 1); // default June 1
    const tenureMs=thrDate - joinDate;
    const tenureMonths=Math.max(0, Math.floor(tenureMs/(30*24*60*60*1000)));
    const wageBasis = parseFloat(emp.baseSalary)||1755000;
    let multiplier = parseFloat(settings?.companyPolicyMultiplier)||1;
    let thrAmount = calcTHR({ employee:emp, tenureMonths, baseSalary:wageBasis*multiplier });
    const minimum = parseFloat(settings?.companyMinimumTHR)||0;
    if(minimum && thrAmount < minimum) thrAmount = minimum;
    const adj=await db.ThrAdjustment.findOne({where:{companyId, year, employeeId}});
    if(adj) thrAmount += parseFloat(adj.adjustmentAmount)||0;
    const payment=await db.ThrPayment.findOne({where:{companyId, year, employeeId}});
    res.json({ok:true,data:{ thr:{ employeeId, year, tenureMonths, baseAmount: calcTHR({employee:emp, tenureMonths, baseSalary:wageBasis }), finalAmount: thrAmount, adjustment: adj? parseFloat(adj.adjustmentAmount):0, status: payment?.status||'UNPAID', settings }}});
  }catch(e){next(e);}
};

exports.upsertAdjustment = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.user.companyId;
    const { year, employeeId, adjustmentAmount, reason, note }=req.body;
    if(!year||!employeeId||adjustmentAmount===undefined) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}});
    const [adj,created]=await db.ThrAdjustment.upsert({ companyId, year, employeeId, adjustmentAmount, reason, note, modifiedBy:req.user.sub });
    await db.ThrAuditLog.create({ companyId, year, employeeId, type:'MANUAL_ADJUSTMENT', detail:{ adjustmentAmount, reason, note }, modifiedBy:req.user.sub });
    res.json({ok:true,data:{ adjustment: adj, created }});
  }catch(e){next(e);}
};

exports.deleteAdjustment = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const { year, employeeId }=req.params;
    await db.ThrAdjustment.destroy({ where:{ companyId, year, employeeId }});
    await db.ThrAuditLog.create({ companyId, year, employeeId, type:'REMOVE_ADJUSTMENT', detail:{}, modifiedBy:req.user.sub });
    res.json({ok:true,data:{message:'Deleted'}});
  }catch(e){next(e);}
};

exports.listAdjustments = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId; const where={}; if(companyId) where.companyId=companyId; if(req.query.year) where.year=req.query.year; const list=await db.ThrAdjustment.findAll({where}); res.json({ok:true,data:{adjustments:list}});}catch(e){next(e);} };
exports.listPayments = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId; const where={}; if(companyId) where.companyId=companyId; if(req.query.year) where.year=req.query.year; const list=await db.ThrPayment.findAll({where}); res.json({ok:true,data:{payments:list}});}catch(e){next(e);} };
exports.updatePayment = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.user.companyId;
    const { year, employeeId, status, paymentMethod, notes }=req.body;
    if(!year||!employeeId||!status) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}});
    const [pay]=await db.ThrPayment.upsert({ companyId, year, employeeId, status, paymentMethod, notes, updatedBy:req.user.sub, paidAt: status==='PAID'? new Date(): null });
    await db.ThrAuditLog.create({ companyId, year, employeeId, type:'PAYMENT_STATUS_UPDATE', detail:{ status, paymentMethod }, modifiedBy:req.user.sub });
    res.json({ok:true,data:{payment:pay}});
  }catch(e){next(e);}
};
exports.listAuditLogs = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId; const where={}; if(companyId) where.companyId=companyId; if(req.query.year) where.year=req.query.year; if(req.query.employeeId) where.employeeId=req.query.employeeId; const logs=await db.ThrAuditLog.findAll({where, order:[['created_at','DESC']]}); res.json({ok:true,data:{logs}});}catch(e){next(e);} };
