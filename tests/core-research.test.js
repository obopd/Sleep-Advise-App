import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, addRecord, appendPredictions } from '../src/core/repo.js';
import { localToInstant, toIso, HOUR_MS } from '../src/core/time.js';
import { buildExport, csvCell, evaluate, evaluateBySubgroup, pairWithReference, participantSplit, temporalSplit, scheduleGroup, dataDictionaryCsv } from '../src/core/research.js';
import { TABLES } from '../src/core/schema.js';
import { FEATURE_DEFS } from '../src/core/features.js';

const NY = 'America/New_York';
const at = (l) => localToInstant(l, NY).ms;

function sample() {
  let s = emptyState(at('2026-10-01T00:00'), NY);
  s = addRecord(s, 'sleep_episodes', { episode_type: 'main', start_time: toIso(at('2026-10-01T23:00')), sleep_latency_minutes: 15, end_time: toIso(at('2026-10-02T07:00')) }).state;
  s = addRecord(s, 'medication_events', { medication_identifier: 'X', timestamp: toIso(at('2026-10-02T08:00')) }).state;
  s = addRecord(s, 'laboratory_measurements', { collection_timestamp: toIso(at('2026-10-02T21:00')), analyte: 'dlmo', measured_value: 1290, measured_unit: 'clock_minutes', sample_type: 'derived' }, { source: 'laboratory' }).state;
  s = appendPredictions(s, [{ id: 'p1', user_id: s.user.id, target_variable: 'dlmo_clock_time', predicted_value: 1275, confidence_or_quality_status: 'ok', model_name: 'm', model_version: '1', generated_at: toIso(at('2026-10-02T12:00')), prediction_timestamp: toIso(at('2026-10-02T12:00')), input_data_window: { end: toIso(at('2026-10-02T12:00')) }, validation_status: 'experimental_unvalidated' }]);
  return s;
}

test('export: separate files per category; pseudonymous; sensitive data opt-in; local times + missing indicators', () => {
  const s = sample();
  const files = buildExport(s, { now: at('2026-10-03T12:00'), featureDays: 1 });
  const names = files.map((f) => f.name);
  for (const n of ['observations_sleep_episodes.csv', 'derived_features.csv', 'model_predictions.csv', 'laboratory_measurements.csv', 'data_dictionary.csv', 'manifest.json']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('observations_medication_events.csv'));
  assert.ok(buildExport(s, { includeSensitive: true, featureDays: 0 }).some((f) => f.name === 'observations_medication_events.csv'));
  const sleep = files.find((f) => f.name === 'observations_sleep_episodes.csv').content;
  assert.ok(!sleep.includes(s.user.id));
  assert.ok(sleep.includes(s.research.participant_id));
  assert.ok(sleep.includes('2026-10-01T23:00'));
  assert.ok(sleep.split('\n')[0].includes('missing_fields'));
  assert.ok(!files.find((f) => f.name === 'model_predictions.csv').content.includes('clock_minutes,derived'));
  const m = JSON.parse(files.find((f) => f.name === 'manifest.json').content);
  assert.ok(m.models.every((x) => x.validation_status === 'experimental_unvalidated'));
  assert.ok(!JSON.stringify(m).includes(s.user.id));
});

test('csv: quoting and JSON cells', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
});

test('data dictionary documents every column and feature', () => {
  const dd = dataDictionaryCsv();
  for (const [t, def] of Object.entries(TABLES)) for (const f of def.fields) assert.ok(dd.includes(`${t},`) && dd.includes(`,${f.name},`), `${t}.${f.name}`);
  for (const n of Object.keys(FEATURE_DEFS)) assert.ok(dd.includes(`derived_features,derived,${n},`), n);
});

test('metrics: MAE, RMSE, signed error; circular errors across midnight', () => {
  const lin = evaluate([{ predicted: 10, observed: 12 }, { predicted: 20, observed: 16 }]);
  assert.equal(lin.mae, 3);
  assert.equal(lin.meanSignedError, 1);
  assert.equal(Math.round(lin.rmse * 1000), Math.round(Math.sqrt(10) * 1000));
  // 23:50 predicted vs 00:10 observed = 20 min error, not 1420
  const circ = evaluate([{ predicted: 1430, observed: 10 }], { circular: true });
  assert.equal(circ.mae, 20);
  assert.equal(circ.meanSignedError, -20);
  assert.equal(evaluate([{ predicted: null, observed: 5 }]).n, 0);
});

test('metrics: interval coverage only over predictions that have intervals (incl. wrap-around)', () => {
  const r = evaluate([{ predicted: 0, observed: 30, lower: 1400, upper: 60 }, { predicted: 0, observed: 200, lower: 1400, upper: 60 }, { predicted: 5, observed: 5 }], { circular: true });
  assert.equal(r.nWithInterval, 2);
  assert.equal(r.intervalCoverage, 0.5);
});

test('subgroups are reported separately', () => {
  const pairs = [{ predicted: 0, observed: 10, g: 'regular' }, { predicted: 0, observed: 120, g: 'shift_work' }];
  const res = evaluateBySubgroup(pairs, (p) => p.g, { circular: true });
  assert.equal(res.regular.mae, 10);
  assert.equal(res.shift_work.mae, 120);
  assert.equal(scheduleGroup({ shiftWork: true }), 'shift_work');
  assert.equal(scheduleGroup({ onsetSdMin: 30 }), 'regular');
  assert.equal(scheduleGroup({ onsetSdMin: 90 }), 'irregular');
});

test('pairing: only predictions made before the measurement are used (no leakage)', () => {
  const s = sample();
  const lab = s.tables.laboratory_measurements;
  const later = { ...s.tables.model_predictions[0], id: 'late', predicted_value: 1000, generated_at: toIso(at('2026-10-03T08:00')) };
  const pairs = pairWithReference([...s.tables.model_predictions, later], lab);
  assert.equal(pairs[0].prediction_id, 'p1');
  assert.equal(pairs[0].predicted, 1275);
  const none = pairWithReference([later], lab);
  assert.equal(none[0].prediction_status, 'no_prediction_before_measurement');
  assert.equal(none[0].predicted, null);
});

test('splits: participant-level (no participant in both) and temporal ordering', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `P-${i}`);
  const { train, test: tst } = participantSplit([...ids, ...ids]);
  assert.equal(train.size + tst.size, 200);
  for (const id of tst) assert.ok(!train.has(id));
  assert.ok(tst.size > 30 && tst.size < 90);
  const rows = [{ collection_timestamp: '2026-01-01T00:00:00Z' }, { collection_timestamp: '2026-06-01T00:00:00Z' }];
  const sp = temporalSplit(rows, '2026-03-01T00:00:00Z');
  assert.equal(sp.development.length, 1);
  assert.equal(sp.evaluation.length, 1);
});
