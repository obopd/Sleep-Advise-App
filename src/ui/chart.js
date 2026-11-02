// 24-hour (noon → noon) line chart of estimated melatonin, cortisol and sleep pressure.
// One shared 0–1 "relative level" axis; every series is a normalised curve, so there is
// no second y-scale. Hover shows a crosshair and a tooltip with all three values.

import { dailyProfile } from '../engine/circadian.js';
import { fmtClock } from '../engine/time.js';

const SERIES = [
  { key: 'melatonin', label: 'Melatonin', cls: 's1' },
  { key: 'cortisol', label: 'Cortisol', cls: 's2' },
  { key: 'sleepPressure', label: 'Sleep pressure', cls: 's3' },
];

const W = 720;
const H = 280;
const M = { top: 16, right: 112, bottom: 32, left: 40 };
const iw = W - M.left - M.right;
const ih = H - M.top - M.bottom;
const x = (offset) => M.left + (offset / 1440) * iw;
const y = (v) => M.top + (1 - v) * ih;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderHormoneChart(container, { phase, sleep, brightLightUntil = null }) {
  const pts = dailyProfile(phase, sleep, { brightLightUntil });

  // Sleep band(s) and markers.
  const bands = [];
  let start = null;
  pts.forEach((p, i) => {
    if (p.asleep && start == null) start = p.offset;
    if ((!p.asleep || i === pts.length - 1) && start != null) {
      bands.push([start, p.offset]);
      start = null;
    }
  });
  const offsetOf = (clock) => ((clock - 720 + 1440) % 1440);
  const markers = [
    { at: phase.dlmo, label: 'DLMO' },
    { at: phase.cbtMin, label: 'Temp. min' },
  ];

  const path = (key) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.offset).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');

  // Direct labels at the right end, nudged apart to avoid collisions.
  const ends = SERIES.map((s) => ({ ...s, y: y(pts.at(-1)[s.key]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  const ticks = [];
  for (let m = 0; m <= 1440; m += 180) ticks.push(m);

  container.innerHTML = `
    <div class="chart-legend" aria-hidden="true">
      ${SERIES.map((s) => `<span><i class="sw ${s.cls}"></i>${s.label}</span>`).join('')}
      <span><i class="sw band"></i>Sleep</span>
    </div>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated 24-hour melatonin, cortisol and sleep-pressure curves">
        ${bands.map(([a, b]) => `<rect class="band" x="${x(a)}" y="${M.top}" width="${x(b) - x(a)}" height="${ih}" rx="4"/>`).join('')}
        ${[0, 0.5, 1].map((v) => `<line class="grid" x1="${M.left}" x2="${M.left + iw}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}
        ${[0, 0.5, 1].map((v) => `<text class="axis" x="${M.left - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? 'low' : v === 1 ? 'high' : ''}</text>`).join('')}
        ${ticks.map((m) => `<text class="axis" x="${x(m)}" y="${H - 10}" text-anchor="middle">${fmtClock(720 + m)}</text>`).join('')}
        ${markers.map((mk) => `<g class="marker"><line x1="${x(offsetOf(mk.at))}" x2="${x(offsetOf(mk.at))}" y1="${M.top}" y2="${M.top + ih}"/><text x="${x(offsetOf(mk.at)) + 4}" y="${M.top + 10}">${mk.label}</text></g>`).join('')}
        ${SERIES.map((s) => `<path class="line ${s.cls}" d="${path(s.key)}"/>`).join('')}
        ${ends.map((s) => `<text class="direct" x="${M.left + iw + 8}" y="${s.y + 4}">${s.label}</text>`).join('')}
        <g class="cross" visibility="hidden">
          <line class="cross-line" y1="${M.top}" y2="${M.top + ih}"/>
          ${SERIES.map((s) => `<circle class="dot ${s.cls}" r="4"/>`).join('')}
        </g>
        <rect class="hit" x="${M.left}" y="${M.top}" width="${iw}" height="${ih}" fill="transparent"/>
      </svg>
      <div class="tooltip" role="status" hidden></div>
    </div>
    <details class="table-view">
      <summary>Show as table</summary>
      <table>
        <thead><tr><th>Time</th>${SERIES.map((s) => `<th>${s.label}</th>`).join('')}<th>State</th></tr></thead>
        <tbody>
          ${pts.filter((p) => p.offset % 60 === 0).map((p) => `<tr><td>${fmtClock(p.clock)}</td>${SERIES.map((s) => `<td>${Math.round(p[s.key] * 100)}%</td>`).join('')}<td>${p.asleep ? 'Asleep' : 'Awake'}</td></tr>`).join('')}
        </tbody>
      </table>
    </details>`;

  const svg = container.querySelector('svg');
  const cross = svg.querySelector('.cross');
  const line = svg.querySelector('.cross-line');
  const dots = svg.querySelectorAll('.dot');
  const tip = container.querySelector('.tooltip');
  const hit = svg.querySelector('.hit');

  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const offset = Math.max(0, Math.min(1440, ((sx - M.left) / iw) * 1440));
    const p = pts[Math.round(offset / 10)];
    if (!p) return;
    cross.setAttribute('visibility', 'visible');
    line.setAttribute('x1', x(p.offset));
    line.setAttribute('x2', x(p.offset));
    SERIES.forEach((s, i) => {
      dots[i].setAttribute('cx', x(p.offset));
      dots[i].setAttribute('cy', y(p[s.key]));
    });
    tip.hidden = false;
    tip.innerHTML = `<strong>${fmtClock(p.clock)}</strong> · ${p.asleep ? 'asleep' : 'awake'}${p.lightSuppressed ? ' · light-suppressed' : ''}
      ${SERIES.map((s) => `<div><i class="sw ${s.cls}"></i>${esc(s.label)} <b>${Math.round(p[s.key] * 100)}%</b></div>`).join('')}`;
    const px = (x(p.offset) / W) * r.width;
    tip.style.left = `${Math.min(r.width - 170, Math.max(0, px + 12))}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
}
