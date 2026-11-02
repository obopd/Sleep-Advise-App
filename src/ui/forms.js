// Entry forms (spec Screens 3 & 4). Validation runs before saving: errors block the save,
// warnings are shown and can be saved anyway. Editing keeps the original in `revisions`.
import { h, icon } from './dom.js';
import { openSheet, ask, segmented } from './dialogs.js';
import { app, update } from './store.js';
import { addRecord, updateRecord, deleteRecord } from '../core/repo.js';
import { validateRecord, validateCollection, hasErrors } from '../core/validate.js';
import { toMs, toIso, MIN_MS, HOUR_MS, DAY_MS, localToInstant, instantToLocal } from '../core/time.js';
import { dateTime, chips, numberInput, textInput, issueList, nowIso, atDayTime } from './kit.js';

// ---------------------------------------------------------------- sleep

function defaultSleep(type) {
  const tz = app.state.user.timezone;
  if (type !== 'main') {
    const start = Date.now() - 45 * MIN_MS;
    return { episode_type: type, start_time: toIso(Math.round(start / 3e5) * 3e5), end_time: nowIso() };
  }
  // Last night: reuse the clock times of your last main sleep, else 23:00 → 07:00.
  const last = [...app.state.tables.sleep_episodes].filter((e) => e.episode_type === 'main').sort((a, b) => toMs(b.start_time) - toMs(a.start_time))[0];
  const today = instantToLocal(Date.now(), tz).slice(0, 10);
  const yesterday = instantToLocal(Date.now() - DAY_MS, tz).slice(0, 10);
  const bedClock = last ? instantToLocal(last.start_time, tz).slice(11) : '23:00';
  const wakeClock = last ? instantToLocal(last.end_time ?? last.start_time, tz).slice(11) : '07:00';
  const bedDay = Number(bedClock.slice(0, 2)) < 12 ? today : yesterday;
  const start = localToInstant(`${bedDay}T${bedClock}`, tz).ms;
  let end = localToInstant(`${today}T${wakeClock}`, tz).ms;
  if (end <= start) end = start + 8 * HOUR_MS;
  return { episode_type: 'main', start_time: toIso(start), end_time: toIso(Math.min(end, Date.now())) };
}

export function openSleepForm(existing = null, { type = 'main' } = {}) {
  const tz = existing?.tz ?? app.state.user.timezone;
  const r = existing ? { ...existing } : defaultSleep(type);
  delete r.revisions;
  const set = (k) => (v) => { r[k] = v ?? undefined; check(); };
  const issuesBox = h('div');
  function candidate() {
    const base = existing ?? { id: '00000000-0000-4000-8000-000000000000', user_id: app.state.user.id, source: 'user', tz, created_at: toIso(Date.now()), updated_at: toIso(Date.now()) };
    return { ...base, ...r, tz };
  }
  function check() {
    const c = candidate();
    const rest = app.state.tables.sleep_episodes.filter((e) => e.id !== c.id);
    const overlap = validateCollection('sleep_episodes', [...rest, c]).filter((i) => i.ids?.includes(c.id) && i.code !== 'possible_duplicate');
    const all = [...validateRecord('sleep_episodes', c), ...overlap];
    issuesBox.replaceChildren(issueList(all));
    return all;
  }

  const latencyOpts = [[5, '5m'], [10, '10m'], [15, '15m'], [30, '30m'], [45, '45m'], [60, '1h'], [90, '1h 30m'], [null, 'Not sure']];
  const wasoOpts = [[0, 'None'], [5, '5m'], [15, '15m'], [30, '30m'], [60, '1h'], [120, '2h'], [null, 'Not sure']];
  const scale5 = (k, labels) => chips([[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [null, '–']], r[k] ?? null, set(k), labels);

  const body = h('div', { class: 'form' },
    segmented([['main', 'Main sleep'], ['nap', 'Nap'], ['other', 'Other']], r.episode_type, (v) => { r.episode_type = v; check(); }, { label: 'Type' }),
    h('p', { class: 'note' }, `Times are in ${tz}. Sleep can start on one day and end on the next, or happen during the day.`),
    dateTime('Got into bed', r.start_time, tz, set('start_time'), { required: true }),
    dateTime('Started trying to sleep', r.attempt_time, tz, set('attempt_time'), { hint: 'Optional. Leave empty if it was the same as getting into bed.' }),
    h('div', { class: 'q' }, h('span', {}, 'Time to fall asleep'),
      chips(latencyOpts, r.sleep_latency_minutes ?? null, (v) => { r.sleep_latency_minutes = v ?? undefined; check(); }, 'Time to fall asleep'),
      h('details', { class: 'more' }, h('summary', {}, 'Or enter the exact time you fell asleep'),
        dateTime('Fell asleep at', r.onset_time, tz, set('onset_time')))),
    h('div', { class: 'q' }, h('span', {}, 'Awake during the night (total)'), chips(wasoOpts, r.wake_after_sleep_onset_minutes ?? null, (v) => { r.wake_after_sleep_onset_minutes = v ?? undefined; check(); }, 'Awake during the night')),
    h('label', { class: 'q-row' }, h('span', {}, 'Times you woke up'), numberInput(r.awakenings_count, set('awakenings_count'), { label: 'Times woke up', min: 0, max: 100 })),
    dateTime('Final awakening', r.final_awakening_time, tz, set('final_awakening_time'), { hint: 'Optional. When you woke for the last time.' }),
    dateTime('Got out of bed', r.end_time, tz, set('end_time'), { hint: 'Leave empty if you are still in this sleep episode.' }),
    h('div', { class: 'q' }, h('span', {}, 'Sleep quality (1 very poor – 5 very good)'), scale5('subjective_quality', 'Sleep quality')),
    h('div', { class: 'q' }, h('span', {}, 'Refreshed on waking (1 not at all – 5 very)'), scale5('morning_refreshment', 'Refreshed')),
    h('div', { class: 'q' }, h('span', {}, 'The day after waking was'), chips([['workday', 'Work / school'], ['free_day', 'Free day'], ['unknown', 'Not sure']], r.day_type ?? 'unknown', set('day_type'), 'Day type')),
    h('div', { class: 'q' }, h('span', {}, 'Woke by alarm'), chips([[true, 'Yes'], [false, 'No'], [null, 'Not sure']], r.alarm_used ?? null, set('alarm_used'), 'Alarm')),
    issuesBox,
    existing ? historyNote(existing) : null,
    existing ? deleteButton('sleep_episodes', existing, () => sheet.close()) : null);

  const sheet = openSheet({
    title: existing ? 'Edit sleep' : r.episode_type === 'main' ? 'Log sleep' : 'Log a nap',
    sub: existing ? `Recorded ${atDayTime(existing.created_at, tz)} · ${existing.source.replace(/_/g, ' ')}` : null,
    body,
    onOk: (close) => save('sleep_episodes', existing, r, check(), close),
  });
  check();
}

function historyNote(rec) {
  const n = rec.revisions?.length ?? 0;
  if (!n) return null;
  return h('details', { class: 'more' }, h('summary', {}, `Edited ${n} time${n > 1 ? 's' : ''}: earlier versions are kept`),
    h('ul', { class: 'refs' }, rec.revisions.map((v) => h('li', {}, `${atDayTime(v.replaced_at, rec.tz)}: replaced version recorded ${atDayTime(v.previous.updated_at ?? v.previous.created_at, rec.tz)}`))));
}

function deleteButton(table, rec, close) {
  return h('button', { type: 'button', class: 'danger-link', onclick: async () => {
    if (await ask({ title: 'Delete this entry?', message: 'It is removed from this device. This cannot be undone.', ok: 'Delete', danger: true })) {
      close();
      update(deleteRecord(app.state, table, rec.id), 'Deleted');
    }
  } }, 'Delete entry');
}

async function save(table, existing, fields, issues, close) {
  if (hasErrors(issues)) {
    const first = issues.find((i) => i.level === 'error');
    return ask({ title: 'Please check the entry', message: first.message, ok: 'OK', cancel: null });
  }
  const warnings = issues.filter((i) => i.level === 'warning');
  if (warnings.length && !(await ask({ title: 'Save anyway?', message: warnings.map((w) => w.message).join(' '), ok: 'Save' }))) return;
  const clean = Object.fromEntries(Object.entries(fields).filter(([k]) => !['id', 'user_id', 'created_at', 'updated_at', 'source', 'tz', 'revisions'].includes(k)));
  const res = existing ? updateRecord(app.state, table, existing.id, clean) : addRecord(app.state, table, clean, { source: 'user' });
  if (hasErrors(res.issues)) return ask({ title: 'Could not save', message: res.issues.find((i) => i.level === 'error').message, ok: 'OK', cancel: null });
  close();
  update(res.state, existing ? 'Updated. The earlier version is kept.' : 'Saved');
}

// ---------------------------------------------------------------- behaviour events

// Typical caffeine per serving (approximate; edit if you know the amount).
const CAFFEINE = [['coffee', 'Coffee', 95], ['espresso', 'Espresso', 65], ['tea', 'Black tea', 47], ['green_tea', 'Green tea', 28], ['energy_drink', 'Energy drink', 80], ['cola', 'Cola', 34], ['other', 'Other', null]];

export const EVENT_FORMS = {
  light: {
    table: 'light_exposure_events', title: 'Light', icon: 'sun',
    defaults: () => ({ start_time: toIso(Date.now() - 30 * MIN_MS), end_time: nowIso(), measurement_type: 'self_report', indoor_outdoor_context: 'outdoor', self_reported_brightness: 'daylight' }),
    why: 'Light timing is the main signal that sets the body clock. Without a light sensor, only where you were and how bright it seemed is recorded; no lux value is guessed.',
    fields: [
      { key: 'start_time', label: 'Start', kind: 'datetime', required: true },
      { key: 'end_time', label: 'End', kind: 'datetime', required: true },
      { key: 'measurement_type', label: 'Measured with', kind: 'chips', options: [['self_report', 'My own estimate'], ['sensor', 'Light sensor (lux)']] },
      { key: 'indoor_outdoor_context', label: 'Where', kind: 'chips', options: [['outdoor', 'Outdoors'], ['indoor', 'Indoors'], ['mixed', 'Both'], ['unknown', 'Not sure']] },
      { key: 'self_reported_brightness', label: 'How bright', kind: 'chips', options: [['dim', 'Dim'], ['normal_indoor', 'Normal indoor'], ['bright_indoor', 'Bright indoor'], ['daylight', 'Daylight']], showIf: (r) => r.measurement_type === 'self_report' },
      { key: 'illuminance_lux', label: 'Mean illuminance', kind: 'number', unit: 'lux', min: 0, max: 200000, showIf: (r) => r.measurement_type === 'sensor' },
      { key: 'sensor_source', label: 'Sensor', kind: 'text', placeholder: 'e.g. Actiwatch', showIf: (r) => r.measurement_type === 'sensor' },
      { key: 'sensor_position', label: 'Sensor worn at', kind: 'chips', options: [['wrist', 'Wrist'], ['chest', 'Chest'], ['eye_level', 'Eye level'], ['desk', 'Desk'], ['unknown', 'Not sure']], showIf: (r) => r.measurement_type === 'sensor' },
    ],
    clean: (r) => (r.measurement_type === 'sensor' ? { ...r, self_reported_brightness: undefined } : { ...r, illuminance_lux: undefined, sensor_source: undefined, sensor_position: undefined }),
  },
  meal: {
    table: 'meal_events', title: 'Meal', icon: 'meal',
    defaults: () => ({ start_time: nowIso(), meal_category: guessMeal() }),
    why: 'Meal timing may relate to sleep timing. Only what you record is analysed; an unrecorded meal does not mean you did not eat.',
    fields: [
      { key: 'start_time', label: 'Started', kind: 'datetime', required: true },
      { key: 'end_time', label: 'Finished', kind: 'datetime' },
      { key: 'meal_category', label: 'Meal', kind: 'chips', options: [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack'], ['other', 'Other']] },
      { key: 'approximate_size', label: 'Size', kind: 'chips', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] },
      { key: 'calories_kcal', label: 'Calories (optional)', kind: 'number', unit: 'kcal', min: 0, max: 10000 },
    ],
  },
  caffeine: {
    table: 'substance_events', title: 'Caffeine', icon: 'coffee',
    defaults: () => ({ event_type: 'caffeine', start_time: nowIso(), product: 'coffee', amount: 95, unit: 'mg' }),
    why: 'Caffeine late in the day can delay and shorten sleep; the time and amount let your own nights be compared.',
    fields: [
      { key: 'start_time', label: 'Time', kind: 'datetime', required: true },
      { key: 'product', label: 'Drink', kind: 'chips', options: CAFFEINE.map(([v, l]) => [v, l]), onPick: (r, v) => { const mg = CAFFEINE.find((c) => c[0] === v)?.[2]; if (mg) r.amount = mg; } },
      { key: 'amount', label: 'Caffeine', kind: 'number', unit: 'mg', min: 0, max: 2000, hint: 'Typical amount per serving filled in; change it if you know better.' },
    ],
  },
  alcohol: {
    table: 'substance_events', title: 'Alcohol', icon: 'glass',
    defaults: () => ({ event_type: 'alcohol', start_time: nowIso(), product: 'beer', amount: 1, unit: 'standard_drink' }),
    why: 'Alcohol can change sleep later in the night. A standard drink is about 10 g of alcohol (a small beer, a small glass of wine or one shot).',
    fields: [
      { key: 'start_time', label: 'Time', kind: 'datetime', required: true },
      { key: 'product', label: 'Drink', kind: 'chips', options: [['beer', 'Beer'], ['wine', 'Wine'], ['spirits', 'Spirits'], ['other', 'Other']] },
      { key: 'amount', label: 'Amount', kind: 'number', unit: 'standard drinks', min: 0, max: 30, step: 0.5 },
    ],
  },
  stress: {
    table: 'subjective_observations', title: 'Stress', icon: 'wave',
    defaults: () => ({ measure: 'stress', timestamp: nowIso(), scale_definition: 'stress_1_5: 1 none – 5 extreme', rating: 3 }),
    why: 'Your own stress ratings can be compared with your sleep. A rating is a feeling, not a measurement of stress hormones.',
    fields: [
      { key: 'timestamp', label: 'Time', kind: 'datetime', required: true },
      { key: 'rating', label: 'Stress (1 none – 5 extreme)', kind: 'chips', options: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] },
      { key: 'optional_context', label: 'Note (optional)', kind: 'text', placeholder: 'Anything unusual today?' },
    ],
  },
  energy: {
    table: 'subjective_observations', title: 'Energy', icon: 'bolt',
    defaults: () => ({ measure: 'energy', timestamp: nowIso(), scale_definition: 'energy_1_5: 1 exhausted – 5 full of energy', rating: 3 }),
    why: 'How energetic you feel, for comparison with your sleep.',
    fields: [
      { key: 'timestamp', label: 'Time', kind: 'datetime', required: true },
      { key: 'rating', label: 'Energy (1 exhausted – 5 full of energy)', kind: 'chips', options: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] },
    ],
  },
  sleepiness: {
    table: 'subjective_observations', title: 'Sleepiness', icon: 'moon',
    defaults: () => ({ measure: 'sleepiness', timestamp: nowIso(), scale_definition: 'KSS_1_9: Karolinska Sleepiness Scale (Åkerstedt & Gillberg 1990)', rating: 5 }),
    why: 'Karolinska Sleepiness Scale: how sleepy you feel right now.',
    fields: [
      { key: 'timestamp', label: 'Time', kind: 'datetime', required: true },
      { key: 'rating', label: '1 extremely alert · 3 alert · 5 neither · 7 sleepy, no effort to stay awake · 9 very sleepy, fighting sleep', kind: 'chips', options: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, String(n)]) },
    ],
  },
  activity: {
    table: 'activity_events', title: 'Activity', icon: 'run',
    defaults: () => ({ start_time: toIso(Date.now() - 45 * MIN_MS), end_time: nowIso(), activity_type: 'walk', intensity: 'moderate' }),
    why: 'Physical activity and its timing can relate to sleep.',
    fields: [
      { key: 'start_time', label: 'Start', kind: 'datetime', required: true },
      { key: 'end_time', label: 'End', kind: 'datetime', required: true },
      { key: 'activity_type', label: 'Activity', kind: 'chips', options: [['walk', 'Walk'], ['run', 'Run'], ['cycling', 'Cycling'], ['gym', 'Gym'], ['sport', 'Sport'], ['yoga', 'Yoga'], ['other', 'Other']] },
      { key: 'intensity', label: 'Intensity', kind: 'chips', options: [['light', 'Light'], ['moderate', 'Moderate'], ['vigorous', 'Vigorous'], ['unknown', 'Not sure']] },
    ],
  },
  medication: {
    table: 'medication_events', title: 'Medication or supplement', icon: 'pill',
    defaults: () => ({ timestamp: nowIso(), kind: 'medication', status: 'current' }),
    why: 'Some medicines and supplements affect sleep. This is sensitive information: it stays on this device, is excluded from exports unless you include it, and is only used to describe your records.',
    sensitive: true,
    fields: [
      { key: 'medication_identifier', label: 'Name', kind: 'text', required: true, placeholder: 'As on the package' },
      { key: 'kind', label: 'Type', kind: 'chips', options: [['medication', 'Medication'], ['supplement', 'Supplement']] },
      { key: 'dose', label: 'Dose', kind: 'number', min: 0, step: 0.1 },
      { key: 'unit', label: 'Dose unit', kind: 'text', placeholder: 'e.g. mg' },
      { key: 'timestamp', label: 'Taken at', kind: 'datetime', required: true },
      { key: 'status', label: 'Entry is', kind: 'chips', options: [['current', 'Current'], ['historical', 'Historical']] },
    ],
  },
};

function guessMeal() {
  const hr = new Date().getHours();
  return hr < 10 ? 'breakfast' : hr < 15 ? 'lunch' : hr < 21 ? 'dinner' : 'snack';
}

export function formKeyFor(table, rec) {
  if (table === 'substance_events') return rec.event_type;
  if (table === 'subjective_observations') return rec.measure;
  return Object.entries(EVENT_FORMS).find(([, f]) => f.table === table)?.[0];
}

export function openEventForm(key, existing = null) {
  const def = EVENT_FORMS[key];
  const tz = existing?.tz ?? app.state.user.timezone;
  const r = existing ? { ...existing } : def.defaults();
  delete r.revisions;
  const issuesBox = h('div');
  const fieldsBox = h('div', { class: 'form' });
  const candidate = () => {
    const base = existing ?? { id: '00000000-0000-4000-8000-000000000000', user_id: app.state.user.id, source: 'user', tz, created_at: toIso(Date.now()), updated_at: toIso(Date.now()) };
    return (def.clean ?? ((x) => x))({ ...base, ...r, tz });
  };
  const check = () => {
    const issues = validateRecord(def.table, candidate());
    issuesBox.replaceChildren(issueList(issues));
    return issues;
  };
  const paint = () => {
    fieldsBox.replaceChildren(...def.fields.filter((f) => !f.showIf || f.showIf(r)).map((f) => {
      const set = (v) => { r[f.key] = v ?? undefined; f.onPick?.(r, v); if (f.onPick || def.fields.some((x) => x.showIf)) paint(); check(); };
      if (f.kind === 'datetime') return dateTime(f.label, r[f.key], tz, set, { required: f.required });
      if (f.kind === 'chips') return h('div', { class: 'q' }, h('span', {}, f.label), chips(f.options, r[f.key] ?? null, set, f.label));
      if (f.kind === 'number') return h('div', { class: 'q' }, h('label', { class: 'q-row' }, h('span', {}, f.label), numberInput(r[f.key], set, { label: f.label, min: f.min, max: f.max, step: f.step ?? 1, unit: f.unit })), f.hint ? h('small', { class: 'note' }, f.hint) : null);
      return h('label', { class: 'q' }, h('span', {}, f.label, f.required ? h('em', {}, ' *') : null), textInput(r[f.key], set, { label: f.label, placeholder: f.placeholder }));
    }));
  };
  paint();
  const sheet = openSheet({
    title: existing ? `Edit ${def.title.toLowerCase()}` : def.title,
    sub: `Times in ${tz}`,
    body: h('div', { class: 'form' }, h('p', { class: 'note' }, def.why), fieldsBox, issuesBox,
      existing ? historyNote(existing) : null, existing ? deleteButton(def.table, existing, () => sheet.close()) : null),
    onOk: (close) => save(def.table, existing, candidate(), check(), close),
  });
  check();
}

/** Quick-add chooser for the behaviour categories the user tracks. */
export function openAddChooser() {
  const t = app.state.user.tracking;
  const keys = ['light', 'meal', 'caffeine', 'alcohol', 'stress', 'energy', 'sleepiness', 'activity', 'medication'].filter((k) => ({ light: t.light, meal: t.meals, caffeine: t.caffeine, alcohol: t.alcohol, stress: t.stress, energy: t.stress, sleepiness: true, activity: t.activity, medication: t.medications })[k]);
  const sheet = openSheet({
    title: 'Add',
    body: h('div', { class: 'grid-pick' },
      h('button', { type: 'button', class: 'pick', onclick: () => { sheet.close(); setTimeout(() => openSleepForm(), 240); } }, icon('moon'), 'Sleep'),
      h('button', { type: 'button', class: 'pick', onclick: () => { sheet.close(); setTimeout(() => openSleepForm(null, { type: 'nap' }), 240); } }, icon('nap'), 'Nap'),
      keys.map((k) => h('button', { type: 'button', class: 'pick', onclick: () => { sheet.close(); setTimeout(() => openEventForm(k), 240); } }, icon(EVENT_FORMS[k].icon), EVENT_FORMS[k].title.split(' ')[0]))),
  });
}
