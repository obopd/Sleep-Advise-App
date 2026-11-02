import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, addRecord } from '../src/core/repo.js';
import { localToInstant, toIso, HOUR_MS, DAY_MS, MIN_MS, localClockMinutes } from '../src/core/time.js';
import { deriveEpisode, analysisEpisodes } from '../src/core/sleep.js';
import { computeFeatures } from '../src/core/features.js';
import { estimateSleepPressure } from '../src/core/models/sleepPressure.js';
import { SLEEP_TIMING_PROXY, FORGER_LIGHT } from '../src/core/models/circadian.js';
import { runModels, predictionsToStore } from '../src/core/predict.js';
import { recommend } from '../src/core/recommend.js';
import { planSleep } from '../src/core/scheduler.js';
import { associations, MIN_GROUP } from '../src/core/insights.js';
import { completeness } from '../src/core/quality.js';

const NY = 'America/New_York';
const at = (local, tz = NY) => localToInstant(local, tz).ms;
const day = (base, n) => new Date(Date.parse(`${base}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Build a state with nightly sleep. spec(i) → { bed:'23:00', wake:'07:00', lat:15, type, dayType, tz } */
function person(n, spec, { start = '2026-10-01', tz = NY, profile = {} } = {}) {
  let s = emptyState(at(`${start}T00:00`, tz), tz);
  s.user.profile = profile;
  for (let i = 0; i < n; i++) {
    const o = { bed: '23:00', wake: '07:00', lat: 15, type: 'main', dayType: 'workday', tz, ...spec(i) };
    const d = day(start, i);
    // Step by calendar date (not +24 h), so DST nights get their true elapsed length.
    const bedDate = Number(o.bed.slice(0, 2)) < 12 && o.type === 'main' && !o.daytime ? day(d, 1) : d;
    const b = at(`${bedDate}T${o.bed}`, o.tz);
    let w = at(`${bedDate}T${o.wake}`, o.tz);
    if (w <= b) w = at(`${day(bedDate, 1)}T${o.wake}`, o.tz);
    const r = addRecord(s, 'sleep_episodes', {
      episode_type: o.type, start_time: toIso(b), attempt_time: toIso(b), end_time: toIso(w + 10 * MIN_MS), final_awakening_time: toIso(w),
      sleep_latency_minutes: o.lat ?? undefined, wake_after_sleep_onset_minutes: o.waso ?? undefined, day_type: o.dayType, alarm_used: o.dayType === 'workday', subjective_quality: o.q,
    }, { tz: o.tz });
    assert.equal(r.issues.filter((x) => x.level === 'error').length, 0, JSON.stringify(r.issues));
    s = r.state;
  }
  return s;
}
const endOf = (s) => Math.max(...s.tables.sleep_episodes.map((e) => Date.parse(e.end_time))) + 2 * HOUR_MS;

// ---------------------------------------------------------------- episodes

test('episode: time in bed vs sleep; onset never assumed equal to bedtime', () => {
  const e = deriveEpisode({ id: 'x', episode_type: 'main', start_time: toIso(at('2026-10-01T22:30')), attempt_time: toIso(at('2026-10-01T23:00')), sleep_latency_minutes: 20, final_awakening_time: toIso(at('2026-10-02T06:40')), end_time: toIso(at('2026-10-02T07:00')), wake_after_sleep_onset_minutes: 30 });
  assert.equal(e.tib, 510);
  assert.equal(e.period, 440);
  assert.equal(e.tst, 410);
  const unknown = deriveEpisode({ episode_type: 'main', start_time: toIso(at('2026-10-01T23:00')), end_time: toIso(at('2026-10-02T07:00')) });
  assert.equal(unknown.onset, null);
  assert.equal(unknown.tst, null);
  assert.equal(unknown.tib, 480);
});

test('analysis: user entry wins over an overlapping device record; both stay stored', () => {
  let s = person(1, () => ({}));
  s = addRecord(s, 'sleep_episodes', { episode_type: 'main', start_time: toIso(at('2026-10-01T23:20')), end_time: toIso(at('2026-10-02T06:50')), onset_time: toIso(at('2026-10-01T23:40')) }, { source: 'import_apple_health' }).state;
  assert.equal(s.tables.sleep_episodes.length, 2);
  const eps = analysisEpisodes(s.tables.sleep_episodes, endOf(s));
  assert.equal(eps.length, 1);
  assert.equal(eps[0].source, 'user');
});

// ---------------------------------------------------------------- features

test('features: regular sleeper — totals, rolling windows, regularity', () => {
  const s = person(10, () => ({}));
  const T = endOf(s);
  const f = computeFeatures(s, T).map;
  assert.equal(f.total_sleep_24h.feature_value, 465); // 23:15 → 07:00
  assert.equal(f.total_sleep_72h.feature_value, 3 * 465);
  assert.equal(f.total_sleep_24h.data_coverage, 1);
  assert.ok(f.onset_sd_7d.feature_value < 1);
  assert.ok(f.sleep_regularity_index_7d.feature_value > 99);
  assert.equal(Math.round(f.onset_mean_clock_7d.feature_value), 23 * 60 + 15);
  assert.equal(f.minutes_since_last_awakening.feature_value, 130);
  assert.equal(f.mean_daily_sleep_7d.feature_value, 465);
});

test('features: missing data is null with low coverage, never zero', () => {
  const s = person(2, () => ({ lat: null }));
  const f = computeFeatures(s, endOf(s)).map;
  assert.equal(f.total_sleep_24h.feature_value, null);
  assert.equal(f.caffeine_mg_24h.feature_value, null);
  assert.equal(f.light_lux_hours_3h.feature_value, null);
  assert.equal(f.onset_sd_7d.feature_value, null);
  assert.equal(f.sleep_regularity_index_7d.feature_value, null);
});

test('features: irregular schedule has high variability and low regularity', () => {
  const s = person(10, (i) => (i % 2 ? { bed: '22:00', wake: '06:00' } : { bed: '02:30', wake: '10:30' }));
  const f = computeFeatures(s, endOf(s)).map;
  assert.ok(f.onset_sd_7d.feature_value > 100);
  assert.ok(f.sleep_regularity_index_7d.feature_value < 50);
});

test('features: no target leakage — later data do not change features as of an earlier time', () => {
  const s = person(10, () => ({}));
  const T = at('2026-10-06T12:00');
  const before = computeFeatures(s, T).list.map((x) => x.feature_value);
  const more = addRecord(s, 'substance_events', { event_type: 'caffeine', start_time: toIso(at('2026-10-07T09:00')), amount: 200, unit: 'mg' }).state;
  assert.deepEqual(computeFeatures(more, T).list.map((x) => x.feature_value), before);
});

test('features: social jetlag from workdays vs alarm-free free days', () => {
  const s = person(14, (i) => (i % 7 >= 5 ? { bed: '01:00', wake: '10:00', dayType: 'free_day' } : {}));
  const f = computeFeatures(s, endOf(s)).map;
  // workday mid-sleep 03:07:30, free mid-sleep 05:37:30 → 150 min
  assert.equal(Math.round(f.social_jetlag_28d.feature_value), 150);
});

test('features: sensor light windows and coverage; self-report never becomes lux', () => {
  let s = person(3, () => ({}));
  const T = at('2026-10-04T12:00');
  s = addRecord(s, 'light_exposure_events', { start_time: toIso(T - 2 * HOUR_MS), end_time: toIso(T - HOUR_MS), measurement_type: 'sensor', illuminance_lux: 1000 }).state;
  s = addRecord(s, 'light_exposure_events', { start_time: toIso(T - 6 * HOUR_MS), end_time: toIso(T - 5 * HOUR_MS), measurement_type: 'self_report', indoor_outdoor_context: 'outdoor', self_reported_brightness: 'daylight' }).state;
  const f = computeFeatures(s, T).map;
  assert.equal(f.light_lux_hours_1h.feature_value, null);
  assert.equal(f.light_lux_hours_3h.feature_value, 1000);
  assert.equal(Math.round(f.light_lux_hours_3h.data_coverage * 100), 33);
  assert.equal(f.light_lux_hours_6h.feature_value, 1000);
  assert.equal(f.outdoor_minutes_24h.feature_value, 60);
});

test('features: time-zone change (travel) keeps durations; clock features use the zone at the time', () => {
  // 5 nights in New York, then 5 in Seoul at the same LOCAL times
  const s = person(10, (i) => ({ tz: i < 5 ? NY : 'Asia/Seoul' }));
  const T = endOf(s);
  const f = computeFeatures(s, T).map;
  assert.equal(f.total_sleep_24h.feature_value, 465);
  assert.ok(f.onset_sd_7d.feature_value < 1); // same local clock time in each zone
});

test('features: DST night — elapsed sleep is 1 h shorter in spring', () => {
  const s = person(1, () => ({}), { start: '2026-03-07' });
  const e = analysisEpisodes(s.tables.sleep_episodes, endOf(s))[0];
  assert.equal(e.tst, 465 - 60);
});

// ---------------------------------------------------------------- sleep pressure

test('sleep pressure: rises with wake, falls with sleep, longer wake → higher', () => {
  const s = person(5, () => ({}));
  const T1 = at('2026-10-05T09:00');
  const T2 = at('2026-10-05T22:00');
  const a = estimateSleepPressure(s.tables.sleep_episodes, T1);
  const b = estimateSleepPressure(s.tables.sleep_episodes, T2);
  assert.equal(a.status, 'ok');
  assert.ok(b.value > a.value);
  const night = a.trajectory.filter((p) => p.asleep);
  assert.ok(night[0].S > night.at(-1).S);
});

test('sleep pressure: long wake period (missed night) gives higher pressure than normal', () => {
  const normal = person(4, () => ({}));
  const T = at('2026-10-05T07:30');
  const deprived = { ...normal, tables: { ...normal.tables, sleep_episodes: normal.tables.sleep_episodes.slice(0, 3) } };
  // without the last night logged the model refuses (could be unlogged sleep)
  assert.equal(estimateSleepPressure(deprived.tables.sleep_episodes, T).status, 'insufficient_data');
  // with a short (2 h) last night, pressure in the morning is higher than after a full night
  const short = person(4, (i) => (i === 3 ? { bed: '05:00', wake: '07:00' } : {}));
  assert.ok(estimateSleepPressure(short.tables.sleep_episodes, T).value > estimateSleepPressure(normal.tables.sleep_episodes, T).value);
});

test('sleep pressure: naps lower pressure; missing onset withholds the estimate', () => {
  let s = person(4, () => ({}));
  const T = at('2026-10-05T17:00');
  const base = estimateSleepPressure(s.tables.sleep_episodes, T).value;
  s = addRecord(s, 'sleep_episodes', { episode_type: 'nap', start_time: toIso(at('2026-10-05T14:00')), attempt_time: toIso(at('2026-10-05T14:00')), sleep_latency_minutes: 5, end_time: toIso(at('2026-10-05T14:45')) }).state;
  assert.ok(estimateSleepPressure(s.tables.sleep_episodes, T).value < base);
  const noOnset = person(4, (i) => (i === 3 ? { lat: null } : {}));
  assert.equal(estimateSleepPressure(noOnset.tables.sleep_episodes, at('2026-10-05T12:00')).status, 'missing_required_features');
});

test('sleep pressure: initial-condition sensitivity is small after 72 h', () => {
  const s = person(5, () => ({}));
  const T = at('2026-10-05T20:00');
  const lo = estimateSleepPressure(s.tables.sleep_episodes, T, { initialS: 0 }).value;
  const hi = estimateSleepPressure(s.tables.sleep_episodes, T, { initialS: 1 }).value;
  assert.ok(Math.abs(hi - lo) < 0.05, `${hi - lo}`);
});

test('sleep pressure: night-shift worker with daytime sleep', () => {
  const s = person(5, () => ({ bed: '08:30', wake: '15:30', daytime: true }));
  const r = estimateSleepPressure(s.tables.sleep_episodes, at('2026-10-05T23:00'));
  assert.equal(r.status, 'ok');
  assert.ok(r.value > 0.3);
});

// ---------------------------------------------------------------- circadian (experimental)

test('circadian proxy: regular sleeper → experimental value; never claims validation', () => {
  const s = person(8, () => ({}));
  const r = SLEEP_TIMING_PROXY.predict({ state: s, T: endOf(s) });
  assert.equal(r.status, 'ok');
  assert.equal(Math.round(r.value), 21 * 60 + 15);
  assert.equal(SLEEP_TIMING_PROXY.validation_status, 'experimental_unvalidated');
});

test('circadian proxy: delayed schedule shifts the estimate later', () => {
  const s = person(8, () => ({ bed: '02:00', wake: '10:00' }));
  assert.equal(Math.round(SLEEP_TIMING_PROXY.predict({ state: s, T: endOf(s) }).value), 15);
});

test('circadian proxy: irregular sleepers, shift workers, short history, missing onset → no value', () => {
  const irregular = person(8, (i) => (i % 2 ? { bed: '22:00', wake: '06:00' } : { bed: '02:30', wake: '10:30' }));
  assert.equal(SLEEP_TIMING_PROXY.predict({ state: irregular, T: endOf(irregular) }).status, 'unsupported_population');
  const shift = person(8, () => ({}), { profile: { shift_work: 'yes' } });
  assert.equal(SLEEP_TIMING_PROXY.predict({ state: shift, T: endOf(shift) }).status, 'unsupported_population');
  const short = person(3, () => ({}));
  assert.equal(SLEEP_TIMING_PROXY.predict({ state: short, T: endOf(short) }).status, 'insufficient_data');
  const noOnset = person(8, () => ({ lat: null }));
  assert.equal(SLEEP_TIMING_PROXY.predict({ state: noOnset, T: endOf(noOnset) }).status, 'insufficient_data');
});

test('circadian light model: needs sensor light; works with continuous light data; chronotype not required', () => {
  const s = person(8, () => ({}));
  assert.equal(FORGER_LIGHT.predict({ state: s, T: endOf(s) }).status, 'insufficient_data');
  let lit = s;
  const T = endOf(s);
  for (let t = T - 8 * DAY_MS; t < T; t += HOUR_MS) {
    const clock = localClockMinutes(t, NY);
    const lux = clock >= 7 * 60 && clock < 23 * 60 ? (clock < 8 * 60 ? 3000 : 250) : 0;
    if (lux) lit = addRecord(lit, 'light_exposure_events', { start_time: toIso(t), end_time: toIso(t + HOUR_MS), measurement_type: 'sensor', illuminance_lux: lux, sensor_position: 'wrist' }, { source: 'import_light_csv' }).state;
  }
  const r = FORGER_LIGHT.predict({ state: lit, T });
  assert.equal(r.status, 'ok');
  assert.ok(r.value > 19 * 60 && r.value < 23.5 * 60, `${r.value}`);
});

test('predictions: versioned records, null value + status when unavailable, no intervals, de-duplicated daily', () => {
  const s = person(3, () => ({}));
  const T = endOf(s);
  const { records } = runModels(s, T, T);
  assert.equal(records.length, 3);
  for (const r of records) {
    assert.ok(r.model_name && r.model_version && r.validation_status === 'experimental_unvalidated');
    assert.equal(r.prediction_interval_lower, null);
    if (r.confidence_or_quality_status !== 'ok') assert.equal(r.predicted_value, null);
  }
  const s2 = { ...s, tables: { ...s.tables, model_predictions: records } };
  assert.equal(predictionsToStore(s2, records, T + HOUR_MS).length, 0);
  assert.equal(predictionsToStore(s2, records, T + 21 * HOUR_MS).length, 3);
});

// ---------------------------------------------------------------- recommendations

test('recommendations: too little data → only "log your sleep"', () => {
  const s = person(3, () => ({}));
  const recs = recommend(s, computeFeatures(s, endOf(s)), endOf(s));
  assert.deepEqual(recs.map((r) => r.id), ['collect_data']);
});

test('recommendations: short + irregular sleep with late caffeine; every rec explains itself', () => {
  let s = person(10, (i) => (i % 2 ? { bed: '01:00', wake: '06:00' } : { bed: '23:30', wake: '05:00' }), { profile: { birthday: '1990-01-01' } });
  for (let i = 0; i < 10; i++) s = addRecord(s, 'substance_events', { event_type: 'caffeine', start_time: toIso(at(`${day('2026-10-01', i)}T18:00`)), amount: 95, unit: 'mg' }).state;
  const T = endOf(s);
  const recs = recommend(s, computeFeatures(s, T), T);
  const ids = recs.map((r) => r.id);
  assert.ok(ids.includes('short_sleep'));
  assert.ok(ids.includes('late_caffeine'));
  for (const r of recs) {
    for (const k of ['action', 'reason', 'observations', 'expected_benefit', 'limitations', 'evaluate']) assert.ok(r[k] && r[k].length, `${r.id} missing ${k}`);
    assert.ok(!/melatonin supplement|light therapy|medication change/i.test(r.action));
  }
});

// ---------------------------------------------------------------- scheduler

test('scheduler: opportunity vs predicted onset are distinct; never below need', () => {
  const s = person(7, () => ({ lat: 30 }), { profile: { birthday: '1990-01-01' } });
  const now = at('2026-10-08T12:00');
  const wake = at('2026-10-09T07:00');
  const p = planSleep(s, { wakeMs: wake, now });
  assert.equal(p.opportunity.start, toIso(wake - (8 * 60 + 30) * MIN_MS));
  assert.equal(p.predictedOnset.time, toIso(wake - 8 * 60 * MIN_MS));
  const tooShort = planSleep(s, { wakeMs: at('2026-10-08T15:00'), now });
  assert.ok(tooShort.notes.some((n) => n.code === 'not_enough_time'));
  assert.ok(planSleep(s, { wakeMs: wake, now, durationHours: 6 }).notes.some((n) => n.code === 'below_range'));
});

test('scheduler: gradual shift for a late sleeper; daytime sleep for shift work', () => {
  const late = person(7, () => ({ bed: '02:00', wake: '09:00' }), { profile: { birthday: '1990-01-01' } });
  const p = planSleep(late, { wakeMs: at('2026-10-09T06:30'), now: at('2026-10-08T12:00') });
  assert.ok(p.gradual && p.gradual.days >= 8);
  const shift = person(5, () => ({ bed: '08:30', wake: '15:30', daytime: true }), { profile: { shift_work: 'yes', birthday: '1990-01-01' } });
  const q = planSleep(shift, { wakeMs: at('2026-10-07T16:00'), now: at('2026-10-07T06:00') });
  assert.equal(q.gradual, null);
  assert.ok(q.adaptive);
  assert.equal(new Date(q.opportunity.start).getTime() < at('2026-10-07T16:00'), true);
});

// ---------------------------------------------------------------- insights & quality

test('insights: association needs enough nights in both groups and is worded as an association', () => {
  let s = person(14, (i) => (i % 2 ? { lat: 45 } : { lat: 10 }));
  for (let i = 0; i < 14; i += 2 * 0 + 1) {
    if (i % 2) s = addRecord(s, 'substance_events', { event_type: 'caffeine', start_time: toIso(at(`${day('2026-10-01', i)}T19:00`)), amount: 95, unit: 'mg' }).state;
    else s = addRecord(s, 'substance_events', { event_type: 'caffeine', start_time: toIso(at(`${day('2026-10-01', i)}T08:00`)), amount: 95, unit: 'mg' }).state;
  }
  const res = associations(s, endOf(s));
  const caf = res.associations[0];
  assert.equal(caf.status, 'ok');
  assert.equal(Math.round(caf.diffs.latency), 35);
  assert.match(caf.sentence, /^On days when you had caffeine/);
  assert.doesNotMatch(caf.sentence, /caus/);
  const few = associations(person(4, () => ({})), endOf(person(4, () => ({}))));
  assert.ok(few.associations.every((a) => a.status === 'too_few'));
  assert.ok(MIN_GROUP >= 5);
});

test('quality: completeness reports days covered, missing onset, issues', () => {
  const s = person(5, (i) => (i === 2 ? { lat: null } : {}));
  const q = completeness(s, endOf(s));
  assert.equal(q.daysWithMainSleep, 5);
  assert.equal(q.withOnset, 0.8);
  assert.equal(q.issues.filter((i) => i.level === 'error').length, 0);
});
