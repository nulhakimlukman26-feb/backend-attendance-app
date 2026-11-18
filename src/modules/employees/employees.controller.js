const XLSX = require('xlsx');
const db = require('../../models');
const { parsePagination, paginationMeta } = require('../../utils/pagination');
const { Op } = require('sequelize');

function generateNextEmployeeId(existingIds) {
  let max = 0;
  for (const id of existingIds) {
    const m = String(id).match(/EMP-?(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1],10));
  }
  return `EMP-${String(max+1).padStart(4,'0')}`;
}

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val.toISOString().slice(0,10);
  if (typeof val === 'number') {
    // Excel serial date
    const base = new Date(1899, 11, 30);
    const d = new Date(base.getTime() + val*24*60*60*1000);
    if (!isNaN(d) && d.getFullYear() >= 1970 && d.getFullYear() <= 2050) return d.toISOString().slice(0,10);
  }
  const s = String(val).trim();
  // Try ISO
  const d = new Date(s);
  if (!isNaN(d) && s.match(/\d{4}-\d{2}-\d{2}/)) return d.toISOString().slice(0,10);
  // Try DD/MM/YYYY
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const dd = new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
    if (!isNaN(dd)) return dd.toISOString().slice(0,10);
  }
  return null;
}

function normalizeEmploymentStatus(val) {
  const s = String(val ?? '').trim();
  if (!s) return 'Active';
  const lower = s.toLowerCase();
  if (['aktif', 'active'].includes(lower)) return 'Active';
  if (lower.includes('resign') || lower === 'keluar' || lower === 'nonaktif') return 'Resigned';
  if (['kontrak', 'contract'].includes(lower)) return 'Contract';
  if (['probation', 'percobaan'].includes(lower)) return 'Probation';
  if (['tetap', 'permanent', 'pkwt', 'pksi'].includes(lower)) return 'Permanent';
  if (['harian', 'daily', 'freelance', 'part time', 'parttime'].includes(lower)) return 'Daily';
  return s;
}

exports.list = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || req.user.companyId || req.companyId;
    const where = {};
    if (companyId) where.companyId = companyId;
    if (req.query.status) where.employmentStatus = req.query.status;
    if (req.query.department) where.department = req.query.department;
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      where[Op.or] = [{ fullName: { [Op.like]: q } }, { id: { [Op.like]: q } }, { email: { [Op.like]: q } }];
    }
    const { page, limit, offset } = parsePagination(req.query);
    const { count, rows } = await db.Employee.findAndCountAll({ where, order:[['full_name','ASC']], limit, offset, include:[{ model: db.EmployeePayrollComponent, as:'payrollComponents' }] });
    res.json({ ok:true, data:{ employees: rows }, meta: paginationMeta(count, page, limit) });
  } catch(e){ next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.user.companyId || req.companyId;
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib'}});
    let id = req.body.id;
    if (!id) {
      const existing = await db.Employee.findAll({ where:{ companyId }, attributes:['id'] });
      id = generateNextEmployeeId(existing.map(x=>x.id));
    }
    const exists = await db.Employee.findByPk(id);
    if (exists) return res.status(409).json({ ok:false, error:{code:'DUPLICATE', message:'ID sudah ada'}});
    const data = { ...req.body, id, companyId };
    const payrollComponents = Array.isArray(data.payrollComponents) ? data.payrollComponents : [];
    delete data.payrollComponents;
    if (data.joinDate) data.joinDate = parseExcelDate(data.joinDate);
    if (data.birthDate) data.birthDate = parseExcelDate(data.birthDate);
    const employee = await db.Employee.create(data);
    if (payrollComponents.length) await db.EmployeePayrollComponent.bulkCreate(payrollComponents.map(c => ({ ...c, id: undefined, employeeId: id, companyId })));
    employee.setDataValue('payrollComponents', payrollComponents);
    res.status(201).json({ ok:true, data:{ employee }});
  } catch(e){ next(e); }
};

exports.importXlsx = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:{code:'NO_FILE'}});
    const companyId = req.body.companyId || req.query.companyId || req.user.companyId || req.companyId;
    if (!companyId) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'companyId wajib'}});
    const wb = XLSX.read(req.file.buffer, { type:'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    // Heuristic: find header row with Nama / fullName
    let headerIdx = -1;
    let headers = [];
    for (let i=0;i<Math.min(10, rows.length);i++){
      const row = rows[i].map(v=>String(v).toLowerCase());
      if (row.some(c=>c.includes('nama') || c.includes('full_name') || c.includes('full name'))) { headerIdx=i; headers=rows[i].map(h=>String(h).trim()); break; }
    }
    if (headerIdx===-1) return res.status(400).json({ ok:false, error:{code:'PARSE_ERROR', message:'Header tidak ditemukan (cari kolom Nama)'}});
    const existing = await db.Employee.findAll({ where:{ companyId }, attributes:['id'] });
    let nextIdNum = existing.reduce((max, r)=>{ const m=String(r.id).match(/(\d+)/); return Math.max(max, m?parseInt(m[1]):0);},0);
    const toCreate=[];
    for(let r=headerIdx+1;r<rows.length;r++){
      const row = rows[r];
      if (!row || row.every(c=>!String(c).trim())) continue;
      const obj={};
      headers.forEach((h,i)=>{ obj[String(h).trim().toLowerCase()]=row[i]; });
      const pick=(...keys)=>{
        for(const k of keys){
          const v=obj[String(k).trim().toLowerCase()];
          if(v!==undefined && v!==null && String(v).trim()!=='') return v;
        }
        return '';
      };
      const fullName = pick('Nama Lengkap','Nama','fullName','full_name','Full Name');
      if (!String(fullName).trim()) continue;
      const rawId = pick('ID Karyawan','ID','id','Employee ID','NIK');
      let id = String(rawId).trim();
      if (id) {
        if (toCreate.some(x=>x.id===id)) continue;
      } else {
        let candidate;
        do { nextIdNum++; candidate = `EMP-${String(nextIdNum).padStart(4,'0')}`; }
        while (toCreate.some(x=>x.id===candidate) || existing.some(x=>x.id===candidate));
        id = candidate;
      }
      const num = (v, fallback) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
      const text = (v) => { const s = String(v??'').trim(); return s || null; };
      toCreate.push({
        id,
        companyId,
        fullName: String(fullName).trim(),
        department: pick('Departemen','Department','department') || 'WAREHOUSE',
        jobTitle: pick('Jabatan','Posisi','jobTitle') || 'Staf',
        email: text(pick('Email','email')),
        phone: text(pick('No. HP','Phone','phone','Telepon','No HP')),
        joinDate: parseExcelDate(pick('Tanggal Join','Join Date','joinDate','Tanggal Masuk')),
        birthDate: parseExcelDate(pick('Tanggal Lahir','Birth Date','birthDate','Tanggal Kelahiran')),
        contractEndDate: parseExcelDate(pick('Tanggal Akhir Kontrak','Contract End Date','contractEndDate')),
        employmentStatus: normalizeEmploymentStatus(pick('Status Karyawan','Status','employmentStatus','Status Kerja')),
        baseSalary: num(pick('Gaji Pokok','Gaji','baseSalary'), 1755000),
        dailySalary: num(pick('Upah Harian','dailySalary'), 85000),
        bankName: text(pick('Bank','bankName')),
        bankAccountNumber: text(pick('No. Rekening','No Rekening','bankAccountNumber')),
        bankAccountHolder: text(pick('Atas Nama Rekening','bankAccountHolder')),
        nik: text(pick('NIK','nik')),
        npwp: text(pick('NPWP','npwp')),
        bpjsKesehatan: text(pick('BPJS Kesehatan','bpjsKesehatan')),
        bpjsKetenagakerjaan: text(pick('BPJS Ketenagakerjaan','bpjsKetenagakerjaan')),
        shift: pick('Jadwal / Shift','Jadwal','Shift','shift') || 'Normal',
        notes: text(pick('Catatan','notes')),
      });
    }
    if (toCreate.length===0) return res.status(400).json({ ok:false, error:{code:'NO_DATA', message:'Tidak ada data karyawan valid di file'}});
    // bulkCreate with ignore duplicates
    const result = await db.Employee.bulkCreate(toCreate, { ignoreDuplicates:true, validate:true });
    res.json({ ok:true, data:{ imported: result.length, totalRows: toCreate.length }});
  } catch(e){ next(e); }
};

exports.getOne = async (req, res, next) => {
  try {
    const emp = await db.Employee.findByPk(req.params.id, { include:[{ model: db.EmployeePayrollComponent, as:'payrollComponents' }] });
    if (!emp) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    res.json({ ok:true, data:{ employee: emp }});
  } catch(e){ next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const emp = await db.Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    if (req.body.joinDate) req.body.joinDate = parseExcelDate(req.body.joinDate);
    if (req.body.birthDate) req.body.birthDate = parseExcelDate(req.body.birthDate);
    const payrollComponents = Array.isArray(req.body.payrollComponents) ? req.body.payrollComponents : null;
    delete req.body.payrollComponents;
    Object.assign(emp, req.body);
    // prevent changing PK incorrectly
    if (req.body.id && req.body.id !== req.params.id) { /* ignore */ delete emp.id; }
    await emp.save();
    if (payrollComponents) {
      await db.EmployeePayrollComponent.destroy({ where:{ employeeId: emp.id } });
      if (payrollComponents.length) await db.EmployeePayrollComponent.bulkCreate(payrollComponents.map(c => ({ ...c, id: undefined, employeeId: emp.id, companyId: emp.companyId })));
    }
    res.json({ ok:true, data:{ employee: emp }});
  } catch(e){ next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const emp = await db.Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    await emp.destroy();
    res.json({ ok:true, data:{ message:'Deleted'}});
  } catch(e){ next(e); }
};

exports.resign = async (req, res, next) => {
  try {
    const emp = await db.Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    emp.employmentStatus = 'Resigned';
    await emp.save();
    res.json({ ok:true, data:{ employee: emp }});
  } catch(e){ next(e); }
};

exports.reactivate = async (req, res, next) => {
  try {
    const emp = await db.Employee.findByPk(req.params.id);
    if (!emp) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    emp.employmentStatus = 'Active';
    await emp.save();
    res.json({ ok:true, data:{ employee: emp }});
  } catch(e){ next(e); }
};

exports.getEvaluations = async (req, res, next) => {
  try {
    const evals = await db.Evaluation.findAll({ where:{ employeeId: req.params.id }, order:[['created_at','DESC']]});
    res.json({ ok:true, data:{ evaluations: evals }});
  } catch(e){ next(e); }
};
