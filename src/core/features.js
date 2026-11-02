// Feature engineering (Layer 3): turns observations into model-ready values at an
// "as-of" instant T. Only data at or before T is used (no target leakage). Every feature
// carries a unit and a data_coverage; unavailable features are null, never 0.
//
// Windows are rolling (e.g. the 24 h before T), not calendar days. See
// docs/DATA_DICTIONARY.md → Features for definitions.

import { analysisEpisodes, sleepIntervals, bedIntervals, overlapMinutes } from './sleep.js';
import { toMs, toIso, HOUR_MS, DAY_MS, MIN_MS, localClockMinutes, circularMean, circularSD, circularDiff } from './time.js';
import { mctq, chronotypeFromProfile } from './chronotype.js';

export const FEATURE_VERSION = '1.0.0';

export const FEATURE_DEFS = {
  total_sleep_24h: { unit: 'min', description: 'Total sleep time (onset→final awakening − WASO) within the 24 h before T.' },
  total_sleep_48h: { unit: 'min', description: 'As above, 48 h.' },
  total_sleep_72h: { unit: 'min', description: 'As above, 72 h.' },
  time_in_bed_24h: { unit: 'min', description: 'Time in bed within the 24 h before T.' },
  mean_daily_sleep_7d: { unit: 'min/day', description: 'Total sleep in the 7 days before T divided by the number of 24 h blocks that contain a logged main sleep.' },
  minutes_since_last_awakening: { unit: 'min', description: 'Elapsed time since the most recent final awakening at or before T.' },
  minutes_since_last_sleep_episode: { unit: 'min', description: 'Elapsed time since the end of the most recent sleep episode (any type).' },
  onset_sd_7d: { unit: 'min', description: 'Circular SD of local clock time of main-sleep onset, 7 days. Needs ≥ 3 onsets.' },
  wake_sd_7d: { unit: 'min', description: 'Circular SD of local clock time of final awakening (main sleep), 7 days. Needs ≥ 3.' },
  onset_mean_clock_7d: { unit: 'clock_minutes_local', description: 'Circular mean local clock time of main-sleep onset, 7 days.' },
  wake_mean_clock_7d: { unit: 'clock_minutes_local', description: 'Circular mean local clock time of final awakening, 7 days.' },
  waso_mean_7d: { unit: 'min', description: 'Mean reported wake after sleep onset, main sleep, 7 days.' },
  latency_mean_7d: { unit: 'min', description: 'Mean time from trying to sleep to sleep onset, 7 days (episodes where it is known).' },
  nap_minutes_7d: { unit: 'min', description: 'Time in bed for naps, 7 days.' },
  nap_count_7d: { unit: 'count', description: 'Number of naps, 7 days.' },
  sleep_regularity_index_7d: { unit: 'index −100…100', description: 'Sleep Regularity Index (Phillips 2017) from minute-by-minute sleep/wake state 24 h apart, using only pairs of 24 h blocks that both contain a logged main sleep. Needs ≥ 2 such pairs.' },
  social_jetlag_28d: { unit: 'min', description: '|mid-sleep on free days − mid-sleep on workdays| (Wittmann 2006), main sleeps of the last 28 days labelled with day type. Needs ≥ 2 workdays and ≥ 1 alarm-free free day.' },
  light_lux_hours_1h: { unit: 'lux·h', description: 'Integrated sensor illuminance in the hour before T. Null when no sensor data; coverage = fraction of the window with sensor data.' },
  light_lux_hours_3h: { unit: 'lux·h', description: 'As above, 3 h.' },
  light_lux_hours_6h: { unit: 'lux·h', description: 'As above, 6 h.' },
  light_lux_hours_12h: { unit: 'lux·h', description: 'As above, 12 h.' },
  outdoor_minutes_24h: { unit: 'min', description: 'Self-reported outdoor/daylight periods in the 24 h before T.' },
  minutes_since_last_caffeine: { unit: 'min', description: 'Elapsed time since the last recorded caffeine.' },
  caffeine_mg_8h: { unit: 'mg', description: 'Recorded caffeine (mg) in the 8 h before T. Null if nothing recorded.' },
  caffeine_mg_24h: { unit: 'mg', description: 'As above, 24 h.' },
  minutes_since_last_alcohol: { unit: 'min', description: 'Elapsed time since the last recorded alcohol.' },
  alcohol_drinks_24h: { unit: 'standard drinks', description: 'Recorded alcohol in the 24 h before T.' },
  minutes_since_last_meal: { unit: 'min', description: 'Elapsed time since the end (or start) of the last recorded meal.' },
  activity_minutes_24h: { unit: 'min', description: 'Recorded activity in the 24 h before T.' },
  minutes_since_last_activity: { unit: 'min', description: 'Elapsed time since the end of the last recorded activity.' },
  stress_latest: { unit: 'rating (scale per record)', description: 'Most recent stress rating at or before T.' },
  stress_mean_24h: { unit: 'rating', description: 'Mean stress rating in the 24 h before T.' },
  chronotype_msfsc: { unit: 'clock_minutes_local', description: 'MCTQ mid-sleep on free days corrected for sleep debt (questionnaire).' },
};

const up = (rows, T) => rows.filter((r) => toMs(r.start_time ?? r.timestamp) <= T);

function feature(name, value, coverage, w0, w1) {
  return {
    feature_name: name,
    feature_value: value == null || Number.isNaN(value) ? null : Math.round(value * 100) / 100,
    feature_unit: FEATURE_DEFS[name].unit,
    data_coverage: coverage == null ? null : Math.round(Math.max(0, Math.min(1, coverage)) * 1000) / 1000,
    feature_window_start: toIso(w0),
    feature_window_end: toIso(w1),
    feature_version: FEATURE_VERSION,
  };
}

/** 24 h blocks ending at T that contain the end of a logged main sleep. */
function coveredBlocks(mains, T, days) {
  const covered = [];
  for (let d = 0; d < days; d++) {
    const b1 = T - d * DAY_MS;
    const b0 = b1 - DAY_MS;
    covered.push(mains.some((e) => (e.wake ?? e.end ?? T) > b0 && (e.wake ?? e.end ?? T) <= b1));
  }
  return covered; // index 0 = most recent block
}

/** Compute all features as of instant T. Returns { list, map }. */
export function computeFeatures(state, T = Date.now(), { tz = state.user.timezone } = {}) {
  const t = state.tables;
  const eps = analysisEpisodes(t.sleep_episodes, T).filter((e) => e.start <= T);
  const mains = eps.filter((e) => e.type === 'main');
  const asleep = sleepIntervals(eps, T);
  const list = [];
  const add = (...a) => list.push(feature(...a));

  // ---- Sleep totals over rolling windows
  for (const h of [24, 48, 72]) {
    const w0 = T - h * HOUR_MS;
    const inWin = eps.filter((e) => (e.end ?? T) > w0);
    const known = inWin.filter((e) => e.onset != null);
    const blocks = coveredBlocks(mains, T, h / 24);
    const blockCov = blocks.filter(Boolean).length / blocks.length;
    const onsetCov = inWin.length ? known.length / inWin.length : 0;
    const total = asleep.reduce((s, iv) => s + overlapMinutes(iv, w0, T), 0)
      - known.reduce((s, e) => s + ((e.waso ?? 0) * (overlapMinutes([e.onset, e.wake ?? T], w0, T) / Math.max(1, e.period ?? 1))), 0);
    add(`total_sleep_${h}h`, inWin.length && known.length ? Math.max(0, total) : null, blockCov * onsetCov, w0, T);
  }
  {
    const w0 = T - DAY_MS;
    const blocks = coveredBlocks(mains, T, 1);
    add('time_in_bed_24h', eps.some((e) => (e.end ?? T) > w0) ? bedIntervals(eps, T).reduce((s, iv) => s + overlapMinutes(iv, w0, T), 0) : null, blocks[0] ? 1 : 0, w0, T);
  }

  // ---- 7-day sleep summaries
  const w7 = T - 7 * DAY_MS;
  const mains7 = mains.filter((e) => (e.wake ?? T) > w7 && (e.wake ?? T) <= T && !e.inProgress);
  const blocks7 = coveredBlocks(mains, T, 7);
  const nBlocks = blocks7.filter(Boolean).length;
  const sleep7 = asleep.reduce((s, iv) => s + overlapMinutes(iv, w7, T), 0) - mains7.reduce((s, e) => s + (e.waso ?? 0), 0);
  add('mean_daily_sleep_7d', nBlocks && mains7.some((e) => e.tst != null) ? sleep7 / nBlocks : null, (nBlocks / 7) * (mains7.length ? mains7.filter((e) => e.tst != null).length / mains7.length : 0), w7, T);

  const lastWake = [...eps].filter((e) => e.wake != null && e.wake <= T && !e.inProgress).sort((a, b) => b.wake - a.wake)[0];
  add('minutes_since_last_awakening', lastWake ? (T - lastWake.wake) / MIN_MS : null, lastWake ? 1 : 0, lastWake?.wake ?? T, T);
  const lastEnd = [...eps].filter((e) => e.end != null && e.end <= T).sort((a, b) => b.end - a.end)[0];
  add('minutes_since_last_sleep_episode', lastEnd ? (T - lastEnd.end) / MIN_MS : null, lastEnd ? 1 : 0, lastEnd?.end ?? T, T);

  const onsets = mains7.filter((e) => e.onset != null).map((e) => localClockMinutes(e.onset, e.tz ?? tz));
  const wakes = mains7.filter((e) => e.wake != null).map((e) => localClockMinutes(e.wake, e.tz ?? tz));
  const cov7 = (n) => Math.min(1, n / 7);
  add('onset_sd_7d', onsets.length >= 3 ? circularSD(onsets) : null, cov7(onsets.length), w7, T);
  add('wake_sd_7d', wakes.length >= 3 ? circularSD(wakes) : null, cov7(wakes.length), w7, T);
  add('onset_mean_clock_7d', onsets.length >= 3 ? circularMean(onsets) : null, cov7(onsets.length), w7, T);
  add('wake_mean_clock_7d', wakes.length >= 3 ? circularMean(wakes) : null, cov7(wakes.length), w7, T);
  const wasos = mains7.filter((e) => e.waso != null).map((e) => e.waso);
  add('waso_mean_7d', wasos.length ? avg(wasos) : null, cov7(wasos.length), w7, T);
  const lats = mains7.filter((e) => e.latency != null).map((e) => e.latency);
  add('latency_mean_7d', lats.length ? avg(lats) : null, cov7(lats.length), w7, T);
  const naps = eps.filter((e) => e.type === 'nap' && (e.end ?? T) > w7);
  // Naps: an unlogged nap is unknown, so coverage reflects how many days have any sleep logged.
  add('nap_minutes_7d', nBlocks ? naps.reduce((s, e) => s + overlapMinutes([e.start, e.end ?? T], w7, T), 0) : null, nBlocks / 7, w7, T);
  add('nap_count_7d', nBlocks ? naps.length : null, nBlocks / 7, w7, T);
  add('sleep_regularity_index_7d', sri(asleep, blocks7, T), nBlocks / 7, w7, T);

  // ---- Social jetlag (28 d)
  const w28 = T - 28 * DAY_MS;
  const m28 = mains.filter((e) => e.midSleep != null && (e.wake ?? T) > w28 && !e.inProgress);
  const work = m28.filter((e) => e.dayType === 'workday');
  const free = m28.filter((e) => e.dayType === 'free_day' && e.alarm !== true);
  let sj = null;
  if (work.length >= 2 && free.length >= 1) {
    const msw = circularMean(work.map((e) => localClockMinutes(e.midSleep, e.tz ?? tz)));
    const msf = circularMean(free.map((e) => localClockMinutes(e.midSleep, e.tz ?? tz)));
    sj = Math.abs(circularDiff(msw, msf));
  }
  add('social_jetlag_28d', sj, Math.min(1, (work.length + free.length) / 20), w28, T);

  // ---- Light (sensor lux only; self-report never converted to lux)
  const sensor = up(t.light_exposure_events, T).filter((l) => l.measurement_type === 'sensor' && l.illuminance_lux != null);
  for (const h of [1, 3, 6, 12]) {
    const w0 = T - h * HOUR_MS;
    let covered = 0;
    let luxH = 0;
    for (const l of sensor) {
      const m = overlapMinutes([toMs(l.start_time), toMs(l.end_time)], w0, T);
      covered += m;
      luxH += (Number(l.illuminance_lux) * m) / 60;
    }
    add(`light_lux_hours_${h}h`, covered > 0 ? luxH : null, covered / (h * 60), w0, T);
  }
  const outdoor = up(t.light_exposure_events, T).filter((l) => l.measurement_type === 'self_report' && (l.indoor_outdoor_context === 'outdoor' || l.self_reported_brightness === 'daylight'));
  const anyLight = up(t.light_exposure_events, T).some((l) => toMs(l.end_time) > T - DAY_MS);
  add('outdoor_minutes_24h', anyLight ? outdoor.reduce((s, l) => s + overlapMinutes([toMs(l.start_time), toMs(l.end_time)], T - DAY_MS, T), 0) : null, anyLight ? 1 : 0, T - DAY_MS, T);

  // ---- Substances, meals, activity, stress
  const subs = up(t.substance_events, T);
  const caf = subs.filter((s) => s.event_type === 'caffeine');
  const alc = subs.filter((s) => s.event_type === 'alcohol');
  const lastOf = (rows, field = 'start_time') => rows.reduce((m, r) => Math.max(m, toMs(r[field] ?? r.start_time)), -Infinity);
  const since = (rows, field) => (rows.length ? (T - lastOf(rows, field)) / MIN_MS : null);
  const mg = (h) => {
    const rows = caf.filter((c) => toMs(c.start_time) > T - h * HOUR_MS && c.unit === 'mg');
    return rows.length ? rows.reduce((s, c) => s + Number(c.amount), 0) : null;
  };
  add('minutes_since_last_caffeine', since(caf), caf.length ? 1 : 0, caf.length ? lastOf(caf) : T, T);
  add('caffeine_mg_8h', mg(8), null, T - 8 * HOUR_MS, T);
  add('caffeine_mg_24h', mg(24), null, T - DAY_MS, T);
  add('minutes_since_last_alcohol', since(alc), alc.length ? 1 : 0, alc.length ? lastOf(alc) : T, T);
  const drinks = alc.filter((a) => toMs(a.start_time) > T - DAY_MS && a.unit === 'standard_drink');
  add('alcohol_drinks_24h', drinks.length ? drinks.reduce((s, a) => s + Number(a.amount), 0) : null, null, T - DAY_MS, T);
  const meals = up(t.meal_events, T);
  add('minutes_since_last_meal', meals.length ? (T - Math.max(...meals.map((m) => Math.min(T, toMs(m.end_time) ?? toMs(m.start_time))))) / MIN_MS : null, meals.length ? 1 : 0, T - DAY_MS, T);
  const acts = up(t.activity_events, T);
  const actDay = acts.filter((a) => toMs(a.end_time) > T - DAY_MS);
  add('activity_minutes_24h', actDay.length ? actDay.reduce((s, a) => s + overlapMinutes([toMs(a.start_time), toMs(a.end_time)], T - DAY_MS, T), 0) : null, null, T - DAY_MS, T);
  add('minutes_since_last_activity', acts.length ? (T - Math.min(T, Math.max(...acts.map((a) => toMs(a.end_time))))) / MIN_MS : null, acts.length ? 1 : 0, T - DAY_MS, T);
  const stress = t.subjective_observations.filter((o) => o.measure === 'stress' && toMs(o.timestamp) <= T).sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
  add('stress_latest', stress.length ? Number(stress.at(-1).rating) : null, stress.length ? 1 : 0, stress.length ? toMs(stress.at(-1).timestamp) : T, T);
  const s24 = stress.filter((o) => toMs(o.timestamp) > T - DAY_MS);
  add('stress_mean_24h', s24.length ? avg(s24.map((o) => Number(o.rating))) : null, s24.length ? 1 : 0, T - DAY_MS, T);

  // ---- Profile
  const ct = chronotypeFromProfile(state.user.profile);
  add('chronotype_msfsc', ct?.MSFsc ?? null, ct ? (ct.valid ? 1 : 0.5) : 0, T, T);

  return { list, map: Object.fromEntries(list.map((f) => [f.feature_name, f])) };
}

/**
 * Sleep Regularity Index (Phillips et al. 2017): −100 + 200 × P(same state at t and t+24 h),
 * in 1-min epochs. Only compares 24 h blocks that both contain a logged main sleep, so
 * unlogged days are not counted as "awake all day".
 */
export function sri(asleepIntervals, blocks, T) {
  const isAsleep = (ms) => asleepIntervals.some(([a, b]) => ms >= a && ms < b);
  let same = 0;
  let total = 0;
  for (let i = blocks.length - 1; i >= 1; i--) {
    if (!blocks[i] || !blocks[i - 1]) continue;
    const b0 = T - (i + 1) * DAY_MS; // older block start
    for (let m = 0; m < 1440; m++) {
      const t0 = b0 + m * MIN_MS;
      if (isAsleep(t0) === isAsleep(t0 + DAY_MS)) same++;
      total++;
    }
  }
  return total >= 2 * 1440 ? -100 + (200 * same) / total : null;
}

const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

export { mctq };
