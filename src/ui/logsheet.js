// "Last night" sheet: tap-first, only bed/wake time are required.
import { h, icon, dayFmt, parseKey, todayKey, shiftKey, fmtTime } from './dom.js';
import { openSheet, segmented, toggle, timeInput, ask } from './dialogs.js';
import { app, update } from './store.js';
import { upsertEntry, removeEntry } from './storage.js';

const CUP_MG = 95; // one cup of brewed coffee

export function openLogSheet(date = shiftKey(todayKey(), -1)) {
  const existing = app.state.entries.find((e) => e.date === date);
  const last = app.state.entries.at(-1);
  const plan = app.plan;
  const e = {
    date,
    bedTime: last?.bedTime ?? (plan?.ready ? fmt24(plan.schedule.tonightLightsOut) : '23:00'),
    wakeTime: last?.wakeTime ?? (plan?.ready ? fmt24(plan.schedule.wake) : '07:00'),
    latencyMin: 15,
    wasoMin: 0,
    quality: 3,
    freeDay: isWeekendNight(date),
    alarm: !isWeekendNight(date),
    caffeineCups: 0,
    alcoholDrinks: 0,
    exerciseIntensity: 'none',
    morningLightMin: 0,
    napMin: 0,
    ...(existing ?? {}),
  };
  if (existing && existing.caffeineCups == null) e.caffeineCups = Math.min(3, (existing.caffeine ?? []).length);
  if (existing && !e.caffeineLastTime) e.caffeineLastTime = existing.caffeine?.at(-1)?.time ?? '';
  const set = (k) => (v) => {
    e[k] = v;
  };

  const dateInput = h('input', { type: 'date', class: 'time-input', value: date, max: todayKey(), onchange: (ev) => {
    if (!ev.target.value) return;
    sheet.close();
    setTimeout(() => openLogSheet(ev.target.value), 240);
  } });

  const timeBig = (label, ic, key) =>
    h('label', { class: 'time-big' }, h('span', {}, icon(ic), label),
      h('input', { type: 'time', value: e[key], 'aria-label': label, onchange: (ev) => set(key)(ev.target.value) }));

  // Habits (optional), each a segmented choice + time when relevant.
  const habit = (ic, label, options, key, whenKey, whenLabel, isOn = (v) => v && v !== 'none') => {
    const when = h('label', { class: 'habit-when', hidden: !isOn(e[key]) || null }, whenLabel, timeInput(e[whenKey], set(whenKey), whenLabel));
    const seg = segmented(options, e[key], (v) => {
      e[key] = v;
      when.hidden = !isOn(v);
    }, { label });
    seg.classList.add('wide');
    return h('div', { class: 'habit' }, h('div', { class: 'habit-top' }, icon(ic), label), seg, whenKey ? when : null);
  };

  const habitsBox = h('div', { class: 'habits', hidden: true },
    habit('coffee', 'Coffee or tea', [[0, 'None'], [1, '1'], [2, '2'], [3, '3+']], 'caffeineCups', 'caffeineLastTime', 'Last one at', (v) => v > 0),
    habit('glass', 'Alcohol', [[0, 'None'], [1, '1'], [2, '2'], [3, '3+']], 'alcoholDrinks', 'alcoholLastTime', 'Last drink at', (v) => v > 0),
    habit('run', 'Exercise', [['none', 'None'], ['light', 'Light'], ['moderate', 'Medium'], ['vigorous', 'Hard']], 'exerciseIntensity', 'exerciseEnd', 'Finished at'),
    habit('sun', 'Outside in the morning', [[0, '0'], [10, '10m'], [30, '30m'], [60, '1h+']], 'morningLightMin', null, null, () => false),
    habit('nap', 'Nap', [[0, 'None'], [20, '20m'], [45, '45m'], [90, '1h+']], 'napMin', 'napStart', 'Started at', (v) => v > 0),
    h('div', { class: 'habit' },
      h('label', { class: 'habit-when' }, h('span', { class: 'habit-top' }, icon('phone'), 'Screens until'), timeInput(e.screensUntil, set('screensUntil'), 'Screens until')),
      h('label', { class: 'habit-when' }, h('span', { class: 'habit-top' }, icon('meal'), 'Dinner at'), timeInput(e.lastMealTime, set('lastMealTime'), 'Dinner at'))));
  const disclosure = h('button', { type: 'button', class: 'disclosure', 'aria-expanded': 'false', onclick: () => {
    habitsBox.hidden = !habitsBox.hidden;
    disclosure.setAttribute('aria-expanded', String(!habitsBox.hidden));
  } }, icon('right'), 'Yesterday’s habits', h('span', { class: 'muted', style: 'font-weight:400' }, 'optional'));

  const faces = h('div', { class: 'faces', role: 'radiogroup', 'aria-label': 'Sleep quality' });
  const paintFaces = () => faces.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', String(e.quality === i + 1)));
  for (let q = 1; q <= 5; q++) faces.append(h('button', { type: 'button', role: 'radio', 'aria-label': `${q} of 5`, onclick: () => { e.quality = q; paintFaces(); } }, String(q)));
  paintFaces();

  const body = h('div', { style: 'display:grid;gap:18px' },
    h('label', { class: 'q-row' }, h('span', {}, 'Night of'), dateInput),
    h('div', { class: 'time-pair' }, timeBig('In bed', 'moon', 'bedTime'), timeBig('Woke up', 'sun', 'wakeTime')),
    h('div', { class: 'q' }, h('span', {}, 'Fell asleep in'),
      Object.assign(segmented([[5, '5m'], [15, '15m'], [30, '30m'], [45, '45m'], [60, '1h+']], nearest(e.latencyMin, [5, 15, 30, 45, 60]), set('latencyMin'), { label: 'Fell asleep in' }), { className: 'segmented wide' })),
    h('div', { class: 'q' }, h('span', {}, 'Awake during the night'),
      Object.assign(segmented([[0, 'No'], [10, '10m'], [30, '30m'], [60, '1h+']], nearest(e.wasoMin, [0, 10, 30, 60]), set('wasoMin'), { label: 'Awake during the night' }), { className: 'segmented wide' })),
    h('div', { class: 'q' }, h('span', {}, 'How did you sleep?'), faces, h('div', { class: 'scale' }, h('span', {}, 'Badly'), h('span', {}, 'Great'))),
    h('div', {},
      h('label', { class: 'q-row' }, h('span', {}, 'Free day today'), toggle(e.freeDay, set('freeDay'), 'Free day today')),
      h('label', { class: 'q-row' }, h('span', {}, 'Woke by alarm'), toggle(e.alarm, set('alarm'), 'Woke by alarm'))),
    h('div', {}, disclosure, habitsBox),
    existing ? h('button', { type: 'button', class: 'danger-link', onclick: async () => {
      if (await ask({ title: 'Delete this night?', ok: 'Delete', danger: true })) {
        sheet.close();
        update(removeEntry(app.state, date), 'Deleted');
      }
    } }, 'Delete this night') : null);

  const sheet = openSheet({
    title: existing ? 'Edit night' : 'Last night',
    sub: dayFmt.format(parseKey(date)),
    body,
    onOk: (close) => {
      if (!e.bedTime || !e.wakeTime) return;
      const cups = Number(e.caffeineCups) || 0;
      const entry = {
        ...e,
        latencyMin: Number(e.latencyMin) || 0,
        wasoMin: Number(e.wasoMin) || 0,
        alcoholDrinks: Number(e.alcoholDrinks) || 0,
        morningLightMin: Number(e.morningLightMin) || 0,
        napMin: Number(e.napMin) || 0,
        caffeineCups: cups,
        // The cutoff rule depends on the last dose; one cup's worth is stored at that time.
        caffeine: cups > 0 && e.caffeineLastTime ? [{ time: e.caffeineLastTime, mg: CUP_MG }] : [],
        source: existing?.source ?? 'manual',
      };
      close();
      update(upsertEntry(app.state, entry), 'Saved');
    },
  });
}

function nearest(v, options) {
  const n = Number(v) || 0;
  return options.reduce((best, o) => (Math.abs(o - n) < Math.abs(best - n) ? o : best), options[0]);
}

const isWeekendNight = (key) => [5, 6].includes(parseKey(key).getDay()); // Fri/Sat night

function fmt24(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export { fmt24, fmtTime };
