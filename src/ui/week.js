// Week: last 7 nights at a glance, a few numbers, and the top tips.
import { h, icon, fmtDur, fmtTime, weekdayFmt, parseKey, todayKey, shiftKey, dayFmt } from './dom.js';
import { openSheet } from './dialogs.js';
import { app } from './store.js';
import { openLogSheet } from './logsheet.js';
import { openWhy } from './why.js';
import { row } from './tonight.js';
import { computeNight } from '../engine/sleepMetrics.js';

export function renderWeek(root) {
  const plan = app.plan;
  const col = h('div', { class: 'col' });
  root.replaceChildren(col);

  col.append(h('div', { class: 'section-head' }, h('h1', { class: 'display page-title', style: 'flex:1' }, 'This week'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Add a night', onclick: () => openLogSheet() }, icon('plus'))));

  // ---- 7-night bar chart (one series: hours slept; the goal is a dashed line)
  const goalH = plan.need?.target ?? 8;
  const maxH = Math.max(goalH + 2, 10);
  const nights = [];
  for (let i = 7; i >= 1; i--) {
    const key = shiftKey(todayKey(), -i);
    const entry = app.state.entries.find((e) => e.date === key);
    nights.push({ key, entry, n: entry ? computeNight(entry) : null });
  }
  const logged = nights.filter((x) => x.n);
  const avg = logged.length ? logged.reduce((s, x) => s + x.n.tst, 0) / logged.length : null;

  const bars = h('div', { class: 'bars', role: 'img', 'aria-label': `Hours slept, last 7 nights. Average ${avg ? fmtDur(avg) : 'none yet'}.` },
    h('div', { class: 'goal-line', style: `bottom:calc(${(goalH / maxH) * 100}% * (150 - 22) / 150 + 22px)` }, h('span', {}, `goal ${goalH}h`)),
    nights.map(({ key, n }) => {
      const hrs = n ? n.tst / 60 : 0;
      const short = n && hrs < (plan.need?.min ?? 7);
      return h('button', {
        type: 'button',
        class: `bar${n ? '' : ' empty'}${short ? ' short' : ''}${key === shiftKey(todayKey(), -1) ? ' today' : ''}`,
        'aria-label': `${dayFmt.format(parseKey(key))}: ${n ? fmtDur(n.tst) : 'not logged'}`,
        title: n ? fmtDur(n.tst) : 'Tap to log',
        onclick: () => openLogSheet(key),
      },
      h('span', { class: 'col-in' }, h('span', { class: 'fill', style: `height:${n ? Math.min(100, (hrs / maxH) * 100) : 3}%` })),
      h('small', {}, weekdayFmt.format(parseKey(key))));
    }));

  col.append(h('section', { class: 'week-card' },
    h('div', { class: 'week-head' },
      h('div', {}, h('div', { class: 'big display' }, avg ? fmtDur(avg) : '–'), h('div', { class: 'muted', style: 'font-size:12.5px' }, 'average sleep')),
      h('div', { class: 'muted', style: 'font-size:12.5px;text-align:right' }, `${logged.length} of 7 nights logged`, h('br'), `lighter = under ${plan.need?.min ?? 7} h`)),
    bars));

  // ---- Three simple numbers
  const s = plan.summary;
  if (s) {
    const steady = s.sri != null ? Math.round(s.sri) : Math.max(0, Math.round(100 - s.onsetSD));
    col.append(h('div', { class: 'stats' },
      stat(fmtDur(s.avgLatency), 'to fall asleep'),
      stat(`${steady}`, 'steadiness /100'),
      stat(s.avgQuality != null ? s.avgQuality.toFixed(1) : '–', 'sleep quality /5')));
  }

  // ---- Tips
  if (plan.ready && plan.recommendations.length) {
    const top = plan.recommendations.slice(0, 3);
    const rest = plan.recommendations.slice(3);
    const list = h('div', { class: 'rows' }, top.map(tipRow));
    col.append(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { class: 'display' }, 'Tips for you')),
      list,
      rest.length ? h('button', { type: 'button', class: 'link-btn', style: 'justify-self:start', onclick: (ev) => {
        list.append(...rest.map(tipRow));
        ev.target.remove();
      } }, `${rest.length} more`) : null));
  } else if (plan.ready) {
    col.append(h('p', { class: 'explain' }, 'Your timing and habits already match the research. Keep logging so the plan can notice changes.'));
  }

  // ---- What your own nights show (plain sentences)
  // Only clear, unconfounded patterns (habits that happen mostly on free or work nights are hidden).
  const ins = (plan.insights ?? []).filter((i) => !i.confoundedByFreeDays && (Math.abs(i.deltaTst ?? 0) >= 10 || Math.abs(i.deltaLatency ?? 0) >= 5));
  if (ins.length) {
    col.append(h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { class: 'display' }, 'Your nights show')),
      h('div', {}, ins.map((i) => h('div', { class: 'insight' }, sentence(i),
        h('small', {}, `Based on ${i.nWith} nights with it and ${i.nWithout} without. A pattern, not proof.`))))));
  }

  // ---- All nights
  col.append(h('button', { type: 'button', class: 'big-btn soft', onclick: openHistory }, icon('calendar'), 'All nights'));
}

const stat = (v, label) => h('div', { class: 'stat' }, h('div', { class: 'v display' }, v), h('small', {}, label));

const tipRow = (r) => row({ ic: r.icon, title: r.title, sub: r.short, onclick: () => openWhy(r) });

function sentence(i) {
  const name = {
    lateCaffeine: 'late coffee',
    lateAlcohol: 'alcohol close to bed',
    lateVigorousExercise: 'late hard workouts',
    lowMorningLight: 'little morning light',
    lateScreens: 'late screens',
    lateMeal: 'late dinner',
    longOrLateNap: 'long or late naps',
    exercised: 'exercise',
  }[i.habit];
  const parts = [];
  if (i.deltaTst != null && Math.abs(i.deltaTst) >= 10) parts.push(`slept ${fmtDur(Math.abs(i.deltaTst))} ${i.deltaTst < 0 ? 'less' : 'more'}`);
  if (i.deltaLatency != null && Math.abs(i.deltaLatency) >= 5) parts.push(`took ${fmtDur(Math.abs(i.deltaLatency))} ${i.deltaLatency > 0 ? 'longer' : 'less'} to fall asleep`);
  if (!parts.length) return `Nights with ${name} looked about the same as other nights.`;
  return `On nights with ${name} you ${parts.join(' and ')}.`;
}

function openHistory() {
  const list = [...app.state.entries].reverse();
  openSheet({
    title: 'All nights',
    sub: `${list.length} logged`,
    body: list.length
      ? h('div', { class: 'rows' }, list.map((e) => {
          const n = computeNight(e);
          return h('button', { type: 'button', class: 'row', onclick: () => openLogSheet(e.date) },
            h('span', { class: 'ico' }, icon(e.freeDay ? 'sun' : 'moon')),
            h('span', { class: 'txt' }, h('b', {}, dayFmt.format(parseKey(e.date))),
              h('small', {}, n ? `${fmtTime(n.bed)} – ${fmtTime(n.wake)}${e.source && e.source !== 'manual' ? ` · ${e.source.split(' ')[0]}` : ''}` : '')),
            h('span', { class: 'when' }, n ? fmtDur(n.tst) : '–'));
        }))
      : h('p', { class: 'explain' }, 'No nights yet.'),
  });
}
