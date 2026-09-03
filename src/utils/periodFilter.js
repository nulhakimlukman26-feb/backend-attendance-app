const { z } = require('zod');
const { Op } = require('sequelize');

// ---------------------------------------------------------------------------
// Zod schemas — unified PeriodFilter cfg as emitted by frontend PeriodPicker
// src/components/ui/PeriodPicker.jsx:156 + MonthPicker.jsx:43
// ---------------------------------------------------------------------------

const PeriodFilterMonth = z.object({
  type: z.literal('MONTH'),
  key: z.string().regex(/^\d{4}-\d{2}$/, 'MONTH key must be YYYY-MM'),
  label: z.string(),
});

const PeriodFilterDay = z.object({
  type: z.literal('DAY'),
  key: z.string(), // e.g. DAY_2026-07-15
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'DAY date must be YYYY-MM-DD'),
  label: z.string(),
});

const PeriodFilterWeek = z.object({
  type: z.literal('WEEK'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string(),
});

const PeriodFilterYear = z.object({
  type: z.literal('YEAR'),
  year: z.number().int().min(2000).max(2100),
  label: z.string(),
});

const PeriodFilterPreset = z.object({
  type: z.literal('PRESET'),
  preset: z.enum(['YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_3_MONTHS', 'LAST_6_MONTHS']),
  label: z.string(),
});

const PeriodFilter = z.discriminatedUnion('type', [
  PeriodFilterMonth,
  PeriodFilterDay,
  PeriodFilterWeek,
  PeriodFilterYear,
  PeriodFilterPreset,
]);

// Allow single cfg body parse (for POST /attendance/upload? or future)
// and also query-string variant where keys are flattened.
// For GET query params we accept a superset that maps to the same shapes.

// Query schema for GET endpoints — flexible, backwards compatible with old ?periodKey=YYYY-MM
// Adds unified keys: date, startDate, endDate, year, preset, type
// periodKey may hold MONTH (2026-07) or prefixed keys (DAY_2026-07-15, YEAR_2026, PRESET_LAST_7_DAYS)
const QueryPeriodFilterSchema = z.object({
  // Legacy single key
  periodKey: z.string().optional(),
  // Unified cfg flattened
  type: z.enum(['MONTH', 'DAY', 'WEEK', 'YEAR', 'PRESET']).optional(),
  key: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  preset: z.enum(['YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_3_MONTHS', 'LAST_6_MONTHS']).optional(),
  label: z.string().optional(),
  // Legacy explicit date range already used in GET /attendance/records
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Allow ALL to mean unfiltered (PelanggaranOverview etc)
  // periodKey=ALL is handled specially before validation
  // Also department etc passes through via passthrough
}).passthrough();

// For body PeriodFilter (POST)
const BodyPeriodFilterSchema = PeriodFilter;

// ---------------------------------------------------------------------------
// Helpers — key prefix parsing (PeriodPicker.jsx:60 handling DAY_, WEEK_, YEAR_, PRESET_)
// ---------------------------------------------------------------------------

function parsePrefixedKey(raw) {
  if (!raw || typeof raw !== 'string') return { type: null, raw };
  if (raw.startsWith('DAY_')) {
    const date = raw.slice(4); // 2026-07-15
    return { type: 'DAY', key: raw, date, monthKey: date.slice(0, 7) };
  }
  if (raw.startsWith('YEAR_')) {
    const y = raw.slice(5);
    const year = parseInt(y, 10);
    return { type: 'YEAR', key: raw, year, yearStr: y };
  }
  if (raw.startsWith('WEEK_')) {
    // WEEK_2026-07-07_2026-07-13 variant (if ever used)
    const parts = raw.slice(5).split('_');
    return { type: 'WEEK', key: raw, startDate: parts[0], endDate: parts[1] };
  }
  if (raw.startsWith('PRESET_')) {
    const preset = raw.slice(7);
    return { type: 'PRESET', key: raw, preset };
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    return { type: 'MONTH', key: raw };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // bare date treated as DAY without prefix (fallback)
    return { type: 'DAY', key: `DAY_${raw}`, date: raw, monthKey: raw.slice(0, 7) };
  }
  if (/^\d{4}$/.test(raw)) {
    return { type: 'YEAR', key: `YEAR_${raw}`, year: parseInt(raw, 10), yearStr: raw };
  }
  return { type: null, raw, key: raw };
}

function normalizeMonthKey(input) {
  // Mirrors MonthPicker.jsx:18 — DAY_ → YYYY-MM and fallback non-month to latest month
  if (!input) return null;
  const parsed = parsePrefixedKey(input);
  if (parsed.type === 'DAY') return parsed.monthKey;
  if (parsed.type === 'MONTH') return parsed.key;
  if (parsed.type === 'YEAR') return null; // year has no month
  return input; // fallback as-is if already YYYY-MM
}

// Preset → date range resolver (server-side)
function resolvePreset(preset, now = new Date()) {
  // Use UTC dates but return YYYY-MM-DD strings
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  let start = new Date(end);
  let dateFrom, dateTo;
  switch (preset) {
    case 'YESTERDAY': {
      const d = new Date(end);
      d.setDate(d.getDate() - 1);
      dateFrom = toISODate(d);
      dateTo = toISODate(d);
      break;
    }
    case 'LAST_7_DAYS': {
      start.setDate(start.getDate() - 6);
      dateFrom = toISODate(start);
      dateTo = toISODate(end);
      break;
    }
    case 'LAST_30_DAYS': {
      start.setDate(start.getDate() - 29);
      dateFrom = toISODate(start);
      dateTo = toISODate(end);
      break;
    }
    case 'LAST_3_MONTHS': {
      start.setMonth(start.getMonth() - 3);
      start.setDate(start.getDate() + 1);
      dateFrom = toISODate(start);
      dateTo = toISODate(end);
      break;
    }
    case 'LAST_6_MONTHS': {
      start.setMonth(start.getMonth() - 6);
      start.setDate(start.getDate() + 1);
      dateFrom = toISODate(start);
      dateTo = toISODate(end);
      break;
    }
    default:
      return null;
  }
  return { dateFrom, dateTo };
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Main resolver — converts query + params into canonical filter
// Handles:
//  - ?periodKey=2026-07 (legacy MONTH)
//  - ?periodKey=DAY_2026-07-15
//  - ?periodKey=YEAR_2026 or ?year=2026 or ?type=YEAR&year=2026
//  - ?periodKey=ALL (unfiltered)
//  - ?type=DAY&date=2026-07-15 etc
//  - ?type=WEEK&startDate=&endDate=
//  - ?type=PRESET&preset=LAST_7_DAYS
//  - ?date=2026-07-15 (shorthand DAY)
//  - ?startDate=&endDate= (shorthand WEEK)
//  - legacy ?dateFrom=&dateTo=
// Returns normalized { type, key, label, periodKey, monthKey, date, startDate, endDate, year, preset, dateFrom, dateTo, isAll }
// ---------------------------------------------------------------------------

function resolvePeriodFilter(query = {}, params = {}) {
  // Merge params.key (route :key) into query if present
  // Express puts :key in req.params; callers should pass both
  const q = { ...query };
  // Prefer explicit query periodKey over route param unless route is non-empty and query has no periodKey
  const routeKey = params.key;
  if (routeKey && !q.periodKey && !q.key) {
    // Route :key acts as periodKey (GET /periods/:key/summary)
    q.periodKey = routeKey;
  } else if (routeKey && q.periodKey === undefined) {
    // If routeKey exists but query already has periodKey, keep query
  }

  // Handle ALL sentinel early — means no filter
  const rawPeriodKey = q.periodKey || q.key;
  if (rawPeriodKey === 'ALL') {
    return { isAll: true, type: 'ALL', periodKey: 'ALL', dateFrom: null, dateTo: null };
  }

  // If query has explicit type field, prefer structured cfg
  // Validate via zod passthrough then infer
  let parsed;
  try {
    parsed = QueryPeriodFilterSchema.parse(q);
  } catch (e) {
    // Return error indicator with zod issues
    return { error: e, isInvalid: true, raw: q };
  }

  // Priority: if type explicitly provided, build from that
  if (parsed.type) {
    switch (parsed.type) {
      case 'MONTH': {
        const key = parsed.key || parsed.periodKey;
        if (!key || !/^\d{4}-\d{2}$/.test(key)) return { isInvalid: true, error: new Error('MONTH requires key YYYY-MM'), raw: q };
        const monthKey = key;
        return { type: 'MONTH', key, label: parsed.label || key, periodKey: key, monthKey, dateFrom: `${key}-01`, dateTo: endOfMonth(key) };
      }
      case 'DAY': {
        const date = parsed.date;
        if (!date) return { isInvalid: true, error: new Error('DAY requires date'), raw: q };
        const key = parsed.key || `DAY_${date}`;
        const monthKey = date.slice(0, 7);
        return { type: 'DAY', key, label: parsed.label || date, date, periodKey: key, monthKey, dateFrom: date, dateTo: date };
      }
      case 'WEEK': {
        if (!parsed.startDate || !parsed.endDate) return { isInvalid: true, error: new Error('WEEK requires startDate & endDate'), raw: q };
        const key = parsed.key || `WEEK_${parsed.startDate}_${parsed.endDate}`;
        return { type: 'WEEK', key, label: parsed.label || `${parsed.startDate} - ${parsed.endDate}`, startDate: parsed.startDate, endDate: parsed.endDate, dateFrom: parsed.startDate, dateTo: parsed.endDate };
      }
      case 'YEAR': {
        const year = parsed.year;
        if (!year) return { isInvalid: true, error: new Error('YEAR requires year'), raw: q };
        const key = parsed.key || `YEAR_${year}`;
        return { type: 'YEAR', key, label: parsed.label || String(year), year, periodKey: key, dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
      }
      case 'PRESET': {
        if (!parsed.preset) return { isInvalid: true, error: new Error('PRESET requires preset'), raw: q };
        const key = parsed.key || `PRESET_${parsed.preset}`;
        const range = resolvePreset(parsed.preset);
        return { type: 'PRESET', key, label: parsed.label || parsed.preset, preset: parsed.preset, dateFrom: range?.dateFrom || null, dateTo: range?.dateTo || null };
      }
      default:
        break;
    }
  }

  // No explicit type — infer from periodKey / date / startDate/endDate / preset / year
  if (parsed.preset) {
    const range = resolvePreset(parsed.preset);
    return { type: 'PRESET', key: `PRESET_${parsed.preset}`, preset: parsed.preset, label: parsed.label || parsed.preset, dateFrom: range?.dateFrom || null, dateTo: range?.dateTo || null };
  }
  if (parsed.date && !parsed.periodKey && !parsed.startDate) {
    // Single date -> DAY
    const key = `DAY_${parsed.date}`;
    return { type: 'DAY', key, date: parsed.date, monthKey: parsed.date.slice(0, 7), periodKey: key, dateFrom: parsed.date, dateTo: parsed.date, label: parsed.label || parsed.date };
  }
  if (parsed.startDate || parsed.endDate) {
    const start = parsed.startDate || parsed.dateFrom;
    const end = parsed.endDate || parsed.dateTo;
    if (start && end) return { type: 'WEEK', key: `WEEK_${start}_${end}`, startDate: start, endDate: end, dateFrom: start, dateTo: end, label: parsed.label || `${start} - ${end}` };
    if (start) return { type: 'DAY', key: `DAY_${start}`, date: start, monthKey: start.slice(0, 7), dateFrom: start, dateTo: start, label: parsed.label || start };
  }
  // Legacy dateFrom/dateTo alone -> range
  if (parsed.dateFrom || parsed.dateTo) {
    if (parsed.dateFrom && parsed.dateTo) return { type: 'WEEK', key: `WEEK_${parsed.dateFrom}_${parsed.dateTo}`, startDate: parsed.dateFrom, endDate: parsed.dateTo, dateFrom: parsed.dateFrom, dateTo: parsed.dateTo, label: parsed.label || `${parsed.dateFrom} - ${parsed.dateTo}` };
    const single = parsed.dateFrom || parsed.dateTo;
    return { type: 'DAY', key: `DAY_${single}`, date: single, monthKey: single.slice(0, 7), dateFrom: single, dateTo: single, label: single };
  }
  if (parsed.year && !rawPeriodKey) {
    const y = parsed.year;
    return { type: 'YEAR', key: `YEAR_${y}`, year: y, label: parsed.label || String(y), dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
  }

  // periodKey based inference
  if (rawPeriodKey) {
    const parsedKey = parsePrefixedKey(rawPeriodKey);
    switch (parsedKey.type) {
      case 'MONTH':
        return { type: 'MONTH', key: parsedKey.key, periodKey: parsedKey.key, monthKey: parsedKey.key, label: parsed.label || parsedKey.key, dateFrom: `${parsedKey.key}-01`, dateTo: endOfMonth(parsedKey.key) };
      case 'DAY':
        return { type: 'DAY', key: parsedKey.key, date: parsedKey.date, monthKey: parsedKey.monthKey, periodKey: parsedKey.key, label: parsed.label || parsedKey.date, dateFrom: parsedKey.date, dateTo: parsedKey.date };
      case 'YEAR':
        return { type: 'YEAR', key: parsedKey.key, year: parsedKey.year, label: parsed.label || String(parsedKey.year), periodKey: parsedKey.key, dateFrom: `${parsedKey.year}-01-01`, dateTo: `${parsedKey.year}-12-31` };
      case 'WEEK':
        return { type: 'WEEK', key: parsedKey.key, startDate: parsedKey.startDate, endDate: parsedKey.endDate, label: parsed.label || parsedKey.key, dateFrom: parsedKey.startDate, dateTo: parsedKey.endDate };
      case 'PRESET': {
        const range = resolvePreset(parsedKey.preset);
        return { type: 'PRESET', key: parsedKey.key, preset: parsedKey.preset, label: parsed.label || parsedKey.preset, dateFrom: range?.dateFrom || null, dateTo: range?.dateTo || null };
      }
      default:
        // Unknown string — treat as MONTH if looks like YYYY-MM else invalid
        if (/^\d{4}-\d{2}$/.test(rawPeriodKey)) {
          return { type: 'MONTH', key: rawPeriodKey, periodKey: rawPeriodKey, monthKey: rawPeriodKey, label: parsed.label || rawPeriodKey, dateFrom: `${rawPeriodKey}-01`, dateTo: endOfMonth(rawPeriodKey) };
        }
        // Fallback: treat as invalid but still return for error handling
        return { isInvalid: true, error: new Error(`Invalid periodKey: ${rawPeriodKey}`), raw: q };
    }
  }

  // No period filter at all — unfiltered
  return { isAll: false, type: null, isEmpty: true };
}

function endOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0); // last day of month
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Sequelize where builders — convert resolved filter to DB where clauses
// AttendanceRecord has `date` DATEONLY + FK periodId; other tables have `date` or `periodKey` etc
// ---------------------------------------------------------------------------

function applyDateWhere(where, dateField, filter) {
  if (!filter || filter.isAll || filter.isEmpty || filter.isInvalid) return where;
  if (filter.dateFrom && filter.dateTo) {
    if (filter.dateFrom === filter.dateTo) where[dateField] = filter.dateFrom;
    else where[dateField] = { [Op.gte]: filter.dateFrom, [Op.lte]: filter.dateTo };
  } else if (filter.dateFrom) {
    where[dateField] = { [Op.gte]: filter.dateFrom };
  } else if (filter.dateTo) {
    where[dateField] = { [Op.lte]: filter.dateTo };
  }
  return where;
}

function applyPeriodKeyWhere(where, filter, options = {}) {
  // For tables that use periodKey column directly (KPI scores, etc)
  // If filter is MONTH/DAY (month derived) we filter by monthKey; YEAR filters by LIKE year%
  // For DAY with monthly-only storage we map to monthKey for periodKey lookup
  if (!filter || filter.isAll || filter.isEmpty || filter.isInvalid) return where;
  const keyField = options.field || 'periodKey';
  if (filter.type === 'MONTH' && filter.monthKey) {
    where[keyField] = filter.monthKey;
  } else if (filter.type === 'DAY' && filter.monthKey) {
    // KPI stores per-month keys; DAY maps to its month (MethodPicker.jsx:18 normalization)
    // Keep exact if caller wants daily granularity: check options.dailyField vs month
    if (options.useDailyDate) {
      // For point_transactions etc that filter via date LIKE, caller should use applyDateWhere instead
    } else {
      where[keyField] = filter.monthKey;
    }
  } else if (filter.type === 'YEAR' && filter.year) {
    // KPI periodKey is YYYY-MM so year = LIKE '2026-%'
    where[keyField] = { [Op.like]: `${filter.year}-%` };
  } else if (filter.type === 'WEEK' || filter.type === 'PRESET') {
    // Week/Preset have no single periodKey — leave unfiltered or use date range elsewhere
    // Do not set periodKey where; caller should filter via date field
  }
  // For YEAR/PRESET etc, do not set if ambiguous — return as is
  return where;
}

// Helper to determine if we have a meaningful filter (for 404 handling)
function isPeriodKeyMissing(filter, foundPeriod) {
  // If filter requested specific MONTH/DAY but no AttendancePeriod found → should 404
  if (!filter || filter.isAll || filter.isEmpty) return false;
  if (filter.type === 'MONTH' || filter.type === 'DAY') {
    return !foundPeriod;
  }
  return false;
}

module.exports = {
  PeriodFilter,
  BodyPeriodFilterSchema,
  QueryPeriodFilterSchema,
  parsePrefixedKey,
  normalizeMonthKey,
  resolvePreset,
  resolvePeriodFilter,
  endOfMonth,
  applyDateWhere,
  applyPeriodKeyWhere,
  isPeriodKeyMissing,
};
