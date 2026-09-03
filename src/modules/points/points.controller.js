const db = require('../../models');

exports.listTransactions = async(req,res,next)=>{
  try{
    const where={};
    if(req.query.companyId||req.user.companyId) where.companyId=req.query.companyId||req.user.companyId;
    if(req.query.employeeId) where.employeeId=req.query.employeeId;
    if(req.query.periodKey){
      const ym=req.query.periodKey;
      where.date={ [db.Sequelize.Op.like]: `${ym}%` };
    }
    const txs=await db.PointTransaction.findAll({where, order:[['date','DESC']]});
    res.json({ok:true,data:{transactions:txs}});
  }catch(e){next(e);}
};

exports.createTransaction = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.user.companyId;
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
    const companyId=req.query.companyId||req.user.companyId;
    const periodKey=req.query.periodKey||new Date().toISOString().slice(0,7);
    const where={ companyId, employeeId, date:{ [db.Sequelize.Op.like]: `${periodKey}%` }};
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
    res.json({ok:true,data:{ employeeId, periodKey, penalty, reward, monthlyPoint, yellow, red, yellowCardPoint, redCardPoint, transactions:txs }});
  }catch(e){next(e);}
};

exports.report = async(req,res,next)=>{
  try{
    const { employeeId }=req.params;
    const companyId=req.query.companyId||req.user.companyId;
    const periodKey=req.query.periodKey||new Date().toISOString().slice(0,7);
    const statusData=(await exports.status(req,res,()=>{}))?.data; // fallback
    const where={ companyId, employeeId, date:{ [db.Sequelize.Op.like]: `${periodKey}%` }};
    const txs=await db.PointTransaction.findAll({where, order:[['date','ASC']]});
    const penalty=txs.filter(t=>t.type==='penalty').reduce((s,t)=>s+ (t.point||0),0);
    const reward=txs.filter(t=>t.type==='reward').reduce((s,t)=>s+ (t.point||0),0);
    res.json({ok:true,data:{ employeeId, periodKey, penalty, reward, monthlyPoint: 0-penalty+reward, transactions:txs, generatedAt: new Date().toISOString() }});
  }catch(e){next(e);}
};

exports.periods = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const txs=await db.PointTransaction.findAll({ where:{ companyId }, attributes:[[db.sequelize.fn('DISTINCT', db.sequelize.col('date')), 'date']], raw:true });
    const keys=[...new Set(txs.map(t=>String(t.date).slice(0,7)))].sort().reverse();
    res.json({ok:true,data:{periods:keys}});
  }catch(e){next(e);}
};
