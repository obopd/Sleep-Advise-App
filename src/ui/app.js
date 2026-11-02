import { buildPlan } from '../engine/recommend.js';
import { evaluateHabits, HABIT_LABELS } from '../engine/habits.js';
import { REFERENCES, GRADE_LABEL } from '../engine/references.js';
import { fmtClock, fmtDuration, parseHHMM, addDays } from '../engine/time.js';
import { renderHormoneChart } from './chart.js';
import { load, save, upsertEntry, removeEntry, exportJson, importJson } from './storage.js';
import { sampleState } from './sample.js';
import { AppleHealthParser, parseSleepCsv, parseLightCsv, mergeEntries, mergeLightLog, pruneLightLog } from '../engine/importers.js';

let state = load();
let currentView = 'today';
const view = document.getElementById('view');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const refKeys = Object.keys(REFERENCES);
const cite = (refs = []) =>
  refs.length
    ? `<span class="cite">[${refs.map((r) => `<a href="#ref-${r}" data-ref="${r}">${refKeys.indexOf(r) + 1}</a>`).join(', ')}]</span>`
    : '';
const grade = (g) => (g ? `<span class="badge" title="${esc(GRADE_LABEL[g])}">Evidence ${g}</span>` : '');

function persist(next, msg) {
  state = next;
  if (!save(state)) toast('Could not save. Storage may be disabled in this browser.');
  else if (msg) toast(msg);
  render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

// ---------------------------------------------------------------- navigation
document.querySelectorAll('nav [data-view]').forEach((b) =>
  b.addEventListener('click', () => go(b.dataset.view)),
);
function go(name) {
  currentView = name;
  document.querySelectorAll('nav [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === name)));
  render();
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
view.addEventListener('click', (e) => {
  const ref = e.target.closest('[data-ref]');
  if (ref) {
    e.preventDefault();
    go('science');
    document.getElementById(`ref-${ref.dataset.ref}`)?.scrollIntoView({ block: 'center' });
  }
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    e.preventDefault();
    go(goto.dataset.goto);
  }
});

function render() {
  const plan = buildPlan({ profile: state.profile, entries: state.entries, measured: state.measured, lightLog: state.lightLog ?? {}, today: todayIso() });
  const views = { today: renderToday, log: renderLog, plan: renderPlan, profile: renderProfile, science: renderScience };
  views[currentView](plan);
}

// ---------------------------------------------------------------- today
function renderToday(plan) {
  const hasData = state.entries.length > 0 || state.profile?.mctq;
  if (!hasData) {
    view.innerHTML = `
      <div class="card stack">
        <h1>Your body clock, explained, and a sleep plan built on it</h1>
        <p>Sleep Advisor estimates your circadian rhythm (when melatonin rises, when cortisol peaks, how sleep pressure builds)
        from your sleep timing, then gives you a schedule and habits backed by sleep research.</p>
        <ol>
          <li>Fill in your <a href="#" data-goto="profile">profile</a>: age, work start, and a 4-question chronotype questionnaire.</li>
          <li>Log your sleep each morning for 1–2 weeks in the <a href="#" data-goto="log">sleep log</a>.</li>
          <li>Follow <a href="#" data-goto="plan">your plan</a>. It updates as your data changes.</li>
        </ol>
        <div class="row"><button class="btn primary" data-goto="profile">Start with my profile</button>
        <button class="btn" id="demo">Explore with sample data</button></div>
      </div>`;
    view.querySelector('#demo').addEventListener('click', () => persist(sampleState(todayIso()), 'Sample data loaded'));
    return;
  }

  const s = plan.summary;
  const flags = plan.flags.map((f) => `<div class="alert ${f.level}"><strong>${esc(f.title)}</strong>${esc(f.text)} ${cite(f.refs)}</div>`).join('');

  if (!plan.ready) {
    view.innerHTML = `<div class="stack">${flags}<div class="card"><h2>Almost there</h2><p>${esc(plan.dataQuality.message)}</p>
      <button class="btn primary" data-goto="log">Log a night</button></div></div>`;
    return;
  }

  const p = plan.phase;
  const sch = plan.schedule;
  const ct = plan.chronotype;
  const lastEntry = state.entries.at(-1);
  const sourceLabel = {
    measured: 'measured (lab or saliva test)',
    'light-model': 'modelled from your measured light exposure (Forger 1999 model)',
    diary: 'estimated from your sleep timing',
    questionnaire: 'estimated from questionnaire',
  }[p.source];
  const lightDays = Object.keys(state.lightLog ?? {}).length;
  const sources = state.entries.reduce((acc, e) => ((acc[e.source || 'manual'] = (acc[e.source || 'manual'] || 0) + 1), acc), {});

  view.innerHTML = `
    <div class="stack">
      ${flags}
      <p class="muted small">${esc(plan.dataQuality.message)} Data: ${Object.entries(sources).map(([k, v]) => `${v} ${v === 1 ? 'night' : 'nights'} ${esc(k)}`).join(', ') || 'none'}${lightDays ? `, ${lightDays} days of light data` : ''}.</p>
      <section class="card">
        <h2>Your target schedule</h2>
        <div class="hero">
          <div><div class="label">Lights out</div><div class="value">${fmtClock(sch.lightsOut)}</div></div>
          <div><div class="label">Wake up</div><div class="value">${fmtClock(sch.wake)}</div></div>
          <div><div class="label">Sleep target</div><div class="value">${sch.needHours} h</div></div>
          <div><div class="label">Free days: wake by</div><div class="value">${fmtClock(sch.freeDayLatestWake)}</div></div>
        </div>
        ${plan.alignment.status === 'advance' ? `<p class="small">Your body clock is about <b>${fmtDuration(plan.alignment.minutes)}</b> later than this schedule. <a href="#" data-goto="plan">See your step-by-step shift plan →</a></p>` : ''}
      </section>

      <section class="card">
        <h2>Your estimated 24-hour rhythm</h2>
        <p class="small muted">Relative levels anchored to your melatonin onset (DLMO ${fmtClock(p.dlmo)}, ${esc(sourceLabel)}, ±${p.uncertaintyMin} min).
        Shaded area = your habitual sleep. ${lastEntry?.screensUntil ? 'The melatonin dip shows the suppression expected from last night’s late light exposure.' : ''}</p>
        ${p.modelCheck ? `<p class="small muted">Cross-check: the light-driven Forger 1999 model, run on light inferred from your diary, puts DLMO at <b>${fmtClock(p.modelCheck.dlmo)}</b>.
          ${Math.abs(((p.modelCheck.dlmo - p.dlmo + 2160) % 1440) - 720) > 90 ? 'The two estimates disagree by more than 1.5 h, so treat your timing as uncertain. Importing wearable light data or a DLMO test would settle it.' : 'Both methods agree within 1.5 h.'} ${cite(['forger1999', 'cheng2021'])}</p>` : ''}
        <div id="chart"></div>
      </section>

      <div class="tiles">
        ${tile('Melatonin onset', fmtClock(p.dlmo), p.source === 'measured' ? 'measured' : 'estimated')}
        ${tile('Wake maintenance zone', `${fmtClock(p.wmzStart)}–${fmtClock(p.wmzEnd)}`, 'hardest time to fall asleep')}
        ${tile('Sleep gate opens', fmtClock(p.sleepGate), 'easiest time to fall asleep')}
        ${tile('Temperature minimum', fmtClock(p.cbtMin), 'light after this = earlier clock')}
        ${ct ? tile('Chronotype', ct.category, `MSFsc ${fmtClock(ct.MSFsc)}${ct.valid ? '' : ' (alarm on free days, less reliable)'}`) : ''}
        ${ct ? tile('Social jetlag', fmtDuration(ct.socialJetlag), ct.socialJetlag > 60 ? 'aim for < 1 h' : 'good') : ''}
      </div>

      ${s ? `<section class="card"><h2>Last ${s.count} nights</h2><div class="tiles">
        ${tile('Avg sleep', fmtDuration(s.avgTst), `target ${plan.need.min}–${plan.need.max} h`)}
        ${tile('Sleep efficiency', `${Math.round(s.avgEfficiency * 100)}%`, '≥ 85% is healthy')}
        ${tile('Time to fall asleep', fmtDuration(s.avgLatency), '≤ 30 min is normal')}
        ${tile('Awake during night', fmtDuration(s.avgWaso), '≤ 20–30 min is normal')}
        ${tile('Regularity (SRI)', s.sri == null ? '–' : Math.round(s.sri), s.sri == null ? 'needs consecutive nights' : 'out of 100')}
        ${tile('Avg quality', s.avgQuality == null ? '–' : `${s.avgQuality.toFixed(1)}/5`, 'self-rated')}
      </div></section>` : ''}
    </div>`;

  const habitualSleep = s
    ? { onset: s.meanOnset, wake: s.meanWake }
    : { onset: sch.sleepOnset, wake: sch.wake };
  renderHormoneChart(view.querySelector('#chart'), {
    phase: p,
    sleep: habitualSleep,
    brightLightUntil: parseHHMM(lastEntry?.screensUntil ?? ''),
  });
}

const tile = (label, value, sub) =>
  `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub ?? '')}</div></div>`;

// ---------------------------------------------------------------- log
function renderLog() {
  const editing = view.dataset.editDate;
  const last = state.entries.at(-1);
  const defaults = {
    date: addDays(todayIso(), -1),
    bedTime: last?.bedTime ?? '23:00',
    latencyMin: 15,
    wakeTime: last?.wakeTime ?? '07:00',
    outOfBedTime: '',
    wasoMin: 0,
    quality: 3,
    freeDay: false,
    alarm: true,
    caffeine: [],
    exerciseIntensity: 'none',
    morningLightMin: 0,
  };
  const e = { ...defaults, ...(state.entries.find((x) => x.date === editing) ?? {}) };
  const caf = [0, 1, 2].map((i) => e.caffeine?.[i] ?? { time: '', mg: '' });

  view.innerHTML = `
    <div class="stack">
      <form class="card" id="logForm">
        <h2>${editing ? 'Edit night' : 'Log last night'}</h2>
        <p class="small muted">Fill this in each morning (Consensus Sleep Diary). "Date" is the evening the night started.</p>
        <fieldset><legend>Sleep</legend><div class="fields">
          ${field('Date (evening of)', 'date', e.date, 'date', 'required')}
          ${field('Got into bed / lights out', 'bedTime', e.bedTime, 'time', 'required')}
          ${field('Minutes to fall asleep', 'latencyMin', e.latencyMin, 'number', 'min="0" max="600"')}
          ${field('Minutes awake during night', 'wasoMin', e.wasoMin, 'number', 'min="0" max="600"')}
          ${field('Final wake-up time', 'wakeTime', e.wakeTime, 'time', 'required')}
          ${field('Got out of bed', 'outOfBedTime', e.outOfBedTime, 'time')}
          <label class="f">Sleep quality
            <select name="quality">${[1, 2, 3, 4, 5].map((q) => `<option value="${q}" ${Number(e.quality) === q ? 'selected' : ''}>${q} – ${['very poor', 'poor', 'fair', 'good', 'very good'][q - 1]}</option>`).join('')}</select></label>
          <label class="f inline"><input type="checkbox" name="freeDay" ${e.freeDay ? 'checked' : ''}/> Next day was a free day</label>
          <label class="f inline"><input type="checkbox" name="alarm" ${e.alarm ? 'checked' : ''}/> Woke by alarm</label>
        </div></fieldset>

        <fieldset><legend>Previous day's habits</legend><div class="fields">
          ${caf.map((c, i) => `
            ${field(`Caffeine ${i + 1}: time`, `cafTime${i}`, c.time, 'time')}
            <label class="f">Caffeine ${i + 1}: mg
              <input name="cafMg${i}" type="number" min="0" max="1000" list="cafList" value="${esc(c.mg)}"/></label>`).join('')}
          ${field('Alcoholic drinks', 'alcoholDrinks', e.alcoholDrinks ?? 0, 'number', 'min="0" max="30"')}
          ${field('Last drink at', 'alcoholLastTime', e.alcoholLastTime, 'time')}
          <label class="f">Exercise intensity
            <select name="exerciseIntensity">${['none', 'light', 'moderate', 'vigorous'].map((v) => `<option ${e.exerciseIntensity === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          ${field('Exercise ended at', 'exerciseEnd', e.exerciseEnd, 'time')}
          ${field('Morning outdoor light (min)', 'morningLightMin', e.morningLightMin, 'number', 'min="0" max="600"')}
          ${field('Screens / bright light until', 'screensUntil', e.screensUntil, 'time')}
          ${field('Last meal at', 'lastMealTime', e.lastMealTime, 'time')}
          ${field('Nap started at', 'napStart', e.napStart, 'time')}
          ${field('Nap length (min)', 'napMin', e.napMin ?? 0, 'number', 'min="0" max="600"')}
        </div>
        <datalist id="cafList"><option value="65">espresso</option><option value="95">coffee</option><option value="47">black tea</option><option value="28">green tea</option><option value="80">energy drink (250 ml)</option><option value="200">pre-workout</option></datalist>
        </fieldset>
        <div class="row"><button class="btn primary" type="submit">Save night</button>
          ${editing ? '<button class="btn" type="button" id="cancelEdit">Cancel</button>' : ''}</div>
      </form>

      <section class="card">
        <h2>Import real data</h2>
        <p class="small muted">Everything is processed in this browser; nothing is uploaded.</p>
        <div class="grid cols-2">
          <div><h3>Apple Health</h3><p class="small">iPhone Health app → profile picture → <i>Export All Health Data</i>. Unzip and choose <code>export.xml</code>.
            Imports nightly sleep (Watch sleep stages or "In Bed") and Apple Watch <i>Time in Daylight</i>.</p>
            <label class="btn">Choose export.xml<input type="file" id="impApple" accept=".xml,text/xml" hidden></label></div>
          <div><h3>Sleep diary CSV</h3><p class="small">Columns: <code>date, bedTime, wakeTime</code> (required) plus optional <code>latencyMin, wasoMin, quality, freeDay, caffeineTime, caffeineMg, morningLightMin…</code>. Exports from other sleep apps work if they have these.</p>
            <label class="btn">Choose CSV<input type="file" id="impCsv" accept=".csv,text/csv" hidden></label></div>
          <div><h3>Light sensor CSV</h3><p class="small">From a wrist or pendant light logger (e.g. Actiwatch, ActTrust): a timestamp (or Date + Time) column and a lux column.
            With enough light data the app switches to the light-driven circadian model.</p>
            <label class="btn">Choose CSV<input type="file" id="impLight" accept=".csv,text/csv,.txt" hidden></label></div>
        </div>
        <p class="small" id="impStatus" role="status"></p>
      </section>

      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>History (${state.entries.length} nights)</h2>
          <div class="row"><button class="btn" id="export">Export</button>
          <label class="btn">Import<input type="file" id="import" accept="application/json" hidden></label></div></div>
        <div class="table-scroll">${historyTable()}</div>
      </section>
    </div>`;

  const form = view.querySelector('#logForm');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const g = (k) => String(fd.get(k) ?? '').trim();
    const entry = {
      date: g('date'),
      bedTime: g('bedTime'),
      latencyMin: Number(g('latencyMin')) || 0,
      wasoMin: Number(g('wasoMin')) || 0,
      wakeTime: g('wakeTime'),
      outOfBedTime: g('outOfBedTime'),
      quality: Number(g('quality')),
      freeDay: fd.get('freeDay') === 'on',
      alarm: fd.get('alarm') === 'on',
      caffeine: [0, 1, 2]
        .map((i) => ({ time: g(`cafTime${i}`), mg: Number(g(`cafMg${i}`)) || 0 }))
        .filter((c) => c.time && c.mg > 0),
      alcoholDrinks: Number(g('alcoholDrinks')) || 0,
      alcoholLastTime: g('alcoholLastTime'),
      exerciseIntensity: g('exerciseIntensity') || 'none',
      exerciseEnd: g('exerciseEnd'),
      morningLightMin: Number(g('morningLightMin')) || 0,
      screensUntil: g('screensUntil'),
      lastMealTime: g('lastMealTime'),
      napStart: g('napStart'),
      napMin: Number(g('napMin')) || 0,
    };
    delete view.dataset.editDate;
    persist(upsertEntry(state, entry), 'Night saved');
  });
  view.querySelector('#cancelEdit')?.addEventListener('click', () => {
    delete view.dataset.editDate;
    render();
  });
  view.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      view.dataset.editDate = b.dataset.edit;
      render();
      window.scrollTo(0, 0);
    }),
  );
  view.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm(`Delete the night of ${b.dataset.del}?`)) persist(removeEntry(state, b.dataset.del), 'Deleted');
    }),
  );
  view.querySelector('#export').addEventListener('click', () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sleep-advisor-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const status = view.querySelector('#impStatus');
  view.querySelector('#impApple').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const parser = new AppleHealthParser();
      const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
      let read = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(value);
        read += value.length;
        status.textContent = `Reading Apple Health export… ${Math.min(100, Math.round((read / file.size) * 100))}%`;
      }
      const r = parser.finish();
      if (!r.nights) throw new Error('no sleep records found');
      persist(
        { ...state, entries: mergeEntries(state.entries, r.entries), lightLog: pruneLightLog(mergeLightLog(state.lightLog, r.lightLog)) },
        `Imported ${r.nights} nights${r.daylightRecords ? ' and daylight data' : ''}`,
      );
    } catch (err) {
      status.textContent = `Apple Health import failed: ${err.message}`;
    }
  });
  view.querySelector('#impCsv').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const r = parseSleepCsv(await file.text());
      persist({ ...state, entries: mergeEntries(state.entries, r.entries) }, `Imported ${r.entries.length} nights${r.skipped ? ` (${r.skipped} rows skipped)` : ''}`);
    } catch (err) {
      status.textContent = `CSV import failed: ${err.message}`;
    }
  });
  view.querySelector('#impLight').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const r = parseLightCsv(await file.text());
      if (!r.samples) throw new Error('no readable rows');
      persist({ ...state, lightLog: pruneLightLog(mergeLightLog(state.lightLog, r.lightLog)) }, `Imported ${r.samples} light readings over ${r.days} days`);
    } catch (err) {
      status.textContent = `Light import failed: ${err.message}`;
    }
  });
  view.querySelector('#import').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      persist(importJson(await file.text()), 'Data imported');
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });
}

const field = (label, name, value, type, attrs = '') =>
  `<label class="f">${esc(label)}<input name="${name}" type="${type}" value="${esc(value ?? '')}" ${attrs}/></label>`;

function historyTable() {
  if (!state.entries.length) return '<p class="muted">No nights logged yet.</p>';
  const rows = [...state.entries].reverse().map((e) => {
    const ev = evaluateHabits(e);
    if (!ev) return '';
    const n = ev.night;
    const issues = Object.keys(HABIT_LABELS).filter((k) => k !== 'exercised' && ev.flags[k]);
    return `<tr>
      <td>${esc(e.date)}${e.freeDay ? ' <span class="badge">free</span>' : ''}${e.source && e.source !== 'manual' ? ` <span class="badge">${esc(e.source.split(' ')[0])}</span>` : ''}</td>
      <td>${fmtClock(n.bed)}–${fmtClock(n.wake)}</td>
      <td>${fmtDuration(n.tst)}</td>
      <td>${Math.round(n.efficiency * 100)}%</td>
      <td>${n.quality ?? '–'}</td>
      <td class="small" style="white-space:normal;min-width:180px">${issues.length ? esc(issues.map((k) => HABIT_LABELS[k]).join('; ')) : '<span class="muted">–</span>'}</td>
      <td><button class="btn link" data-edit="${esc(e.date)}">Edit</button><button class="btn link" data-del="${esc(e.date)}">Delete</button></td>
    </tr>`;
  });
  return `<table><thead><tr><th>Night of</th><th>In bed–wake</th><th>Slept</th><th>Efficiency</th><th>Quality</th><th>Habit flags</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// ---------------------------------------------------------------- plan
function renderPlan(plan) {
  if (!plan.ready) {
    view.innerHTML = `<div class="card"><h2>No plan yet</h2><p>${esc(plan.dataQuality.message)}</p>
      <div class="row"><button class="btn primary" data-goto="profile">Complete profile</button><button class="btn" data-goto="log">Log a night</button></div></div>`;
    return;
  }
  const a = plan.alignment;
  const steps = a.steps;
  const pred = a.prediction;
  view.innerHTML = `
    <div class="stack">
      <section class="card">
        <h2>Priorities for you</h2>
        ${plan.recommendations.length ? `<ul class="recs">${plan.recommendations.map((r) => `
          <li><h3>${esc(r.title)} ${grade(r.grade)}</h3><p>${esc(r.detail)} ${cite(r.refs)}</p></li>`).join('')}</ul>`
          : '<p>Your timing and habits already line up well with the evidence. Keep doing what you are doing, and keep logging so the plan can catch changes.</p>'}
      </section>

      ${steps.length ? `<section class="card">
        <h2>Step-by-step shift plan</h2>
        <p class="small muted">Move lights-out ${steps.length > 1 ? '15 min earlier each day' : 'earlier'} while keeping wake-up fixed, get 30 min of outdoor light right after waking, and keep the last 3 h before bed dim. If a step feels too hard, repeat it for an extra day before moving on.</p>
        ${pred ? `<p class="small">The Forger 1999 circadian model, simulating this plan, predicts your body clock moves <b>${fmtDuration(-pred.finalShiftMin)}</b> earlier
          ${pred.reachedDay ? `and reaches your target around <b>day ${pred.reachedDay}</b>` : `within ${pred.days.length} days, short of the full ${fmtDuration(a.minutes)}. Expect it to take longer, or add more morning light`}.
          ${pred.reachedDay && pred.reachedDay > steps.length ? 'The clock lags a few days behind your bedtime, so it is normal to need extra time to fall asleep at the earlier times at first.' : ''} ${cite(['forger1999', 'cheng2021'])}</p>` : ''}
        <div class="table-scroll"><table><thead><tr><th>Day</th><th>Date</th><th>Lights out</th><th>Wake</th>${pred ? '<th>Predicted clock shift</th>' : ''}</tr></thead><tbody>
          ${steps.map((s, i) => `<tr><td>${s.day}</td><td>${esc(s.date ?? '')}</td><td>${fmtClock(s.lightsOut)}</td><td>${fmtClock(s.wake)}</td>${pred ? `<td>${pred.days[i] ? signed(pred.days[i].shiftMin, 'min') : '–'}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>
      </section>` : ''}

      <section class="card">
        <h2>Your daily timeline</h2>
        <ol class="timeline">${plan.timeline.map((t) => `
          <li><time>${fmtClock(t.time)}</time><div><h3>${esc(t.title)} ${grade(t.grade)}</h3><p class="small">${esc(t.detail)} ${cite(t.refs)}</p></div></li>`).join('')}
        </ol>
      </section>

      <section class="card">
        <h2>What your own data shows</h2>
        ${plan.insights.length ? `<p class="small muted">Your nights with each habit compared with nights without it. These are associations in your data, not proof of cause, and are noisy with few nights.</p>
        <div class="table-scroll"><table><thead><tr><th>Habit</th><th>Nights (with / without)</th><th>Time to fall asleep</th><th>Sleep time</th><th>Quality</th></tr></thead><tbody>
        ${plan.insights.map((i) => `<tr><td>${esc(i.label)}${i.confoundedByFreeDays ? '<br><span class="small muted">Mostly on free or work nights only, so the difference may reflect the day type, not the habit</span>' : ''}</td><td>${i.nWith} / ${i.nWithout}</td>
          <td>${signed(i.deltaLatency, 'min')}</td><td>${signed(i.deltaTst, 'min')}</td><td>${i.deltaQuality == null ? '–' : signedNum(i.deltaQuality)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Needs at least 3 nights with and 3 without a given habit. Keep logging.</p>'}
      </section>
    </div>`;
}

const signed = (v, unit) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v))} ${unit}`);
const signedNum = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

// ---------------------------------------------------------------- profile
function renderProfile() {
  const p = state.profile ?? {};
  const q = p.mctq ?? {};
  const sb = p.screening ?? {};
  view.innerHTML = `
    <form class="card" id="profileForm">
      <h2>Profile</h2>
      <fieldset><legend>About you</legend><div class="fields">
        ${field('Age', 'age', p.age, 'number', 'min="6" max="110"')}
        ${field('Must be up by on workdays (optional)', 'workWake', p.workWake, 'time')}
        ${field('Personal sleep need, hours (optional)', 'personalNeedHours', p.personalNeedHours, 'number', 'min="4" max="12" step="0.25"')}
        <label class="f inline"><input type="checkbox" name="shiftWork" ${p.shiftWork ? 'checked' : ''}/> I work night or rotating shifts</label>
      </div>
      <p class="small muted">Personal need = how long you sleep on a long holiday once rested. Leave it blank to use the age-based recommendation.</p></fieldset>

      <fieldset><legend>Chronotype questionnaire (MCTQ core)</legend>
        <p class="small muted">Think of a typical recent week. "Fall asleep" means actually asleep, not just in bed.</p>
        <div class="fields">
          ${field('Workdays per week', 'workdays', q.workdays ?? 5, 'number', 'min="0" max="7"')}
          ${field('Workdays: fall asleep at', 'workOnset', q.workOnset, 'time')}
          ${field('Workdays: wake up at', 'mWorkWake', q.workWake, 'time')}
          ${field('Free days: fall asleep at', 'freeOnset', q.freeOnset, 'time')}
          ${field('Free days: wake up at', 'freeWake', q.freeWake, 'time')}
          <label class="f inline"><input type="checkbox" name="freeAlarm" ${q.freeAlarm ? 'checked' : ''}/> I use an alarm on free days</label>
        </div></fieldset>

      <fieldset><legend>Health screening (private, stays on this device)</legend><div class="fields">
        <label class="f inline"><input type="checkbox" name="snoring" ${sb.snoring ? 'checked' : ''}/> I snore loudly</label>
        <label class="f inline"><input type="checkbox" name="tired" ${sb.tired ? 'checked' : ''}/> I often feel tired or sleepy in the daytime</label>
        <label class="f inline"><input type="checkbox" name="observedApnea" ${sb.observedApnea ? 'checked' : ''}/> Someone has seen me stop breathing or gasp in my sleep</label>
        <label class="f inline"><input type="checkbox" name="highBloodPressure" ${sb.highBloodPressure ? 'checked' : ''}/> I have high blood pressure</label>
      </div></fieldset>

      <fieldset><legend>Measured melatonin onset (optional)</legend>
        <p class="small muted">If you had a dim-light melatonin onset (DLMO) test from a saliva kit or sleep clinic, enter it. It replaces the estimate for 30 days.</p>
        <div class="fields">
          ${field('Test date', 'dlmoDate', '', 'date')}
          ${field('DLMO time', 'dlmoTime', '', 'time')}
        </div>
        ${state.measured.length ? `<ul class="small">${state.measured.map((m, i) => `<li>${esc(m.date)}: DLMO ${esc(m.dlmo)} <button type="button" class="btn link" data-delm="${i}">Remove</button></li>`).join('')}</ul>` : ''}
      </fieldset>
      <div class="row"><button class="btn primary" type="submit">Save profile</button>
        <button class="btn" type="button" id="reset">Delete all data</button></div>
    </form>`;

  const form = view.querySelector('#profileForm');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const g = (k) => String(fd.get(k) ?? '').trim();
    const c = (k) => fd.get(k) === 'on';
    const profile = {
      age: g('age') ? Number(g('age')) : '',
      workWake: g('workWake'),
      personalNeedHours: g('personalNeedHours'),
      shiftWork: c('shiftWork'),
      mctq: {
        workdays: Number(g('workdays') || 5),
        workOnset: g('workOnset'),
        workWake: g('mWorkWake'),
        freeOnset: g('freeOnset'),
        freeWake: g('freeWake'),
        freeAlarm: c('freeAlarm'),
      },
      screening: { snoring: c('snoring'), tired: c('tired'), observedApnea: c('observedApnea'), highBloodPressure: c('highBloodPressure') },
    };
    let measured = state.measured;
    if (g('dlmoDate') && g('dlmoTime')) measured = [...measured, { date: g('dlmoDate'), dlmo: g('dlmoTime') }];
    persist({ ...state, profile, measured }, 'Profile saved');
  });
  view.querySelectorAll('[data-delm]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.delm);
      persist({ ...state, measured: state.measured.filter((_, j) => j !== i) }, 'Removed');
    }),
  );
  view.querySelector('#reset').addEventListener('click', () => {
    if (confirm('Delete your profile and every logged night from this browser? This cannot be undone.')) {
      persist({ profile: {}, entries: [], measured: [], lightLog: {} }, 'All data deleted');
    }
  });
}

// ---------------------------------------------------------------- science
function renderScience() {
  view.innerHTML = `
    <div class="stack">
      <section class="card">
        <h2>How Sleep Advisor works</h2>
        <h3>1. Two processes time your sleep</h3>
        <p>Sleep is timed by <b>sleep pressure</b> (Process S, adenosine building up the longer you are awake and clearing during sleep) and your
        <b>circadian clock</b> (Process C). The app simulates Process S with the published time constants (rise τ = 18.2 h, decay τ = 4.2 h) ${cite(['borbely1982', 'daan1984'])}.</p>
        <h3>2. Your hormone rhythm is anchored to melatonin onset</h3>
        <p>Dim-light melatonin onset (DLMO) is the gold-standard marker of circadian phase. It occurs about 2 h before habitual sleep onset ${cite(['burgess2003', 'sletten2010'])},
        so the app estimates it from your recent sleep times, weighting recent nights more. A measured DLMO always overrides the estimate.
        From DLMO the app places the wake maintenance zone (the ~3 h before DLMO, when falling asleep is hardest) ${cite(['shekleton2013', 'strogatz1987'])}, the sleep gate (~DLMO + 2 h) ${cite(['lavie1986', 'sletten2010'])},
        and the core-temperature minimum (~DLMO + 7 h) ${cite(['benloucif2005'])}. Cortisol is drawn with its early-night low, pre-dawn rise and
        awakening response peaking 30–45 min after waking ${cite(['clow2004', 'fries2009'])}.</p>
        <p class="alert info small"><strong>What "tracking hormones" means here</strong>These curves are <em>model estimates</em> from sleep timing, not measurements.
        Melatonin and cortisol can only be measured with saliva or blood assays. Estimated DLMO is typically within about ±1 h of a lab measurement.</p>
        <h3>2b. Light-driven circadian model</h3>
        <p>When you import light-sensor data, the app runs the Forger, Jewett &amp; Kronauer (1999) model of the human circadian pacemaker, a
        light-driven oscillator, to estimate your phase (DLMO = model temperature minimum − 7 h) ${cite(['forger1999'])}. It also simulates your
        shift plan day by day to predict how quickly your clock will follow. In real-world validation, light/activity-driven models and the simple
        "bedtime − 2 h" rule were both accurate to about 1 h for people on regular schedules ${cite(['cheng2021'])}. That's why the sleep-timing
        estimate stays the default when you have no light data.</p>
        <h3>3. Chronotype and social jetlag</h3>
        <p>Chronotype uses the Munich ChronoType Questionnaire: mid-sleep on free days corrected for sleep debt (MSFsc) ${cite(['roenneberg2003', 'roenneberg2004'])}.
        Social jetlag is the gap between workday and free-day mid-sleep ${cite(['wittmann2006'])}.</p>
        <h3>4. Light moves the clock</h3>
        <p>Light before your temperature minimum delays the clock; light after it advances it ${cite(['khalsa2003'])}. Lighting targets follow the 2022 expert consensus:
        bright days, ≤ 10 lux melanopic EDI from 3 h before bed, ≤ 1 lux during sleep ${cite(['brown2022'])}.</p>
        <h3>5. Schedule</h3>
        <p>Sleep need comes from AASM/SRS and NSF consensus by age ${cite(['watson2015', 'hirshkowitz2015', 'paruthi2016'])}. If your body clock is later than your
        obligations allow, the plan shifts it gradually (15 min/day) using morning light, dim evenings and, optionally, clinician-guided low-dose melatonin
        ${cite(['eastman2009', 'burgess2010', 'auger2015'])}.</p>
        <h3>6. Regularity and quality metrics</h3>
        <p>Sleep Regularity Index ${cite(['phillips2017', 'windred2024'])}; efficiency, latency and wake-after-sleep-onset thresholds from NSF quality recommendations ${cite(['ohayon2017'])}.</p>
        <h3>Evidence grades</h3>
        <ul class="small">${Object.entries(GRADE_LABEL).map(([g, l]) => `<li><b>${g}</b>: ${esc(l)}</li>`).join('')}</ul>
      </section>
      <section class="card">
        <h2>References</h2>
        <ol class="refs">${refKeys.map((k) => `<li id="ref-${k}">${esc(REFERENCES[k])}</li>`).join('')}</ol>
      </section>
    </div>`;
}

render();
