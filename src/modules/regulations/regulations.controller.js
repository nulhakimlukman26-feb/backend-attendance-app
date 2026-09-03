const db = require('../../models');
exports.list = async(req,res,next)=>{ try{ const companyId=req.query.companyId||req.user.companyId; const where={}; if(companyId) where.companyId=companyId; const list=await db.Regulation.findAll({where, order:[['created_at','DESC']]}); res.json({ok:true,data:{regulations:list}});}catch(e){next(e);} };
exports.upsert = async(req,res,next)=>{
  try{
    const companyId=req.body.companyId||req.query.companyId||req.user.companyId;
    if(!req.body.html && !req.body.content) return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR', message:'html atau content wajib'}});
    let reg=await db.Regulation.findOne({where:{companyId}});
    if(!reg) reg=await db.Regulation.create({ companyId, title:req.body.title||'Regulations', html:req.body.html, content:req.body.content, category:req.body.category });
    else { Object.assign(reg, req.body); await reg.save(); }
    res.json({ok:true,data:{regulation:reg}});
  }catch(e){next(e);}
};
exports.remove = async(req,res,next)=>{ try{ const r=await db.Regulation.findByPk(req.params.id); if(!r) return res.status(404).json({ok:false,error:{code:'NOT_FOUND'}}); await r.destroy(); res.json({ok:true,data:{message:'Deleted'}});}catch(e){next(e);} };
