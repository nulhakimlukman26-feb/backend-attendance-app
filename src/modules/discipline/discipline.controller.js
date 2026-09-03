const db = require('../../models');

exports.list = async(req,res,next)=>{ try{ const where={}; if(req.query.companyId||req.user.companyId) where.companyId=req.query.companyId||req.user.companyId; if(req.query.employeeId) where.employeeId=req.query.employeeId; if(req.query.status) where.status=req.query.status; if(req.query.severity) where.severity=req.query.severity; const list=await db.DisciplineRecord.findAll({where, order:[['date','DESC']]}); res.json({ok:true,data:{disciplines:list}});}catch(e){next(e);} };
exports.create = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.user.companyId; if(!req.body.date||!req.body.violationType) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}}); const rec=await db.DisciplineRecord.create({ companyId, ...req.body, createdBy:req.user.sub }); res.status(201).json({ok:true,data:{discipline:rec}});}catch(e){next(e);} };
exports.getOne = async(req,res,next)=>{ try{ const r=await db.DisciplineRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); res.json({ok:true,data:{discipline:r}});}catch(e){next(e);} };
exports.update = async(req,res,next)=>{ try{ const r=await db.DisciplineRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); Object.assign(r, req.body); await r.save(); res.json({ok:true,data:{discipline:r}});}catch(e){next(e);} };
exports.remove = async(req,res,next)=>{ try{ const r=await db.DisciplineRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); await r.destroy(); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);} };
exports.metrics = async(req,res,next)=>{
  try{
    const { employeeId } = req.params;
    const where={ employeeId }; if(req.query.companyId||req.user.companyId) where.companyId=req.query.companyId||req.user.companyId;
    const records=await db.DisciplineRecord.findAll({where});
    const metrics={
      total: records.length,
      bySeverity:{ Ringan:0, Sedang:0, Berat:0 },
      byStatus:{ Aktif:0, Selesai:0, Kedaluwarsa:0 },
      activeCount: records.filter(r=>r.status==='Aktif').length,
    };
    for(const r of records){ metrics.bySeverity[r.severity]=(metrics.bySeverity[r.severity]||0)+1; metrics.byStatus[r.status]=(metrics.byStatus[r.status]||0)+1; }
    res.json({ok:true,data:{metrics, records}});
  }catch(e){next(e);}
};
