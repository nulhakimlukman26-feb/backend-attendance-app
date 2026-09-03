const db = require('../../models');
const { uploadToR2 } = require('../../utils/r2Upload');

exports.list = async (req, res, next) => {
  try {
    const companies = await db.Company.findAll({ order: [['created_at','ASC']] });
    res.json({ ok:true, data:{ companies }});
  } catch(e){ next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, phone, address, email, logo, isDefault } = req.body;
    if (!name) return res.status(400).json({ ok:false, error:{code:'VALIDATION_ERROR', message:'Nama perusahaan wajib diisi'}});
    const existing = await db.Company.findOne({ where:{ name }});
    if (existing) return res.status(409).json({ ok:false, error:{code:'DUPLICATE', message:'Perusahaan dengan nama tersebut sudah ada'}});
    const company = await db.Company.create({ name, phone, address, email, logo, isDefault: !!isDefault });
    if (company.isDefault) {
      await db.Company.update({ isDefault: false }, { where:{ id: { [db.Sequelize.Op.ne]: company.id } } });
    }
    res.status(201).json({ ok:true, data:{ company }});
  } catch(e){ next(e); }
};

exports.getOne = async (req, res, next) => {
  try {
    const company = await db.Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    res.json({ ok:true, data:{ company }});
  } catch(e){ next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const company = await db.Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    const fields = ['name','phone','address','email','logo','isDefault'];
    for (const f of fields) if (req.body[f] !== undefined) company[f] = req.body[f];
    await company.save();
    if (company.isDefault) {
      await db.Company.update({ isDefault: false }, { where:{ id: { [db.Sequelize.Op.ne]: company.id } } });
    }
    res.json({ ok:true, data:{ company }});
  } catch(e){ next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const count = await db.Company.count();
    if (count <= 1) return res.status(400).json({ ok:false, error:{code:'LAST_COMPANY', message:'Tidak dapat menghapus perusahaan terakhir'}});
    const company = await db.Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    await company.destroy();
    res.json({ ok:true, data:{ message:'Deleted' }});
  } catch(e){ next(e); }
};

exports.activate = async (req, res, next) => {
  try {
    const company = await db.Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    await db.User.update({ activeCompanyId: company.id }, { where:{ id: req.user.sub }});
    // Also ensure AppSetting exists for this company
    await db.AppSetting.findOrCreate({ where:{ companyId: company.id }, defaults:{ companyId: company.id, companyName: company.name }});
    res.json({ ok:true, data:{ activeCompanyId: company.id }});
  } catch(e){ next(e); }
};

exports.uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:{code:'NO_FILE', message:'File logo wajib'}});
    const company = await db.Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ ok:false, error:{code:'NOT_FOUND'}});
    const key = `companies/${company.id}/logo-${Date.now()}-${req.file.originalname}`;
    const url = await uploadToR2(req.file.buffer, key, req.file.mimetype);
    if (url) company.logo = url;
    else company.logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64').slice(0,50000)}`;
    await company.save();
    res.json({ ok:true, data:{ company, fileUrl: url }});
  } catch(e){ next(e); }
};
