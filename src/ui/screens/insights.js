// SCREEN 5 — Sleep insights: trends and within-person associations (not causes).
import { h } from '../dom.js';
import { app } from '../store.js';
import { associations, MIN_GROUP } from '../../core/insights.js';
import { circularMean } from '../../core/time.js';
import { clock, dur, section, stat, emptyNote, badge } from '../kit.js';

export function renderInsights(root) {
  const { state } = app;
  const d = app.d;
  const col = h('div', { class: 'col' });
  root.replaceChildren(col);
  col.append(h('h1', { class: 'display page-title' }, 'Insights'));
  const res = associations(state, d.now);
  const rows = res.rows.slice(-28);
  if (rows.length < 3) {
    col.append(emptyNote('Trends appear after a few recorded nights.'));
    return;
  }

  // Sleep duration trend
  col.append(section('Sleep duration', badge('calculated'), durationChart(rows), h('p', { class: 'note' }, `Each bar is one main sleep (last ${rows.length}). Nights without a fall-asleep time show time in bed only (outlined).`)));

  // Timing trend + variability
  col.append(section('Sleep timing', badge('calculated'), timingChart(rows),
    h('div', { class: 'stats' },
      stat(d.f('onset_sd_7d') != null ? `±${dur(d.f('onset_sd_7d'))}` : '–', 'sleep-onset variation (7 d)'),
      stat(d.f('wake_sd_7d') != null ? `±${dur(d.f('wake_sd_7d'))}` : '–', 'wake-time variation (7 d)'),
      stat(d.f('nap_count_7d') ?? '–', 'naps (7 d)'))));

  // Workdays vs free days
  const work = rows.filter((r) => r.dayType === 'workday');
  const free = rows.filter((r) => r.dayType === 'free_day');
  const m = (xs, k) => (xs.filter((x) => x[k] != null).length ? xs.filter((x) => x[k] != null).reduce((s, x) => s + x[k], 0) / xs.filter((x) => x[k] != null).length : null);
  const on = (xs) => (xs.filter((x) => x.onsetClock != null).length ? circularMean(xs.filter((x) => x.onsetClock != null).map((x) => x.onsetClock)) : null);
  col.append(section('Workdays and free days', badge('calculated'),
    work.length && free.length
      ? h('table', { class: 'mini' }, h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, `Workdays (${work.length})`), h('th', {}, `Free days (${free.length})`))),
          h('tbody', {},
            h('tr', {}, h('td', {}, 'Sleep'), h('td', {}, dur(m(work, 'tst'))), h('td', {}, dur(m(free, 'tst')))),
            h('tr', {}, h('td', {}, 'Fell asleep'), h('td', {}, clock(on(work))), h('td', {}, clock(on(free)))),
            h('tr', {}, h('td', {}, 'Woke up'), h('td', {}, clock(circularMean(work.map((x) => x.wakeClock)))), h('td', {}, clock(circularMean(free.map((x) => x.wakeClock)))))))
      : emptyNote('Mark nights as workday or free day when you log sleep to see this comparison.'),
    d.f('social_jetlag_28d') != null ? h('p', { class: 'explain' }, `Mid-sleep shifts by ${dur(d.f('social_jetlag_28d'))} between workdays and free days.`) : null));

  // Associations
  const ok = res.associations.filter((a) => a.status === 'ok');
  const few = res.associations.filter((a) => a.status !== 'ok');
  col.append(section('Patterns in your records', null,
    h('p', { class: 'note' }, `Comparisons of your own nights. They show associations, not causes: other things that differ between those days can explain them. Each needs at least ${MIN_GROUP} nights in both groups.`),
    ok.length ? h('div', {}, ok.map((a) => h('div', { class: 'insight' }, a.sentence,
      h('small', {}, `${a.nWith} nights with, ${a.nWithout} without.${a.confounded ? ' These days were mostly workdays or mostly free days, which may explain the difference.' : ''}`)))) : emptyNote('No pattern has enough data yet.'),
    few.length ? h('details', { class: 'more' }, h('summary', {}, `${few.length} comparisons need more data`), h('ul', { class: 'refs' }, few.map((a) => h('li', {}, `${a.label}: ${a.nWith ?? 0} / ${MIN_GROUP} nights with, ${a.nWithout ?? 0} / ${MIN_GROUP} without`)))) : null));
}

function durationChart(rows) {
  const max = Math.max(10 * 60, ...rows.map((r) => r.tib ?? 0));
  return h('div', { class: 'bars long', role: 'img', 'aria-label': 'Sleep duration per night' },
    rows.map((r) => h('div', { class: `bar${r.tst == null ? ' partial' : ''}`, title: `${r.wakeDate}: ${r.tst != null ? dur(r.tst) + ' asleep' : dur(r.tib) + ' in bed'}` },
      h('span', { class: 'col-in' }, h('span', { class: 'fill', style: `height:${Math.max(3, ((r.tst ?? r.tib ?? 0) / max) * 100)}%` })),
      h('small', {}, r.wakeDate.slice(8)))));
}

/** Clock-time strip chart: one line per night from sleep onset (or bedtime) to wake, 18:00 → 14:00 axis. */
function timingChart(rows) {
  const W = 320;
  const rowH = 9;
  const H = rows.length * rowH + 24;
  const x = (clk) => ((((clk - 18 * 60) % 1440) + 1440) % 1440) / (20 * 60) * W;
  const lines = rows.map((r, i) => {
    const a = r.onsetClock;
    const b = r.wakeClock;
    if (a == null) return '';
    const x1 = x(a);
    const x2 = Math.min(W, x(b) < x1 ? W : x(b));
    return `<line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${i * rowH + 6}" y2="${i * rowH + 6}" class="tl"/>`;
  }).join('');
  const ticks = [18, 22, 2, 6, 10, 14].map((hh) => `<text x="${Math.min(W - 14, x(hh * 60)).toFixed(1)}" y="${H - 4}" class="ax">${clock(hh * 60).replace(':00', '')}</text><line x1="${x(hh * 60)}" x2="${x(hh * 60)}" y1="0" y2="${H - 16}" class="grid"/>`).join('');
  const svg = h('div', { class: 'timing' });
  svg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sleep onset to wake time per night">${ticks}${lines}</svg>`;
  return svg;
}
