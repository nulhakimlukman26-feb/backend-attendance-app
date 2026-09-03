const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isXlsx = file.mimetype === allowedMime || file.originalname.toLowerCase().endsWith('.xlsx');
    if (isXlsx) cb(null, true);
    else cb(new Error('Hanya file .xlsx yang diterima'), false);
  },
});

module.exports = upload;
