const db = require('../../models');

exports.list = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.headers['x-company-id'];
    const where={}; if(companyId) where.companyId=companyId;
    const departments = await db.Department.findAll({ where, order:[['name','ASC']] });
    res.json({ ok:true, data:{ departments }});
  } catch(e){ next(e); }
};
exports.create = async (req,res,next)=>{
  try{
    const companyId = req.body.companyId || req.user.companyId;
    if(!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR'}});
    if(!req.body.name) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'name wajib'}});
    const dep = await db.Department.create({ companyId, name:req.body.name, code:req.body.code, description:req.body.description, head:req.body.head });
    res.status(201).json({ ok:true, data:{ department: dep }});
  }catch(e){ if(e.name==='SequelizeUniqueConstraintError') return res.status(409).json({ ok:false, error:{code:'DUPLICATE'}}); next(e); }
};
exports.getOne = async(req,res,next)=>{ try{ const d=await db.Department.findByPk(req.params.id); if(!d) return res.status(404).json({ok:false, error:{code:'NOT_FOUND'}}); res.json({ok:true, data:{department:d}});}catch(e){next(e);} };
exports.update = async(req,res,next)=>{ try{ const d=await db.Department.findByPk(req.params.id); if(!d) return res.status(404).json({ok:false, error:{code:'NOT_FOUND'}}); Object.assign(d, req.body); await d.save(); res.json({ok:true, data:{department:d}});}catch(e){next(e);} };
exports.remove = async(req,res,next)=>{ try{ const d=await db.Department.findByPk(req.params.id); if(!d) return res.status(404).json({ok:false, error:{code:'NOT_FOUND'}}); await d.destroy(); res.json({ok:true, data:{message:'Deleted'}});}catch(e){next(e);} };
exports.autoSeed = async(req,res,next)=>{
  try{
    const companyId = req.body.companyId || req.user.companyId || req.headers['x-company-id'];
    if(!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR'}});
    // Seed from distinct attendance record employees departments
    const employees = await db.Employee.findAll({ where:{ companyId }, attributes:['department'] });
    const distinct = [...new Set(employees.map(e=>e.department).filter(Boolean))];
    const toCreate=[];
    for(const name of distinct){
      const exists = await db.Department.findOne({ where:{ companyId, name }});
      if(!exists) toCreate.push({ companyId, name });
    }
    if(toCreate.length) await db.Department.bulkCreate(toCreate);
    const all = await db.Department.findAll({ where:{ companyId }});
    res.json({ ok:true, data:{ departments: all, seeded: toCreate.length }});
  }catch(e){ next(e); }
};
