import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localToInstant, instantToLocal, offsetMinutes, minutesBetween, localClockMinutes, circularMean, circularSD, circularDiff, toIso,
} from '../src/core/time.js';
import { validateRecord, validateCollection, hasErrors } from '../src/core/validate.js';
import { emptyState, addRecord, updateRecord, deleteRecord, appendPredictions, migrateV1, uuid } from '../src/core/repo.js';
import { TABLES } from '../src/core/schema.js';

const NY = 'America/New_York';
const iso = (local, tz = NY) => toIso(localToInstant(local, tz).ms);

test('time: local ↔ UTC round trip in several zones', () => {
  for (const tz of ['UTC', NY, 'Asia/Seoul', 'Australia/Adelaide', 'Asia/Kathmandu']) {
    const { ms } = localToInstant('2026-03-20T23:45', tz);
    assert.equal(instantToLocal(ms, tz), '2026-03-20T23:45', tz);
  }
  assert.equal(offsetMinutes(Date.parse('2026-07-01T12:00:00Z'), NY), -240);
  assert.equal(offsetMinutes(Date.parse('2026-01-01T12:00:00Z'), NY), -300);
});

test('time: DST spring-forward gap and fall-back overlap', () => {
  // 2026-03-08 02:30 does not exist in New York
  const gap = localToInstant('2026-03-08T02:30', NY);
  assert.equal(gap.note, 'nonexistent_dst');
  assert.equal(instantToLocal(gap.ms, NY), '2026-03-08T03:30');
  // 2026-11-01 01:30 happens twice; earlier instant chosen
  const amb = localToInstant('2026-11-01T01:30', NY);
  assert.equal(amb.note, 'ambiguous_dst');
  assert.equal(new Date(amb.ms).toISOString(), '2026-11-01T05:30:00.000Z');
});

test('time: durations use elapsed time across DST (not clock subtraction)', () => {
  // 23:00 → 07:00 across the spring-forward night is 7 h of elapsed time, not 8
  assert.equal(minutesBetween(iso('2026-03-07T23:00'), iso('2026-03-08T07:00')), 7 * 60);
  // and across fall-back it is 9 h
  assert.equal(minutesBetween(iso('2026-10-31T23:00'), iso('2026-11-01T07:00')), 9 * 60);
});

test('time: travel — same instant has different local clock times', () => {
  const t = iso('2026-05-01T23:00', NY);
  assert.equal(localClockMinutes(t, NY), 23 * 60);
  assert.equal(localClockMinutes(t, 'Europe/London'), 4 * 60);
});

test('time: circular statistics', () => {
  assert.equal(circularMean([23 * 60 + 30, 30]), 0);
  assert.ok(Math.abs(circularSD([22 * 60, 0]) - 60) < 2);
  assert.equal(circularDiff(23 * 60, 60), 120);
  assert.equal(circularSD([5]), null);
});

const ep = (over = {}) => ({
  id: uuid(), user_id: uuid(), episode_type: 'main', source: 'user', tz: NY,
  created_at: toIso(Date.now()), updated_at: toIso(Date.now()),
  start_time: iso('2026-10-01T23:00'), end_time: iso('2026-10-02T07:10'), ...over,
});

test('validate: sleep crossing midnight is valid; daytime sleep is valid', () => {
  assert.deepEqual(validateRecord('sleep_episodes', ep()).filter((i) => i.level !== 'info'), []);
  const day = ep({ start_time: iso('2026-10-02T09:00'), end_time: iso('2026-10-02T16:30') });
  assert.equal(hasErrors(validateRecord('sleep_episodes', day)), false);
});

test('validate: incorrectly ordered timestamps and negative duration are errors', () => {
  const bad = ep({ onset_time: iso('2026-10-01T22:00') }); // onset before into bed
  assert.ok(validateRecord('sleep_episodes', bad).some((i) => i.code === 'impossible_order'));
  const neg = ep({ end_time: iso('2026-10-01T22:00') });
  assert.ok(hasErrors(validateRecord('sleep_episodes', neg)));
});

test('validate: missing sleep onset is allowed (not assumed = bedtime); missing end = in progress', () => {
  const r = validateRecord('sleep_episodes', ep({ end_time: undefined }));
  assert.equal(hasErrors(r), false);
  assert.ok(r.some((i) => i.code === 'in_progress'));
});

test('validate: WASO longer than the sleep period is an error; very long sleep only a warning', () => {
  const w = ep({ onset_time: iso('2026-10-01T23:30'), final_awakening_time: iso('2026-10-02T01:00'), wake_after_sleep_onset_minutes: 200 });
  assert.ok(validateRecord('sleep_episodes', w).some((i) => i.code === 'waso_exceeds_period'));
  const long = ep({ end_time: iso('2026-10-02T18:00') });
  const issues = validateRecord('sleep_episodes', long);
  assert.equal(hasErrors(issues), false);
  assert.ok(issues.some((i) => i.code === 'unusually_long'));
});

test('validate: units, invalid enums, invalid time zone, lux only from sensors', () => {
  const sub = { id: uuid(), user_id: uuid(), event_type: 'caffeine', start_time: iso('2026-10-01T09:00'), amount: 95, unit: 'standard_drink', source: 'user', tz: NY, created_at: toIso(0), updated_at: toIso(0) };
  assert.ok(validateRecord('substance_events', sub).some((i) => i.code === 'invalid_unit'));
  assert.ok(validateRecord('substance_events', { ...sub, unit: undefined }).some((i) => i.code === 'missing_required'));
  assert.ok(validateRecord('substance_events', { ...sub, unit: 'mg', tz: 'Mars/Base' }).some((i) => i.code === 'invalid_timezone'));
  const light = { id: uuid(), user_id: uuid(), start_time: iso('2026-10-01T09:00'), end_time: iso('2026-10-01T09:30'), measurement_type: 'self_report', illuminance_lux: 5000, source: 'user', tz: NY, created_at: toIso(0), updated_at: toIso(0) };
  assert.ok(validateRecord('light_exposure_events', light).some((i) => i.code === 'lux_without_sensor'));
  assert.ok(validateRecord('light_exposure_events', { ...light, measurement_type: 'sensor', illuminance_lux: 500000 }).some((i) => i.code === 'out_of_range'));
});

test('validate collection: overlap (same source) is an error, sensor vs user disagreement is kept as info, duplicates flagged', () => {
  const a = ep();
  const b = ep({ start_time: iso('2026-10-02T03:00'), end_time: iso('2026-10-02T09:00') });
  assert.ok(validateCollection('sleep_episodes', [a, b]).some((i) => i.code === 'overlapping_sleep'));
  const sensor = ep({ source: 'import_apple_health', start_time: iso('2026-10-01T23:20') });
  const res = validateCollection('sleep_episodes', [a, sensor]);
  assert.ok(res.some((i) => i.code === 'source_disagreement' && i.level === 'info'));
  assert.ok(!res.some((i) => i.level === 'error'));
  const dup = { ...a, id: uuid() };
  assert.ok(validateCollection('sleep_episodes', [a, dup]).some((i) => i.code === 'possible_duplicate'));
});

test('repo: add, correct with revision history, delete; errors leave state unchanged', () => {
  let s = emptyState(Date.parse('2026-10-01T12:00:00Z'), NY);
  const r1 = addRecord(s, 'sleep_episodes', { episode_type: 'main', start_time: iso('2026-10-01T23:00'), end_time: iso('2026-10-02T07:00') });
  assert.equal(r1.state.tables.sleep_episodes.length, 1);
  s = r1.state;
  const bad = addRecord(s, 'sleep_episodes', { episode_type: 'main', start_time: iso('2026-10-03T23:00'), end_time: iso('2026-10-03T22:00') });
  assert.equal(bad.state, s);
  const u = updateRecord(s, 'sleep_episodes', r1.record.id, { end_time: iso('2026-10-02T07:30') });
  const rec = u.state.tables.sleep_episodes[0];
  assert.equal(rec.end_time, iso('2026-10-02T07:30'));
  assert.equal(rec.revisions.length, 1);
  assert.equal(rec.revisions[0].previous.end_time, iso('2026-10-02T07:00'));
  assert.equal(rec.created_at, r1.record.created_at);
  assert.equal(deleteRecord(u.state, 'sleep_episodes', rec.id).tables.sleep_episodes.length, 0);
});

test('repo: multiple episodes per day and naps', () => {
  let s = emptyState(0, NY);
  for (const [type, a, b] of [['main', '2026-10-01T23:00', '2026-10-02T05:00'], ['nap', '2026-10-02T13:00', '2026-10-02T13:25'], ['other', '2026-10-02T19:00', '2026-10-02T20:00']]) {
    const r = addRecord(s, 'sleep_episodes', { episode_type: type, start_time: iso(a), end_time: iso(b) });
    assert.equal(r.issues.filter((i) => i.level === 'error').length, 0);
    s = r.state;
  }
  assert.equal(s.tables.sleep_episodes.length, 3);
});

test('repo: predictions are append-only', () => {
  let s = emptyState(0, NY);
  s = appendPredictions(s, [{ id: 'a' }]);
  s = appendPredictions(s, [{ id: 'b' }]);
  assert.deepEqual(s.tables.model_predictions.map((p) => p.id), ['a', 'b']);
});

test('repo: v1 migration converts nights to timestamped events and keeps the original', () => {
  const v1 = {
    profile: { birthday: '1996-03-20', workWake: '06:45', mctq: { workOnset: '00:10' }, onboarded: true },
    entries: [
      { date: '2026-10-01', bedTime: '00:15', latencyMin: 20, wakeTime: '06:45', outOfBedTime: '07:00', wasoMin: 10, quality: 3,
        caffeine: [{ time: '16:30', mg: 95 }], alcoholDrinks: 2, alcoholLastTime: '23:00', napStart: '14:00', napMin: 20, morningLightMin: 30, lastMealTime: '20:00' },
    ],
    measured: [{ date: '2026-10-05', dlmo: '21:30' }],
  };
  const s = migrateV1(v1, { tz: NY, now: Date.parse('2026-11-01T00:00:00Z') });
  const main = s.tables.sleep_episodes.find((e) => e.episode_type === 'main');
  assert.equal(main.start_time, iso('2026-10-02T00:15')); // after midnight → next calendar day
  assert.equal(main.onset_time, iso('2026-10-02T00:35'));
  assert.equal(main.final_awakening_time, iso('2026-10-02T06:45'));
  assert.equal(main.end_time, iso('2026-10-02T07:00'));
  assert.equal(s.tables.sleep_episodes.filter((e) => e.episode_type === 'nap').length, 1);
  assert.equal(s.tables.substance_events.length, 2);
  assert.equal(s.tables.light_exposure_events[0].measurement_type, 'self_report');
  assert.equal(s.tables.laboratory_measurements[0].measured_value, 21 * 60 + 30);
  assert.deepEqual(s.meta.v1_archive, v1);
  assert.equal(s.user.profile.birthday, '1996-03-20');
  assert.ok(s.tables.sleep_episodes.every((e) => e.source === 'migration_v1'));
});

test('schema: every table has id, required provenance fields and unique column names', () => {
  for (const [name, def] of Object.entries(TABLES)) {
    const cols = def.fields.map((f) => f.name);
    assert.equal(new Set(cols).size, cols.length, name);
    assert.ok(cols.includes('id') && cols.includes('source') && cols.includes('tz') || name === 'daily_features' || name === 'model_predictions', name);
  }
});

test('no backend: the app makes no network requests to other hosts', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const files = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : files.push(`${d}/${e.name}`)));
  walk(new URL('../src', import.meta.url).pathname);
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /fetch\(|XMLHttpRequest|WebSocket|https?:\/\/(?!www\.w3\.org)/, f);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /connect-src 'self';/);
});
