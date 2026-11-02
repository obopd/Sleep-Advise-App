// SCREEN 6 — Sleep scheduler + recommendations (rules, with their evidence).
import { h, icon } from '../dom.js';
import { openSheet, segmented } from '../dialogs.js';
import { app } from '../store.js';
import { planSleep, nextLocalTime } from '../../core/scheduler.js';
import { resolveSleepNeed } from '../../core/sleepNeed.js';
import { localToInstant, toIso, toMs, instantToLocal, DAY_MS } from '../../core/time.js';
import { RULES_VERSION } from '../../core/recommend.js';
import { atTime, atDay, dateTime, section, row, badge, emptyNote } from '../kit.js';
import { evidenceBadge, refList } from '../why.js';

let wakeIso = null;
let hours = null;

export function renderPlan(root) {
  const { state } = app;
  const tz = state.user.timezone;
  const col = h('div', { class: 'col' });
  root.replaceChildren(col);
  col.append(h('h1', { class: 'display page-title' }, 'Plan'));

  const need = resolveSleepNeed(state.user.profile);
  if (!wakeIso || toMs(wakeIso) < Date.now()) {
    const pref = state.user.profile?.work_wake_time || '07:00';
    wakeIso = toIso(nextLocalTime(pref, tz, Date.now(), localToInstant));
  }
  hours = hours ?? need.target;
  const out = h('div');
  const paint = () => out.replaceChildren(planCard(planSleep(state, { wakeMs: toMs(wakeIso), durationHours: hours }), tz));
  const hourOpts = [];
  for (let x = need.min; x <= need.max; x += 0.5) hourOpts.push([x, `${x} h`]);
  const hs = segmented(hourOpts, hours, (v) => { hours = v; paint(); }, { label: 'Sleep length' });
  hs.classList.add('wide');
  col.append(section('Next sleep', null,
    dateTime('I need to be up at', wakeIso, tz, (v) => { if (v) { wakeIso = v; paint(); } }, { required: true, hint: 'Any time of day: night shifts and daytime sleep work too.' }),
    h('div', { class: 'q' }, h('span', {}, `Sleep length (recommended for ${need.group}: ${need.min}–${need.max} h)`), hs),
    out));
  paint();

  const recs = app.d.recs;
  col.append(section('Suggestions', null,
    recs.length ? h('div', { class: 'rows' }, recs.map((r) => row({ ic: r.icon, title: r.title, sub: r.action, onclick: () => openRecommendation(r) }))) : emptyNote('No suggestions right now. Your recorded timing and habits do not trigger any of the rules.'),
    h('p', { class: 'note' }, `Suggestions come from simple, transparent rules (${RULES_VERSION}) applied to your records. They are not medical advice and do not diagnose sleep disorders.`)));
}

function planCard(p, tz) {
  const start = p.opportunity.start;
  return h('div', { class: 'card plan' },
    h('div', { class: 'card-head' }, h('b', {}, 'Recommended sleep opportunity'), badge('calculated')),
    h('div', { class: 'times' },
      h('div', {}, h('div', { class: 'label' }, 'In bed, lights out'), h('div', { class: 'big display' }, atTime(start, tz)), h('div', { class: 'muted small' }, atDay(start, tz))),
      h('div', {}, h('div', { class: 'label' }, 'Wake up'), h('div', { class: 'big display' }, atTime(p.wake, tz)), h('div', { class: 'muted small' }, atDay(p.wake, tz)))),
    h('p', { class: 'explain' }, `${p.opportunity.sleepHours} h of sleep plus ${p.opportunity.latencyAllowanceMin} min to fall asleep.`),
    p.predictedOnset
      ? h('p', { class: 'explain' }, badge('estimate'), ' Likely asleep around ', h('b', {}, atTime(p.predictedOnset.time, tz)), `. ${p.predictedOnset.basis}`)
      : h('p', { class: 'note' }, 'A predicted fall-asleep time appears after 3 nights with a recorded time to fall asleep.'),
    p.gradual ? h('div', { class: 'banner' }, icon('shift'), h('span', {}, p.gradual.text)) : null,
    p.adaptive ? h('p', { class: 'note' }, 'Your schedule is irregular or shift-based, so the plan is made for this one wake time only; set the wake time for each sleep as your schedule changes.') : null,
    ...p.notes.map((n) => h('p', { class: `note ${n.code === 'not_enough_time' ? 'warn-text' : ''}` }, n.text)));
}

export function openRecommendation(r) {
  const part = (t, v) => (v ? h('div', { class: 'q' }, h('span', {}, t), Array.isArray(v) ? h('ul', { class: 'plain' }, v.map((x) => h('li', {}, x))) : h('p', { class: 'explain' }, v)) : null);
  openSheet({
    title: r.title,
    body: h('div', { class: 'form' },
      part('What to try', r.action),
      part('Why', r.reason),
      part('Your records', r.observations),
      part('Expected benefit', r.expected_benefit),
      part('Limitations', r.limitations),
      part('How we will check', r.evaluate),
      r.evidence ? evidenceBadge(r.evidence.grade) : null,
      r.evidence ? refList(r.evidence.refs) : null),
  });
}
