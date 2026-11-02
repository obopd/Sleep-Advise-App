// Tonight: when to go to bed and wake up, what's next today, and the body clock.
import { h, icon, fmtTime, fmtDur, dayFmt, todayKey, shiftKey, timeParts, localizeTimes } from './dom.js';
import { openSheet } from './dialogs.js';
import { app } from './store.js';
import { openLogSheet } from './logsheet.js';
import { openWhy, evidenceBadge, refList } from './why.js';
import { renderHormoneChart } from './chart.js';
import { parseHHMM } from '../engine/time.js';

export function renderTonight(root) {
  const plan = app.plan;
  const col = h('div', { class: 'col' }, h('div', { class: 'brand', 'aria-hidden': 'true' }, icon('moon')));
  root.replaceChildren(col);

  if (!plan.ready) {
    col.append(h('div', { class: 'tonight' },
      h('p', { class: 'display', style: 'font-size:22px;text-align:center' }, 'Log a few nights'),
      h('p', { class: 'tonight-note' }, 'Your plan appears as soon as the app knows your sleep times.')),
    logButton());
    return;
  }

  const s = plan.schedule;
  const shifting = plan.alignment.status === 'advance';
  const steps = plan.alignment.steps;
  const daysLeft = plan.alignment.prediction?.reachedDay ?? steps.length;

  // ---- Tonight card
  col.append(h('section', { class: 'tonight', 'aria-label': 'Tonight' },
    h('div', { class: 'tonight-date' }, dayFmt.format(new Date())),
    h('div', { class: 'times' },
      h('div', {}, h('div', { class: 'label' }, icon('moon'), 'Bed'), bigTime(s.tonightLightsOut)),
      h('div', {}, h('div', { class: 'label' }, icon('sun'), 'Wake'), bigTime(s.wake))),
    shifting
      ? h('div', { style: 'display:grid;gap:8px' },
          h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.max(6, 100 / Math.max(1, daysLeft))}%` })),
          h('p', { class: 'tonight-note' }, 'Goal ', h('b', {}, fmtTime(s.lightsOut)), ` · 15 min earlier each night · about ${daysLeft} days`))
      : h('p', { class: 'tonight-note' }, h('b', {}, `${s.needHours} h`), ' of sleep · free days, up by ', h('b', {}, fmtTime(s.freeDayLatestWake)))));

  // ---- Log button / logged state
  const lastNight = shiftKey(todayKey(), -1);
  const logged = app.state.entries.find((e) => e.date === lastNight);
  col.append(logged ? loggedRow(logged) : logButton());

  // ---- Health flags (only when there are any)
  if (plan.flags.length) {
    col.append(h('section', { class: 'section' }, h('div', { class: 'rows' },
      plan.flags.map((f) => row({ ic: 'alert', title: f.title, sub: f.short, warn: f.level === 'warning', onclick: () => openWhy({ ...f, detail: f.text }) })))));
  }

  // ---- Today: next steps
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const wakeRel = (t) => (t - s.wake + 1440) % 1440;
  const upcoming = plan.timeline.filter((t) => wakeRel(t.time) >= wakeRel(now)).slice(0, 3);
  const items = upcoming.length ? upcoming : plan.timeline.slice(0, 3);
  col.append(h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'display' }, 'Next'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Whole day', onclick: openDay }, icon('right'))),
    h('div', { class: 'rows' }, items.map((t) => timelineRow(t)))));

  // ---- Body clock
  col.append(bodyClock(plan));
}

function bigTime(min) {
  const { main, period } = timeParts(min);
  return h('div', { class: 'big display' }, main, period ? h('span', { class: 'ampm' }, period) : null);
}

function logButton() {
  return h('button', { type: 'button', class: 'big-btn', onclick: () => openLogSheet() }, icon('plus'), 'Log last night');
}

function loggedRow(e) {
  const night = app.plan.summary?.nights.find((n) => n.date === e.date);
  return h('button', { type: 'button', class: 'logged', onclick: () => openLogSheet(e.date) },
    icon('check'), 'Last night ', h('b', {}, night ? fmtDur(night.tst) : 'logged'), h('span', {}, '· edit'));
}

export function row({ ic, title, sub, when = null, warn = false, past = false, onclick }) {
  return h('button', { type: 'button', class: `row${warn ? ' warn' : ''}${past ? ' past' : ''}`, onclick },
    h('span', { class: 'ico' }, icon(ic)),
    h('span', { class: 'txt' }, h('b', {}, localizeTimes(title)), sub ? h('small', {}, localizeTimes(sub)) : null),
    h('span', { class: 'end' }, when ? h('span', { class: 'when' }, when) : icon('right')));
}

const timelineRow = (t) => row({ ic: t.icon, title: t.title, sub: t.short, when: fmtTime(t.time), onclick: () => openWhy(t) });

function openDay() {
  openSheet({
    title: 'Your day',
    sub: 'Tap any step to see why',
    body: h('div', { class: 'rows' }, app.plan.timeline.map((t) => timelineRow(t))),
  });
}

// ---- Body clock strip: noon → noon, sleep window, alert zone, melatonin onset, now.
function bodyClock(plan) {
  const p = plan.phase;
  const s = plan.summary;
  const onset = s?.meanOnset ?? plan.schedule.sleepOnset;
  const wake = s?.meanWake ?? plan.schedule.wake;
  const pos = (clock) => (((clock - 720 + 1440) % 1440) / 1440) * 100;
  const seg = (a, b, cls) => {
    const x1 = pos(a);
    let x2 = pos(b);
    if (x2 < x1) x2 = 100;
    return h('div', { class: `seg ${cls}`, style: `left:${x1}%;width:${x2 - x1}%` });
  };
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const strip = h('div', { class: 'strip', role: 'img', 'aria-label': `Melatonin rises around ${fmtTime(p.dlmo)}; easiest to fall asleep around ${fmtTime(p.sleepGate)}` },
    seg(p.wmzStart, p.wmzEnd, 'alert'),
    seg(onset, wake, 'sleep'),
    h('div', { class: 'mark', style: `left:calc(${pos(p.dlmo)}% - 1.5px)` }),
    h('div', { class: 'now', style: `left:${pos(now)}%` }));
  const ticks = h('div', { class: 'strip-ticks', 'aria-hidden': 'true' },
    [720, 1080, 0, 360, 720].map((t, i) => h('span', { style: `left:${i * 25}%` }, fmtTime(t).replace(':00', ''))));

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'display' }, 'Body clock'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Body clock details', onclick: () => openClockDetails(plan) }, icon('info'))),
    h('div', { class: 'strip-wrap' }, strip, ticks,
      h('div', { class: 'legend' },
        h('span', {}, h('i', { class: 'k-sleep' }), 'Sleep'),
        h('span', {}, h('i', { class: 'k-alert' }), 'Wide awake'),
        h('span', {}, h('i', { class: 'k-mel' }), 'Melatonin'),
        h('span', {}, h('i', { class: 'k-now' }), 'Now'))),
    h('p', { class: 'explain' },
      'Your body starts making melatonin around ', h('b', {}, fmtTime(p.dlmo)),
      '. Falling asleep is easiest from ', h('b', {}, fmtTime(p.sleepGate)),
      ' and hardest between ', h('b', {}, `${fmtTime(p.wmzStart)}–${fmtTime(p.wmzEnd)}`), '.'));
}

function openClockDetails(plan) {
  const p = plan.phase;
  const s = plan.summary;
  const ct = plan.chronotype;
  const source = {
    measured: 'From your melatonin test.',
    'light-model': 'From your light data, using a body clock model.',
    diary: 'Estimated from your sleep times. Usually within about 1 hour.',
    questionnaire: 'Estimated from your answers. Log nights to make it personal.',
  }[p.source];
  const chart = h('div');
  const facts = [
    ['Melatonin starts', fmtTime(p.dlmo)],
    ['Easiest to fall asleep', fmtTime(p.sleepGate)],
    ['Wide-awake zone', `${fmtTime(p.wmzStart)}–${fmtTime(p.wmzEnd)}`],
    ['Body temperature lowest', fmtTime(p.cbtMin)],
    ct ? ['Sleep type', ct.category] : null,
    ct ? ['Weekend shift', fmtDur(ct.socialJetlag)] : null,
  ].filter(Boolean);
  openSheet({
    title: 'Body clock',
    sub: source,
    body: h('div', { style: 'display:grid;gap:16px' },
      h('div', { class: 'rows' }, facts.map(([k, v]) => h('div', { class: 'row', style: 'grid-template-columns:1fr auto' }, h('span', { class: 'txt' }, h('b', { style: 'font-weight:500' }, k)), h('span', { class: 'when' }, v)))),
      h('div', { class: 'q' }, h('span', {}, 'Your estimated 24 hours'), chart,
        h('p', { class: 'note' }, 'Relative levels, not measurements. Shaded = your usual sleep.')),
      p.modelCheck ? h('p', { class: 'note' }, `Cross-check: a light-based body clock model puts melatonin at ${fmtTime(p.modelCheck.dlmo)}.`) : null,
      evidenceBadge('B'),
      refList(['burgess2003', 'sletten2010', 'shekleton2013', 'benloucif2005', 'clow2004', 'daan1984', 'forger1999', 'cheng2021'])),
  });
  const last = app.state.entries.at(-1);
  renderHormoneChart(chart, {
    phase: p,
    sleep: s ? { onset: s.meanOnset, wake: s.meanWake } : { onset: plan.schedule.sleepOnset, wake: plan.schedule.wake },
    brightLightUntil: parseHHMM(last?.screensUntil ?? ''),
  });
}
