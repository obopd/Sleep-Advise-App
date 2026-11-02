// MODELS B/C — Circadian phase / predicted DLMO: experimental baselines behind one interface.
//
// Interface (any future model must implement it):
//   { name, version, target, unit, validation_status, population, refs,
//     predict(context) → { status, value, coverage, window, details } }
// context = { state, T, features } — only data at or before T may be used.
//
// Neither baseline below has been validated against measured DLMO in this app's users.
// Both are labelled 'experimental_unvalidated', produce NO prediction interval, and are
// shown to users only in the Biology screen's experimental section.

import { analysisEpisodes } from '../sleep.js';
import { localClockMinutes, circularMean, circularSD, HOUR_MS, DAY_MS, MIN_MS, toMs, toIso } from '../time.js';
import { entrain, simulate, cbtMinTimes, STEPS_PER_DAY, DT_H, FORGER99 } from '../forger99.js';

/**
 * Baseline 1 — sleep-timing proxy: DLMO ≈ habitual sleep onset − 2 h.
 * Source of the 2 h interval: Burgess et al. 2003 (mean DLMO-to-sleep-onset ≈ 2 h in young
 * adults on regular schedules); used as a comparator by Cheng et al. 2021 (MAE ≈ 1 h in day
 * workers, much worse in shift workers). Known weakness: the interval varies between
 * people (roughly ±1 h), so this cannot be individually accurate.
 * Population: regular schedules only. Shift workers and irregular sleepers → no prediction.
 */
export const SLEEP_TIMING_PROXY = {
  name: 'dlmo_sleep_timing_proxy',
  version: '0.1.0',
  target: 'dlmo_clock_time',
  unit: 'clock_minutes_local',
  validation_status: 'experimental_unvalidated',
  population: 'Regular day-active schedules; not shift work; ≥ 5 main sleeps with known onset in 7 days; onset SD ≤ 60 min.',
  refs: ['burgess2003', 'cheng2021'],
  params: { offset_min: -120, min_nights: 5, max_onset_sd_min: 60, window_days: 7 },
  predict({ state, T }) {
    const p = this.params;
    const w0 = T - p.window_days * DAY_MS;
    const window = { start: toIso(w0), end: toIso(T) };
    if (state.user.profile?.shift_work === 'yes') return { status: 'unsupported_population', value: null, coverage: null, window, details: { reason: 'Not evaluated for shift work.' } };
    const mains = analysisEpisodes(state.tables.sleep_episodes, T).filter((e) => e.type === 'main' && !e.inProgress && (e.wake ?? T) > w0);
    const onsets = mains.filter((e) => e.onset != null).map((e) => localClockMinutes(e.onset, e.tz));
    const coverage = Math.min(1, onsets.length / p.window_days);
    if (onsets.length < p.min_nights) return { status: 'insufficient_data', value: null, coverage, window, details: { reason: `Needs ${p.min_nights} nights with a fall-asleep time in the last ${p.window_days} days (has ${onsets.length}).` } };
    const sd = circularSD(onsets);
    if (sd > p.max_onset_sd_min) return { status: 'unsupported_population', value: null, coverage, window, details: { reason: 'Sleep times vary too much for this method.', onset_sd_min: Math.round(sd) } };
    const value = ((circularMean(onsets) + p.offset_min) % 1440 + 1440) % 1440;
    return { status: 'ok', value, coverage, window, details: { nights: onsets.length, onset_sd_min: Math.round(sd) } };
  },
};

/**
 * Baseline 2 — light-driven oscillator (Forger, Jewett & Kronauer 1999), parameters from the
 * reference implementation (Arcascope `circadian`), DLMO = model CBTmin − 7 h (Cheng 2021).
 * Input: measured sensor lux (10-min bins) over 7 days, darkness (0 lux) during recorded
 * sleep. Requires sensor data for ≥ 80 % of waking time; remaining waking gaps are filled
 * with the median measured waking lux at the same clock hour (reported in details).
 * Self-reported light is never converted to lux.
 */
export const FORGER_LIGHT = {
  name: 'dlmo_forger1999_light',
  version: '0.1.0',
  target: 'dlmo_clock_time',
  unit: 'clock_minutes_local',
  validation_status: 'experimental_unvalidated',
  population: 'Any schedule, given continuous sensor light data (≥ 80 % of waking time over 7 days) and complete sleep records.',
  refs: ['forger1999', 'cheng2021'],
  params: { window_days: 7, min_awake_coverage: 0.8, bin_min: 10 },
  predict({ state, T }) {
    const p = this.params;
    const w0 = T - p.window_days * DAY_MS;
    const window = { start: toIso(w0), end: toIso(T) };
    const nBins = (p.window_days * 1440) / p.bin_min;
    const eps = analysisEpisodes(state.tables.sleep_episodes, T);
    const asleepBin = new Uint8Array(nBins);
    for (const e of eps) {
      const a = e.onset ?? e.start;
      const b = Math.min(e.wake ?? e.end ?? T, T);
      for (let i = Math.max(0, Math.floor((a - w0) / (p.bin_min * MIN_MS))); i < nBins && w0 + i * p.bin_min * MIN_MS < b; i++) asleepBin[i] = 1;
    }
    const lux = new Array(nBins).fill(null);
    for (const l of state.tables.light_exposure_events) {
      if (l.measurement_type !== 'sensor' || l.illuminance_lux == null) continue;
      const a = toMs(l.start_time);
      const b = Math.min(toMs(l.end_time), T);
      for (let i = Math.max(0, Math.floor((a - w0) / (p.bin_min * MIN_MS))); i < nBins && w0 + i * p.bin_min * MIN_MS < b; i++) lux[i] = Number(l.illuminance_lux);
    }
    // Each day must have recorded sleep, or wake/sleep cannot be separated.
    for (let d = 0; d < p.window_days; d++) {
      const s = (d * 1440) / p.bin_min;
      if (!asleepBin.slice(s, s + 1440 / p.bin_min).some(Boolean)) return { status: 'insufficient_data', value: null, coverage: 0, window, details: { reason: 'Every day of the last week needs recorded sleep.' } };
    }
    let awake = 0;
    let measured = 0;
    const byHour = Array.from({ length: 24 }, () => []);
    for (let i = 0; i < nBins; i++) {
      if (asleepBin[i]) continue;
      awake++;
      if (lux[i] != null) {
        measured++;
        byHour[Math.floor(localClockMinutes(w0 + i * p.bin_min * MIN_MS, state.user.timezone) / 60)].push(lux[i]);
      }
    }
    const coverage = awake ? measured / awake : 0;
    if (coverage < p.min_awake_coverage) return { status: 'insufficient_data', value: null, coverage, window, details: { reason: `Light sensor data covers ${Math.round(coverage * 100)} % of waking time; ${p.min_awake_coverage * 100} % needed.` } };
    const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
    let imputed = 0;
    const series = new Float64Array(STEPS_PER_DAY * p.window_days);
    for (let k = 0; k < series.length; k++) {
      const ms = w0 + k * DT_H * HOUR_MS;
      const i = Math.min(nBins - 1, Math.floor((ms - w0) / (p.bin_min * MIN_MS)));
      if (asleepBin[i]) series[k] = 0;
      else if (lux[i] != null) series[k] = lux[i];
      else {
        series[k] = median(byHour[Math.floor(localClockMinutes(ms, state.user.timezone) / 60)]);
        imputed++;
      }
    }
    const init = entrain(series.slice(0, STEPS_PER_DAY));
    const mins = cbtMinTimes(simulate(series, init).x);
    if (!mins.length) return { status: 'invalid_input', value: null, coverage, window, details: { reason: 'Model produced no rhythm minimum.' } };
    const cbtMs = w0 + mins.at(-1) * HOUR_MS;
    const value = ((localClockMinutes(cbtMs, state.user.timezone) - FORGER99.cbtToDlmo * 60) % 1440 + 1440) % 1440;
    return { status: 'ok', value, coverage, window, details: { imputed_fraction: Math.round((imputed / series.length) * 1000) / 1000 } };
  },
};

export const CIRCADIAN_MODELS = [SLEEP_TIMING_PROXY, FORGER_LIGHT];
