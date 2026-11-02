// More: Biology, Research & export, Data quality, Import, Settings, Privacy, Account, About.
import { h, icon } from '../dom.js';
import { openSheet, toggle, field, segmented, ask, tell, snack } from '../dialogs.js';
import { app, update } from '../store.js';
import { wipe } from '../storage.js';
import { emptyState, addRecord } from '../../core/repo.js';
import { toMs } from '../../core/time.js';
import { AppleHealthParser, sleepCsvToRecords, lightCsvToRecords } from '../../core/importers.js';
import { createCloud } from '../../core/cloud.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { resolveSleepNeed, profileAge } from '../../core/sleepNeed.js';
import { chronotypeFromProfile } from '../../core/chronotype.js';
import { row, section, chips, multiChips, numberInput, emptyNote, clock } from '../kit.js';
import { biologyBody } from './biology.js';
import { researchBody } from './research.js';
import { REFERENCES } from '../../core/references.js';
import { applyTheme } from '../theme.js';

export const cloud = createCloud({
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  storage: { get: () => { try { return JSON.parse(localStorage.getItem('sleep-advisor:session')); } catch { return null; } }, set: (s) => { try { if (s) localStorage.setItem('sleep-advisor:session', JSON.stringify(s)); else localStorage.removeItem('sleep-advisor:session'); } catch { /* blocked */ } } },
});

const PAGES = {
  biology: ['Biology', 'flask', 'Sleep pressure, body-clock timing, light', () => biologyBody()],
  research: ['Research & export', 'download', 'Download your data, lab results, model check', () => researchBody()],
  quality: ['Data quality', 'table', 'What is recorded and what is missing', () => qualityBody()],
  import: ['Import', 'upload', 'Apple Health, sleep diary or light-sensor files', () => importBody()],
  settings: ['Settings', 'sliders', 'Profile, schedule, what to track, appearance', () => settingsBody()],
  privacy: ['Privacy & consent', 'lock', 'Where your data is and what it is used for', () => privacyBody()],
  account: ['Account & sync', 'cloud', SUPABASE_URL ? 'Sign in to back up and sync' : 'Local-only in this version', () => accountBody()],
  about: ['How it works', 'info', 'The science, and what this app cannot do', () => aboutBody()],
};

export function renderMore(root, sub = null) {
  const col = h('div', { class: 'col' });
  root.replaceChildren(col);
  col.append(h('h1', { class: 'display page-title' }, 'More'));
  col.append(h('div', { class: 'rows' }, Object.entries(PAGES).map(([k, [title, ic, desc]]) => row({ ic, title, sub: desc, onclick: () => openPage(k) }))));
  if (sub) openPage(sub);
}

export function openPage(key) {
  const [title, , , body] = PAGES[key];
  const s = openSheet({ title, body: body() });
  // Re-render the open page after changes made inside it.
  const holder = s.sheet.querySelector('.sheet-body');
  const refresh = () => { if (document.body.contains(holder)) holder.replaceChildren(body()); };
  pageRefreshers.add(refresh);
}
export const pageRefreshers = new Set();

// ---------------------------------------------------------------- Data quality
function qualityBody() {
  const q = app.d.quality;
  const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)} %`);
  const errors = q.issues.filter((i) => i.level !== 'info');
  return h('div', { class: 'form' },
    h('p', { class: 'explain' }, `Last ${q.days} days. Missing information is never counted as zero: an unrecorded meal or light period is unknown, not absent.`),
    h('table', { class: 'mini' }, h('tbody', {},
      ...[
        ['Days with a main sleep', `${q.daysWithMainSleep} / ${q.days}`],
        ['Main sleeps · naps', `${q.mainSleeps} · ${q.naps}`],
        ['…with fall-asleep time', pct(q.withOnset)],
        ['…with time awake at night', pct(q.withWaso)],
        ['…with quality rating', pct(q.withQuality)],
        ['…with workday / free day', pct(q.withDayType)],
        ['Light entries · sensor hours', `${q.counts.light} · ${q.counts.sensorLightHours} h`],
        ['Meals · caffeine · alcohol', `${q.counts.meals} · ${q.counts.caffeine} · ${q.counts.alcohol}`],
        ['Stress ratings · activities', `${q.counts.stress} · ${q.counts.activity}`],
      ].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, v))))),
    section('Things to check', null, errors.length
      ? h('ul', { class: 'plain' }, errors.slice(0, 30).map((i) => h('li', {}, `${i.table.replace(/_/g, ' ')}: ${i.message}`)))
      : emptyNote('No problems found in your records.')));
}

// ---------------------------------------------------------------- Import
function importBody() {
  const status = h('p', { class: 'note', role: 'status' });
  const pick = (accept) => new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => { resolve(input.files[0] ?? null); input.remove(); });
    document.body.append(input);
    input.click();
  });
  const addMany = (table, rows, source) => {
    let s = app.state;
    let added = 0;
    let dupes = 0;
    let rejected = 0;
    const seen = new Set(s.tables[table].filter((r) => r.source === source).map((r) => `${toMs(r.start_time ?? r.timestamp)}|${r.episode_type ?? r.event_type ?? r.measurement_type ?? ''}`));
    for (const r of rows) {
      const key = `${toMs(r.start_time ?? r.timestamp)}|${r.episode_type ?? r.event_type ?? r.measurement_type ?? ''}`;
      if (seen.has(key)) { dupes++; continue; }
      const res = addRecord(s, table, r, { source });
      if (res.issues.some((i) => i.level === 'error')) rejected++;
      else { s = res.state; added++; seen.add(key); }
    }
    return { s, added, dupes, rejected };
  };
  const summary = (parts) => parts.filter(Boolean).join(', ');
  return h('div', { class: 'form' },
    h('p', { class: 'explain' }, 'Files are read on this device and never uploaded. Imported records keep their source, never overwrite what you entered, and re-importing the same file does not create duplicates.'),
    row({ ic: 'apple', title: 'Apple Health', sub: 'Health app → your picture → Export All Health Data → unzip → export.xml. Imports sleep (stages or In Bed) and Apple Watch Time in Daylight.', onclick: async () => {
      const f = await pick('.xml,text/xml');
      if (!f) return;
      try {
        status.textContent = 'Reading…';
        const p = new AppleHealthParser();
        const reader = f.stream().pipeThrough(new TextDecoderStream()).getReader();
        for (;;) { const { done, value } = await reader.read(); if (done) break; p.push(value); }
        const out = p.finish();
        const a = addMany('sleep_episodes', out.sleep_episodes, 'import_apple_health');
        app.state = a.s;
        const b = addMany('light_exposure_events', out.light_exposure_events, 'import_apple_health');
        update(b.s, `Imported ${a.added} sleep episodes${b.added ? ` and ${b.added} daylight periods` : ''}`);
        status.textContent = summary([`${a.added} sleep episodes`, `${b.added} daylight periods`, a.dupes + b.dupes ? `${a.dupes + b.dupes} already imported` : null, a.rejected + b.rejected ? `${a.rejected + b.rejected} rejected by validation` : null]) + '. Times come with their UTC offset; your current time zone is recorded for them.';
      } catch (err) { tell('Could not import', err.message); }
    } }),
    row({ ic: 'table', title: 'Sleep diary (CSV)', sub: 'Columns date, bedTime, wakeTime; optional latency, quality, free day, caffeine…', onclick: async () => {
      const f = await pick('.csv,text/csv');
      if (!f) return;
      try {
        const r = sleepCsvToRecords(await f.text(), app.state.user.timezone);
        let s = app.state;
        const counts = [];
        for (const [t, rows] of Object.entries(r.tables)) { app.state = s; const res = addMany(t, rows, 'import_csv'); s = res.s; counts.push(`${res.added} ${t.replace(/_/g, ' ')}`); }
        update(s, `Imported ${r.nights} nights`);
        status.textContent = `${counts.join(', ')}${r.skipped ? `; ${r.skipped} rows skipped` : ''}. Times read as local time in ${app.state.user.timezone}.`;
      } catch (err) { tell('Could not import', `${err.message}. The file needs columns date, bedTime and wakeTime.`); }
    } }),
    row({ ic: 'sun', title: 'Light sensor (CSV)', sub: 'Timestamp (or Date + Time) and lux, e.g. Actiwatch or ActTrust exports. Stored as measured lux in 10-minute periods.', onclick: async () => {
      const f = await pick('.csv,text/csv,.txt');
      if (!f) return;
      try {
        const r = lightCsvToRecords(await f.text(), app.state.user.timezone, { sensorSource: f.name });
        const res = addMany('light_exposure_events', r.records, 'import_light_csv');
        update(res.s, `Imported ${res.added} light periods`);
        status.textContent = `${r.samples} readings → ${res.added} periods${res.dupes ? `, ${res.dupes} already imported` : ''}${r.rejected ? `, ${r.rejected} implausible readings skipped` : ''}.`;
      } catch (err) { tell('Could not import', `${err.message}. The file needs a time column and a lux column.`); }
    } }),
    status,
    h('p', { class: 'note' }, 'Not available in a web app: Apple HealthKit live sync, Google Health Connect and Fitbit/Oura APIs need a native app or vendor credentials. See docs/INTEGRATIONS.md.'));
}

// ---------------------------------------------------------------- Settings
function settingsBody() {
  const s = app.state;
  const p = s.user.profile ?? {};
  const patch = (o) => update({ ...app.state, user: { ...app.state.user, profile: { ...app.state.user.profile, ...o } } });
  const track = (k) => (v) => update({ ...app.state, user: { ...app.state.user, tracking: { ...app.state.user.tracking, [k]: v } } });
  const need = resolveSleepNeed(p);
  const ct = chronotypeFromProfile(p);
  const age = profileAge(p);
  return h('div', { class: 'form' },
    section('You', null,
      field('Birthday', h('input', { type: 'date', class: 'time-input', value: p.birthday ?? '', max: new Date().toISOString().slice(0, 10), onchange: (e) => patch({ birthday: e.target.value || null }) }), { sub: age != null ? `${age} years · recommended sleep ${need.min}–${need.max} h (${need.group})` : 'Used only to look up the recommended sleep range for your age group.' }),
      h('div', { class: 'q' }, h('span', {}, 'My schedule is'), chips([['regular', 'Regular'], ['irregular', 'Irregular'], ['rotating_shifts', 'Rotating shifts'], ['night_shifts', 'Night shifts']], p.schedule_type ?? null, (v) => patch({ schedule_type: v, shift_work: ['rotating_shifts', 'night_shifts'].includes(v) ? 'yes' : 'no' }), 'Schedule')),
      field('Usually up by on work/school days', h('input', { type: 'time', class: 'time-input', value: p.work_wake_time ?? '', onchange: (e) => patch({ work_wake_time: e.target.value || null }) }), { sub: 'Default wake time in the planner.' }),
      field('Preferred sleep (hours)', numberInput(p.preferred_sleep_hours, (v) => patch({ preferred_sleep_hours: v }), { label: 'Preferred sleep', min: 4, max: 12, step: 0.5 }), { sub: `Kept within ${need.min}–${need.max} h.` }),
      row({ ic: 'calendar', title: 'Chronotype questionnaire', sub: ct ? `Mid-sleep on free days (corrected): ${clock(ct.MSFsc)} · ${ct.category}${ct.valid ? '' : ' (alarm on free days: less reliable)'}` : 'Munich ChronoType Questionnaire, core questions', onclick: openMctq })),
    section('What to track', null,
      h('p', { class: 'note' }, 'Turn off anything you do not want to record. Nothing is required every day.'),
      ...[['light', 'Light exposure'], ['meals', 'Meals'], ['caffeine', 'Caffeine'], ['alcohol', 'Alcohol'], ['stress', 'Stress and energy'], ['activity', 'Physical activity'], ['medications', 'Medications and supplements (sensitive)']].map(([k, l]) => field(l, toggle(s.user.tracking[k], track(k), l)))),
    section('Appearance', null, field('Theme', segmented([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], s.settings.theme, (v) => { update({ ...app.state, settings: { ...app.state.settings, theme: v } }); applyTheme(v); }, { label: 'Theme' }))),
    section('Time zone', null, h('p', { class: 'explain' }, `${s.user.timezone}. Follows your phone. Each entry keeps the zone it was recorded in, so travel and daylight-saving changes do not shift past records.`)));
}

function openMctq() {
  const q = { workdays: 5, workOnset: '23:30', workWake: '07:00', freeOnset: '00:30', freeWake: '08:30', freeAlarm: false, ...(app.state.user.profile.mctq ?? {}) };
  const t = (k, l) => field(l, h('input', { type: 'time', class: 'time-input', value: q[k], onchange: (e) => { q[k] = e.target.value; } }));
  openSheet({
    title: 'Chronotype',
    sub: 'Munich ChronoType Questionnaire (core)',
    body: h('div', { class: 'form' },
      h('p', { class: 'note' }, 'Think of a normal recent week. "Fall asleep" means actually asleep, not just in bed. Free-day answers are only reliable if you wake without an alarm.'),
      h('div', { class: 'q' }, h('span', {}, 'Work or school days per week'), chips([[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']], Number(q.workdays), (v) => { q.workdays = v; }, 'Workdays')),
      t('workOnset', 'Workdays: fall asleep at'), t('workWake', 'Workdays: wake up at'), t('freeOnset', 'Free days: fall asleep at'), t('freeWake', 'Free days: wake up at'),
      field('I use an alarm on free days', toggle(q.freeAlarm, (v) => { q.freeAlarm = v; }, 'Alarm on free days'))),
    onOk: (close) => { close(); update({ ...app.state, user: { ...app.state.user, profile: { ...app.state.user.profile, mctq: q } } }, 'Saved'); },
  });
}

// ---------------------------------------------------------------- Privacy
function privacyBody() {
  const s = app.state;
  const c = s.user.consent ?? {};
  return h('div', { class: 'form' },
    h('p', { class: 'explain' }, 'Your records are stored on this phone (browser storage). Nothing is sent anywhere unless you turn on cloud sync, and nothing is shared with third parties or used to train models without your permission.'),
    h('table', { class: 'mini' }, h('tbody', {},
      h('tr', {}, h('td', {}, 'Store records on this device'), h('td', {}, c.local_storage ? `Agreed ${new Date(c.local_storage).toLocaleDateString()}` : '–')),
      h('tr', {}, h('td', {}, 'Cloud backup and sync'), h('td', {}, cloud.session ? 'On' : 'Off')),
      h('tr', {}, h('td', {}, 'Research use'), h('td', {}, s.research.enrolled ? 'Allowed' : 'Not allowed')),
      h('tr', {}, h('td', {}, 'Medication records'), h('td', {}, s.user.tracking.medications ? 'Tracked' : 'Off')))),
    section('Your rights', null, h('ul', { class: 'plain' },
      h('li', {}, 'See and correct every entry (Log). Corrections keep the earlier version so nothing is silently changed.'),
      h('li', {}, 'Export everything (More → Research & export).'),
      h('li', {}, 'Delete everything on this device below. With an account, deleting the account removes the cloud copy too, including research records.'))),
    section('Retention', null, h('p', { class: 'explain' }, 'Records stay until you delete them. The app keeps no backups on any server in local-only mode; the earlier app version’s copy on this device is kept as a fallback until you delete all data.')),
    h('button', { type: 'button', class: 'big-btn danger', onclick: async () => {
      if (!(await ask({ title: 'Delete all data on this device?', message: 'Your sleep records, entries, predictions, lab results and settings will be removed from this phone. This cannot be undone. Export first if you want a copy.', ok: 'Delete everything', danger: true }))) return;
      wipe();
      update(emptyState(), 'All data deleted');
      document.querySelectorAll('dialog').forEach((d) => d.close());
    } }, icon('trash'), 'Delete all data on this device'));
}

// ---------------------------------------------------------------- Account
function accountBody() {
  if (!cloud.enabled) {
    return h('div', { class: 'form' },
      h('p', { class: 'explain' }, 'This version runs in local-only mode: everything is stored on this phone and no account is needed.'),
      h('p', { class: 'note' }, 'To enable accounts and cloud backup, the app owner sets up a Supabase project (see docs/SETUP.md) and adds its public URL and key to src/ui/config.js. The database only lets each user reach their own records.'));
  }
  if (!cloud.session) {
    const email = h('input', { type: 'email', class: 'text-input', placeholder: 'Email', autocomplete: 'email' });
    const pass = h('input', { type: 'password', class: 'text-input', placeholder: 'Password (8+ characters)', autocomplete: 'current-password' });
    const go = (fn) => async () => {
      try { await fn(email.value.trim(), pass.value); snack('Signed in'); document.querySelectorAll('dialog.sheet').forEach((d) => d.close()); }
      catch (err) { tell('Could not sign in', err.message); }
    };
    return h('div', { class: 'form' }, h('p', { class: 'explain' }, 'Sign in to back up and sync your records. Only you can read them.'), email, pass,
      h('button', { type: 'button', class: 'big-btn', onclick: go(cloud.signIn) }, 'Sign in'),
      h('button', { type: 'button', class: 'big-btn soft', onclick: go(cloud.signUp) }, 'Create account'));
  }
  return h('div', { class: 'form' },
    h('p', { class: 'explain' }, `Signed in as ${cloud.session.user?.email ?? 'you'}.`),
    h('button', { type: 'button', class: 'big-btn', onclick: async () => {
      try {
        const merged = await cloud.sync(app.state.tables);
        update({ ...app.state, tables: { ...app.state.tables, ...merged } }, 'Synced');
      } catch (err) { tell('Sync failed', err.message); }
    } }, icon('cloud'), 'Sync now'),
    h('button', { type: 'button', class: 'big-btn soft', onclick: async () => { await cloud.signOut(); snack('Signed out'); } }, 'Sign out'),
    h('button', { type: 'button', class: 'danger-link', onclick: async () => {
      if (!(await ask({ title: 'Delete your account?', message: 'Your cloud copy, including research records linked to you, is deleted. Records on this phone stay until you delete them.', ok: 'Delete account', danger: true }))) return;
      try { await cloud.deleteAccount(); snack('Account deleted'); } catch (err) { tell('Could not delete the account', err.message); }
    } }, 'Delete account'));
}

// ---------------------------------------------------------------- About
function aboutBody() {
  const sec = (t, ...p) => h('div', { class: 'how' }, h('h3', { class: 'display' }, t), ...p.map((x) => h('p', {}, x)));
  return h('div', { class: 'form' },
    sec('What is recorded and what is estimated',
      'The app separates four kinds of information: what you or a device recorded; values calculated from those records (like sleep duration); model estimates (like sleep pressure); and laboratory results. Each is labelled on screen and stored separately.'),
    sec('Sleep pressure', 'Estimated with the homeostatic part of the two-process model of sleep regulation (Borbély 1982; Daan, Beersma & Borbély 1984). It describes how sleep pressure is expected to build while awake and fall during sleep. It is not a measurement and has not been validated for you.'),
    sec('Body-clock timing', 'Two experimental methods are included: one from your sleep timing (melatonin onset is on average about 2 h before sleep onset in regular sleepers; Burgess et al. 2003) and one from measured light with a published body-clock model (Forger et al. 1999). They are off by default and labelled experimental, because neither has been checked against melatonin tests in this app’s users.'),
    sec('Hormones', 'This version cannot measure or reliably determine melatonin or cortisol levels. Only saliva or blood tests can. Lab results can be added for research comparison.'),
    sec('Patterns', 'Insights compare your own nights. They show associations, not causes.'),
    sec('Not medical advice', 'The app does not diagnose sleep disorders or recommend medication, supplements or light therapy. If you are worried about your sleep, talk to a doctor.'),
    h('details', { class: 'more' }, h('summary', {}, 'All references'), h('ol', { class: 'refs' }, Object.values(REFERENCES).map((r) => h('li', {}, r)))));
}
