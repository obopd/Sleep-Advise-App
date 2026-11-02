// Circadian phase estimation and 24-hour hormone / sleep-regulation profiles.
//
// IMPORTANT: without a lab or home saliva assay, hormone levels cannot be *measured*.
// This module estimates the user's circadian phase from their sleep timing, which is a
// validated proxy, and draws *relative* (0–1) curves anchored to that phase. A measured
// DLMO, when the user enters one, always overrides the estimate.
//
// Anchors used (all approximate, individual variation is about ±1 h):
//   DLMO           ≈ habitual sleep onset − 2 h            (Burgess 2003; Sletten 2010)
//   Wake maintenance zone ≈ the 2 h before DLMO           (Lavie 1986; Strogatz 1987)
//   Sleep gate     ≈ DLMO + 2 h                             (Lavie 1986; Sletten 2010)
//   Melatonin peak ≈ DLMO + 4 h, offset ≈ DLMO + 10 h
//   Core body temperature minimum ≈ DLMO + 7 h              (Benloucif 2005)
//   Light before CBTmin delays the clock, light after it advances (Khalsa 2003)
//   Cortisol awakening response peaks ≈ 30–45 min after waking, +50–75 % (Clow 2004; Fries 2009)
//   Process S time constants τ_rise = 18.2 h, τ_decay = 4.2 h (Daan, Beersma & Borbély 1984)

import { wrap, circularMean, parseHHMM, daysBetween, forward, DAY } from './time.js';

export const DLMO_TO_ONSET = 120;
export const DLMO_TO_CBTMIN = 420;
export const TAU_RISE_H = 18.2;
export const TAU_DECAY_H = 4.2;

/**
 * Estimate circadian phase (DLMO) from, in priority order:
 *  1. a measured DLMO from the last 30 days (saliva/blood melatonin assay),
 *  2. the last 14 diary nights (recent nights weighted more; half-life 3 days, since the
 *     clock shifts at most ~1–1.5 h per day),
 *  3. the MCTQ questionnaire in the profile.
 */
export function estimatePhase({ nights = [], measured = [], profile = null, today = null } = {}) {
  const ref = today ?? nights.at(-1)?.date ?? null;

  const recentMeasured = measured
    .filter((m) => parseHHMM(m.dlmo) != null && (!ref || Math.abs(daysBetween(m.date, ref)) <= 30))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  if (recentMeasured) {
    return withMarkers(parseHHMM(recentMeasured.dlmo), 'measured', 30, recentMeasured);
  }

  const last = nights.at(-1)?.date;
  const recent = last ? nights.filter((n) => daysBetween(n.date, last) < 14) : [];
  if (recent.length >= 3) {
    const weights = recent.map((n) => Math.pow(0.5, daysBetween(n.date, last) / 3));
    const onset = circularMean(recent.map((n) => n.onset), weights);
    return withMarkers(wrap(onset - DLMO_TO_ONSET), 'diary', 60, { nights: recent.length });
  }

  const q = profile?.mctq;
  if (q) {
    const wo = parseHHMM(q.workOnset);
    const fo = parseHHMM(q.freeOnset);
    if (wo != null && fo != null) {
      const wd = Number(q.workdays ?? 5);
      const onset = circularMean([wo, fo], [wd, 7 - wd]);
      return withMarkers(wrap(onset - DLMO_TO_ONSET), 'questionnaire', 90, null);
    }
  }
  return null;
}

function withMarkers(dlmo, source, uncertaintyMin, detail) {
  return {
    dlmo,
    source,
    uncertaintyMin,
    detail,
    wmzStart: wrap(dlmo - 120),
    wmzEnd: dlmo,
    sleepGate: wrap(dlmo + DLMO_TO_ONSET),
    melatoninPeak: wrap(dlmo + 240),
    melatoninOffset: wrap(dlmo + 600),
    cbtMin: wrap(dlmo + DLMO_TO_CBTMIN),
    // Light phase response (Khalsa 2003): before CBTmin = delay, after = advance.
    advanceLightStart: wrap(dlmo + DLMO_TO_CBTMIN),
    delayLightEnd: wrap(dlmo + DLMO_TO_CBTMIN),
  };
}

/** Is clock time t inside the (possibly midnight-crossing) window [a, b)? */
export function inWindow(t, a, b) {
  return forward(a, t) < forward(a, b);
}

const gauss = (x, mu, sd) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));

/** Hours from `from` forward to `to` on the clock, in (−12, 12]. */
const relHours = (from, to) => {
  let d = wrap(to - from);
  if (d > DAY / 2) d -= DAY;
  return d / 60;
};

/** Relative melatonin (0–1). Skewed Gaussian: faster rise, slower fall. */
export function melatoninAt(t, dlmo) {
  const h = relHours(dlmo, t);
  const peak = 4;
  const sd = h < peak ? 1.8 : 2.6;
  return 0.03 + 0.97 * gauss(h, peak, sd);
}

/**
 * Relative cortisol (0–1): nadir in early sleep (~DLMO + 3 h), rise through late sleep,
 * awakening response peaking ~35 min after wake, then decline across the day.
 */
export function cortisolAt(t, dlmo, wake) {
  const nadir = wrap(dlmo + 180);
  const riseLen = forward(nadir, wake) / 60 || 1;
  const fallLen = 24 - riseLen;
  const sinceNadir = forward(nadir, t) / 60;
  let base;
  if (sinceNadir <= riseLen) {
    base = 0.1 + 0.5 * (1 - Math.cos((Math.PI * sinceNadir) / riseLen)) / 2;
  } else {
    const x = sinceNadir - riseLen;
    const tau = 5;
    const norm = (Math.exp(-x / tau) - Math.exp(-fallLen / tau)) / (1 - Math.exp(-fallLen / tau));
    base = 0.1 + 0.5 * norm;
  }
  const car = 0.36 * gauss(relHours(wake, t), 35 / 60, 25 / 60);
  return Math.min(1, base + car);
}

/**
 * Circadian alerting signal (Process C), 0–1. Peaks in the wake maintenance zone
 * (~1 h before DLMO) and bottoms out at the core body temperature minimum.
 */
export function circadianAlertingAt(t, dlmo) {
  const peak = wrap(dlmo - 60);
  const trough = wrap(dlmo + DLMO_TO_CBTMIN);
  const fall = forward(peak, trough);
  const s = forward(peak, t);
  if (s <= fall) return 0.5 + 0.5 * Math.cos((Math.PI * s) / fall);
  const rise = DAY - fall;
  return 0.5 - 0.5 * Math.cos((Math.PI * (s - fall)) / rise);
}

/**
 * Process S (homeostatic sleep pressure) over one day of a repeating schedule, in steady
 * state. Returns a function of clock time -> S in 0–1.
 */
export function processS(onset, wake, stepMin = 5) {
  const asleep = (t) => inWindow(t, onset, wake);
  const kRise = Math.exp(-stepMin / (TAU_RISE_H * 60));
  const kDecay = Math.exp(-stepMin / (TAU_DECAY_H * 60));
  let S = 0.5;
  const steps = DAY / stepMin;
  const table = new Float64Array(steps);
  for (let day = 0; day < 15; day++) {
    for (let i = 0; i < steps; i++) {
      const t = i * stepMin;
      S = asleep(t) ? S * kDecay : 1 - (1 - S) * kRise;
      if (day === 14) table[i] = S;
    }
  }
  return (t) => table[Math.floor(wrap(t) / stepMin) % steps];
}

/**
 * Sample all curves across a noon-to-noon day.
 * @param {object} phase      result of estimatePhase
 * @param {{onset:number, wake:number}} sleep  habitual sleep onset & wake (minutes)
 * @param {number|null} brightLightUntil  clock time evening bright light / screens ended
 */
export function dailyProfile(phase, sleep, { brightLightUntil = null, stepMin = 10 } = {}) {
  const S = processS(sleep.onset, sleep.wake);
  const points = [];
  for (let m = 0; m <= DAY; m += stepMin) {
    const t = wrap(720 + m);
    let mel = melatoninAt(t, phase.dlmo);
    // Room light before bed suppresses and delays melatonin (Gooley 2011). The 50 %
    // factor is illustrative of the reported effect size, not a per-person prediction.
    const lightOn =
      brightLightUntil != null && inWindow(t, wrap(phase.dlmo - 120), brightLightUntil) &&
      forward(phase.dlmo - 120, brightLightUntil) < 12 * 60;
    if (lightOn) mel *= 0.5;
    // Recover over ~45 min after the light ends rather than jumping back instantly.
    else if (brightLightUntil != null && forward(brightLightUntil, t) < 45) {
      mel *= 0.5 + 0.5 * (forward(brightLightUntil, t) / 45);
    }
    points.push({
      offset: m,
      clock: t,
      melatonin: mel,
      cortisol: cortisolAt(t, phase.dlmo, sleep.wake),
      sleepPressure: S(t),
      alerting: circadianAlertingAt(t, phase.dlmo),
      asleep: inWindow(t, sleep.onset, sleep.wake),
      lightSuppressed: lightOn,
    });
  }
  return points;
}
