const db = require('../../models');

exports.exportData = async(req,res,next)=>{
  try{
    const companyId=req.query.companyId||req.user.companyId;
    const where={}; if(companyId) where.companyId=companyId;
    const [
      companies, employees, appSettings, periods, records, uploadLogs, cards,
      payrollSnapshots, payslipArchives, thrSettings, thrAdjustments, thrPayments, thrAuditLogs,
      kpiMasters, kpiConfigs, kpiScores, disciplines, leaves, pointTxs, evaluations, sops, regulations,
      departments, contractTypes, positionAllowances, payrollComponents, manualOverrides
    ] = await Promise.all([
      companyId ? db.Company.findAll({where:{ id: companyId }}) : db.Company.findAll(),
      db.Employee.findAll({where}),
      db.AppSetting.findAll({where}),
      db.AttendancePeriod.findAll({where}),
      db.AttendanceRecord.findAll({where}),
      db.UploadLog.findAll({where}),
      db.EmployeeCard.findAll({where}),
      db.PayrollSnapshot.findAll({where}),
      db.PayslipArchive.findAll({where}),
      db.ThrSetting.findAll({where}),
      db.ThrAdjustment.findAll({where}),
      db.ThrPayment.findAll({where}),
      db.ThrAuditLog.findAll({where}),
      db.KpiMaster.findAll(),
      db.KpiConfig.findAll({where}),
      db.KpiScore.findAll({where}),
      db.DisciplineRecord.findAll({where}),
      db.LeaveRecord.findAll({where}),
      db.PointTransaction.findAll({where}),
      db.Evaluation.findAll({where}),
      db.Sop.findAll({where: companyId? {companyId}: {}}),
      db.Regulation.findAll({where}),
      db.Department.findAll({where}),
      db.ContractType.findAll({where}),
      db.PositionAllowance.findAll({where}),
      db.PayrollComponent.findAll({where}),
      db.ManualAttendanceOverride.findAll({where}),
    ]);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      companyId,
      data: {
        companies, employees, appSettings, periods, records, uploadLogs, cards,
        payrollSnapshots, payslipArchives, thrSettings, thrAdjustments, thrPayments, thrAuditLogs,
        kpiMasters, kpiConfigs, kpiScores, disciplines, leaves, pointTxs, evaluations, sops, regulations,
        departments, contractTypes, positionAllowances, payrollComponents, manualOverrides,
      }
    };
    res.json({ ok:true, data: backup });
  }catch(e){ next(e); }
};

exports.importData = async(req,res,next)=>{
  const t=await db.sequelize.transaction();
  try{
    const payload=req.body;
    const data=payload.data || payload; // support both envelope and raw
    const upsert = async(model, rows, opts={})=>{
      if(!Array.isArray(rows)||rows.length===0) return;
      await model.bulkCreate(rows, { updateOnDuplicate: Object.keys(model.rawAttributes).filter(k=>!['id','created_at','updated_at'].includes(k)), transaction:t, ...opts });
    };
    if(data.companies) await upsert(db.Company, data.companies);
    if(data.employees) await upsert(db.Employee, data.employees);
    if(data.appSettings) await upsert(db.AppSetting, data.appSettings);
    if(data.periods) await upsert(db.AttendancePeriod, data.periods);
    if(data.records) await upsert(db.AttendanceRecord, data.records);
    if(data.uploadLogs) await db.UploadLog.bulkCreate(data.uploadLogs, { ignoreDuplicates:true, transaction:t });
    if(data.cards) await upsert(db.EmployeeCard, data.cards);
    if(data.payrollSnapshots) await upsert(db.PayrollSnapshot, data.payrollSnapshots);
    if(data.payslipArchives) await upsert(db.PayslipArchive, data.payslipArchives);
    if(data.thrSettings) await upsert(db.ThrSetting, data.thrSettings);
    if(data.thrAdjustments) await upsert(db.ThrAdjustment, data.thrAdjustments);
    if(data.thrPayments) await upsert(db.ThrPayment, data.thrPayments);
    if(data.thrAuditLogs) await db.ThrAuditLog.bulkCreate(data.thrAuditLogs, { ignoreDuplicates:true, transaction:t });
    if(data.kpiMasters) await upsert(db.KpiMaster, data.kpiMasters);
    if(data.kpiConfigs) await upsert(db.KpiConfig, data.kpiConfigs);
    if(data.kpiScores) await upsert(db.KpiScore, data.kpiScores);
    if(data.disciplines) await upsert(db.DisciplineRecord, data.disciplines);
    if(data.leaves) await upsert(db.LeaveRecord, data.leaves);
    if(data.pointTxs) await upsert(db.PointTransaction, data.pointTxs);
    if(data.evaluations) await upsert(db.Evaluation, data.evaluations);
    if(data.sops) await upsert(db.Sop, data.sops);
    if(data.regulations) await upsert(db.Regulation, data.regulations);
    if(data.departments) await upsert(db.Department, data.departments);
    if(data.contractTypes) await upsert(db.ContractType, data.contractTypes);
    if(data.positionAllowances) await upsert(db.PositionAllowance, data.positionAllowances);
    if(data.payrollComponents) await upsert(db.PayrollComponent, data.payrollComponents);
    if(data.manualOverrides) await upsert(db.ManualAttendanceOverride, data.manualOverrides);
    await t.commit();
    res.json({ ok:true, data:{ message:'Import berhasil', imported:true }});
  }catch(e){
    await t.rollback();
    next(e);
  }
};
