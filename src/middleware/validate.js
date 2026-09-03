const { ZodError } = require('zod');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const data = req[source];
      const parsed = schema.parse(data);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validasi gagal',
            details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
          },
        });
      }
      next(err);
    }
  };
}

module.exports = { validate };
