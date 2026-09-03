const db = require('../../models');
const { Op } = require('sequelize');

exports.overview = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const periodKey=req.query.periodKey;
    let period=null;
    if(periodKey) period=await db.AttendancePeriod.findOne({where:{ companyId, key: periodKey }});
    const where={ companyId };
    if(period) where.periodId=period.id;
    const totalEmployees=await db.Employee.count({ where:{ companyId }});
    const totalRecords=await db.AttendanceRecord.count({ where });
    const hadir=await db.AttendanceRecord.count({ where:{ ...where, status:'Hadir' }});
    const tidakHadir=await db.AttendanceRecord.count({ where:{ ...where, status:'Tidak Hadir' }});
    const tidakLengkap=await db.AttendanceRecord.count({ where:{ ...where, status:'Data Tidak Lengkap' }});
    const totalPeriods=await db.AttendancePeriod.count({ where:{ companyId }});
    res.json({ok:true,data:{ overview:{ totalEmployees, totalRecords, hadir, tidakHadir, tidakLengkap, totalPeriods, periodKey, periodLabel: period?.label||null }}});
  }catch(e){next(e);}
};

exports.byDepartment = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const periodKey=req.query.periodKey;
    let period=null;
    if(periodKey) period=await db.AttendancePeriod.findOne({where:{ companyId, key: periodKey }});
    const employees=await db.Employee.findAll({ where:{ companyId }, attributes:['id','department'] });
    const deptMap={};
    for(const e of employees) deptMap[e.id]=e.department||'Unknown';
    const where={ companyId }; if(period) where.periodId=period.id;
    const records=await db.AttendanceRecord.findAll({where});
    const agg={};
    for(const r of records){
      const dept=deptMap[r.employeeId]||'Unknown';
      if(!agg[dept]) agg[dept]={ department:dept, total:0, hadir:0, tidakHadir:0, tidakLengkap:0 };
      agg[dept].total++;
      if(r.status==='Hadir') agg[dept].hadir++;
      else if(r.status==='Tidak Hadir') agg[dept].tidakHadir++;
      else agg[dept].tidakLengkap++;
    }
    res.json({ok:true,data:{ byDepartment: Object.values(agg) }});
  }catch(e){next(e);}
};

exports.byEmployee = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const employeeId=req.params.id;
    const periodKey=req.query.periodKey;
    let period=null;
    if(periodKey) period=await db.AttendancePeriod.findOne({where:{ companyId, key: periodKey }});
    const where={ companyId, employeeId };
    if(period) where.periodId=period.id;
    const records=await db.AttendanceRecord.findAll({where, order:[['date','ASC']]});
    const stats={ total: records.length, hadir: records.filter(r=>r.status==='Hadir').length, tidakHadir: records.filter(r=>r.status==='Tidak Hadir').length, tidakLengkap: records.filter(r=>r.status==='Data Tidak Lengkap').length };
    res.json({ok:true,data:{ employeeId, periodKey, stats, records }});
  }catch(e){next(e);}
};

exports.calendar = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const periodKey=req.query.periodKey;
    let period=null;
    if(periodKey) period=await db.AttendancePeriod.findOne({where:{ companyId, key: periodKey }});
    const where={ companyId }; if(period) where.periodId=period.id;
    const records=await db.AttendanceRecord.findAll({where, include:[{model:db.Employee, attributes:['fullName']}]});
    // Group by date
    const byDate={};
    for(const r of records){
      const d=r.date;
      if(!byDate[d]) byDate[d]={ date:d, hadir:0, tidakHadir:0, tidakLengkap:0 };
      if(r.status==='Hadir') byDate[d].hadir++;
      else if(r.status==='Tidak Hadir') byDate[d].tidakHadir++;
      else byDate[d].tidakLengkap++;
    }
    res.json({ok:true,data:{ calendar: Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date)), period }});
  }catch(e){next(e);}
};
