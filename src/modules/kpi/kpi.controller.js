const db = require('../../models');
const { Op } = require('sequelize');

exports.listMasters = async(req,res,next)=>{
  try{
    const where={};
    if(req.query.department) where.department=req.query.department;
    if(req.query.jobTitle) where.jobTitle=req.query.jobTitle;
    const masters=await db.KpiMaster.findAll({where, order:[['name','ASC']]});
    res.json({ok:true,data:{masters}});
  }catch(e){next(e);}
};
exports.createMaster = async(req,res,next)=>{ try{ const id=req.body.id||`KPI-${Date.now()}`; const m=await db.KpiMaster.create({ id, ...req.body }); res.status(201).json({ok:true,data:{master:m}});}catch(e){next(e);} };
exports.updateMaster = async(req,res,next)=>{ try{ const m=await db.KpiMaster.findByPk(req.params.id); if(!m) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); Object.assign(m, req.body); await m.save(); res.json({ok:true,data:{master:m}});}catch(e){next(e);} };
exports.deleteMaster = async(req,res,next)=>{ try{ const m=await db.KpiMaster.findByPk(req.params.id); if(!m) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); await m.destroy(); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);} };

exports.getConfig = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId; let cfg=await db.KpiConfig.findOne({where:{companyId}}); if(!cfg) cfg=await db.KpiConfig.create({ companyId }); res.json({ok:true,data:{config:cfg}});}catch(e){next(e);} };
exports.upsertConfig = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.user.companyId; let cfg=await db.KpiConfig.findOne({where:{companyId}}); if(!cfg) cfg=await db.KpiConfig.create({ companyId, ...req.body }); else { Object.assign(cfg, req.body); await cfg.save(); } res.json({ok:true,data:{config:cfg}});}catch(e){next(e);} };

exports.listScores = async(req,res,next)=>{ try{ const where={}; if(req.query.companyId||req.user.companyId) where.companyId=req.query.companyId||req.user.companyId; if(req.query.employeeId) where.employeeId=req.query.employeeId; if(req.query.periodKey) where.periodKey=req.query.periodKey; const scores=await db.KpiScore.findAll({where, order:[['period_key','DESC']]}); res.json({ok:true,data:{scores}});}catch(e){next(e);} };
exports.upsertScore = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.user.companyId; const { employeeId, periodKey, kpiId, actualValue, scorePoin }=req.body; if(!employeeId||!periodKey||!kpiId) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}}); const [score]=await db.KpiScore.upsert({ companyId, employeeId, periodKey, kpiId, actualValue, scorePoin, isCustom:false }); res.json({ok:true,data:{score}});}catch(e){next(e);} };
exports.batchUpsert = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.user.companyId;
    const { scores }=req.body; // array
    if(!Array.isArray(scores)) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}});
    const upserted=[];
    for(const s of scores){
      const [row]=await db.KpiScore.upsert({ companyId, employeeId:s.employeeId, periodKey:s.periodKey, kpiId:s.kpiId, actualValue:s.actualValue, scorePoin:s.scorePoin, isCustom: !!s.isCustom, customMeta:s.customMeta||null });
      upserted.push(row);
    }
    res.json({ok:true,data:{scores:upserted}});
  }catch(e){next(e);}
};
exports.createCustom = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.user.companyId; const { employeeId, periodKey, kpiId, actualValue, scorePoin, customMeta }=req.body; const [score]=await db.KpiScore.upsert({ companyId, employeeId, periodKey, kpiId, actualValue, scorePoin, isCustom:true, customMeta }); res.json({ok:true,data:{score}});}catch(e){next(e);} };
exports.deleteScore = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId; await db.KpiScore.destroy({ where:{ companyId, employeeId:req.params.employeeId, periodKey:req.params.periodKey, kpiId:req.params.kpiId } }); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);} };

exports.evaluate = async(req,res,next)=>{
  try{
    const { employeeId, periodKey }=req.body;
    const companyId=req.body.companyId||req.user.companyId;
    const scores=await db.KpiScore.findAll({ where:{ companyId, employeeId, periodKey }});
    if(scores.length===0) return res.status(404).json({ok:false,error:{code:'NO_SCORES'}});
    // Weighted average if masters have weights, else simple avg
    let totalWeight=0, weightedSum=0;
    for(const s of scores){
      const master=await db.KpiMaster.findByPk(s.kpiId);
      const w = master?.weight||1;
      totalWeight+=w; weightedSum+= (parseFloat(s.scorePoin)||0)*w;
    }
    const overall = totalWeight? weightedSum/totalWeight : 0;
    const cfg=await db.KpiConfig.findOne({where:{companyId}});
    const veryGoodMin=cfg?.veryGoodMin||90, goodMin=cfg?.goodMin||80, fairMin=cfg?.fairMin||70;
    let grade='poor'; if(overall>=veryGoodMin) grade='veryGood'; else if(overall>=goodMin) grade='good'; else if(overall>=fairMin) grade='fair';
    res.json({ok:true,data:{ employeeId, periodKey, overallScore: overall, grade, scoresCount: scores.length }});
  }catch(e){next(e);}
};

exports.assignList = async(req,res,next)=>{
  // Placeholder: store assigned KPI list as custom KpiScores with isCustom and meta
  try{ res.json({ok:true, data:{ message:'Assign not yet implemented - use /scores/batch', assigned: req.body }});}catch(e){next(e);}
};
