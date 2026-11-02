// MODEL A — Homeostatic sleep pressure (Process S), experimental proxy.
//
// Structure and time constants from the two-process model:
//   Borbély 1982; Daan, Beersma & Borbély 1984 (τ_rise = 18.2 h during wake,
//   τ_decay = 4.2 h during sleep, S normalised between asymptotes 0 and 1).
//   Wake:  S(t+Δ) = 1 − (1 − S(t))·e^(−Δ/τ_rise)
//   Sleep: S(t+Δ) = S(t)·e^(−Δ/τ_decay)
//
// What this is NOT: a measurement. Individual time constants differ, and the original
// constants were fitted to group sleep-deprivation data. The output is a unitless proxy
// (0–1 of the model's range), labelled experimental, with no clinical thresholds.
//
// Inputs: sleep intervals (onset → final awakening) from the 72 h before T. Every 24 h block
// must contain a logged main sleep with known onset, otherwise an unlogged sleep could be
// mistaken for wakefulness and the prediction is withheld ("insufficient_data").
// WASO is not modelled (it is reported as a total without timing).
// Initial condition: S = 0.5 at T − 72 h (an assumption). Sensitivity: changing it by ±0.5
// moves the estimate at T by < 0.05 for typical schedules (tested).

import { analysisEpisodes, sleepIntervals } from '../sleep.js';
import { HOUR_MS, DAY_MS, MIN_MS, toIso } from '../time.js';

export const SLEEP_PRESSURE_MODEL = {
  name: 'process_s_daan1984',
  version: '1.0.0',
  target: 'sleep_pressure_proxy',
  unit: 'fraction of model range (0–1)',
  validation_status: 'experimental_unvalidated',
  constants: { tau_rise_h: 18.2, tau_decay_h: 4.2, history_h: 72, initial_S: 0.5, step_min: 5 },
  refs: ['borbely1982', 'daan1984'],
};

/** Simulate S over [T − history, T]. Returns { status, value, trajectory, coverage }. */
export function estimateSleepPressure(sleepRecords, T = Date.now(), { initialS = SLEEP_PRESSURE_MODEL.constants.initial_S } = {}) {
  const { tau_rise_h: tr, tau_decay_h: td, history_h: hh, step_min: step } = SLEEP_PRESSURE_MODEL.constants;
  const t0 = T - hh * HOUR_MS;
  const eps = analysisEpisodes(sleepRecords, T).filter((e) => (e.end ?? T) > t0 - DAY_MS);
  const mains = eps.filter((e) => e.type === 'main');
  // Each 24 h block in the history must have a main sleep with known onset.
  const blocksOk = [];
  for (let d = 0; d < hh / 24; d++) {
    const b1 = T - d * DAY_MS;
    const b0 = b1 - DAY_MS;
    blocksOk.push(mains.some((e) => (e.wake ?? T) > b0 && e.start <= b1));
  }
  const unknownOnset = eps.filter((e) => e.onset == null && (e.end ?? T) > t0);
  const coverage = blocksOk.filter(Boolean).length / blocksOk.length;
  const base = { model: SLEEP_PRESSURE_MODEL, coverage, window: { start: toIso(t0), end: toIso(T) } };
  if (coverage < 1) return { ...base, status: 'insufficient_data', value: null, trajectory: [], reason: 'Each of the last 3 days needs a logged main sleep.' };
  if (unknownOnset.length) return { ...base, status: 'missing_required_features', value: null, trajectory: [], reason: 'Some recent sleep has no fall-asleep time, so sleep and wake cannot be separated.' };

  const asleep = sleepIntervals(eps, T);
  const isAsleep = (ms) => asleep.some(([a, b]) => ms >= a && ms < b);
  const kr = Math.exp(-step / (tr * 60));
  const kd = Math.exp(-step / (td * 60));
  let S = initialS;
  const trajectory = [];
  for (let t = t0; t < T; t += step * MIN_MS) {
    S = isAsleep(t) ? S * kd : 1 - (1 - S) * kr;
    trajectory.push({ t: t + step * MIN_MS, S, asleep: isAsleep(t) });
  }
  return { ...base, status: 'ok', value: S, trajectory };
}

/** The user's own typical S at sleep onset over the history (for personal comparison, not a threshold). */
export function typicalPressureAtOnset(result, sleepRecords, T) {
  if (result.status !== 'ok') return null;
  const onsets = analysisEpisodes(sleepRecords, T).filter((e) => e.type === 'main' && e.onset != null && e.onset > T - 72 * HOUR_MS).map((e) => e.onset);
  const vals = onsets.map((o) => result.trajectory.find((p) => p.t >= o)?.S).filter((v) => v != null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}
