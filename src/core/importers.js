// Importers (spec Phase 7). File-based, processed on the device; nothing is uploaded.
//
// Supported (technically possible in a web app, no vendor credentials needed):
//   1. Apple Health export.xml — sleep analysis (In Bed / stages) and Apple Watch
//      "Time in Daylight". Apple's timestamps carry a UTC offset, so instants are exact.
//      The IANA zone is not in the export; the user's current zone is recorded and flagged.
//   2. Sleep-diary CSV (date, bedTime, wakeTime, ... from other apps).
//   3. Light-sensor CSV (timestamp + lux), e.g. Actiwatch / ActTrust exports.
// Imported records keep their own source; they never overwrite user entries.

import { migrateV1 } from './repo.js';
import { localToInstant, toIso, MIN_MS } from './time.js';

const BIN_MIN = 10;

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

/** Sleep-diary CSV → { tables: { sleep_episodes, substance_events, ... }, skipped }. */
export function sleepCsvToRecords(text, tz) {
  const { entries, skipped } = parseSleepCsv(text);
  const s = migrateV1({ entries }, { tz });
  const tables = {};
  for (const [t, rows] of Object.entries(s.tables)) {
    if (!rows.length || t === 'laboratory_measurements') continue;
    tables[t] = rows.map(({ id, user_id, created_at, updated_at, source, ...rest }) => ({ ...rest, quality_flags: undefined }));
  }
  return { tables, skipped, nights: entries.length };
}

/**
 * Light-sensor CSV → sensor light events (mean lux per 10-min bin). Timestamps without an
 * offset are read as local time in `tz` (flagged in measurement_quality).
 */
export function lightCsvToRecords(text, tz, { sensorPosition = 'unknown', sensorSource = 'light sensor CSV' } = {}) {
  const rows = parseCsv(text);
  const isLux = (h) => /lux|whitelight|^light$|illuminance|ambientlight/.test(h);
  const hIdx = rows.findIndex((r) => r.map(norm).some(isLux));
  if (hIdx < 0) throw new Error('No lux / light column found');
  const header = rows[hIdx].map(norm);
  const luxI = header.findIndex(isLux);
  const tsI = header.findIndex((h) => ['timestamp', 'datetime', 'localtime', 'datetimelocal'].includes(h));
  const dateI = header.indexOf('date');
  const timeI = header.indexOf('time');
  const bins = new Map();
  let samples = 0;
  let rejected = 0;
  let localTimes = 0;
  for (const r of rows.slice(hIdx + 1)) {
    let ts = tsI >= 0 ? r[tsI] : dateI >= 0 && timeI >= 0 ? `${r[dateI]} ${r[timeI]}` : null;
    if (!ts) continue;
    ts = ts.trim();
    let ms = null;
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts) && Number.isFinite(Date.parse(ts.replace(' ', 'T')))) ms = Date.parse(ts.replace(' ', 'T'));
    else {
      const [dPart, tPart = ''] = ts.split(/[ T]/);
      const date = normDate(dPart);
      const clock = normTime(tPart.slice(0, 8).replace(/(\d{2}:\d{2}):\d{2}/, '$1') + (/(am|pm)/i.exec(ts)?.[0] ?? ''));
      if (date && clock) {
        ms = localToInstant(`${date}T${clock}`, tz).ms;
        localTimes++;
      }
    }
    const lux = Number(String(r[luxI]).replace(',', '.'));
    if (ms == null || !Number.isFinite(lux)) continue;
    if (lux < 0 || lux > 200000) { rejected++; continue; }
    const bin = Math.floor(ms / (BIN_MIN * MIN_MS));
    const b = bins.get(bin) ?? [0, 0];
    b[0] += lux;
    b[1]++;
    bins.set(bin, b);
    samples++;
  }
  const records = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([bin, [sum, n]]) => ({
    start_time: toIso(bin * BIN_MIN * MIN_MS),
    end_time: toIso((bin + 1) * BIN_MIN * MIN_MS),
    measurement_type: 'sensor',
    illuminance_lux: Math.round((sum / n) * 10) / 10,
    sensor_source: sensorSource,
    sensor_position: sensorPosition,
    measurement_quality: { samples: n, bin_minutes: BIN_MIN, timezone_assumed: localTimes > 0 },
  }));
  return { records, samples, rejected };
}

// ---------------------------------------------------------------------------- Apple Health

/** "2024-01-01 23:10:00 -0800" → epoch ms (exact, using the offset). */
export function parseAppleDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*([+-])(\d{2}):?(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const off = (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]);
  return wall - off * MIN_MS;
}

const ASLEEP = new Set(['HKCategoryValueSleepAnalysisAsleep', 'HKCategoryValueSleepAnalysisAsleepUnspecified', 'HKCategoryValueSleepAnalysisAsleepCore', 'HKCategoryValueSleepAnalysisAsleepDeep', 'HKCategoryValueSleepAnalysisAsleepREM']);
const IN_BED = 'HKCategoryValueSleepAnalysisInBed';
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

function unionMs(intervals) {
  const iv = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of iv) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b);
  }
  return cur ? total + cur[1] - cur[0] : total;
}

/** Streaming parser for export.xml (can be hundreds of MB): push() text chunks, then finish(). */
export class AppleHealthParser {
  constructor() { this.buf = ''; this.sleep = []; this.daylight = []; }
  push(chunk) {
    this.buf += chunk;
    let idx = 0;
    for (;;) {
      const s = this.buf.indexOf('<Record ', idx);
      if (s < 0) { idx = Math.max(idx, this.buf.length - 8); break; }
      const e = this.buf.indexOf('>', s);
      if (e < 0) { idx = s; break; }
      this.handle(this.buf.slice(s, e));
      idx = e + 1;
    }
    this.buf = this.buf.slice(idx);
  }
  handle(tag) {
    const isSleep = tag.includes('HKCategoryTypeIdentifierSleepAnalysis');
    const isDay = tag.includes('HKQuantityTypeIdentifierTimeInDaylight');
    if (!isSleep && !isDay) return;
    const a = attrs(tag);
    const start = parseAppleDate(a.startDate);
    const end = parseAppleDate(a.endDate);
    if (start == null || end == null || end <= start) return;
    if (isSleep) this.sleep.push({ source: a.sourceName || 'unknown', value: a.value, start, end });
    else this.daylight.push({ source: a.sourceName || 'unknown', start, end });
  }
  /** Returns { sleep_episodes: [fields], light_exposure_events: [fields] } ready for addRecord. */
  finish() {
    const bySource = new Map();
    for (const r of this.sleep) (bySource.get(r.source) ?? bySource.set(r.source, []).get(r.source)).push(r);
    const episodes = [];
    for (const [sourceName, recs] of bySource) {
      recs.sort((a, b) => a.start - b.start);
      let session = [];
      let end = -Infinity;
      const flush = () => { if (session.length) episodes.push(sessionToEpisode(session, sourceName)); session = []; };
      for (const r of recs) {
        if (r.start - end > 90 * MIN_MS) flush();
        session.push(r);
        end = Math.max(end, r.end);
      }
      flush();
    }
    const light = this.daylight.map((d) => ({
      start_time: toIso(d.start), end_time: toIso(d.end), measurement_type: 'device_daylight', indoor_outdoor_context: 'outdoor',
      sensor_source: d.source, sensor_position: 'wrist', measurement_quality: { note: 'Apple Watch Time in Daylight (no lux value).' },
    }));
    return { sleep_episodes: episodes.filter(Boolean), light_exposure_events: light };
  }
}

function sessionToEpisode(recs, sourceName) {
  const asleep = recs.filter((r) => ASLEEP.has(r.value)).map((r) => [r.start, r.end]);
  const inBed = recs.filter((r) => r.value === IN_BED).map((r) => [r.start, r.end]);
  const all = [...asleep, ...inBed];
  const start = Math.min(...all.map((x) => x[0]));
  const end = Math.max(...all.map((x) => x[1]));
  const flags = { device_source: sourceName, timezone_assumed: true };
  if (!asleep.length) {
    return { episode_type: (end - start) / MIN_MS >= 180 ? 'main' : 'nap', start_time: toIso(start), end_time: toIso(end), quality_flags: { ...flags, in_bed_only: true } };
  }
  const onset = Math.min(...asleep.map((x) => x[0]));
  const wake = Math.max(...asleep.map((x) => x[1]));
  const asleepMs = unionMs(asleep);
  return {
    episode_type: asleepMs / MIN_MS >= 180 ? 'main' : 'nap',
    start_time: toIso(start),
    onset_time: toIso(onset),
    final_awakening_time: toIso(wake),
    end_time: toIso(Math.max(end, wake)),
    wake_after_sleep_onset_minutes: Math.max(0, Math.round((wake - onset - asleepMs) / MIN_MS)),
    quality_flags: { ...flags, stages: true },
  };
}

export function parseAppleHealthXml(text) {
  const p = new AppleHealthParser();
  p.push(text);
  return p.finish();
}
