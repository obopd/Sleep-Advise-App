// Per-night metrics and multi-night summaries computed from sleep-diary entries.
//
// A diary entry describes one night and is keyed by the date the night *started*:
// {
//   date: 'YYYY-MM-DD', freeDay: boolean, alarm: boolean,
//   bedTime: 'HH:MM', latencyMin: number, wakeTime: 'HH:MM', outOfBedTime: 'HH:MM',
//   wasoMin: number, quality: 1-5,
//   caffeine: [{ time: 'HH:MM', mg: number }], alcoholDrinks: number, alcoholLastTime: 'HH:MM',
//   exerciseEnd: 'HH:MM', exerciseIntensity: 'none'|'light'|'moderate'|'vigorous',
//   morningLightMin: number, screensUntil: 'HH:MM', lastMealTime: 'HH:MM',
//   napStart: 'HH:MM', napMin: number,
// }
// Field definitions follow the Consensus Sleep Diary (Carney et al., Sleep 2012).

import { parseHHMM, forward, wrap, circularMean, circularSD, daysBetween, DAY } from './time.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

/** Derive objective-style metrics for one night. Returns null if core times are missing. */
export function computeNight(entry) {
  const bed = parseHHMM(entry.bedTime);
  const wake = parseHHMM(entry.wakeTime);
  if (bed == null || wake == null) return null;
  const out = parseHHMM(entry.outOfBedTime) ?? wake;
  const latency = Math.max(0, num(entry.latencyMin, 15));
  const waso = Math.max(0, num(entry.wasoMin, 0));

  const onset = wrap(bed + latency);
  const sleepPeriod = forward(onset, wake); // sleep onset -> final awakening
  const tib = forward(bed, out); // time in bed
  const tst = Math.max(0, sleepPeriod - waso); // total sleep time
  const efficiency = tib > 0 ? tst / tib : 0;
  const midSleep = wrap(onset + sleepPeriod / 2);

  return {
    date: entry.date,
    freeDay: Boolean(entry.freeDay),
    alarm: Boolean(entry.alarm),
    bed,
    onset,
    wake,
    out,
    latency,
    waso,
    sleepPeriod,
    tib,
    tst,
    efficiency,
    midSleep,
    quality: entry.quality != null && entry.quality !== '' ? num(entry.quality) : null,
  };
}

/** Sort entries by date and drop any that lack core times. */
export function validNights(entries) {
  return entries
    .map(computeNight)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Sleep Regularity Index (Phillips et al. 2017): the probability of being in the same
 * state (asleep/awake) at any two time points 24 h apart, scaled to -100..100.
 * 100 = perfectly regular, ~0 = random. Only consecutive calendar nights are compared.
 * Each night is placed in a noon-to-noon window starting at noon on its date.
 */
export function sleepRegularityIndex(nights) {
  const windows = new Map();
  for (const n of nights) {
    const arr = new Uint8Array(DAY);
    const start = wrap(n.onset - 720); // minutes after noon
    // An onset before noon (e.g. 13:00 nap-like, or after-noon shift) is treated as the same window.
    for (let m = 0; m < n.sleepPeriod; m++) {
      const idx = start + m;
      if (idx < DAY) arr[idx] = 1;
    }
    windows.set(n.date, arr);
  }
  let matches = 0;
  let total = 0;
  for (const n of nights) {
    const a = windows.get(n.date);
    const nextDate = nights.find((x) => daysBetween(n.date, x.date) === 1)?.date;
    if (!nextDate) continue;
    const b = windows.get(nextDate);
    for (let m = 0; m < DAY; m++) {
      if (a[m] === b[m]) matches++;
      total++;
    }
  }
  if (total === 0) return null;
  return -100 + (200 * matches) / total;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Summary statistics over the most recent `windowDays` nights (default 14). */
export function summarize(entries, windowDays = 14) {
  const all = validNights(entries);
  if (!all.length) return null;
  const last = all[all.length - 1].date;
  const nights = all.filter((n) => daysBetween(n.date, last) < windowDays);

  const quality = nights.map((n) => n.quality).filter((q) => q != null);
  const longLatency = nights.filter((n) => n.latency > 30).length;
  const longWaso = nights.filter((n) => n.waso > 30).length;

  return {
    nights,
    count: nights.length,
    avgTst: mean(nights.map((n) => n.tst)),
    avgTib: mean(nights.map((n) => n.tib)),
    avgEfficiency: mean(nights.map((n) => n.efficiency)),
    avgLatency: mean(nights.map((n) => n.latency)),
    avgWaso: mean(nights.map((n) => n.waso)),
    avgQuality: mean(quality),
    meanOnset: circularMean(nights.map((n) => n.onset)),
    meanWake: circularMean(nights.map((n) => n.wake)),
    meanMid: circularMean(nights.map((n) => n.midSleep)),
    onsetSD: circularSD(nights.map((n) => n.onset)),
    wakeSD: circularSD(nights.map((n) => n.wake)),
    midSD: circularSD(nights.map((n) => n.midSleep)),
    sri: sleepRegularityIndex(nights),
    // Fraction of nights with an insomnia-range symptom (>30 min to fall asleep or awake).
    insomniaSymptomRate: nights.length
      ? nights.filter((n) => n.latency > 30 || n.waso > 30).length / nights.length
      : 0,
    longLatencyNights: longLatency,
    longWasoNights: longWaso,
  };
}
