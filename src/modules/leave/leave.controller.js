const db = require('../../models');
const { uploadToR2 } = require('../../utils/r2Upload');

exports.list = async(req,res,next)=>{ try{ const where={}; if(req.query.companyId||req.user.companyId) where.companyId=req.query.companyId||req.user.companyId; if(req.query.employeeId) where.employeeId=req.query.employeeId; if(req.query.type) where.type=req.query.type; if(req.query.status) where.status=req.query.status; const list=await db.LeaveRecord.findAll({where, order:[['start_date','DESC']]}); res.json({ok:true,data:{leaves:list}});}catch(e){next(e);} };

exports.create = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.user.companyId;
    const { employeeId, employeeName, type, startDate, endDate, paidType, reason }=req.body;
    if(!type||!startDate||!endDate) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'type,startDate,endDate wajib'}});
    const s=new Date(startDate), e=new Date(endDate);
    const diff=Math.ceil((e-s)/(24*60*60*1000))+1;
    let attachment=null;
    if(req.file){
      const key=`leave/${companyId}/${Date.now()}-${req.file.originalname}`;
      attachment=await uploadToR2(req.file.buffer, key, req.file.mimetype) || null;
    } else if(req.body.attachment) attachment=req.body.attachment;
    const rec=await db.LeaveRecord.create({ companyId, employeeId, employeeName, type, startDate, endDate, totalDays: diff>0?diff:1, paidType: paidType||'PAID', reason, attachment, status:'PENDING' });
    res.status(201).json({ok:true,data:{leave:rec}});
  }catch(e){next(e);}
};

exports.update = async(req,res,next)=>{ try{ const r=await db.LeaveRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); Object.assign(r, req.body); if(req.body.startDate||req.body.endDate){ const s=new Date(r.startDate), e=new Date(r.endDate); r.totalDays=Math.ceil((e-s)/(24*60*60*1000))+1; } await r.save(); res.json({ok:true,data:{leave:r}});}catch(e){next(e);} };
exports.remove = async(req,res,next)=>{ try{ const r=await db.LeaveRecord.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); await r.destroy(); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);} };

exports.quota = async(req,res,next)=>{
  try{
    const { employeeId }=req.params;
    const companyId=req.query.companyId||req.user.companyId;
    const year=parseInt(req.query.year||new Date().getFullYear(),10);
    const leaves=await db.LeaveRecord.findAll({ where:{ companyId, employeeId, type:'CUTI', status:'APPROVED' }});
    const used=leaves.reduce((s,l)=>s+(l.totalDays||0),0);
    const quota=12; // default annual leave
    res.json({ok:true,data:{ quota, used, remaining: Math.max(0, quota-used), year }});
  }catch(e){next(e);}
};

exports.summary = async(req,res,next)=>{
  try{
    const { employeeId }=req.params;
    const companyId=req.query.companyId||req.user.companyId;
    const where={ companyId, employeeId };
    if(req.query.periodKey){
      // filter by month if needed: check startDate prefix
      const ym=req.query.periodKey; // YYYY-MM
      where.startDate={ [db.Sequelize.Op.like]: `${ym}%` };
    }
    const leaves=await db.LeaveRecord.findAll({where});
    const summary={ total: leaves.length, byType:{ CUTI:0, SAKIT:0, IZIN:0 }, byStatus:{ APPROVED:0, PENDING:0, REJECTED:0 }, totalDays: leaves.reduce((s,l)=>s+(l.totalDays||0),0)};
    for(const l of leaves){ summary.byType[l.type]=(summary.byType[l.type]||0)+1; summary.byStatus[l.status]=(summary.byStatus[l.status]||0)+1; }
    res.json({ok:true,data:{summary, leaves}});
  }catch(e){next(e);}
};
