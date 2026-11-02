// Settings: about you, sleep type, health checks, import, look, data.
import { h, icon, todayKey } from './dom.js';
import { openSheet, segmented, toggle, field, timeInput, ask, tell, snack } from './dialogs.js';
import { app, update } from './store.js';
import { exportJson, importJson, emptyState } from './storage.js';
import { openHowItWorks } from './why.js';
import { row } from './tonight.js';
import { AppleHealthParser, parseSleepCsv, parseLightCsv, mergeEntries, mergeLightLog, pruneLightLog } from '../engine/importers.js';
import { applyTheme } from './theme.js';
import { profileAge } from '../engine/sleepNeed.js';

const patchProfile = (patch) => update({ ...app.state, profile: { ...app.state.profile, ...patch } });

export function renderSettings(root) {
  const p = app.state.profile ?? {};
  const plan = app.plan;
  const sb = p.screening ?? {};
  const col = h('div', { class: 'col' });
  root.replaceChildren(col);

  col.append(h('h1', { class: 'display page-title' }, 'Settings'));

  // ---- You
  const age = h('input', { type: 'date', class: 'time-input', max: todayKey(), value: p.birthday ?? '', 'aria-label': 'Birthday',
    onchange: (e) => patchProfile({ birthday: e.target.value }) });
  const years = profileAge(p);
  const need = h('input', { type: 'number', inputmode: 'decimal', class: 'num-input', min: 4, max: 12, step: 0.25, placeholder: plan.need ? String(plan.need.target) : '8',
    value: p.personalNeedHours ?? '', 'aria-label': 'Sleep need in hours', onchange: (e) => patchProfile({ personalNeedHours: e.target.value }) });
  col.append(group('You',
    field('Birthday', age, { sub: years != null ? `${years} years old` : null }),
    field('Up by on workdays', timeInput(p.workWake, (v) => patchProfile({ workWake: v }), 'Up by on workdays'), { sub: 'Leave empty if you have no fixed start' }),
    field('Sleep need (hours)', need, { sub: plan.need ? `Recommended for you: ${plan.need.min}–${plan.need.max} h` : null }),
    row({ ic: 'calendar', title: 'Sleep type quiz', sub: plan.chronotype ? `You: ${plan.chronotype.category}` : '4 quick questions', onclick: openQuiz })));

  // ---- Health checks
  const flag = (key, label) => field(label, toggle(sb[key], (v) => patchProfile({ screening: { ...(app.state.profile.screening ?? {}), [key]: v } }), label));
  col.append(group('Health check',
    flag('snoring', 'I snore loudly'),
    flag('tired', 'I’m often sleepy in the day'),
    flag('observedApnea', 'Someone saw me stop breathing'),
    flag('highBloodPressure', 'I have high blood pressure'),
    field('I work night or rotating shifts', toggle(p.shiftWork, (v) => patchProfile({ shiftWork: v }), 'Shift work')),
    h('p', { class: 'note' }, 'Private, stays on this phone. Used only to tell you when a doctor visit is worth it.')));

  // ---- Import
  col.append(group('Import',
    row({ ic: 'apple', title: 'Apple Health', sub: 'Sleep from Apple Watch or iPhone', onclick: importApple }),
    row({ ic: 'table', title: 'Sleep diary file (CSV)', sub: 'From another sleep app', onclick: importCsv }),
    row({ ic: 'sun', title: 'Light sensor file (CSV)', sub: 'Makes the body clock more precise', onclick: importLight }),
    row({ ic: 'heart', title: 'Melatonin test result', sub: app.state.measured.length ? `${app.state.measured.length} saved` : 'From a saliva or lab test', onclick: openMeasured })));

  // ---- Look
  const theme = segmented([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], app.state.settings?.theme ?? 'auto', (v) => {
    update({ ...app.state, settings: { ...(app.state.settings ?? {}), theme: v } });
    applyTheme(v);
  }, { label: 'Appearance' });
  col.append(group('Look', field('Appearance', theme)));

  // ---- Data
  col.append(group('Data',
    row({ ic: 'download', title: 'Save a backup', sub: 'Download all your data as a file', onclick: backup }),
    row({ ic: 'upload', title: 'Restore a backup', onclick: restore }),
    row({ ic: 'trash', title: 'Delete everything', warn: true, onclick: wipe })));

  col.append(group('About',
    row({ ic: 'info', title: 'How it works', sub: 'The science, in plain words', onclick: openHowItWorks }),
    h('p', { class: 'note' }, 'For wellbeing and learning, not a medical device. Your data never leaves this phone.')));
}

const group = (label, ...kids) => h('section', { class: 'group' }, h('div', { class: 'group-label' }, label), ...kids);

// ---- Sleep type quiz (MCTQ core)
export function openQuiz() {
  const q = { workdays: 5, workOnset: '23:30', workWake: '07:00', freeOnset: '00:30', freeWake: '08:30', freeAlarm: false, ...(app.state.profile.mctq ?? {}) };
  const set = (k) => (v) => { q[k] = v; };
  openSheet({
    title: 'Sleep type',
    sub: 'Think of a normal recent week',
    body: h('div', { style: 'display:grid;gap:14px' },
      h('div', { class: 'q' }, h('span', {}, 'Workdays per week'),
        Object.assign(segmented([[3, '3'], [4, '4'], [5, '5'], [6, '6']], Number(q.workdays), set('workdays')), { className: 'segmented wide' })),
      h('div', { class: 'group' }, h('div', { class: 'group-label' }, 'On workdays'),
        field('I fall asleep at', timeInput(q.workOnset, set('workOnset'), 'Workdays fall asleep')),
        field('I wake up at', timeInput(q.workWake, set('workWake'), 'Workdays wake up'))),
      h('div', { class: 'group' }, h('div', { class: 'group-label' }, 'On free days'),
        field('I fall asleep at', timeInput(q.freeOnset, set('freeOnset'), 'Free days fall asleep')),
        field('I wake up at', timeInput(q.freeWake, set('freeWake'), 'Free days wake up')),
        field('I use an alarm', toggle(q.freeAlarm, set('freeAlarm'), 'Alarm on free days'))),
      h('p', { class: 'note' }, 'Based on the Munich ChronoType Questionnaire (Roenneberg et al.). "Fall asleep" means actually asleep, not just in bed.')),
    onOk: (close) => {
      close();
      update({ ...app.state, profile: { ...app.state.profile, mctq: q } }, 'Saved');
    },
  });
}

// ---- Imports
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      resolve(input.files[0] ?? null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

async function importApple() {
  const go = await ask({
    title: 'Apple Health',
    message: 'In the Health app: tap your picture → Export All Health Data. Unzip it in Files and choose export.xml here.',
    ok: 'Choose file',
  });
  if (!go) return;
  const file = await pickFile('.xml,text/xml');
  if (!file) return;
  try {
    snack('Reading…');
    const parser = new AppleHealthParser();
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(value);
    }
    const r = parser.finish();
    if (!r.nights) throw new Error('No sleep found in this file.');
    update({ ...app.state, entries: mergeEntries(app.state.entries, r.entries), lightLog: pruneLightLog(mergeLightLog(app.state.lightLog, r.lightLog)) },
      `Added ${r.nights} nights${r.daylightRecords ? ' and daylight' : ''}`);
  } catch (err) {
    tell('Couldn’t import', err.message);
  }
}

async function importCsv() {
  const file = await pickFile('.csv,text/csv');
  if (!file) return;
  try {
    const r = parseSleepCsv(await file.text());
    update({ ...app.state, entries: mergeEntries(app.state.entries, r.entries) }, `Added ${r.entries.length} nights`);
  } catch (err) {
    tell('Couldn’t import', `${err.message}. The file needs columns date, bedTime and wakeTime.`);
  }
}

async function importLight() {
  const file = await pickFile('.csv,text/csv,.txt');
  if (!file) return;
  try {
    const r = parseLightCsv(await file.text());
    if (!r.samples) throw new Error('No readings found');
    update({ ...app.state, lightLog: pruneLightLog(mergeLightLog(app.state.lightLog, r.lightLog)) }, `Added light for ${r.days} days`);
  } catch (err) {
    tell('Couldn’t import', `${err.message}. The file needs a time column and a lux column.`);
  }
}

function openMeasured() {
  const m = { date: todayKey(), dlmo: '' };
  const list = h('div', { class: 'rows' }, app.state.measured.map((x, i) => h('div', { class: 'row', style: 'grid-template-columns:1fr auto' },
    h('span', { class: 'txt' }, h('b', {}, x.dlmo), h('small', {}, x.date)),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove', onclick: () => {
      update({ ...app.state, measured: app.state.measured.filter((_, j) => j !== i) }, 'Removed');
      sheet.close();
    } }, icon('trash')))));
  const sheet = openSheet({
    title: 'Melatonin test',
    sub: 'Dim-light melatonin onset (DLMO)',
    body: h('div', { style: 'display:grid;gap:12px' },
      h('p', { class: 'explain' }, 'If a saliva kit or sleep clinic measured when your melatonin starts rising, enter it. The app uses it instead of its estimate for 30 days.'),
      h('div', { class: 'group' },
        field('Test date', h('input', { type: 'date', class: 'time-input', value: m.date, max: todayKey(), onchange: (e) => { m.date = e.target.value; } })),
        field('Melatonin started at', timeInput('', (v) => { m.dlmo = v; }, 'DLMO time'))),
      list),
    onOk: (close) => {
      if (!m.date || !m.dlmo) return tell('Add the date and time');
      close();
      update({ ...app.state, measured: [...app.state.measured, m] }, 'Saved');
    },
  });
}

// ---- Data
function backup() {
  const blob = new Blob([exportJson(app.state)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `sleep-backup-${todayKey()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function restore() {
  const file = await pickFile('application/json,.json');
  if (!file) return;
  try {
    const data = importJson(await file.text());
    if (!(await ask({ title: 'Replace your data?', message: 'Everything on this phone is replaced by the backup.', ok: 'Replace', danger: true }))) return;
    update({ ...emptyState(), ...data, profile: { ...data.profile, onboarded: true } }, 'Restored');
    applyTheme(app.state.settings?.theme);
  } catch (err) {
    tell('Couldn’t restore', err.message);
  }
}

async function wipe() {
  if (await ask({ title: 'Delete everything?', message: 'Your nights, profile and settings are removed from this phone. This can’t be undone.', ok: 'Delete', danger: true })) {
    update(emptyState(), 'Deleted');
  }
}
