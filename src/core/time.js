// Time handling for longitudinal records.
//
// Rules (see docs/DATABASE.md, "Time"):
// - Every instant is stored as a UTC ISO-8601 string ("2026-11-02T04:30:00.000Z").
// - The IANA time zone in which the user recorded it is stored next to it (`tz`), so the
//   local clock time can always be reconstructed, including across DST changes and travel.
// - Durations are computed from elapsed milliseconds between instants, never by
//   subtracting clock-time strings.

export const MIN_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsCache = new Map();
function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return partsCache.get(tz);
}

/** Wall-clock fields of an instant in a time zone. */
export function zonedParts(ms, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second };
}

/** UTC offset (minutes east of UTC) of a time zone at an instant. */
export function offsetMinutes(ms, tz) {
  const z = zonedParts(ms, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MIN_MS);
}

/**
 * Convert a local wall-clock time ("YYYY-MM-DDTHH:MM", e.g. from <input type=datetime-local>)
 * in time zone `tz` to an epoch-ms instant.
 *
 * DST rules: a time that does not exist (spring-forward gap) is moved forward by the gap;
 * an ambiguous time (fall-back overlap) resolves to the earlier instant. Both are reported
 * via `note` so the UI can tell the user.
 */
export function localToInstant(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local || '');
  if (!m || !isValidTimeZone(tz)) return { ms: null, note: 'invalid' };
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const candidates = new Set();
  for (const guess of [naive - offsetMinutes(naive, tz) * MIN_MS, naive - offsetMinutes(naive - DAY_MS, tz) * MIN_MS, naive - offsetMinutes(naive + DAY_MS, tz) * MIN_MS]) {
    const z = zonedParts(guess, tz);
    if (Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second) === naive) candidates.add(guess);
  }
  const sorted = [...candidates].sort((a, b) => a - b);
  if (sorted.length >= 1) return { ms: sorted[0], note: sorted.length > 1 ? 'ambiguous_dst' : null };
  // Nonexistent (gap): shift forward using the offset before the gap.
  const before = offsetMinutes(naive - DAY_MS / 2, tz);
  return { ms: naive - before * MIN_MS, note: 'nonexistent_dst' };
}

/** Local wall-clock string ("YYYY-MM-DDTHH:MM") of an instant in a time zone. */
export function instantToLocal(msOrIso, tz) {
  const ms = toMs(msOrIso);
  if (ms == null) return '';
  const z = zonedParts(ms, tz);
  const p = (n) => String(n).padStart(2, '0');
  return `${z.year}-${p(z.month)}-${p(z.day)}T${p(z.hour)}:${p(z.minute)}`;
}

/** Local calendar date "YYYY-MM-DD" of an instant in a time zone. */
export function localDate(msOrIso, tz) {
  return instantToLocal(msOrIso, tz).slice(0, 10);
}

/** Minutes after local midnight (0–1439) of an instant in a time zone. */
export function localClockMinutes(msOrIso, tz) {
  const z = zonedParts(toMs(msOrIso), tz);
  return z.hour * 60 + z.minute;
}

export function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export const toIso = (ms) => (ms == null ? null : new Date(ms).toISOString());

/** Elapsed minutes between two instants (null if either is missing). */
export function minutesBetween(a, b) {
  const x = toMs(a);
  const y = toMs(b);
  return x == null || y == null ? null : (y - x) / MIN_MS;
}

// ---- Circular statistics on clock time (minutes, period 1440) ------------------------

export function circularMean(mins, weights) {
  if (!mins.length) return null;
  let x = 0;
  let y = 0;
  mins.forEach((t, i) => {
    const w = weights ? weights[i] : 1;
    const a = (2 * Math.PI * t) / 1440;
    x += w * Math.cos(a);
    y += w * Math.sin(a);
  });
  if (Math.hypot(x, y) < 1e-9) return null;
  return (((Math.atan2(y, x) * 1440) / (2 * Math.PI)) % 1440 + 1440) % 1440;
}

export function circularSD(mins) {
  if (mins.length < 2) return null;
  let x = 0;
  let y = 0;
  for (const t of mins) {
    const a = (2 * Math.PI * t) / 1440;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  const R = Math.min(1, Math.hypot(x, y) / mins.length);
  if (R >= 1 - 1e-12) return 0;
  return (Math.sqrt(-2 * Math.log(R)) * 1440) / (2 * Math.PI);
}

/** Signed shortest difference b − a on the 24 h circle, in minutes (−720, 720]. */
export function circularDiff(a, b) {
  let d = (((b - a) % 1440) + 1440) % 1440;
  if (d > 720) d -= 1440;
  return d;
}
