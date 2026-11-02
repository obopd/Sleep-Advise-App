// Builds light-exposure time series for the Forger 1999 model and runs it to
// (a) estimate circadian phase from real wearable light data, and
// (b) predict how a proposed schedule will move the clock day by day.
//
// Light sources, in priority order for each 10-minute bin:
//   1. measured lux from a wearable light sensor (imported CSV)
//   2. Apple Watch "Time in Daylight" minutes (treated as outdoor light)
//   3. imputed from the sleep diary using the typical levels below
//
// Imputed levels are assumptions, deliberately conservative:
//   in bed / asleep: 0 lux; typical indoor daytime: 250 lux; evening room light: 100 lux;
//   dimmed evening (as recommended): 10 lux; outdoors: 3000 lux (overcast daylight is
//   ~1,000–10,000 lux). Typical indoor and outdoor ranges: Brown et al. 2022.

import { entrain, simulate, cbtMinTimes, DT_H, STEPS_PER_DAY, FORGER99 } from './forger99.js';
import { parseHHMM, wrap, forward, circularMean, daysBetween, addDays } from './time.js';
import { computeNight } from './sleepMetrics.js';

export const LUX = Object.freeze({ dark: 0, dim: 10, evening: 100, indoor: 250, outdoor: 3000 });
export const BIN_MIN = 10; // stored wearable light resolution
export const BINS_PER_DAY = 1440 / BIN_MIN;

const STEP_MIN = DT_H * 60;

/** Fill [startMin, endMin) (minutes from series start) with a lux value. */
function fill(arr, startMin, endMin, lux) {
  const a = Math.max(0, Math.floor(startMin / STEP_MIN));
  const b = Math.min(arr.length, Math.ceil(endMin / STEP_MIN));
  for (let i = a; i < b; i++) arr[i] = lux;
}

/** Absolute minute (from midnight of `originDate`) of a clock time on the evening/night of `date`. */
function eveningAbs(originDate, date, clock) {
  const dayOffset = daysBetween(originDate, date) * 1440;
  return dayOffset + (clock < 720 ? clock + 1440 : clock);
}

/**
 * Paint one night (and the following morning) of diary data onto the series.
 * `night` fields are clock minutes; see describeNight().
 */
function paintNight(arr, originDate, nt, { dimEvening = false } = {}) {
  const bedAbs = eveningAbs(originDate, nt.date, nt.bed);
  const outAbs = bedAbs + forward(nt.bed, nt.out);
  // Evening (3 h before bed): room light, or dim if the person dims after screens.
  const eveStart = bedAbs - 180;
  if (dimEvening) {
    fill(arr, eveStart, bedAbs, LUX.dim);
  } else if (nt.screensUntil != null) {
    const scrAbs = bedAbs + ((nt.screensUntil - nt.bed + 2160) % 1440) - 720; // nearest to bed
    fill(arr, eveStart, Math.min(scrAbs, bedAbs), LUX.evening);
    fill(arr, Math.min(scrAbs, bedAbs), bedAbs, LUX.dim);
  } else {
    fill(arr, eveStart, bedAbs, LUX.evening);
  }
  // Morning outdoor light right after getting up.
  if (nt.morningLightMin > 0) fill(arr, outAbs, outAbs + nt.morningLightMin, LUX.outdoor);
  // In bed = dark (painted last so it always wins).
  fill(arr, bedAbs, outAbs, LUX.dark);
  // Nap on the day of `date` (afternoon before the night).
  if (nt.napStart != null && nt.napMin > 0) {
    const napAbs = daysBetween(originDate, nt.date) * 1440 + nt.napStart;
    fill(arr, napAbs, napAbs + nt.napMin, LUX.dark);
  }
}

/** Normalise a diary entry into the fields the light painter needs. */
export function describeNight(entry) {
  const n = computeNight(entry);
  if (!n) return null;
  return {
    date: entry.date,
    bed: n.bed,
    out: n.out,
    morningLightMin: Number(entry.morningLightMin) || 0,
    screensUntil: parseHHMM(entry.screensUntil),
    napStart: parseHHMM(entry.napStart),
    napMin: Number(entry.napMin) || 0,
  };
}

/** A typical night built from the averages of several nights (for entrainment). */
export function habitualNight(nights) {
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const scr = nights.map((n) => n.screensUntil).filter((v) => v != null);
  return {
    bed: circularMean(nights.map((n) => n.bed)),
    out: circularMean(nights.map((n) => n.out)),
    morningLightMin: avg(nights.map((n) => n.morningLightMin)),
    screensUntil: scr.length ? circularMean(scr) : null,
    napStart: null,
    napMin: 0,
  };
}

/** A single 24 h light day (midnight → midnight) for a repeating routine. */
export function routineDay(nt, opts) {
  const arr = new Float64Array(STEPS_PER_DAY * 3).fill(LUX.indoor);
  // Paint yesterday's and today's nights onto a 3-day canvas, then cut out the middle day.
  paintNight(arr, '2000-01-01', { ...nt, date: '2000-01-01' }, opts);
  paintNight(arr, '2000-01-01', { ...nt, date: '2000-01-02' }, opts);
  paintNight(arr, '2000-01-01', { ...nt, date: '2000-01-03' }, opts);
  return arr.slice(STEPS_PER_DAY, STEPS_PER_DAY * 2);
}

/** Most recent run of consecutive diary nights (max `maxNights`). */
export function lastContiguousBlock(entries, maxNights = 14) {
  const nights = entries.map(describeNight).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const block = [];
  for (let i = nights.length - 1; i >= 0 && block.length < maxNights; i--) {
    if (block.length && daysBetween(nights[i].date, block[0].date) !== 1) break;
    block.unshift(nights[i]);
  }
  return block;
}

/**
 * Light series covering the diary block: from midnight of the first night's date to
 * midnight two days after the last night's date.
 * @param lightLog  { 'YYYY-MM-DD': (number|null)[] } 10-min bins of measured lux / daylight
 */
export function buildSeries(block, lightLog = {}) {
  const origin = block[0].date;
  const days = daysBetween(origin, block.at(-1).date) + 2;
  const arr = new Float64Array(days * STEPS_PER_DAY).fill(LUX.indoor);
  // Morning of the first day: assume the habitual previous night.
  const habit = habitualNight(block);
  paintNight(arr, origin, { ...habit, date: addDays(origin, -1) });
  for (const nt of block) paintNight(arr, origin, nt);

  let measuredBins = 0;
  for (let d = 0; d < days; d++) {
    const bins = lightLog[addDays(origin, d)];
    if (!Array.isArray(bins)) continue;
    bins.forEach((v, b) => {
      if (v == null || !Number.isFinite(v)) return;
      measuredBins++;
      const start = d * 1440 + b * BIN_MIN;
      fill(arr, start, start + BIN_MIN, Math.max(0, v));
    });
  }
  return { origin, days, lux: arr, measuredFraction: measuredBins / (days * BINS_PER_DAY) };
}

/**
 * Estimate DLMO with the Forger 1999 model from the diary block and any measured light.
 * Returns null when there are fewer than 3 consecutive nights.
 */
export function modelPhase(entries, lightLog = {}) {
  const block = lastContiguousBlock(entries);
  if (block.length < 3) return null;
  const { lux, measuredFraction, origin } = buildSeries(block, lightLog);
  const init = entrain(routineDay(habitualNight(block)));
  const { x } = simulate(lux, init);
  const mins = cbtMinTimes(x);
  if (!mins.length) return null;
  const cbtH = mins.at(-1);
  const cbtMin = wrap(Math.round(cbtH * 60));
  return {
    dlmo: wrap(cbtMin - FORGER99.cbtToDlmo * 60),
    cbtMin,
    nights: block.length,
    measuredFraction,
    origin,
  };
}

/**
 * Predict the day-by-day phase shift produced by a schedule plan.
 * @param current   habitual routine (describeNight shape, without date)
 * @param steps     [{ lightsOut, wake }] clock minutes, one per day
 * @param opts.morningLightMin  outdoor minutes after waking during the plan (default 30)
 * @param opts.extraDays        days to keep simulating the final step (default 7)
 * Returns per-day predicted shift of DLMO relative to today (minutes, negative = earlier).
 */
export function predictShift(current, steps, { morningLightMin = 30, extraDays = 7 } = {}) {
  const baseDay = routineDay(current);
  const init = entrain(baseDay);
  // Baseline DLMO of the current routine.
  const baseMins = cbtMinTimes(simulate(new Float64Array([...baseDay, ...baseDay, ...baseDay]), init).x);
  const baseCbt = (baseMins.at(-1) % 24) * 60;

  const all = [...steps, ...Array(extraDays).fill(steps.at(-1))];
  const series = [];
  for (const s of all) {
    series.push(
      routineDay(
        { bed: s.lightsOut, out: wrap(s.wake + 10), morningLightMin, screensUntil: null, napStart: null, napMin: 0 },
        { dimEvening: true },
      ),
    );
  }
  const lux = new Float64Array(series.length * STEPS_PER_DAY);
  series.forEach((d, i) => lux.set(d, i * STEPS_PER_DAY));
  const mins = cbtMinTimes(simulate(lux, init).x);

  return mins.slice(0, all.length).map((t, i) => {
    let shift = (t % 24) * 60 - baseCbt;
    if (shift > 720) shift -= 1440;
    if (shift < -720) shift += 1440;
    return { day: i + 1, shiftMin: Math.round(shift), planDay: i < steps.length };
  });
}
