const db = require('../../models');
const { resolvePeriodFilter, applyDateWhere } = require('../../utils/periodFilter');
const { Op } = require('sequelize');

exports.list = async(req,res,next)=>{ 
  try{ 
    const where={}; 
    const companyId = req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    if(companyId) where.companyId=companyId; 
    if(req.query.employeeId) where.employeeId=req.query.employeeId; 
    if(req.query.cardType) where.cardType=req.query.cardType;
    if(req.query.status) where.status=req.query.status; 
    if(req.query.severity) where.severity=req.query.severity; 
    // Unified period filter: discipline.date field is DATEONLY; filter via date range
    // Supports ?periodKey=ALL (unfiltered), ?periodKey=2026-07, DAY_..., YEAR_..., WEEK, PRESET, ?type=DAY&date= etc
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    if (filter.isAll) {
      // explicitly unfiltered - no date constraint
    } else if (!filter.isEmpty) {
      applyDateWhere(where, 'date', filter);
    }
    const list=await db.DisciplineRecord.findAll({where, order:[['date','DESC']]}); 
    res.json({ok:true,data:{disciplines:list, filter: filter.isEmpty? null: filter}});
  }catch(e){next(e);} 
};
exports.create = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.user.companyId||req.headers['x-company-id']; if(!req.body.date||!req.body.violationType) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}}); const rec=await db.DisciplineRecord.create({ companyId, ...req.body, createdBy:req.user.sub }); res.status(201).json({ok:true,data:{discipline:rec}});}catch(e){next(e);} };
exports.getOne = async(req,res,next)=>{ try{ const r=await db.DisciplineRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); res.json({ok:true,data:{discipline:r}});}catch(e){next(e);} };
exports.update = async(req,res,next)=>{ try{ const r=await db.DisciplineRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); Object.assign(r, req.body); await r.save(); res.json({ok:true,data:{discipline:r}});}catch(e){next(e);} };
exports.remove = async(req,res,next)=>{ try{ const r=await db.DisciplineRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); await r.destroy(); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);} };
exports.metrics = async(req,res,next)=>{
  try{
    const { employeeId } = req.params;
    const companyId = req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const where={ employeeId }; if(companyId) where.companyId=companyId;
    const filter = resolvePeriodFilter(req.query, {});
    if (!filter.isInvalid && !filter.isEmpty && !filter.isAll) applyDateWhere(where, 'date', filter);
    const records=await db.DisciplineRecord.findAll({where});
    const metrics={
      total: records.length,
      bySeverity:{ Ringan:0, Sedang:0, Berat:0 },
      byStatus:{ Aktif:0, Selesai:0, Kedaluwarsa:0 },
      activeCount: records.filter(r=>r.status==='Aktif').length,
    };
    for(const r of records){ metrics.bySeverity[r.severity]=(metrics.bySeverity[r.severity]||0)+1; metrics.byStatus[r.status]=(metrics.byStatus[r.status]||0)+1; }
    res.json({ok:true,data:{metrics, records, filter: filter.isEmpty? null: filter}});
  }catch(e){next(e);}
};
