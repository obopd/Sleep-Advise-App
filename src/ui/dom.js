// Small DOM helpers and icons, in the same style as Planner.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((c) => c != null && c !== false));
  return el;
}

// Static SVG markup only (never user text).
export function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.dot}</svg>`;
  return span.firstChild;
}

export const ICONS = {
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z"/>',
  week: '<path d="M5 20v-7M10 20V6M15 20v-9M20 20V9"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M5.5 4 3 6.5M18.5 4 21 6.5"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M2.8 12h2M19.2 12h2M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  coffee: '<path d="M5 9h11v4.5a5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 5 13.5z"/><path d="M16 10.5h1.3a2.5 2.5 0 0 1 0 5H16M8.5 3.5V6M12.5 3.5V6"/>',
  glass: '<path d="M7 3.5h10l-1 7a4 4 0 0 1-8 0zM12 14.5v6M8.5 20.5h7"/>',
  lamp: '<path d="M8.5 3.5h7l3.5 7H5zM12 10.5v8M8 20.5h8"/>',
  book: '<path d="M4.5 18.5v-13a2 2 0 0 1 2-2h13v15h-13a2 2 0 0 0 0 4h13"/>',
  nap: '<path d="M4 9h5l-5 6h5M13 4h7l-7 9h7"/>',
  shift: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8M12 8v4l2.5 2"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)"/><path d="M9.6 9.1l4.8 5.8"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 16.8v.01"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  repeat: '<path d="M17 3.5l3 3-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  bed: '<path d="M3 18.5v-12M3 14h18v4.5M21 14v-1.5a3 3 0 0 0-3-3h-7V14"/><circle cx="7" cy="11" r="1.8"/>',
  run: '<circle cx="14.5" cy="4.5" r="1.8"/><path d="M7 20.5l3.5-5 3 2.5v3.5M6 11l3-3h4.5l2 3 3 1M10.5 15.5l1.5-6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  meal: '<path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9M17 21V3c-2 1.5-3 4-3 7h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.01"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10a4.3 4.3 0 0 1 7.5-2.8A4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  apple: '<path d="M15.5 3.5c-1.4.1-2.8 1-3.2 2.4 1.4.1 2.8-.9 3.2-2.4zM16.8 12.6c0-2 1.6-2.9 1.7-3a3.8 3.8 0 0 0-3-1.6c-1.3-.1-2.5.8-3.1.8s-1.6-.8-2.7-.8A4 4 0 0 0 6.3 10c-1.4 2.5-.4 6.2 1 8.2.7 1 1.5 2.1 2.5 2 1 0 1.4-.6 2.6-.6s1.6.6 2.6.6c1.1 0 1.7-1 2.4-2a8 8 0 0 0 1.1-2.2 3.4 3.4 0 0 1-1.7-3.4z"/>',
  table: '<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M4 14.5h16M10 9.5v10"/>',
  dot: '<circle cx="12" cy="12" r="2"/>',
  home: '<path d="M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-3.5v-5h-6v5H5.5A1.5 1.5 0 0 1 4 19z"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.8" cy="7" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17" r="1"/>',
  chart: '<path d="M4 4v16h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v5.3L5.2 18a1.8 1.8 0 0 0 1.6 2.5h10.4a1.8 1.8 0 0 0 1.6-2.5l-5.3-9.2V3.5"/><path d="M7.6 14h8.8"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  cloud: '<path d="M7.5 18.5h9.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7.5 18.5z"/>',
  bolt: '<path d="M13 3 5.5 13.5H11l-1 7.5 7.5-10.5H12z"/>',
  wave: '<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  gauge: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l3.5-4"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M13 7l4 4"/>',
};

// Times follow the phone's 12/24 h preference.
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export function fmtTime(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return timeFmt.format(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));
}

/** Big-number display: main part and a separate AM/PM (shown smaller). */
export function timeParts(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const parts = timeFmt.formatToParts(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));
  const period = parts.find((x) => x.type === 'dayPeriod')?.value ?? '';
  const main = parts.filter((x) => x.type !== 'dayPeriod').map((x) => x.value).join('').trim();
  return { main, period };
}

/** Engine text uses 24 h "HH:MM"; show it in the phone's own time format. */
export function localizeTimes(text) {
  if (!text) return text;
  return String(text).replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_, hh, mm) => fmtTime(Number(hh) * 60 + Number(mm)));
}

export function fmtDur(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const a = Math.round(Math.abs(min));
  const hh = Math.floor(a / 60);
  const mm = a % 60;
  if (!hh) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

export const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
export const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dateKey(new Date());
export const shiftKey = (key, n) => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
