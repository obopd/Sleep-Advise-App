// Research infrastructure (spec §11): exports, data dictionary, validation metrics,
// leakage-safe pairing of predictions with laboratory measurements, and data splits.
//
// Exports keep the four data categories in separate files: observations, derived features,
// model predictions and laboratory reference measurements. Research exports replace the
// account id with the pseudonymous participant id.

import { TABLES, OBSERVATION_TABLES } from './schema.js';
import { FEATURE_DEFS, FEATURE_VERSION, computeFeatures } from './features.js';
import { instantToLocal, toMs, toIso, circularDiff, DAY_MS } from './time.js';
import { SLEEP_PRESSURE_MODEL } from './models/sleepPressure.js';
import { CIRCADIAN_MODELS } from './models/circadian.js';
import { RULES_VERSION } from './recommend.js';

export const EXPORT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------- CSV

export function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (columns, rows) => [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n');

/** Columns for an observation table: schema fields + local clock time for each instant + missing list. */
function observationColumns(table, pseudonymous) {
  const cols = [];
  for (const f of TABLES[table].fields) {
    if (f.name === 'user_id') cols.push(pseudonymous ? 'participant_id' : 'user_id');
    else if (f.name === 'revisions') cols.push('revision_count');
    else cols.push(f.name);
    if (f.type === 'timestamptz' && !['created_at', 'updated_at'].includes(f.name)) cols.push(`${f.name}_local`);
  }
  cols.push('missing_fields');
  return cols;
}

function observationRow(table, r, { pseudonymous, participantId }) {
  const row = { ...r };
  if (pseudonymous) {
    delete row.user_id;
    row.participant_id = participantId;
  }
  row.revision_count = (r.revisions ?? []).length;
  for (const f of TABLES[table].fields) {
    if (f.type === 'timestamptz' && r[f.name]) row[`${f.name}_local`] = instantToLocal(r[f.name], r.tz);
  }
  row.missing_fields = TABLES[table].fields.filter((f) => !['revisions', 'user_id'].includes(f.name) && (r[f.name] == null || r[f.name] === '')).map((f) => f.name).join(' ');
  return row;
}

/**
 * Build all export files. Returns [{ name, content, mime }].
 * pseudonymous: replace user_id with participant_id (default for research exports).
 * featureDays: daily feature snapshots (as of each local midnight) for this many days.
 */
export function buildExport(state, { now = Date.now(), pseudonymous = true, featureDays = 30, includeSensitive = false } = {}) {
  const pid = state.research.participant_id;
  const files = [];
  const opts = { pseudonymous, participantId: pid };
  for (const t of OBSERVATION_TABLES) {
    if (TABLES[t].sensitive && !includeSensitive) continue;
    files.push({ name: `observations_${t}.csv`, mime: 'text/csv', content: toCsv(observationColumns(t, pseudonymous), state.tables[t].map((r) => observationRow(t, r, opts))) });
  }
  // Derived features: daily snapshots as of each midnight UTC-free instant (end of each 24 h block before now).
  const featRows = [];
  for (let d = featureDays; d >= 0; d--) {
    const T = now - d * DAY_MS;
    for (const f of computeFeatures(state, T).list) featRows.push({ [pseudonymous ? 'participant_id' : 'user_id']: pseudonymous ? pid : state.user.id, ...f, generated_at: toIso(now) });
  }
  const featCols = [pseudonymous ? 'participant_id' : 'user_id', 'feature_window_start', 'feature_window_end', 'feature_name', 'feature_value', 'feature_unit', 'data_coverage', 'feature_version', 'generated_at'];
  files.push({ name: 'derived_features.csv', mime: 'text/csv', content: toCsv(featCols, featRows) });
  // Predictions — separate file, never merged with lab values.
  const predCols = TABLES.model_predictions.fields.map((f) => (f.name === 'user_id' && pseudonymous ? 'participant_id' : f.name));
  files.push({ name: 'model_predictions.csv', mime: 'text/csv', content: toCsv(predCols, state.tables.model_predictions.map((p) => (pseudonymous ? { ...p, participant_id: pid, user_id: undefined } : p))) });
  // Reference measurements — separate file.
  const labCols = [...TABLES.laboratory_measurements.fields.map((f) => f.name), 'collection_timestamp_local'];
  files.push({ name: 'laboratory_measurements.csv', mime: 'text/csv', content: toCsv(labCols, state.tables.laboratory_measurements.map((l) => ({ ...l, collection_timestamp_local: instantToLocal(l.collection_timestamp, l.tz) }))) });
  files.push({ name: 'data_dictionary.csv', mime: 'text/csv', content: dataDictionaryCsv() });
  files.push({ name: 'manifest.json', mime: 'application/json', content: JSON.stringify(manifest(state, now, pseudonymous), null, 2) });
  return files;
}

export function manifest(state, now, pseudonymous) {
  return {
    export_version: EXPORT_VERSION,
    exported_at: toIso(now),
    identifier: pseudonymous ? { participant_id: state.research.participant_id } : { user_id: state.user.id },
    timezone_at_export: state.user.timezone,
    feature_version: FEATURE_VERSION,
    models: [SLEEP_PRESSURE_MODEL, ...CIRCADIAN_MODELS].map((m) => ({ name: m.name, version: m.version, target: m.target, validation_status: m.validation_status })),
    rules_version: RULES_VERSION,
    missing_data: 'Empty cell = not recorded (never zero). `missing_fields` lists empty schema fields per row. Features: null value = unavailable; data_coverage gives the share of the window with the needed data.',
    time: 'All *_time / timestamp columns are UTC ISO-8601. *_local columns give local wall-clock time in the row\'s tz.',
    categories: { observations: 'observations_*.csv', derived: 'derived_features.csv', predictions: 'model_predictions.csv', reference: 'laboratory_measurements.csv' },
  };
}

export function dataDictionaryCsv() {
  const rows = [];
  for (const [table, def] of Object.entries(TABLES)) {
    for (const f of def.fields) rows.push({ dataset: table, category: def.category, column: f.name, type: f.type, unit: f.unit ?? '', allowed_values: f.values?.join('|') ?? '', required: f.required ? 'yes' : 'no', description: f.description });
  }
  for (const [name, d] of Object.entries(FEATURE_DEFS)) rows.push({ dataset: 'derived_features', category: 'derived', column: name, type: 'numeric', unit: d.unit, allowed_values: '', required: 'no', description: d.description });
  return toCsv(['dataset', 'category', 'column', 'type', 'unit', 'allowed_values', 'required', 'description'], rows);
}

// ---------------------------------------------------------------------------- Metrics

/**
 * Metrics for (predicted, observed) pairs. circular=true for clock times (minutes, period 1440):
 * errors are the signed shortest difference on the 24 h circle.
 */
export function evaluate(pairs, { circular = false } = {}) {
  const usable = pairs.filter((p) => p.predicted != null && p.observed != null);
  const err = usable.map((p) => (circular ? circularDiff(p.observed, p.predicted) : p.predicted - p.observed));
  const n = err.length;
  if (!n) return { n: 0, mae: null, rmse: null, meanSignedError: null, intervalCoverage: null, nWithInterval: 0 };
  const withPi = usable.filter((p) => p.lower != null && p.upper != null);
  const inside = withPi.filter((p) => (circular ? inCircularInterval(p.observed, p.lower, p.upper) : p.observed >= p.lower && p.observed <= p.upper));
  return {
    n,
    mae: err.reduce((s, e) => s + Math.abs(e), 0) / n,
    rmse: Math.sqrt(err.reduce((s, e) => s + e * e, 0) / n),
    meanSignedError: err.reduce((s, e) => s + e, 0) / n,
    withinThreshold: (t) => err.filter((e) => Math.abs(e) <= t).length / n,
    intervalCoverage: withPi.length ? inside.length / withPi.length : null,
    nWithInterval: withPi.length,
  };
}

function inCircularInterval(x, lo, hi) {
  const span = ((hi - lo) % 1440 + 1440) % 1440;
  return ((x - lo) % 1440 + 1440) % 1440 <= span;
}

/** Evaluate separately per subgroup (e.g. regular / irregular / shift work). */
export function evaluateBySubgroup(pairs, groupOf, opts) {
  const groups = {};
  for (const p of pairs) (groups[groupOf(p)] ??= []).push(p);
  return Object.fromEntries(Object.entries(groups).map(([g, ps]) => [g, evaluate(ps, opts)]));
}

/**
 * Pair each reference measurement with the latest prediction that could have been made
 * BEFORE it: generated_at ≤ collection time and input window end ≤ collection time.
 * Predictions without a value (status ≠ ok) are reported as unpaired, not as errors.
 */
export function pairWithReference(predictions, measurements, { target = 'dlmo_clock_time', analyte = 'dlmo', modelName = null, maxAgeHours = 48 } = {}) {
  const preds = predictions.filter((p) => p.target_variable === target && (!modelName || p.model_name === modelName));
  return measurements.filter((m) => m.analyte === analyte).map((m) => {
    const tc = toMs(m.collection_timestamp);
    const eligible = preds.filter((p) => toMs(p.generated_at) <= tc && toMs(p.input_data_window?.end ?? p.prediction_timestamp) <= tc && tc - toMs(p.generated_at) <= maxAgeHours * 3_600_000);
    const p = eligible.sort((a, b) => toMs(b.generated_at) - toMs(a.generated_at))[0] ?? null;
    return {
      measurement_id: m.id,
      participant_id: m.participant_id,
      observed: Number(m.measured_value),
      predicted: p?.confidence_or_quality_status === 'ok' ? Number(p.predicted_value) : null,
      lower: p?.prediction_interval_lower ?? null,
      upper: p?.prediction_interval_upper ?? null,
      prediction_id: p?.id ?? null,
      prediction_status: p ? p.confidence_or_quality_status : 'no_prediction_before_measurement',
      model: p ? `${p.model_name}@${p.model_version}` : null,
      qc: m.quality_control_status ?? null,
    };
  });
}

/** Deterministic participant-level split: all of a participant's data lands in one set. */
export function participantSplit(participantIds, { testFraction = 0.3, salt = 'v1' } = {}) {
  const hash = (s) => {
    let h = 2166136261;
    for (const c of `${salt}:${s}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h / 2 ** 32;
  };
  const test = new Set();
  const train = new Set();
  for (const id of new Set(participantIds)) (hash(id) < testFraction ? test : train).add(id);
  return { train, test };
}

/** Temporal split: rows strictly before the cutoff for development, at/after for evaluation. */
export function temporalSplit(rows, cutoffIso, field = 'collection_timestamp') {
  const c = toMs(cutoffIso);
  return { development: rows.filter((r) => toMs(r[field]) < c), evaluation: rows.filter((r) => toMs(r[field]) >= c) };
}

/** Subgroup label for a participant from their features. */
export function scheduleGroup({ shiftWork, onsetSdMin }) {
  if (shiftWork) return 'shift_work';
  if (onsetSdMin == null) return 'unknown';
  return onsetSdMin <= 60 ? 'regular' : 'irregular';
}
