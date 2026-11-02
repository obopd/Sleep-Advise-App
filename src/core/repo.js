// Event store (pure functions over a plain state object; persistence lives in the UI layer).
//
// - Every record gets a stable UUID, provenance (`source`), the user's time zone and
//   audit timestamps.
// - Corrections never destroy the original observation: the previous version is pushed
//   onto `revisions` with the time it was replaced.
// - Model predictions are append-only.
// - The previous app version stored one row per calendar night; migrateV1 converts that
//   to timestamped events and keeps the untouched originals in `meta.v1_archive`.

import { TABLES, OBSERVATION_TABLES } from './schema.js';
import { validateRecord, hasErrors } from './validate.js';
import { localToInstant, toIso, toMs, MIN_MS, deviceTimeZone } from './time.js';

export const SCHEMA_VERSION = 2;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  (globalThis.crypto ?? { getRandomValues: (a) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Pseudonymous research ID, unrelated to the account ID. */
export const newParticipantId = () => `P-${uuid().slice(0, 8).toUpperCase()}`;

export function emptyState(now = Date.now(), tz = deviceTimeZone()) {
  const iso = toIso(now);
  return {
    schema_version: SCHEMA_VERSION,
    user: {
      id: uuid(),
      created_at: iso,
      updated_at: iso,
      timezone: tz,
      profile: {},
      consent: {},
      tracking: { meals: true, caffeine: true, alcohol: true, stress: true, activity: true, light: true, medications: false },
      onboarded: false,
    },
    research: { participant_id: newParticipantId(), enrolled: false },
    tables: Object.fromEntries(Object.keys(TABLES).map((t) => [t, []])),
    settings: { theme: 'auto', show_experimental: false },
    meta: {},
  };
}

/** Add a record. Returns { state, record, issues }; on errors the state is unchanged. */
export function addRecord(state, table, fields, { source = 'user', tz = state.user.timezone, now = Date.now() } = {}) {
  const iso = toIso(now);
  const base = table === 'laboratory_measurements'
    ? { id: uuid(), participant_id: state.research.participant_id, source, created_at: iso, tz }
    : { id: uuid(), user_id: state.user.id, source, tz, created_at: iso, updated_at: iso };
  const record = clean({ ...base, ...fields });
  const issues = validateRecord(table, record);
  if (hasErrors(issues)) return { state, record, issues };
  return { state: withTable(state, table, [...state.tables[table], record]), record, issues };
}

/** Correct a record. The previous version is kept in `revisions`. */
export function updateRecord(state, table, id, patch, { now = Date.now(), reason = 'user_correction' } = {}) {
  const prev = state.tables[table].find((r) => r.id === id);
  if (!prev) return { state, record: null, issues: [{ level: 'error', code: 'not_found', message: 'Record not found.' }] };
  const { revisions = [], ...previous } = prev;
  const record = clean({
    ...prev,
    ...patch,
    id: prev.id,
    user_id: prev.user_id,
    created_at: prev.created_at,
    updated_at: toIso(now),
    revisions: [...revisions, { replaced_at: toIso(now), reason, previous }],
  });
  const issues = validateRecord(table, record);
  if (hasErrors(issues)) return { state, record, issues };
  return { state: withTable(state, table, state.tables[table].map((r) => (r.id === id ? record : r))), record, issues };
}

/** Delete a record (the user's right to remove their own data). */
export function deleteRecord(state, table, id) {
  return withTable(state, table, state.tables[table].filter((r) => r.id !== id));
}

/** Append model predictions; earlier predictions are never replaced. */
export function appendPredictions(state, predictions) {
  return withTable(state, 'model_predictions', [...state.tables.model_predictions, ...predictions]);
}

function withTable(state, table, rows) {
  return { ...state, tables: { ...state.tables, [table]: rows } };
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));
}

export const observationCount = (state) => OBSERVATION_TABLES.reduce((n, t) => n + state.tables[t].length, 0);

// ---------------------------------------------------------------------------------------
// Migration from the v1 store ('sleep-advisor:v1': one entry per night, clock-time strings).

/** First instant at or after `afterMs` whose local clock time in tz is HH:MM. */
function nextClock(afterMs, clock, tz) {
  if (!/^\d{1,2}:\d{2}$/.test(clock || '')) return null;
  const day = new Date(afterMs).toISOString().slice(0, 10);
  for (let d = -1; d <= 2; d++) {
    const date = new Date(Date.parse(`${day}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    const { ms } = localToInstant(`${date}T${clock.padStart(5, '0')}`, tz);
    if (ms != null && ms >= afterMs) return ms;
  }
  return null;
}

function at(date, clock, tz) {
  if (!/^\d{1,2}:\d{2}$/.test(clock || '')) return null;
  return localToInstant(`${date}T${clock.padStart(5, '0')}`, tz).ms;
}

export function migrateV1(v1, { tz = deviceTimeZone(), now = Date.now() } = {}) {
  let state = emptyState(now, tz);
  const p = v1?.profile ?? {};
  state.user.profile = {
    birthday: p.birthday || null,
    age_years_reported: p.birthday ? null : p.age || null,
    work_wake_time: p.workWake || null,
    preferred_sleep_hours: p.personalNeedHours ? Number(p.personalNeedHours) : null,
    shift_work: p.shiftWork ? 'yes' : 'unknown',
    mctq: p.mctq ?? null,
    screening: p.screening ?? {},
  };
  state.user.onboarded = Boolean(p.onboarded || v1?.entries?.length);
  state.settings.theme = v1?.settings?.theme ?? 'auto';
  state.meta = { migrated_from_v1_at: toIso(now), v1_archive: v1 };
  const opts = { source: 'migration_v1', tz, now };
  const add = (table, fields) => {
    const r = addRecord(state, table, fields, opts);
    state = r.state;
    return r;
  };

  for (const e of v1?.entries ?? []) {
    // In v1, `date` is the evening the night started and bedTime meant "got into bed / lights out".
    const bed = at(e.date, e.bedTime, tz);
    if (bed == null) continue;
    const bedMs = Number(e.bedTime.split(':')[0]) < 12 ? bed + 86_400_000 : bed; // 00:30 belongs to the next calendar day
    const wake = nextClock(bedMs, e.wakeTime, tz);
    if (wake == null) continue;
    const out = (e.outOfBedTime && nextClock(wake, e.outOfBedTime, tz)) || wake;
    const latency = Number(e.latencyMin);
    const onset = Number.isFinite(latency) ? bedMs + latency * MIN_MS : null;
    add('sleep_episodes', {
      episode_type: 'main',
      start_time: toIso(bedMs),
      attempt_time: toIso(bedMs),
      onset_time: onset != null && onset <= wake ? toIso(onset) : undefined,
      final_awakening_time: toIso(wake),
      end_time: toIso(out),
      sleep_latency_minutes: Number.isFinite(latency) ? latency : undefined,
      wake_after_sleep_onset_minutes: e.wasoMin != null ? Number(e.wasoMin) : undefined,
      subjective_quality: e.quality ? Number(e.quality) : undefined,
      day_type: e.freeDay ? 'free_day' : e.freeDay === false ? 'workday' : 'unknown',
      alarm_used: typeof e.alarm === 'boolean' ? e.alarm : undefined,
      quality_flags: { migrated: true },
    });
    const dayBefore = e.date; // v1 habits were "the previous day" = the day the night began
    for (const c of e.caffeine ?? []) {
      const t = at(dayBefore, c.time, tz);
      if (t != null && Number(c.mg) > 0) add('substance_events', { event_type: 'caffeine', start_time: toIso(t), amount: Number(c.mg), unit: 'mg', product: 'unspecified' });
    }
    if (Number(e.alcoholDrinks) > 0) {
      let t = at(dayBefore, e.alcoholLastTime, tz);
      if (t != null && Number(e.alcoholLastTime.split(':')[0]) < 12) t += 86_400_000;
      if (t != null) add('substance_events', { event_type: 'alcohol', start_time: toIso(t), amount: Number(e.alcoholDrinks), unit: 'standard_drink' });
    }
    if (e.lastMealTime) {
      const t = at(dayBefore, e.lastMealTime, tz);
      if (t != null) add('meal_events', { start_time: toIso(t), meal_category: 'other' });
    }
    if (e.exerciseIntensity && e.exerciseIntensity !== 'none' && e.exerciseEnd) {
      const t = at(dayBefore, e.exerciseEnd, tz);
      if (t != null) add('activity_events', { start_time: toIso(t), end_time: toIso(t), activity_type: 'unspecified', intensity: e.exerciseIntensity });
    }
    if (Number(e.napMin) > 0 && e.napStart) {
      const t = at(dayBefore, e.napStart, tz);
      if (t != null) add('sleep_episodes', { episode_type: 'nap', start_time: toIso(t), end_time: toIso(t + Number(e.napMin) * MIN_MS), quality_flags: { migrated: true } });
    }
    if (Number(e.morningLightMin) > 0) {
      add('light_exposure_events', {
        start_time: toIso(out), end_time: toIso(out + Number(e.morningLightMin) * MIN_MS), measurement_type: 'self_report',
        indoor_outdoor_context: 'outdoor', self_reported_brightness: 'daylight',
        measurement_quality: { note: 'Migrated: v1 recorded only "minutes outside in the morning"; timing assumed to start at out-of-bed time.' },
      });
    }
  }
  for (const m of v1?.measured ?? []) {
    const [hh, mm] = String(m.dlmo).split(':').map(Number);
    const t = at(m.date, m.dlmo, tz);
    if (t != null) {
      add('laboratory_measurements', {
        collection_timestamp: toIso(t), analyte: 'dlmo', measured_value: hh * 60 + mm, measured_unit: 'clock_minutes',
        sample_type: 'derived', quality_control_status: 'not_reported', protocol_deviation: 'Entered by the user from an external test result.',
      });
    }
  }
  return state;
}

/** Sort helper used across modules. */
export const byStart = (a, b) => toMs(a.start_time ?? a.timestamp) - toMs(b.start_time ?? b.timestamp);
