// SCREENS 3 & 4 — Sleep log and daily behaviour log (history with corrections).
import { h, icon } from '../dom.js';
import { segmented } from '../dialogs.js';
import { app } from '../store.js';
import { deriveEpisode } from '../../core/sleep.js';
import { toMs } from '../../core/time.js';
import { validateCollection, validateRecord } from '../../core/validate.js';
import { atDay, atTime, dur, row, emptyNote, badge } from '../kit.js';
import { openSleepForm, openEventForm, openAddChooser, formKeyFor } from '../forms.js';

let tab = 'sleep';

export function renderLog(root) {
  const col = h('div', { class: 'col' });
  root.replaceChildren(col);
  col.append(h('div', { class: 'top-row' }, h('h1', { class: 'display page-title' }, 'Log'),
    h('button', { type: 'button', class: 'icon-btn round', 'aria-label': 'Add an entry', onclick: () => (tab === 'sleep' ? openSleepForm() : openAddChooser()) }, icon('plus'))));
  const seg = segmented([['sleep', 'Sleep'], ['day', 'Daytime']], tab, (v) => { tab = v; renderLog(root); }, { label: 'Log type' });
  seg.classList.add('wide');
  col.append(seg);
  col.append(tab === 'sleep' ? sleepList() : dayList());
}

function sleepList() {
  const { state } = app;
  const recs = [...state.tables.sleep_episodes].sort((a, b) => toMs(b.start_time) - toMs(a.start_time));
  if (!recs.length) return h('div', {}, emptyNote('No sleep recorded yet. Log main sleep, naps and any other sleep, at any time of day.'), h('button', { type: 'button', class: 'big-btn', onclick: () => openSleepForm() }, icon('plus'), 'Log sleep'));
  const issues = validateCollection('sleep_episodes', state.tables.sleep_episodes);
  const flagged = new Set(issues.filter((i) => i.level !== 'info').flatMap((i) => i.ids ?? []));
  const devicePair = new Set(issues.filter((i) => i.code === 'source_disagreement').flatMap((i) => i.ids ?? []));
  return h('div', { class: 'rows' }, recs.map((r) => {
    const e = deriveEpisode(r);
    const own = validateRecord('sleep_episodes', r).filter((i) => i.level === 'warning');
    const type = { main: 'Sleep', nap: 'Nap', other: 'Sleep (other)' }[r.episode_type];
    const sub = [
      `${atTime(r.start_time, r.tz)} → ${r.end_time ? atTime(r.end_time, r.tz) : 'in progress'}`,
      e.tst != null ? `${dur(e.tst)} asleep` : e.tib != null ? `${dur(e.tib)} in bed · sleep time unknown` : null,
      r.source !== 'user' ? r.source.replace('import_', '').replace(/_/g, ' ') : null,
      devicePair.has(r.id) ? 'also recorded by another source' : null,
      r.revisions?.length ? 'edited' : null,
    ].filter(Boolean).join(' · ');
    return row({ ic: r.episode_type === 'nap' ? 'nap' : 'moon', title: `${type} · ${atDay(r.start_time, r.tz)}`, sub, warn: flagged.has(r.id) || own.length > 0, onclick: () => openSleepForm(r) });
  }));
}

function dayList() {
  const { state } = app;
  const items = [];
  const push = (table, r, title, ic, t = r.start_time ?? r.timestamp) => items.push({ table, r, title, ic, t: toMs(t) });
  for (const r of state.tables.substance_events) push('substance_events', r, r.event_type === 'caffeine' ? `Caffeine · ${r.amount} mg` : `Alcohol · ${r.amount} drink${r.amount === 1 ? '' : 's'}`, r.event_type === 'caffeine' ? 'coffee' : 'glass');
  for (const r of state.tables.meal_events) push('meal_events', r, `Meal · ${r.meal_category}`, 'meal');
  for (const r of state.tables.light_exposure_events) push('light_exposure_events', r, r.measurement_type === 'sensor' ? `Light sensor · ${r.illuminance_lux} lux` : r.measurement_type === 'device_daylight' ? 'Daylight (device)' : `Light · ${(r.self_reported_brightness ?? r.indoor_outdoor_context ?? '').replace('_', ' ')}`, 'sun');
  for (const r of state.tables.subjective_observations) push('subjective_observations', r, `${r.measure[0].toUpperCase()}${r.measure.slice(1)} · ${r.rating}`, r.measure === 'stress' ? 'wave' : r.measure === 'energy' ? 'bolt' : 'moon');
  for (const r of state.tables.activity_events) push('activity_events', r, `Activity · ${r.activity_type}`, 'run');
  for (const r of state.tables.medication_events) push('medication_events', r, `${r.kind === 'supplement' ? 'Supplement' : 'Medication'} · ${r.medication_identifier}`, 'pill');
  items.sort((a, b) => b.t - a.t);
  // Sensor light arrives in many 10-minute rows; show a summary instead of hundreds of rows.
  const sensor = items.filter((x) => x.table === 'light_exposure_events' && x.r.measurement_type !== 'self_report');
  const shown = items.filter((x) => !(x.table === 'light_exposure_events' && x.r.measurement_type !== 'self_report')).slice(0, 80);
  if (!shown.length && !sensor.length) return h('div', {}, emptyNote('Nothing recorded yet. Record only what you want to track; you do not need to fill in every category every day.'), h('button', { type: 'button', class: 'big-btn', onclick: openAddChooser }, icon('plus'), 'Add an entry'));
  return h('div', {},
    sensor.length ? h('p', { class: 'explain' }, badge('device'), ` ${sensor.length} imported light records (10-minute periods). They are used in Biology and exports.`) : null,
    h('div', { class: 'rows' }, shown.map(({ table, r, title, ic }) => row({ ic, title, sub: `${atDay(r.start_time ?? r.timestamp, r.tz)}, ${atTime(r.start_time ?? r.timestamp, r.tz)}${r.source !== 'user' ? ` · ${r.source.replace(/_/g, ' ')}` : ''}`, onclick: () => openEventForm(formKeyFor(table, r), r) }))));
}
