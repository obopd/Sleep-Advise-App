// Derived values for single sleep episodes (Layer 3). All durations are elapsed time
// between UTC instants.
//
// Definitions (docs/DATA_DICTIONARY.md):
//   time in bed (TIB)   = end_time − start_time
//   onset               = onset_time if reported, else (attempt_time or start_time) + sleep_latency_minutes
//                         if latency was reported, else UNKNOWN (never assumed = bedtime)
//   wake                = final_awakening_time, else end_time
//   sleep period        = wake − onset
//   total sleep (TST)   = sleep period − WASO (WASO missing → treated as 0 and flagged)
//   efficiency          = TST / TIB

import { toMs, MIN_MS } from './time.js';

const USER_SOURCES = new Set(['user', 'migration_v1']);

export function deriveEpisode(e) {
  const start = toMs(e.start_time);
  const end = toMs(e.end_time);
  const attempt = toMs(e.attempt_time) ?? start;
  let onset = toMs(e.onset_time);
  let onsetBasis = onset != null ? 'reported' : null;
  if (onset == null && e.sleep_latency_minutes != null && e.sleep_latency_minutes !== '') {
    onset = attempt + Number(e.sleep_latency_minutes) * MIN_MS;
    onsetBasis = 'from_latency';
  }
  const wake = toMs(e.final_awakening_time) ?? end;
  const waso = e.wake_after_sleep_onset_minutes != null ? Number(e.wake_after_sleep_onset_minutes) : null;
  const tib = start != null && end != null ? (end - start) / MIN_MS : null;
  const period = onset != null && wake != null && wake > onset ? (wake - onset) / MIN_MS : null;
  const tst = period != null ? Math.max(0, period - (waso ?? 0)) : null;
  const latency = onset != null ? (onset - attempt) / MIN_MS : null;
  return {
    id: e.id,
    type: e.episode_type,
    source: e.source,
    tz: e.tz,
    dayType: e.day_type ?? 'unknown',
    alarm: e.alarm_used ?? null,
    start,
    end,
    attempt,
    onset,
    onsetBasis,
    wake,
    tib,
    period,
    tst,
    waso,
    wasoMissing: waso == null,
    latency,
    efficiency: tst != null && tib ? tst / tib : null,
    midSleep: onset != null && wake != null ? onset + (wake - onset) / 2 : null,
    quality: e.subjective_quality ?? null,
    refreshment: e.morning_refreshment ?? null,
    inProgress: end == null,
  };
}

/**
 * Episodes used for analysis. When a device record and the user's own entry describe the
 * same sleep (overlap, different sources), the user's entry is used and the device record
 * is kept in storage only (rule documented in docs/SCIENCE.md, "Source conflicts").
 * In-progress episodes are clipped to `asOf`.
 */
export function analysisEpisodes(records, asOf = Date.now()) {
  const eps = records
    .map(deriveEpisode)
    .filter((e) => e.start != null && e.start <= asOf)
    .sort((a, b) => a.start - b.start);
  const keep = [];
  for (const e of eps) {
    const clash = keep.findIndex((k) => overlaps(k, e, asOf) && k.source !== e.source);
    if (clash < 0) keep.push(e);
    else if (USER_SOURCES.has(e.source) && !USER_SOURCES.has(keep[clash].source)) keep[clash] = e;
  }
  return keep;
}

function overlaps(a, b, asOf) {
  const ae = a.end ?? asOf;
  const be = b.end ?? asOf;
  return a.start < be && b.start < ae;
}

/** Asleep intervals [onset, wake] (ms) for episodes whose onset is known. */
export function sleepIntervals(eps, asOf = Date.now()) {
  return eps.filter((e) => e.onset != null).map((e) => [e.onset, Math.min(e.wake ?? asOf, asOf)]).filter(([a, b]) => b > a);
}

/** Time-in-bed intervals [start, end] (ms), in-progress clipped to asOf. */
export function bedIntervals(eps, asOf = Date.now()) {
  return eps.map((e) => [e.start, Math.min(e.end ?? asOf, asOf)]).filter(([a, b]) => b > a);
}

/** Minutes of overlap between interval [a,b] and window [w0,w1]. */
export function overlapMinutes([a, b], w0, w1) {
  return Math.max(0, Math.min(b, w1) - Math.max(a, w0)) / MIN_MS;
}
