// Importers for real-world data. All parsing is local; nothing is uploaded.
//
// 1. Apple Health export (export.xml from Health app → profile → Export All Health Data):
//    - HKCategoryTypeIdentifierSleepAnalysis records → nightly sleep timing
//      (InBed, Asleep / AsleepUnspecified / AsleepCore / AsleepDeep / AsleepREM, Awake)
//    - HKQuantityTypeIdentifierTimeInDaylight (Apple Watch, watchOS 10+) → outdoor light
// 2. Sleep diary CSV with a header row (column names match the app's field names, common
//    aliases accepted).
// 3. Wearable light-sensor CSV (e.g. Actiwatch, ActTrust, research loggers): a timestamp
//    column (or Date + Time columns) and a lux column, aggregated to 10-minute bins.

import { addDays, wrap, fmtClock } from './time.js';
import { BIN_MIN, BINS_PER_DAY, LUX } from './lightModel.js';

// ------------------------------------------------------------------ helpers

/** "2024-01-01 23:10:00 -0800" → { date, min, abs } in local wall-clock time (offset ignored). */
export function parseAppleDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || '');
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const min = Number(m[4]) * 60 + Number(m[5]) + Number(m[6] || 0) / 60;
  const abs = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 60000 + min;
  return { date, min, abs };
}

const absToDate = (abs) => new Date(Math.floor(abs / 1440) * 86400000).toISOString().slice(0, 10);
const absToClock = (abs) => fmtClock(wrap(Math.round(abs)));

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** Union length (minutes) of intervals clipped to [lo, hi]. */
function unionMinutes(intervals, lo = -Infinity, hi = Infinity) {
  const iv = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of iv) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

// ------------------------------------------------------------------ Apple Health

const ASLEEP = new Set([
  'HKCategoryValueSleepAnalysisAsleep',
  'HKCategoryValueSleepAnalysisAsleepUnspecified',
  'HKCategoryValueSleepAnalysisAsleepCore',
  'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM',
]);
const IN_BED = 'HKCategoryValueSleepAnalysisInBed';

/**
 * Streaming parser: call push() with text chunks of export.xml (it can be hundreds of MB),
 * then finish(). Only <Record> opening tags of the two types we need are kept.
 */
export class AppleHealthParser {
  constructor() {
    this.buf = '';
    this.sleep = []; // { source, value, start, end } (abs minutes)
    this.daylight = []; // [start, end]
    this.records = 0;
  }

  push(chunk) {
    this.buf += chunk;
    let idx = 0;
    for (;;) {
      const s = this.buf.indexOf('<Record ', idx);
      if (s < 0) {
        idx = Math.max(idx, this.buf.length - 8); // keep a possible partial "<Record"
        break;
      }
      const e = this.buf.indexOf('>', s);
      if (e < 0) {
        idx = s;
        break;
      }
      this.handle(this.buf.slice(s, e));
      idx = e + 1;
    }
    this.buf = this.buf.slice(idx);
  }

  handle(tag) {
    const isSleep = tag.includes('HKCategoryTypeIdentifierSleepAnalysis');
    const isDaylight = tag.includes('HKQuantityTypeIdentifierTimeInDaylight');
    if (!isSleep && !isDaylight) return;
    const a = attrs(tag);
    const start = parseAppleDate(a.startDate);
    const end = parseAppleDate(a.endDate);
    if (!start || !end || end.abs <= start.abs) return;
    this.records++;
    if (isSleep) this.sleep.push({ source: a.sourceName || 'unknown', value: a.value, start: start.abs, end: end.abs });
    else this.daylight.push([start.abs, end.abs]);
  }

  finish() {
    return buildAppleResult(this.sleep, this.daylight, this.records);
  }
}

export function parseAppleHealthXml(text) {
  const p = new AppleHealthParser();
  p.push(text);
  return p.finish();
}

function buildAppleResult(sleep, daylight, records) {
  // Cluster each source's records into sessions (gaps ≤ 90 min belong together).
  const bySource = new Map();
  for (const r of sleep) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push(r);
  }
  const best = new Map(); // nightDate -> session summary with most sleep
  for (const recs of bySource.values()) {
    recs.sort((a, b) => a.start - b.start);
    let session = [];
    let end = -Infinity;
    const flush = () => {
      if (!session.length) return;
      const s = summarizeSession(session);
      // Prefer sessions with measured sleep (e.g. Watch stages) over "in bed only" data,
      // then the session with the most sleep (avoids double counting overlapping sources).
      const rank = (x) => (x.measured ? 1e6 : 0) + x.asleepMin;
      if (s && (!best.has(s.date) || rank(best.get(s.date)) < rank(s))) best.set(s.date, s);
      session = [];
    };
    for (const r of recs) {
      if (r.start - end > 90) flush();
      session.push(r);
      end = Math.max(end, r.end);
    }
    flush();
  }

  const entries = [...best.values()]
    .filter((s) => s.asleepMin >= 120) // main sleep only, not naps
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => s.entry);

  // Daylight → 10-min bins of outdoor light, and morning outdoor minutes per night.
  const lightLog = {};
  for (const [a, b] of daylight) {
    for (let t = Math.floor(a / BIN_MIN) * BIN_MIN; t < b; t += BIN_MIN) {
      const covered = Math.min(b, t + BIN_MIN) - Math.max(a, t);
      if (covered < BIN_MIN / 2) continue;
      const date = absToDate(t);
      const bin = Math.floor((t - Math.floor(t / 1440) * 1440) / BIN_MIN);
      if (!lightLog[date]) lightLog[date] = Array(BINS_PER_DAY).fill(null);
      lightLog[date][bin] = LUX.outdoor;
    }
  }
  if (daylight.length) {
    for (const s of best.values()) {
      if (!s.entry) continue;
      s.entry.morningLightMin = Math.round(unionMinutes(daylight, s.outAbs, s.outAbs + 120));
    }
  }

  return { entries, lightLog, records, nights: entries.length, daylightRecords: daylight.length };
}

function summarizeSession(recs) {
  const asleep = recs.filter((r) => ASLEEP.has(r.value)).map((r) => [r.start, r.end]);
  const inBed = recs.filter((r) => r.value === IN_BED).map((r) => [r.start, r.end]);
  const first = Math.min(...recs.map((r) => r.start));
  const date = absToDate(first - 720); // night belongs to the evening it started
  if (!asleep.length) {
    // iPhone-only "In Bed" data: use it as an approximation of the sleep period.
    if (!inBed.length) return null;
    const bed = Math.min(...inBed.map((i) => i[0]));
    const out = Math.max(...inBed.map((i) => i[1]));
    const minutes = unionMinutes(inBed);
    return {
      date,
      asleepMin: minutes,
      measured: false,
      outAbs: out,
      entry: { date, bedTime: absToClock(bed), wakeTime: absToClock(out), outOfBedTime: absToClock(out), latencyMin: 15, wasoMin: 0, source: 'apple-health (in bed only)' },
    };
  }
  const onset = Math.min(...asleep.map((i) => i[0]));
  const wake = Math.max(...asleep.map((i) => i[1]));
  const bed = inBed.length ? Math.min(onset, ...inBed.map((i) => i[0])) : onset;
  const out = inBed.length ? Math.max(wake, ...inBed.map((i) => i[1])) : wake;
  const asleepMin = unionMinutes(asleep, onset, wake);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return {
    date,
    asleepMin,
    measured: true,
    outAbs: out,
    entry: {
      date,
      bedTime: absToClock(bed),
      latencyMin: Math.round(onset - bed),
      wakeTime: absToClock(wake),
      outOfBedTime: absToClock(out),
      wasoMin: Math.round(wake - onset - asleepMin),
      freeDay: dow === 5 || dow === 6, // Fri/Sat nights; editable in the log
      source: 'apple-health',
    },
  };
}

// ------------------------------------------------------------------ CSV

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). Auto-detects , ; or tab. */
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const DIARY_ALIASES = {
  date: ['date', 'night', 'nightof', 'evening'],
  bedTime: ['bedtime', 'bed', 'lightsout', 'inbed', 'timeinbed'],
  latencyMin: ['latencymin', 'latency', 'sleeplatency', 'sol', 'minutestofallasleep'],
  wakeTime: ['waketime', 'wake', 'wakeup', 'finalawakening'],
  outOfBedTime: ['outofbedtime', 'outofbed', 'getup', 'risetime'],
  wasoMin: ['wasomin', 'waso', 'awakemin', 'minutesawake'],
  quality: ['quality', 'sleepquality', 'rating'],
  freeDay: ['freeday', 'free', 'weekend', 'dayoff'],
  alarm: ['alarm', 'alarmused'],
  alcoholDrinks: ['alcoholdrinks', 'alcohol', 'drinks'],
  alcoholLastTime: ['alcohollasttime', 'lastdrink'],
  exerciseIntensity: ['exerciseintensity', 'exercise'],
  exerciseEnd: ['exerciseend', 'exercisetime'],
  morningLightMin: ['morninglightmin', 'morninglight', 'outdoorlight', 'daylight'],
  screensUntil: ['screensuntil', 'screens', 'lastscreen'],
  lastMealTime: ['lastmealtime', 'lastmeal', 'dinner'],
  napStart: ['napstart', 'naptime'],
  napMin: ['napmin', 'nap', 'naplength'],
  caffeineTime: ['caffeinetime', 'lastcaffeine', 'coffeetime'],
  caffeineMg: ['caffeinemg', 'caffeine', 'coffeemg'],
};
const NUMERIC = new Set(['latencyMin', 'wasoMin', 'quality', 'alcoholDrinks', 'morningLightMin', 'napMin', 'caffeineMg']);
const BOOL = new Set(['freeDay', 'alarm']);

function normTime(v) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(v.trim());
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function normDate(v) {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); // US month/day/year
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

/** Sleep-diary CSV → entries. Returns { entries, skipped, columns }. */
export function parseSleepCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { entries: [], skipped: 0, columns: [] };
  const header = rows[0].map(norm);
  const col = {};
  for (const [field, aliases] of Object.entries(DIARY_ALIASES)) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) col[field] = i;
  }
  if (col.date == null || col.bedTime == null || col.wakeTime == null) {
    throw new Error('CSV needs at least date, bedTime and wakeTime columns');
  }
  const entries = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const e = {};
    for (const [field, i] of Object.entries(col)) {
      const v = (r[i] ?? '').trim();
      if (field === 'date') e.date = normDate(v);
      else if (NUMERIC.has(field)) e[field] = v === '' ? '' : Number(v);
      else if (BOOL.has(field)) e[field] = /^(1|y|yes|true|x)$/i.test(v);
      else if (field === 'exerciseIntensity') e[field] = ['light', 'moderate', 'vigorous'].includes(v.toLowerCase()) ? v.toLowerCase() : 'none';
      else e[field] = normTime(v);
    }
    if (e.caffeineTime && Number(e.caffeineMg) > 0) e.caffeine = [{ time: e.caffeineTime, mg: Number(e.caffeineMg) }];
    delete e.caffeineTime;
    delete e.caffeineMg;
    if (!e.date || !e.bedTime || !e.wakeTime) {
      skipped++;
      continue;
    }
    e.source = 'csv';
    entries.push(e);
  }
  return { entries, skipped, columns: Object.keys(col) };
}

/**
 * Light-sensor CSV → { lightLog, samples, days }. Accepts a single timestamp column
 * ("2024-01-01 23:10:00", ISO "2024-01-01T23:10:00", "01/02/2024 23:10") or separate
 * Date and Time columns, plus a lux column (lux, light, white light, illuminance).
 */
export function parseLightCsv(text) {
  const rows = parseCsv(text);
  // Some device exports put metadata above the header: find the first row with a lux column.
  const isLux = (h) => /lux|whitelight|^light$|illuminance|ambientlight/.test(h);
  const hIdx = rows.findIndex((r) => r.map(norm).some(isLux));
  if (hIdx < 0) throw new Error('No lux / light column found');
  const header = rows[hIdx].map(norm);
  const luxI = header.findIndex(isLux);
  const tsI = header.findIndex((h) => ['timestamp', 'datetime', 'localtime', 'datetimelocal'].includes(h));
  const dateI = header.indexOf('date');
  const timeI = header.indexOf('time');
  const sums = {};
  let samples = 0;
  for (const r of rows.slice(hIdx + 1)) {
    let ts;
    if (tsI >= 0) ts = r[tsI];
    else if (dateI >= 0 && timeI >= 0) ts = `${r[dateI]} ${r[timeI]}`;
    else if (timeI >= 0) ts = r[timeI];
    if (!ts) continue;
    const [dPart, tPart = ''] = ts.trim().split(/[ T]/);
    const date = normDate(dPart);
    const clock = normTime(tPart.slice(0, 8).replace(/(\d{2}:\d{2}):\d{2}/, '$1') + (/(am|pm)/i.exec(ts)?.[0] ?? ''));
    const lux = Number(String(r[luxI]).replace(',', '.'));
    if (!date || !clock || !Number.isFinite(lux)) continue;
    const [hh, mm] = clock.split(':').map(Number);
    const bin = Math.floor((hh * 60 + mm) / BIN_MIN);
    const key = `${date}|${bin}`;
    if (!sums[key]) sums[key] = [0, 0];
    sums[key][0] += lux;
    sums[key][1]++;
    samples++;
  }
  const lightLog = {};
  for (const [key, [s, n]] of Object.entries(sums)) {
    const [date, bin] = key.split('|');
    if (!lightLog[date]) lightLog[date] = Array(BINS_PER_DAY).fill(null);
    lightLog[date][Number(bin)] = Math.round((s / n) * 10) / 10;
  }
  return { lightLog, samples, days: Object.keys(lightLog).length };
}

/** Merge imported light into existing log (imported bins win where present). */
export function mergeLightLog(existing = {}, incoming = {}) {
  const out = { ...existing };
  for (const [date, bins] of Object.entries(incoming)) {
    const prev = out[date] ? [...out[date]] : Array(BINS_PER_DAY).fill(null);
    bins.forEach((v, i) => {
      if (v != null) prev[i] = v;
    });
    out[date] = prev;
  }
  return out;
}

/**
 * Merge imported nights into existing entries: device timing replaces the sleep-timing
 * fields, while habits the user already logged for that night are kept.
 */
export function mergeEntries(existing, incoming) {
  const byDate = new Map(existing.map((e) => [e.date, e]));
  for (const inc of incoming) {
    const prev = byDate.get(inc.date);
    byDate.set(inc.date, prev ? { ...prev, ...inc, freeDay: prev.freeDay ?? inc.freeDay, morningLightMin: inc.morningLightMin ?? prev.morningLightMin } : inc);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Keep only the most recent `days` of light data (storage is limited). */
export function pruneLightLog(log, days = 45) {
  const dates = Object.keys(log).sort();
  if (!dates.length) return log;
  const cutoff = addDays(dates.at(-1), -days);
  return Object.fromEntries(Object.entries(log).filter(([d]) => d > cutoff));
}
