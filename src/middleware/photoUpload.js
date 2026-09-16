const multer = require('multer');

// Image-only upload for photo attendance (selfie check-in/out).
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp'];
    const name = (file.originalname || '').toLowerCase();
    const okExt = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
    if (allowedMime.includes(file.mimetype) && okExt) cb(null, true);
    else cb(new Error('Hanya foto JPG/PNG/WEBP yang diterima'), false);
  },
});

module.exports = photoUpload;
