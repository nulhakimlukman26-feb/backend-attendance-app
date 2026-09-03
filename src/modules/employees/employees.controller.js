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
    const { count, rows } = await db.Employee.findAndCountAll({ where, order:[['full_name','ASC']], limit, offset });
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
    if (data.joinDate) data.joinDate = parseExcelDate(data.joinDate);
    if (data.birthDate) data.birthDate = parseExcelDate(data.birthDate);
    const employee = await db.Employee.create(data);
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
      headers.forEach((h,i)=>{ obj[h]=row[i]; });
      const fullName = obj['Nama']||obj['nama']||obj['fullName']||obj['full_name']||obj['Full Name']||'';
      if (!String(fullName).trim()) continue;
      nextIdNum++;
      const id = obj['ID']||obj['id']||obj['NIK']||`EMP-${String(nextIdNum).padStart(4,'0')}`;
      // check duplicate
      if (toCreate.some(x=>x.id===id)) continue;
      toCreate.push({
        id: String(id).trim(),
        companyId,
        fullName: String(fullName).trim(),
        department: String(obj['Department']||obj['department']||obj['Departemen']||'WAREHOUSE').trim()||'WAREHOUSE',
        jobTitle: String(obj['Jabatan']||obj['jobTitle']||obj['Posisi']||'Staf').trim()||'Staf',
        email: String(obj['Email']||obj['email']||'').trim()||null,
        phone: String(obj['Phone']||obj['phone']||obj['Telepon']||'').trim()||null,
        joinDate: parseExcelDate(obj['Join Date']||obj['joinDate']||obj['Tanggal Masuk']||''),
        employmentStatus: String(obj['Status']||'Active').trim()||'Active',
        baseSalary: parseFloat(obj['Gaji']||obj['baseSalary']||1755000)||1755000,
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
    const emp = await db.Employee.findByPk(req.params.id);
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
    Object.assign(emp, req.body);
    // prevent changing PK incorrectly
    if (req.body.id && req.body.id !== req.params.id) { /* ignore */ delete emp.id; }
    await emp.save();
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
