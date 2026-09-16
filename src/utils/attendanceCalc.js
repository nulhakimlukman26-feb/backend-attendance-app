/**
 * Telat (lateness) & Lembur (overtime) calculation.
 *
 * Sources of truth:
 * - thresholds come from per-company app_settings
 *   (normalStart, overtimeStart, latePenaltyPerMinute, latePenaltyMaxMinutes,
 *    maxOvertimeMinutes, overtimeRatePerHour)
 * - hourly overtime rate prefers the employee's own overtimeRate
 *
 * Time strings are "HH:mm" (also accepts "HH:mm:ss").
 */

// "09:15" / "09:15:00" -> minutes since midnight, or null when missing/invalid.
function toMinutes(str) {
  if (str === null || str === undefined) return null;
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function settingsOrDefaults(settings) {
  const s = settings && typeof settings.toJSON === 'function' ? settings.toJSON() : (settings || {});
  return {
    normalStart: s.normalStart || '09:00',
    overtimeStart: s.overtimeStart || '18:30',
    latePenaltyPerMinute: s.latePenaltyPerMinute !== undefined && s.latePenaltyPerMinute !== null
      ? parseInt(s.latePenaltyPerMinute, 10) : 1000,
    latePenaltyMaxMinutes: s.latePenaltyMaxMinutes !== undefined && s.latePenaltyMaxMinutes !== null
      ? parseInt(s.latePenaltyMaxMinutes, 10) : 30,
    maxOvertimeMinutes: s.maxOvertimeMinutes !== undefined && s.maxOvertimeMinutes !== null
      ? parseInt(s.maxOvertimeMinutes, 10) : 240,
    overtimeRatePerHour: s.overtimeRatePerHour !== undefined && s.overtimeRatePerHour !== null
      ? parseFloat(s.overtimeRatePerHour) : 9000,
  };
}

// Per-day result: { lateMinutes, lateDeduction, overtimeMinutes, overtimePay }.
// Missing/invalid times contribute 0 (e.g. absent or half-day rows).
function calcDay({ checkIn, checkOut }, settings, employee) {
  const cfg = settingsOrDefaults(settings);
  const inMin = toMinutes(checkIn);
  const outMin = toMinutes(checkOut);
  const startMin = toMinutes(cfg.normalStart);
  const otStartMin = toMinutes(cfg.overtimeStart);

  let lateMinutes = 0;
  if (inMin !== null && startMin !== null && inMin > startMin) {
    lateMinutes = Math.min(inMin - startMin, Math.max(cfg.latePenaltyMaxMinutes, 0));
  }
  const lateDeduction = lateMinutes * Math.max(cfg.latePenaltyPerMinute, 0);

  let overtimeMinutes = 0;
  if (outMin !== null && otStartMin !== null && outMin > otStartMin) {
    overtimeMinutes = Math.min(outMin - otStartMin, Math.max(cfg.maxOvertimeMinutes, 0));
  }
  const empRate = employee && employee.overtimeRate !== undefined && employee.overtimeRate !== null
    ? parseFloat(employee.overtimeRate) : NaN;
  const rate = Number.isFinite(empRate) ? empRate : cfg.overtimeRatePerHour;
  const overtimePay = Math.round((overtimeMinutes / 60) * Math.max(rate, 0));

  return { lateMinutes, lateDeduction, overtimeMinutes, overtimePay };
}

function zeroTotals() {
  return { lateMinutes: 0, lateDeduction: 0, overtimeMinutes: 0, overtimePay: 0 };
}

function addTotals(a, b) {
  return {
    lateMinutes: a.lateMinutes + b.lateMinutes,
    lateDeduction: a.lateDeduction + b.lateDeduction,
    overtimeMinutes: a.overtimeMinutes + b.overtimeMinutes,
    overtimePay: a.overtimePay + b.overtimePay,
  };
}

module.exports = { toMinutes, settingsOrDefaults, calcDay, zeroTotals, addTotals };
