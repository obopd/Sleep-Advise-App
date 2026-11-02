// Data-quality layer (spec §7). Returns issues instead of throwing so unusual but valid
// observations (daytime sleep, 03:00 bedtimes, long recovery sleep) are kept and flagged,
// never silently discarded.
//
// Issue: { level: 'error' | 'warning' | 'info', code, field?, message, ids? }
//   error   — the record cannot be stored as is (e.g. negative duration, invalid time)
//   warning — stored, but flagged for the user to check (e.g. 18 h sleep, possible duplicate)
//   info    — noted for analysis (e.g. sensor and user disagree)

import { TABLES } from './schema.js';
import { toMs, isValidTimeZone, MIN_MS, HOUR_MS } from './time.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const issue = (level, code, message, extra = {}) => ({ level, code, message, ...extra });

export function validateRecord(table, rec) {
  const def = TABLES[table];
  if (!def) return [issue('error', 'unknown_table', `Unknown table ${table}`)];
  const out = [];
  for (const f of def.fields) {
    const v = rec[f.name];
    const empty = v == null || v === '';
    if (empty) {
      if (f.required) out.push(issue('error', 'missing_required', `${f.name} is required.`, { field: f.name }));
      continue;
    }
    switch (f.type) {
      case 'uuid':
        if (!UUID.test(v)) out.push(issue('error', 'invalid_uuid', `${f.name} is not a valid id.`, { field: f.name }));
        break;
      case 'timestamptz':
        if (toMs(v) == null) out.push(issue('error', 'invalid_timestamp', `${f.name} is not a valid time.`, { field: f.name }));
        break;
      case 'enum':
        if (!f.values.includes(v)) out.push(issue('error', 'invalid_value', `${f.name} must be one of ${f.values.join(', ')}.`, { field: f.name }));
        break;
      case 'int':
      case 'numeric': {
        const n = Number(v);
        if (!Number.isFinite(n)) out.push(issue('error', 'not_a_number', `${f.name} must be a number.`, { field: f.name }));
        else if (f.type === 'int' && !Number.isInteger(n)) out.push(issue('error', 'not_an_integer', `${f.name} must be a whole number.`, { field: f.name }));
        else if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) {
          out.push(issue('error', 'out_of_range', `${f.name} must be between ${f.min} and ${f.max}${f.unit ? ` ${f.unit}` : ''}.`, { field: f.name }));
        }
        break;
      }
      default:
        break;
    }
  }
  if (rec.tz != null && !isValidTimeZone(rec.tz)) out.push(issue('error', 'invalid_timezone', `Unknown time zone "${rec.tz}".`, { field: 'tz' }));
  const specific = SPECIFIC[table];
  if (specific) out.push(...specific(rec));
  return out;
}

function ordered(rec, fieldsInOrder, labels) {
  const out = [];
  const present = fieldsInOrder.filter((f) => toMs(rec[f]) != null);
  for (let i = 1; i < present.length; i++) {
    const a = present[i - 1];
    const b = present[i];
    if (toMs(rec[b]) < toMs(rec[a])) {
      out.push(issue('error', 'impossible_order', `${labels[b]} is before ${labels[a]}.`, { field: b }));
    }
  }
  return out;
}

function endAfterStart(rec, max = null, maxLabel = '') {
  const s = toMs(rec.start_time);
  const e = toMs(rec.end_time);
  const out = [];
  if (s == null || e == null) return out;
  if (e < s) out.push(issue('error', 'negative_duration', 'End is before start.', { field: 'end_time' }));
  else if (max != null && e - s > max) out.push(issue('warning', 'unusually_long', `Longer than ${maxLabel}. Please check the times.`, { field: 'end_time' }));
  return out;
}

const SLEEP_LABELS = {
  start_time: 'Got into bed',
  attempt_time: 'Tried to sleep',
  onset_time: 'Fell asleep',
  final_awakening_time: 'Final awakening',
  end_time: 'Got out of bed',
};

const SPECIFIC = {
  sleep_episodes(r) {
    const out = ordered(r, ['start_time', 'attempt_time', 'onset_time', 'final_awakening_time', 'end_time'], SLEEP_LABELS);
    const s = toMs(r.start_time);
    const e = toMs(r.end_time);
    if (s != null && e != null) {
      const h = (e - s) / HOUR_MS;
      if (h <= 0) out.push(issue('error', 'negative_duration', 'Out of bed must be after into bed.', { field: 'end_time' }));
      else if (h > 16) out.push(issue('warning', 'unusually_long', 'More than 16 h in bed. Please check the dates.', { field: 'end_time' }));
      if (r.episode_type === 'nap' && h > 4) out.push(issue('warning', 'long_nap', 'This nap is longer than 4 h. Is it a main sleep?', { field: 'episode_type' }));
    }
    const on = toMs(r.onset_time);
    const fin = toMs(r.final_awakening_time);
    if (on != null && fin != null && r.wake_after_sleep_onset_minutes != null && Number(r.wake_after_sleep_onset_minutes) > (fin - on) / MIN_MS) {
      out.push(issue('error', 'waso_exceeds_period', 'Time awake at night is longer than the time between falling asleep and final awakening.', { field: 'wake_after_sleep_onset_minutes' }));
    }
    const att = toMs(r.attempt_time) ?? s;
    if (on != null && att != null && r.sleep_latency_minutes != null && r.sleep_latency_minutes !== '') {
      const implied = (on - att) / MIN_MS;
      if (Math.abs(implied - Number(r.sleep_latency_minutes)) > 5) {
        out.push(issue('warning', 'latency_mismatch', 'Minutes to fall asleep do not match the times entered.', { field: 'sleep_latency_minutes' }));
      }
    }
    if (e == null) out.push(issue('info', 'in_progress', 'No end time yet: episode treated as in progress.', { field: 'end_time' }));
    return out;
  },
  light_exposure_events(r) {
    const out = endAfterStart(r, 24 * HOUR_MS, '24 h');
    if (r.measurement_type === 'self_report' && r.illuminance_lux != null && r.illuminance_lux !== '') {
      out.push(issue('error', 'lux_without_sensor', 'Lux values can only come from a sensor measurement.', { field: 'illuminance_lux' }));
    }
    if (r.measurement_type === 'self_report' && (r.melanopic_edi_lux != null || r.spectral_measurement != null)) {
      out.push(issue('error', 'spectral_without_sensor', 'Melanopic or spectral values can only come from a sensor.', { field: 'melanopic_edi_lux' }));
    }
    if (r.measurement_type === 'sensor' && (r.illuminance_lux == null || r.illuminance_lux === '')) {
      out.push(issue('error', 'missing_lux', 'A sensor measurement needs a lux value.', { field: 'illuminance_lux' }));
    }
    if (Number(r.illuminance_lux) > 130000) out.push(issue('warning', 'implausible_lux', 'Above the brightest direct sunlight (~130,000 lux).', { field: 'illuminance_lux' }));
    return out;
  },
  meal_events: (r) => endAfterStart(r, 6 * HOUR_MS, '6 h'),
  activity_events: (r) => endAfterStart(r, 16 * HOUR_MS, '16 h'),
  substance_events(r) {
    const out = [];
    const caffeineUnits = ['mg', 'serving'];
    const alcoholUnits = ['standard_drink', 'ml', 'serving'];
    if (r.event_type === 'caffeine' && r.unit && !caffeineUnits.includes(r.unit)) out.push(issue('error', 'invalid_unit', 'Caffeine is recorded in mg or servings.', { field: 'unit' }));
    if (r.event_type === 'alcohol' && r.unit && !alcoholUnits.includes(r.unit)) out.push(issue('error', 'invalid_unit', 'Alcohol is recorded in standard drinks, ml or servings.', { field: 'unit' }));
    if (r.event_type === 'caffeine' && r.unit === 'mg' && Number(r.amount) > 1000) out.push(issue('warning', 'implausible_amount', 'More than 1,000 mg caffeine at once. Please check.', { field: 'amount' }));
    if (r.event_type === 'alcohol' && r.unit === 'standard_drink' && Number(r.amount) > 15) out.push(issue('warning', 'implausible_amount', 'More than 15 drinks at once. Please check.', { field: 'amount' }));
    return out;
  },
  subjective_observations(r) {
    const scaleMax = { stress: 5, energy: 5, sleepiness: 9 }[r.measure];
    if (scaleMax && Number(r.rating) > scaleMax) return [issue('error', 'out_of_range', `Rating must be 1–${scaleMax}.`, { field: 'rating' })];
    return [];
  },
  laboratory_measurements(r) {
    const units = { melatonin: ['pg/mL'], cortisol: ['nmol/L', 'ug/dL'], dlmo: ['clock_minutes'] }[r.analyte];
    if (units && r.measured_unit && !units.includes(r.measured_unit)) return [issue('error', 'invalid_unit', `${r.analyte} must be in ${units.join(' or ')}.`, { field: 'measured_unit' })];
    if (r.analyte === 'dlmo' && (Number(r.measured_value) < 0 || Number(r.measured_value) >= 1440)) return [issue('error', 'out_of_range', 'DLMO clock time must be 0–1439 minutes after midnight.', { field: 'measured_value' })];
    return [];
  },
};

/** Interval of a record for overlap checks. */
function interval(table, r) {
  const s = toMs(r.start_time ?? r.timestamp);
  const e = toMs(r.end_time) ?? s;
  return s == null ? null : [s, e];
}

/**
 * Checks across records of one table: duplicates, overlapping sleep from the same source,
 * and disagreement between sources (kept as info: both values are preserved).
 */
export function validateCollection(table, records) {
  const out = [];
  const list = records.filter((r) => interval(table, r));
  // Duplicates: same type, same start, same source.
  const seen = new Map();
  for (const r of list) {
    const key = [r.source, r.episode_type ?? r.event_type ?? r.measure ?? r.meal_category ?? '', toMs(r.start_time ?? r.timestamp), r.amount ?? r.rating ?? ''].join('|');
    if (seen.has(key)) out.push(issue('warning', 'possible_duplicate', 'Looks like a duplicate entry.', { ids: [seen.get(key), r.id] }));
    else seen.set(key, r.id);
  }
  if (table === 'sleep_episodes') {
    const sorted = [...list].sort((a, b) => interval(table, a)[0] - interval(table, b)[0]);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const [as, ae] = interval(table, sorted[i]);
        const [bs, be] = interval(table, sorted[j]);
        if (bs >= ae) break;
        if (be <= as) continue;
        const sameSource = sorted[i].source === sorted[j].source;
        out.push(sameSource
          ? issue('error', 'overlapping_sleep', 'Two sleep episodes overlap.', { ids: [sorted[i].id, sorted[j].id] })
          : issue('info', 'source_disagreement', 'A device and your own entry both describe this sleep. Both are kept; your entry is used for analysis.', { ids: [sorted[i].id, sorted[j].id] }));
      }
    }
  }
  return out;
}

export const hasErrors = (issues) => issues.some((i) => i.level === 'error');
