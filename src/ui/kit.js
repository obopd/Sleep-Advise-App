// Shared UI pieces for the research-grade screens.
import { h, icon } from './dom.js';
import { instantToLocal, localToInstant, toIso, toMs } from '../core/time.js';

/** Visible label for the four data categories (spec §2.1). */
export function badge(kind) {
  const text = { recorded: 'Recorded', calculated: 'Calculated', estimate: 'Model estimate', experimental: 'Experimental', reference: 'Lab result', device: 'Device' }[kind] ?? kind;
  return h('span', { class: `kind kind-${kind}`, title: KIND_HELP[kind] }, text);
}
export const KIND_HELP = {
  recorded: 'Entered by you or recorded by a device.',
  calculated: 'Calculated from your records.',
  estimate: 'Produced by a model. Not a measurement.',
  experimental: 'Experimental model output. Not validated; not a measurement.',
  reference: 'A laboratory measurement.',
  device: 'Recorded by a device or imported.',
};

const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }));
  return fmtCache.get(key);
}

/** "11:15 PM" in the event's own zone. */
export const atTime = (iso, tz) => (toMs(iso) == null ? '–' : fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(toMs(iso))));
/** "Mon, Nov 2" in the event's own zone. */
export const atDay = (iso, tz) => (toMs(iso) == null ? '–' : fmt(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(toMs(iso))));
export const atDayTime = (iso, tz) => `${atDay(iso, tz)}, ${atTime(iso, tz)}`;

/** Clock minutes (0–1439) → "9:15 PM" in the phone's 12/24 h style. */
export function clock(min) {
  if (min == null) return '–';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));
}

export function dur(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const a = Math.round(Math.abs(min));
  const hh = Math.floor(a / 60);
  const mm = a % 60;
  return hh ? (mm ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`;
}

/**
 * Date-time field in a given zone. value/onChange use UTC ISO strings.
 * Reports DST notes ("this time happens twice / does not exist") under the field.
 */
export function dateTime(label, iso, tz, onChange, { required = false, hint = null } = {}) {
  const note = h('small', { class: 'dt-note' }, hint ?? '');
  const input = h('input', {
    type: 'datetime-local', class: 'time-input dt', value: iso ? instantToLocal(iso, tz) : '', 'aria-label': label, required: required || null,
    onchange: (e) => {
      if (!e.target.value) return onChange(null);
      const r = localToInstant(e.target.value, tz);
      note.textContent = r.note === 'ambiguous_dst' ? 'This time happens twice (clocks went back); the first one is used.' : r.note === 'nonexistent_dst' ? 'This time was skipped (clocks went forward); moved to the next valid time.' : hint ?? '';
      onChange(r.ms == null ? null : toIso(r.ms));
    },
  });
  const clear = required ? null : h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Clear ${label}`, onclick: () => { input.value = ''; onChange(null); } }, icon('close'));
  return h('div', { class: 'dt-field' }, h('label', { class: 'dt-label' }, h('span', {}, label, required ? h('em', {}, ' *') : null), h('span', { class: 'dt-row' }, input, clear)), note);
}

/** Validation messages under a form. */
export function issueList(issues) {
  const shown = issues.filter((i) => i.level !== 'info');
  if (!shown.length) return h('div', { class: 'issues', hidden: true });
  return h('ul', { class: 'issues' }, shown.map((i) => h('li', { class: `issue ${i.level}` }, icon(i.level === 'error' ? 'alert' : 'info'), i.message)));
}

export function section(title, action, ...kids) {
  return h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { class: 'display' }, title), action ?? null), ...kids);
}

export function stat(value, label, kind) {
  return h('div', { class: 'stat' }, h('div', { class: 'v display' }, value), h('small', {}, label), kind ? badge(kind) : null);
}

export function emptyNote(text) {
  return h('p', { class: 'explain' }, text);
}

/** Simple list row. */
export function row({ ic, title, sub, end = null, onclick, warn = false }) {
  const tag = onclick ? 'button' : 'div';
  return h(tag, { type: onclick ? 'button' : null, class: `row${warn ? ' warn' : ''}`, onclick },
    h('span', { class: 'ico' }, icon(ic)),
    h('span', { class: 'txt' }, h('b', {}, title), sub ? h('small', {}, sub) : null),
    h('span', { class: 'end' }, end ?? (onclick ? icon('right') : null)));
}

/** Chip choice (single). options [[value, label]]; null value allowed for "not sure". */
export function chips(options, value, onchange, label) {
  const el = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label });
  const paint = () => el.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', String(options[i][0] === value)));
  options.forEach(([v, text]) => el.append(h('button', { type: 'button', role: 'radio', onclick: () => { value = v; paint(); onchange(v); } }, text)));
  paint();
  return el;
}

/** Multi-select chips. */
export function multiChips(options, values, onchange, label) {
  const set = new Set(values);
  const el = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  options.forEach(([v, text]) => {
    const b = h('button', { type: 'button', role: 'checkbox', 'aria-checked': String(set.has(v)), onclick: () => {
      if (set.has(v)) set.delete(v); else set.add(v);
      b.setAttribute('aria-checked', String(set.has(v)));
      onchange([...set]);
    } }, text);
    el.append(b);
  });
  return el;
}

/** Number input (empty = not recorded). */
export function numberInput(value, onchange, { label, min, max, step = 1, unit = '' } = {}) {
  return h('span', { class: 'num-wrap' },
    h('input', { type: 'number', inputmode: step < 1 ? 'decimal' : 'numeric', class: 'num-input', value: value ?? '', min, max, step, 'aria-label': label, onchange: (e) => onchange(e.target.value === '' ? null : Number(e.target.value)) }),
    unit ? h('span', { class: 'unit' }, unit) : null);
}

export function textInput(value, onchange, { label, placeholder = '' } = {}) {
  return h('input', { type: 'text', class: 'text-input', value: value ?? '', placeholder, 'aria-label': label, onchange: (e) => onchange(e.target.value.trim() || null) });
}

/** Rounded "now" for default times (5-min steps). */
export const nowIso = () => toIso(Math.round(Date.now() / 300000) * 300000);
