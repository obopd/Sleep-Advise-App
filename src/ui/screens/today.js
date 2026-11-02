// SCREEN 2 — Daily dashboard. Observed values, calculations and estimates are labelled.
import { h, icon } from '../dom.js';
import { app } from '../store.js';
import { analysisEpisodes } from '../../core/sleep.js';
import { toMs, DAY_MS, HOUR_MS, localDate } from '../../core/time.js';
import { typicalPressureAtOnset } from '../../core/models/sleepPressure.js';
import { badge, atTime, atDay, dur, section, stat, row, emptyNote } from '../kit.js';
import { openSleepForm, openEventForm, openAddChooser, formKeyFor } from '../forms.js';
import { openRecommendation } from './plan.js';
import { go } from '../nav.js';

export function renderToday(root) {
  const { state } = app;
  const d = app.d;
  const tz = state.user.timezone;
  const col = h('div', { class: 'col' });
  root.replaceChildren(col);

  col.append(h('div', { class: 'top-row' },
    h('div', {}, h('div', { class: 'muted small' }, atDay(new Date().toISOString(), tz)), h('h1', { class: 'display page-title' }, 'Today')),
    h('button', { type: 'button', class: 'icon-btn round', 'aria-label': 'Add an entry', onclick: openAddChooser }, icon('plus'))));

  if (state.meta.sample) col.append(h('div', { class: 'banner' }, icon('info'), h('span', {}, 'Sample data for exploring. Delete it in More → Privacy & consent before logging your own.')));

  // ---- 1–3. Last sleep, duration, time awake
  const eps = analysisEpisodes(state.tables.sleep_episodes, d.now);
  const last = [...eps].filter((e) => !e.inProgress).sort((a, b) => (b.wake ?? b.end) - (a.wake ?? a.end))[0];
  const inProgress = eps.find((e) => e.inProgress);
  const card = h('section', { class: 'card' });
  if (inProgress) {
    card.append(h('div', { class: 'card-head' }, h('b', {}, 'Sleep in progress'), badge('recorded')),
      h('p', { class: 'explain' }, `Started ${atTime(toIso(inProgress.start), inProgress.tz)}. Add the end time when you get up.`),
      h('button', { type: 'button', class: 'big-btn', onclick: () => openSleepForm(state.tables.sleep_episodes.find((x) => x.id === inProgress.id)) }, 'I’m up'));
  } else if (last) {
    const raw = state.tables.sleep_episodes.find((x) => x.id === last.id);
    card.append(
      h('div', { class: 'card-head' }, h('b', {}, last.type === 'main' ? 'Last sleep' : 'Last nap'), h('span', { class: 'muted small' }, atDay(raw.start_time, last.tz))),
      h('div', { class: 'times' },
        h('div', {}, h('div', { class: 'label' }, 'In bed'), h('div', { class: 'big display' }, atTime(raw.start_time, last.tz))),
        h('div', {}, h('div', { class: 'label' }, 'Out of bed'), h('div', { class: 'big display' }, atTime(raw.end_time, last.tz)))),
      h('div', { class: 'kv' },
        kv('Sleep', last.tst != null ? dur(last.tst) : 'Unknown', last.tst != null ? 'calculated' : null, last.tst == null ? 'Add how long it took to fall asleep to calculate it.' : `From your record${last.wasoMissing ? ' (no time awake at night recorded)' : ''}.`),
        kv('Time in bed', dur(last.tib), 'calculated', 'From your record.'),
        kv('Awake since', d.f('minutes_since_last_awakening') != null ? dur(d.f('minutes_since_last_awakening')) : '–', 'calculated', 'Time since your last recorded wake-up.')),
      h('button', { type: 'button', class: 'link-btn', onclick: () => openSleepForm(raw) }, 'Edit this entry'));
  } else {
    card.append(emptyNote('No sleep recorded yet.'), h('button', { type: 'button', class: 'big-btn', onclick: () => openSleepForm() }, icon('plus'), 'Log your last sleep'));
  }
  col.append(card);
  if (last && !inProgress && d.now - (last.wake ?? last.end) > 14 * HOUR_MS) {
    col.append(h('button', { type: 'button', class: 'big-btn soft', onclick: () => openSleepForm() }, icon('plus'), 'Log last night'));
  }

  // ---- 4–5. Recent history & regularity
  col.append(section('Last 7 days', h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Open insights', onclick: () => go('insights') }, icon('right')),
    historyBars(eps, d.now, tz),
    h('div', { class: 'stats' },
      stat(d.f('mean_daily_sleep_7d') != null ? dur(d.f('mean_daily_sleep_7d')) : '–', 'average sleep / day', 'calculated'),
      stat(d.f('wake_sd_7d') != null ? `±${dur(d.f('wake_sd_7d'))}` : '–', 'wake-time variation', 'calculated'),
      stat(d.f('sleep_regularity_index_7d') != null ? Math.round(d.f('sleep_regularity_index_7d')) : '–', 'regularity index', 'calculated'))));

  // ---- 6–8. Today's entries
  const since = d.now - DAY_MS;
  const todays = todaysEvents(state, since);
  col.append(section('Last 24 hours', h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Add an entry', onclick: openAddChooser }, icon('plus')),
    todays.length ? h('div', { class: 'rows' }, todays.slice(0, 6).map(({ table, r, text, ic }) => row({ ic, title: text, sub: atTime(r.start_time ?? r.timestamp, r.tz), onclick: () => openEventForm(formKeyFor(table, r), r) })))
      : emptyNote('Nothing recorded in the last 24 hours. Tap + to add light, meals, caffeine, alcohol, stress or activity.'),
    quickAdd(state)));

  // ---- 9. Sleep pressure (model estimate)
  col.append(pressureSection(d, state));

  // ---- 10. Recommendations
  if (d.recs.length) {
    col.append(section('Suggestions', h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'All suggestions', onclick: () => go('plan') }, icon('right')),
      h('div', { class: 'rows' }, d.recs.slice(0, 2).map((r) => row({ ic: r.icon, title: r.title, sub: r.reason, onclick: () => openRecommendation(r) })))));
  }

  // ---- 11. Data completeness
  const q = d.quality;
  col.append(section('Your data', h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Data details', onclick: () => go('more', 'quality') }, icon('right')),
    h('p', { class: 'explain' },
      h('b', {}, `${q.daysWithMainSleep} of ${q.days} days`), ' with a main sleep recorded',
      q.withOnset != null ? [', ', h('b', {}, `${Math.round(q.withOnset * 100)} %`), ' with a fall-asleep time'] : null,
      '. Estimates are only shown when there is enough data.')));
}

function kv(label, value, kind, help) {
  return h('div', { class: 'kv-row', title: help }, h('span', {}, label), h('span', { class: 'kv-val' }, h('b', { class: 'display' }, value), kind ? badge(kind) : null));
}

function historyBars(eps, now, tz) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const end = now - i * DAY_MS;
    const start = end - DAY_MS;
    const ending = eps.filter((e) => !e.inProgress && (e.wake ?? e.end) > start && (e.wake ?? e.end) <= end);
    const tst = ending.filter((e) => e.tst != null).reduce((s, e) => s + e.tst, 0);
    const unknown = ending.some((e) => e.tst == null);
    days.push({ label: new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: tz }).format(new Date(end)), tst: ending.length ? tst : null, unknown, naps: ending.filter((e) => e.type === 'nap').length, logged: ending.length > 0 });
  }
  const max = Math.max(10 * 60, ...days.map((x) => x.tst ?? 0));
  return h('div', { class: 'bars', role: 'img', 'aria-label': `Recorded sleep per 24 hours, last 7 days: ${days.map((x) => (x.tst != null ? dur(x.tst) : 'not recorded')).join(', ')}` },
    days.map((x) => h('div', { class: `bar${x.logged ? '' : ' empty'}${x.unknown ? ' partial' : ''}` },
      h('span', { class: 'col-in' }, h('span', { class: 'fill', style: `height:${x.tst != null ? Math.max(3, (x.tst / max) * 100) : 3}%` })),
      h('small', {}, x.label, x.naps ? '·' : ''))));
}

function todaysEvents(state, since) {
  const out = [];
  const add = (table, r, text, ic) => out.push({ table, r, text, ic, t: toMs(r.start_time ?? r.timestamp) });
  for (const r of state.tables.substance_events) if (toMs(r.start_time) > since) add('substance_events', r, r.event_type === 'caffeine' ? `Caffeine ${r.amount} mg${r.product ? ` · ${r.product.replace('_', ' ')}` : ''}` : `Alcohol ${r.amount} drink${r.amount === 1 ? '' : 's'}`, r.event_type === 'caffeine' ? 'coffee' : 'glass');
  for (const r of state.tables.meal_events) if (toMs(r.start_time) > since) add('meal_events', r, `${cap(r.meal_category)}${r.approximate_size ? ` · ${r.approximate_size}` : ''}`, 'meal');
  for (const r of state.tables.light_exposure_events) if (toMs(r.end_time) > since && r.source === 'user') add('light_exposure_events', r, `Light · ${r.measurement_type === 'sensor' ? `${r.illuminance_lux} lux` : (r.self_reported_brightness ?? r.indoor_outdoor_context ?? '').replace('_', ' ')}`, 'sun');
  for (const r of state.tables.subjective_observations) if (toMs(r.timestamp) > since) add('subjective_observations', r, `${cap(r.measure)} ${r.rating}${r.measure === 'sleepiness' ? '/9' : '/5'}`, r.measure === 'stress' ? 'wave' : r.measure === 'energy' ? 'bolt' : 'moon');
  for (const r of state.tables.activity_events) if (toMs(r.end_time) > since) add('activity_events', r, `${cap(r.activity_type)}${r.intensity ? ` · ${r.intensity}` : ''}`, 'run');
  return out.sort((a, b) => b.t - a.t);
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');

function quickAdd(state) {
  const t = state.user.tracking;
  const items = [['caffeine', 'coffee', 'Caffeine', t.caffeine], ['meal', 'meal', 'Meal', t.meals], ['light', 'sun', 'Light', t.light], ['stress', 'wave', 'Stress', t.stress], ['energy', 'bolt', 'Energy', t.stress], ['alcohol', 'glass', 'Alcohol', t.alcohol], ['activity', 'run', 'Activity', t.activity]].filter((x) => x[3]);
  return h('div', { class: 'quick' }, items.map(([k, ic, label]) => h('button', { type: 'button', class: 'quick-btn', onclick: () => openEventForm(k) }, icon(ic), label)));
}

function pressureSection(d, state) {
  const r = d.models.process_s_daan1984;
  const body = [];
  if (r.status === 'ok') {
    const typical = typicalPressureAtOnset(r, state.tables.sleep_episodes, d.now);
    const rel = typical == null ? null : r.value < typical - 0.05 ? 'lower than' : r.value > typical + 0.05 ? 'higher than' : 'similar to';
    body.push(h('p', { class: 'explain' }, rel ? ['Right now it is ', h('b', {}, rel), ' your typical level when you fall asleep.'] : 'Estimated from your recent sleep and wake times.'),
      h('div', { class: 'meter', role: 'img', 'aria-label': `Estimated sleep pressure ${Math.round(r.value * 100)} percent of the model range` },
        h('i', { style: `width:${Math.round(r.value * 100)}%` }), typical != null ? h('b', { class: 'tick', style: `left:${Math.round(typical * 100)}%`, title: 'Your typical level at sleep onset' }) : null),
      h('p', { class: 'note' }, 'Two-process model (Process S). A model of how sleep pressure builds while awake and falls during sleep, not a measurement. Not validated for you; individual rates differ.'));
  } else {
    body.push(h('p', { class: 'explain' }, r.reason ?? 'Not enough recent sleep data.'));
  }
  return section('Sleep pressure', badge('estimate'), ...body);
}

import { toIso } from '../../core/time.js';
export { localDate };
