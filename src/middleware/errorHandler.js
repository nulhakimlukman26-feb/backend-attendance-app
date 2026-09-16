// Global error handler - must have 4 args
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Sequelize wraps the real driver error in .parent/.original — log it so
  // DB connection failures (ECONNREFUSED, Access denied, Unknown database…)
  // are visible instead of just a stack line.
  const rootMsg = err?.parent?.message || err?.original?.message || err?.cause?.message;
  console.error('[error]', err.message, rootMsg ? `| caused by: ${rootMsg}` : '', err.stack?.split('\n').slice(0, 4).join(' | ') || '');

  if (err.code === 'LIMIT_FILE_SIZE' || err.message?.includes('File too large')) {
    return res.status(413).json({ ok: false, error: { code: 'FILE_TOO_LARGE', message: 'File melebihi batas 10MB' } });
  }
  if (err.message === 'Hanya file .xlsx yang diterima') {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_FILE_TYPE', message: err.message } });
  }
  if (err.message === 'Hanya foto JPG/PNG/WEBP yang diterima') {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_PHOTO_TYPE', message: err.message } });
  }
  // Multer errors
  if (err instanceof require('multer').MulterError) {
    return res.status(400).json({ ok: false, error: { code: 'UPLOAD_ERROR', message: err.message } });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    ok: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Terjadi kesalahan server',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

module.exports = errorHandler;
