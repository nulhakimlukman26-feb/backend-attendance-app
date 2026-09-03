const db = require('../../models');
const { Op } = require('sequelize');
const { resolvePeriodFilter, parsePrefixedKey } = require('../../utils/periodFilter');

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

exports.getConfig = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id']; let cfg=await db.KpiConfig.findOne({where:{companyId}}); if(!cfg) cfg=await db.KpiConfig.create({ companyId }); res.json({ok:true,data:{config:cfg}});}catch(e){next(e);} };
exports.upsertConfig = async(req,res,next)=>{ try{ const companyId=req.body.companyId||req.user.companyId||req.headers['x-company-id']; let cfg=await db.KpiConfig.findOne({where:{companyId}}); if(!cfg) cfg=await db.KpiConfig.create({ companyId, ...req.body }); else { Object.assign(cfg, req.body); await cfg.save(); } res.json({ok:true,data:{config:cfg}});}catch(e){next(e);} };

exports.listScores = async(req,res,next)=>{
  try{
    const companyId = req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const where={}; if(companyId) where.companyId=companyId;
    if(req.query.employeeId) where.employeeId=req.query.employeeId;
    // Unified period filtering: supports ?periodKey=YYYY-MM, DAY_*, YEAR_*, WEEK, PRESET, ?type=DAY&date= etc
    // Also respects ?periodKey=ALL => unfiltered (frontend sends txPeriodFilter ALL)
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    if (filter.isAll) {
      // No period filter, return all
    } else if (!filter.isEmpty) {
      if (filter.type === 'MONTH') {
        // Validate period exists, return 404 PERIOD_NOT_FOUND if missing (frontend handles empty via month-picker--empty)
        const exists = await db.AttendancePeriod.findOne({ where:{ companyId, key: filter.monthKey }});
        if(!exists) return res.status(404).json({ ok:false, error:{ code:'PERIOD_NOT_FOUND', message:`Periode ${filter.monthKey} tidak ditemukan` }});
        where.periodKey = filter.monthKey;
      } else if (filter.type === 'DAY') {
        const monthKey = filter.monthKey;
        const exists = await db.AttendancePeriod.findOne({ where:{ companyId, key: monthKey }});
        if(!exists) return res.status(404).json({ ok:false, error:{ code:'PERIOD_NOT_FOUND', message:`Periode ${monthKey} tidak ditemukan` }});
        where.periodKey = monthKey; // KPI scores are monthly granularity, map DAY -> month
      } else if (filter.type === 'YEAR') {
        // Year queries KPI scores where periodKey LIKE year-%
        where.periodKey = { [Op.like]: `${filter.year}-%` };
      } else if (['WEEK','PRESET'].includes(filter.type)) {
        // Week/Preset have no single periodKey: expand to date range then map to month keys overlapping range
        // Simplest: find months overlapping range via periodStart/periodEnd or derive month keys
        // For now, fetch all scores where periodKey between month of start and month of end
        const startMonth = filter.dateFrom?.slice(0,7);
        const endMonth = filter.dateTo?.slice(0,7);
        if (startMonth && endMonth) {
          if (startMonth === endMonth) where.periodKey = startMonth;
          else where.periodKey = { [Op.between]: [startMonth, endMonth] };
        }
      }
    } else if(req.query.periodKey) {
      // Fallback legacy (should already be handled by resolve but keep for safety if filter empty)
      if(req.query.periodKey !== 'ALL') where.periodKey=req.query.periodKey;
    }
    const scores=await db.KpiScore.findAll({where, order:[['period_key','DESC']]});
    res.json({ok:true,data:{scores, filter: filter.isEmpty? null: filter}});
  }catch(e){next(e);}
};
exports.upsertScore = async(req,res,next)=>{ 
  try{ 
    const companyId=req.body.companyId||req.user.companyId||req.headers['x-company-id']; 
    const { employeeId, periodKey, kpiId, actualValue, scorePoin }=req.body; 
    // Normalize periodKey if DAY_ prefix supplied (MonthPicker.jsx:18)
    let normalizedKey = periodKey;
    if (periodKey) {
      const parsed = parsePrefixedKey(periodKey);
      if (parsed.type === 'DAY') normalizedKey = parsed.monthKey;
      else if (parsed.type === 'YEAR') {
        return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'Use YYYY-MM for KPI scores, not year prefix'}});
      }
      if (normalizedKey && !/^\d{4}-\d{2}$/.test(normalizedKey)) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'periodKey must be YYYY-MM'}});
    }
    if(!employeeId||!normalizedKey||!kpiId) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'employeeId, periodKey (YYYY-MM) dan kpiId wajib'}}); 
    // Validate period exists
    const periodExists = await db.AttendancePeriod.findOne({ where:{ companyId, key: normalizedKey }});
    if(!periodExists) return res.status(404).json({ok:false,error:{code:'PERIOD_NOT_FOUND', message:`Periode ${normalizedKey} tidak ditemukan`}});
    const [score]=await db.KpiScore.upsert({ companyId, employeeId, periodKey: normalizedKey, kpiId, actualValue, scorePoin, isCustom:false }); 
    res.json({ok:true,data:{score}});
  }catch(e){next(e);} 
};
exports.batchUpsert = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.user.companyId||req.headers['x-company-id'];
    const { scores }=req.body; // array
    if(!Array.isArray(scores)) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}});
    const upserted=[];
    for(const s of scores){
      let nk = s.periodKey;
      if (nk) {
        const parsed = parsePrefixedKey(nk);
        if (parsed.type === 'DAY') nk = parsed.monthKey;
      }
      if (nk && !/^\d{4}-\d{2}$/.test(nk)) return res.status(400).json({ok:false, error:{code:'VALIDATION_ERROR', message:`Invalid periodKey ${s.periodKey}`}});
      // Optional: validate period exists per row, skip if not found? We'll check and 404 on first missing
      if (nk) {
        const exists = await db.AttendancePeriod.findOne({ where:{ companyId, key: nk }});
        if(!exists) return res.status(404).json({ ok:false, error:{ code:'PERIOD_NOT_FOUND', message:`Periode ${nk} tidak ditemukan` }});
      }
      const [row]=await db.KpiScore.upsert({ companyId, employeeId:s.employeeId, periodKey:nk, kpiId:s.kpiId, actualValue:s.actualValue, scorePoin:s.scorePoin, isCustom: !!s.isCustom, customMeta:s.customMeta||null });
      upserted.push(row);
    }
    res.json({ok:true,data:{scores:upserted}});
  }catch(e){next(e);}
};
exports.createCustom = async(req,res,next)=>{ 
  try{ 
    const companyId=req.body.companyId||req.user.companyId||req.headers['x-company-id']; 
    let { employeeId, periodKey, kpiId, actualValue, scorePoin, customMeta }=req.body; 
    if (periodKey) {
      const parsed = parsePrefixedKey(periodKey);
      if (parsed.type === 'DAY') periodKey = parsed.monthKey;
    }
    if (periodKey && !/^\d{4}-\d{2}$/.test(periodKey)) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'periodKey must be YYYY-MM'}});
    const [score]=await db.KpiScore.upsert({ companyId, employeeId, periodKey, kpiId, actualValue, scorePoin, isCustom:true, customMeta }); 
    res.json({ok:true,data:{score}});
  }catch(e){next(e);} 
};
exports.deleteScore = async(req,res,next)=>{ 
  try{ 
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id']; 
    let periodKey = req.params.periodKey;
    const parsed = parsePrefixedKey(periodKey);
    if (parsed.type === 'DAY') periodKey = parsed.monthKey;
    await db.KpiScore.destroy({ where:{ companyId, employeeId:req.params.employeeId, periodKey, kpiId:req.params.kpiId } }); 
    res.json({ok:true,data:{message:'Deleted'}});
  }catch(e){next(e);} 
};

exports.evaluate = async(req,res,next)=>{
  try{
    let { employeeId, periodKey }=req.body;
    const companyId=req.body.companyId||req.user.companyId||req.headers['x-company-id'];
    if (periodKey) {
      const parsed = parsePrefixedKey(periodKey);
      if (parsed.type === 'DAY') periodKey = parsed.monthKey;
    }
    if (periodKey && !/^\d{4}-\d{2}$/.test(periodKey)) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'periodKey must be YYYY-MM'}});
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
