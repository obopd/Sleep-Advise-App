// Longitudinal trends and personal associations (spec Screen 5).
//
// Associations compare the user's own nights with vs without an exposure, using the waking
// period before each main sleep (previous wake → this sleep attempt), not calendar days.
// They are worded as associations, require MIN_GROUP nights in each group, and are flagged
// when the exposure is concentrated on workdays or free days (possible confounding).

import { analysisEpisodes } from './sleep.js';
import { toMs, HOUR_MS, DAY_MS, MIN_MS, localClockMinutes, localDate, circularMean, circularDiff } from './time.js';
import { CAFFEINE_CUTOFF_H } from './recommend.js';
import { fmtMin } from './format.js';

export const INSIGHTS_VERSION = 'insights-1.0.0';
export const MIN_GROUP = 5;

/** One row per completed main sleep: outcomes + exposures from the preceding waking period. */
export function nightTable(state, T = Date.now(), days = 60) {
  const eps = analysisEpisodes(state.tables.sleep_episodes, T).filter((e) => !e.inProgress);
  const mains = eps.filter((e) => e.type === 'main' && e.wake > T - days * DAY_MS);
  const t = state.tables;
  return mains.map((e) => {
    const prev = eps.filter((x) => x.type === 'main' && x.wake <= e.start).sort((a, b) => b.wake - a.wake)[0];
    const from = prev?.wake ?? e.attempt - 16 * HOUR_MS;
    const inPeriod = (ms) => ms != null && ms >= from && ms <= e.attempt;
    const caf = t.substance_events.filter((s) => s.event_type === 'caffeine' && inPeriod(toMs(s.start_time)));
    const lastCaf = caf.reduce((m, s) => Math.max(m, toMs(s.start_time)), -Infinity);
    const meals = t.meal_events.filter((m) => inPeriod(toMs(m.start_time)));
    const lastMeal = meals.reduce((m, x) => Math.max(m, toMs(x.end_time) ?? toMs(x.start_time)), -Infinity);
    const stress = t.subjective_observations.filter((o) => o.measure === 'stress' && inPeriod(toMs(o.timestamp)));
    const eveStart = e.attempt - 3 * HOUR_MS;
    const lightEve = t.light_exposure_events.filter((l) => toMs(l.end_time) > eveStart && toMs(l.start_time) < e.attempt);
    const sensorEve = lightEve.filter((l) => l.measurement_type === 'sensor');
    let luxMin = 0;
    let covered = 0;
    for (const l of sensorEve) {
      const m = Math.max(0, Math.min(toMs(l.end_time), e.attempt) - Math.max(toMs(l.start_time), eveStart)) / MIN_MS;
      covered += m;
      luxMin += m * Number(l.illuminance_lux);
    }
    const selfBright = lightEve.some((l) => l.measurement_type === 'self_report' && ['bright_indoor', 'daylight'].includes(l.self_reported_brightness));
    const selfDim = lightEve.some((l) => l.measurement_type === 'self_report' && ['dim', 'normal_indoor'].includes(l.self_reported_brightness));
    return {
      id: e.id,
      wakeDate: localDate(e.wake, e.tz ?? state.user.timezone),
      dayType: e.dayType,
      onsetClock: e.onset != null ? localClockMinutes(e.onset, e.tz ?? state.user.timezone) : null,
      wakeClock: localClockMinutes(e.wake, e.tz ?? state.user.timezone),
      tst: e.tst,
      tib: e.tib,
      latency: e.latency,
      quality: e.quality,
      exposures: {
        lateCaffeine: caf.length ? e.attempt - lastCaf <= CAFFEINE_CUTOFF_H * HOUR_MS : (t.substance_events.length ? false : null),
        mealToSleepH: Number.isFinite(lastMeal) ? (e.attempt - lastMeal) / HOUR_MS : null,
        stressMean: stress.length ? stress.reduce((s, o) => s + Number(o.rating), 0) / stress.length : null,
        eveningLux: covered >= 60 ? luxMin / covered : null, // needs ≥ 1 h of sensor data in the 3 h before
        eveningBrightSelf: selfBright ? true : selfDim ? false : null,
      },
    };
  });
}

function compare(rows, groupFn, label, outcomeKeys = ['onset', 'tst', 'latency']) {
  const yes = rows.filter((r) => groupFn(r) === true);
  const no = rows.filter((r) => groupFn(r) === false);
  if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return { label, status: 'too_few', nWith: yes.length, nWithout: no.length };
  const res = { label, status: 'ok', nWith: yes.length, nWithout: no.length, diffs: {} };
  if (outcomeKeys.includes('onset')) {
    const a = yes.filter((r) => r.onsetClock != null).map((r) => r.onsetClock);
    const b = no.filter((r) => r.onsetClock != null).map((r) => r.onsetClock);
    if (a.length >= MIN_GROUP && b.length >= MIN_GROUP) res.diffs.onset = circularDiff(circularMean(b), circularMean(a));
  }
  for (const k of ['tst', 'latency']) {
    if (!outcomeKeys.includes(k)) continue;
    const a = yes.filter((r) => r[k] != null).map((r) => r[k]);
    const b = no.filter((r) => r[k] != null).map((r) => r[k]);
    if (a.length >= MIN_GROUP && b.length >= MIN_GROUP) res.diffs[k] = mean(a) - mean(b);
  }
  const share = (g) => g.filter((r) => r.dayType === 'free_day').length / g.length;
  res.confounded = Math.abs(share(yes) - share(no)) >= 0.5;
  res.sentence = sentence(label, res.diffs);
  return res;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function sentence(label, d) {
  const parts = [];
  if (d.onset != null && Math.abs(d.onset) >= 10) parts.push(`your sleep onset was ${fmtMin(Math.abs(d.onset))} ${d.onset > 0 ? 'later' : 'earlier'}`);
  if (d.tst != null && Math.abs(d.tst) >= 10) parts.push(`you slept ${fmtMin(Math.abs(d.tst))} ${d.tst > 0 ? 'more' : 'less'}`);
  if (d.latency != null && Math.abs(d.latency) >= 5) parts.push(`you took ${fmtMin(Math.abs(d.latency))} ${d.latency > 0 ? 'longer' : 'less time'} to fall asleep`);
  if (!parts.length) return `On days when ${label}, your sleep looked similar to other days.`;
  return `On days when ${label}, ${parts.join(', and ')} on average.`;
}

/** All associations with enough data, plus the ones that need more. */
export function associations(state, T = Date.now()) {
  const rows = nightTable(state, T);
  const out = [];
  out.push(compare(rows, (r) => r.exposures.lateCaffeine, `you had caffeine within ${CAFFEINE_CUTOFF_H} h of trying to sleep`));
  const lux = rows.map((r) => r.exposures.eveningLux).filter((v) => v != null);
  if (lux.length >= 2 * MIN_GROUP) {
    const m = median(lux);
    out.push(compare(rows, (r) => (r.exposures.eveningLux == null ? null : r.exposures.eveningLux > m), 'your measured evening light was above your usual level'));
  } else {
    out.push(compare(rows, (r) => r.exposures.eveningBrightSelf, 'you reported bright light in the 3 h before sleep'));
  }
  const meal = rows.map((r) => r.exposures.mealToSleepH).filter((v) => v != null);
  if (meal.length >= 2 * MIN_GROUP) {
    const m = median(meal);
    out.push(compare(rows, (r) => (r.exposures.mealToSleepH == null ? null : r.exposures.mealToSleepH < m), `your last recorded meal was closer to sleep than usual (under ${Math.round(m * 10) / 10} h)`));
  } else out.push({ label: 'meal timing', status: 'too_few', nWith: meal.length, nWithout: 0 });
  const st = rows.map((r) => r.exposures.stressMean).filter((v) => v != null);
  if (st.length >= 2 * MIN_GROUP) {
    const m = median(st);
    out.push(compare(rows, (r) => (r.exposures.stressMean == null ? null : r.exposures.stressMean > m), 'your stress rating was above your usual level'));
  } else out.push({ label: 'stress', status: 'too_few', nWith: st.length, nWithout: 0 });
  out.push(compare(rows, (r) => (r.dayType === 'unknown' ? null : r.dayType === 'free_day'), 'the next day was a free day'));
  return { version: INSIGHTS_VERSION, rows, associations: out };
}
