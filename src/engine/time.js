// Time utilities. Clock times are stored as minutes after midnight [0, 1440).
// Sleep data straddles midnight, so averaging clock times must be circular.

export const DAY = 1440;

/** Wrap any minute value into [0, 1440). */
export function wrap(min) {
  return ((min % DAY) + DAY) % DAY;
}

/** Parse "HH:MM" (24h) into minutes after midnight. Returns null for empty/invalid input. */
export function parseHHMM(str) {
  if (typeof str !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Format minutes (any value) as "HH:MM" clock time. */
export function fmtClock(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const w = Math.round(wrap(min)) % DAY;
  const h = Math.floor(w / 60);
  const m = w % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format a duration in minutes as "7h 30m". */
export function fmtDuration(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const sign = min < 0 ? '-' : '';
  const a = Math.round(Math.abs(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h === 0) return `${sign}${m}m`;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`;
}

/** Forward duration from clock time a to clock time b (crosses midnight if needed). */
export function forward(a, b) {
  return wrap(b - a);
}

/** Signed shortest difference b - a on the 24h circle, in (-720, 720]. */
export function signedDiff(a, b) {
  let d = wrap(b - a);
  if (d > DAY / 2) d -= DAY;
  return d;
}

/**
 * Circular (weighted) mean of clock times. Returns null for empty input.
 * Uses the mean resultant vector so 23:30 and 00:30 average to 00:00, not 12:00.
 */
export function circularMean(times, weights) {
  if (!times.length) return null;
  let x = 0;
  let y = 0;
  times.forEach((t, i) => {
    const w = weights ? weights[i] : 1;
    const a = (2 * Math.PI * t) / DAY;
    x += w * Math.cos(a);
    y += w * Math.sin(a);
  });
  if (Math.hypot(x, y) < 1e-9) return null;
  return wrap((Math.atan2(y, x) * DAY) / (2 * Math.PI));
}

/** Circular standard deviation of clock times, in minutes. */
export function circularSD(times) {
  if (times.length < 2) return 0;
  let x = 0;
  let y = 0;
  for (const t of times) {
    const a = (2 * Math.PI * t) / DAY;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  const R = Math.min(1, Math.hypot(x, y) / times.length);
  if (R >= 1) return 0;
  return (Math.sqrt(-2 * Math.log(R)) * DAY) / (2 * Math.PI);
}

/** Days between two ISO dates (b - a). */
export function daysBetween(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Add n days to an ISO date string. */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
