const db = require('../../models');
const { resolvePeriodFilter, applyDateWhere } = require('../../utils/periodFilter');
const { Op } = require('sequelize');

exports.listTransactions = async(req,res,next)=>{
  try{
    const companyId = req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const where={};
    if(companyId) where.companyId=companyId;
    if(req.query.employeeId) where.employeeId=req.query.employeeId;
    if(req.query.cardType) where.cardType=req.query.cardType;
    // Unified period filter via date field (points date is DATEONLY)
    // Supports ?periodKey=ALL => unfiltered, plus MONTH/DAY/YEAR/WEEK/PRESET etc
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    if (filter.isAll) {
      // no date filter
    } else if (!filter.isEmpty) {
      applyDateWhere(where, 'date', filter);
    } else if (req.query.periodKey && req.query.periodKey !== 'ALL') {
      // Legacy fallback already handled by resolvePeriodFilter, but keep old LIKE for compat if filter empty
      const ym=req.query.periodKey;
      if (/^\d{4}-\d{2}$/.test(ym)) where.date={ [Op.like]: `${ym}%` };
    }
    const txs=await db.PointTransaction.findAll({where, order:[['date','DESC']]});
    res.json({ok:true,data:{transactions:txs, filter: filter.isEmpty? null: filter}});
  }catch(e){next(e);}
};

exports.createTransaction = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.user.companyId||req.headers['x-company-id'];
    const { employeeId, employeeName, type, masterId, name, point, category, cardType, description, date }=req.body;
    if(!employeeId||!type||point===undefined) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR'}});
    const tx=await db.PointTransaction.create({ companyId, employeeId, employeeName, type, masterId, name, point, category, cardType, description, date: date||new Date().toISOString().slice(0,10) });
    res.status(201).json({ok:true,data:{transaction:tx}});
  }catch(e){next(e);}
};

exports.updateTransaction = async(req,res,next)=>{ try{ const tx=await db.PointTransaction.findByPk(req.params.id); if(!tx) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); Object.assign(tx, req.body); await tx.save(); res.json({ok:true,data:{transaction:tx}});}catch(e){next(e);} };
exports.deleteTransaction = async(req,res,next)=>{ try{ const tx=await db.PointTransaction.findByPk(req.params.id); if(!tx) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); await tx.destroy(); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);} };

exports.status = async(req,res,next)=>{
  try{
    const { employeeId }=req.params;
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    // Default to current month if no filter supplied (backwards compat with src/core/pointStore.js:295)
    let effectiveFilter = filter;
    if (filter.isEmpty) {
      const nowKey = new Date().toISOString().slice(0,7);
      effectiveFilter = { type:'MONTH', monthKey: nowKey, periodKey: nowKey, dateFrom:`${nowKey}-01`, dateTo: new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10) };
    }
    if (filter.isAll) {
      // For ALL, return overall status (no date filter)
      effectiveFilter = { isAll:true };
    }
    const where={ companyId, employeeId };
    if (!effectiveFilter.isAll) applyDateWhere(where, 'date', effectiveFilter);
    const txs=await db.PointTransaction.findAll({where});
    const penalty = txs.filter(t=>t.type==='penalty').reduce((s,t)=>s+ (t.point||0),0);
    const reward = txs.filter(t=>t.type==='reward').reduce((s,t)=>s+ (t.point||0),0);
    const monthlyPoint = 0 - penalty + reward; // src/core/pointStore.js:202
    // Card mapping via settings
    const setting=await db.AppSetting.findOne({where:{companyId}});
    const yellowCardPoint=setting?.yellowCardPoint||10;
    const redCardPoint=setting?.redCardPoint||30;
    const card = await db.EmployeeCard.findOne({ where:{ companyId, employeeId }}) || await db.EmployeeCard.findOne({ where:{ companyId, empName: employeeId }});
    const yellow = card?.yellow||0, red = card?.red||0;
    const respPeriodKey = filter.periodKey || filter.key || req.query.periodKey || effectiveFilter.monthKey || effectiveFilter.key || null;
    res.json({ok:true,data:{ employeeId, periodKey: respPeriodKey, penalty, reward, monthlyPoint, yellow, red, yellowCardPoint, redCardPoint, transactions:txs, filter: filter.isEmpty? null: filter }});
  }catch(e){next(e);}
};

exports.report = async(req,res,next)=>{
  try{
    const { employeeId }=req.params;
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const filter = resolvePeriodFilter(req.query, {});
    if (filter.isInvalid) return res.status(400).json({ ok:false, error:{ code:'VALIDATION_ERROR', message: filter.error.message }});
    let effectiveFilter = filter;
    if (filter.isEmpty) {
      const nowKey = new Date().toISOString().slice(0,7);
      effectiveFilter = { type:'MONTH', monthKey: nowKey, periodKey: nowKey, dateFrom:`${nowKey}-01`, dateTo: new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10) };
    }
    const where={ companyId, employeeId };
    if (!effectiveFilter.isAll) applyDateWhere(where, 'date', effectiveFilter);
    const txs=await db.PointTransaction.findAll({where, order:[['date','ASC']]});
    const penalty=txs.filter(t=>t.type==='penalty').reduce((s,t)=>s+ (t.point||0),0);
    const reward=txs.filter(t=>t.type==='reward').reduce((s,t)=>s+ (t.point||0),0);
    const respPeriodKey = filter.periodKey || filter.key || req.query.periodKey || effectiveFilter.monthKey || null;
    res.json({ok:true,data:{ employeeId, periodKey: respPeriodKey, penalty, reward, monthlyPoint: 0-penalty+reward, transactions:txs, generatedAt: new Date().toISOString(), filter: filter.isEmpty? null: filter }});
  }catch(e){next(e);}
};

exports.periods = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId||req.headers['x-company-id'];
    const txs=await db.PointTransaction.findAll({ where:{ companyId }, attributes:[[db.sequelize.fn('DISTINCT', db.sequelize.col('date')), 'date']], raw:true });
    const keys=[...new Set(txs.map(t=>String(t.date).slice(0,7)))].sort().reverse();
    res.json({ok:true,data:{periods:keys}});
  }catch(e){next(e);}
};
