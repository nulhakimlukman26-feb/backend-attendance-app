const { ZodError, z } = require('zod');

// Canonical PeriodFilter cfg as emitted by frontend PeriodPicker & MonthPicker
// Spec §18.3 #1 — backend must accept unified cfg shape
const PeriodFilter = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MONTH'),  key: z.string().regex(/^\d{4}-\d{2}$/), label: z.string() }),
  z.object({ type: z.literal('DAY'),    key: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string() }),
  z.object({ type: z.literal('WEEK'),   startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string() }),
  z.object({ type: z.literal('YEAR'),   year: z.number().int().min(2000).max(2100), label: z.string() }),
  z.object({ type: z.literal('PRESET'), preset: z.enum(['YESTERDAY','LAST_7_DAYS','LAST_30_DAYS','LAST_3_MONTHS','LAST_6_MONTHS']), label: z.string() }),
]);

// Query variant for GET endpoints — flattened + pass-through for periodKey, date, preset etc
// periodKey may hold MONTH, DAY_, YEAR_, PRESET_, WEEK_ prefixed keys plus ALL sentinel
const QueryPeriodFilter = z.object({
  periodKey: z.string().optional(),
  type: z.enum(['MONTH','DAY','WEEK','YEAR','PRESET']).optional(),
  key: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  preset: z.enum(['YESTERDAY','LAST_7_DAYS','LAST_30_DAYS','LAST_3_MONTHS','LAST_6_MONTHS']).optional(),
  label: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough();

const ThrSettingsSchema = z.object({
  wageBasisType: z.enum(['AVERAGE_WAGE_NON_BONUS','BASIC_PLUS_FIXED_ALLOWANCE','BASIC_ONLY']).optional(),
  applicableYear: z.coerce.number().int().min(2000).max(2100).optional(),
  // other thr_settings fields passthrough
}).passthrough();

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

// Optional middleware to validate unified period filter query without blocking ALL handling
function validatePeriodQuery(req, _res, next) {
  try {
    // Allow periodKey=ALL sentinel — skip strict regex for that
    if (req.query.periodKey === 'ALL') return next();
    QueryPeriodFilter.parse(req.query);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return _res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validasi period filter gagal', details: err.errors.map(e=>({ path:e.path.join('.'), message:e.message })) },
      });
    }
    next(err);
  }
}

module.exports = { validate, validatePeriodQuery, PeriodFilter, QueryPeriodFilter, ThrSettingsSchema };
