// SCREEN 7 — Biological insights: education + clearly labelled model outputs.
// No hormone concentrations are shown. Circadian estimates are experimental and hidden
// unless the user turns them on.
import { h } from '../dom.js';
import { toggle } from '../dialogs.js';
import { app, update } from '../store.js';
import { CIRCADIAN_MODELS } from '../../core/models/circadian.js';
import { SLEEP_PRESSURE_MODEL } from '../../core/models/sleepPressure.js';
import { toMs, DAY_MS, localClockMinutes } from '../../core/time.js';
import { clock, dur, section, badge, emptyNote } from '../kit.js';
import { refList } from '../why.js';

export function biologyBody() {
  const { state } = app;
  const d = app.d;
  const wrap = h('div', { class: 'form' });
  wrap.append(h('div', { class: 'banner' }, h('span', {}, 'This version cannot measure or reliably determine your melatonin or cortisol levels. Only saliva or blood tests can. What follows are estimates of timing and sleep pressure from your records, clearly marked.')));

  // Sleep pressure
  const sp = d.models[SLEEP_PRESSURE_MODEL.name];
  wrap.append(section('Sleep pressure', badge('estimate'),
    sp.status === 'ok' ? pressureChart(sp, state.user.timezone) : emptyNote(sp.reason),
    h('p', { class: 'note' }, `Model: ${SLEEP_PRESSURE_MODEL.name} v${SLEEP_PRESSURE_MODEL.version}. Builds while you are awake (time constant 18.2 h) and falls during sleep (4.2 h), from group data (Daan et al. 1984). Unitless, not validated for individuals.`),
    refList(SLEEP_PRESSURE_MODEL.refs)));

  // Circadian timing (experimental)
  const on = state.settings.show_experimental;
  const circ = h('div', { class: 'form' },
    h('p', { class: 'explain' }, 'Your body clock runs on a roughly 24-hour cycle. In the evening, melatonin starts rising ("dim-light melatonin onset", DLMO); this is the standard laboratory marker of body-clock timing. Bedtime is related to it but is not the same thing, and the gap differs between people.'),
    h('label', { class: 'q-row' }, h('span', {}, 'Show experimental estimates'), toggle(on, (v) => update({ ...state, settings: { ...state.settings, show_experimental: v } }), 'Show experimental estimates')));
  if (on) {
    for (const m of CIRCADIAN_MODELS) {
      const r = d.models[m.name];
      circ.append(h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('b', {}, m.name === 'dlmo_sleep_timing_proxy' ? 'From your sleep times' : 'From measured light'), badge('experimental')),
        r.status === 'ok'
          ? h('p', { class: 'explain' }, 'Estimated melatonin onset around ', h('b', {}, clock(r.value)), '. Treat this as a rough guide: it has not been checked against a melatonin test for you.')
          : h('p', { class: 'explain' }, r.details?.reason ?? 'No estimate.'),
        h('p', { class: 'note' }, `${m.name} v${m.version} · ${m.population}`),
        refList(m.refs)));
    }
    circ.append(h('p', { class: 'note' }, 'Published comparisons of methods like these against laboratory DLMO found typical errors of about an hour for people with regular schedules and much larger errors for shift workers (Cheng et al. 2021). That is a property of the methods, not a validation of this app.'));
  }
  wrap.append(section('Body-clock timing', badge('experimental'), circ));

  // Light exposure patterns
  const w7 = d.now - 7 * DAY_MS;
  const light = state.tables.light_exposure_events.filter((l) => toMs(l.end_time) > w7);
  const sensorH = light.filter((l) => l.measurement_type === 'sensor').reduce((s, l) => s + (toMs(l.end_time) - toMs(l.start_time)), 0) / 36e5;
  const outdoorMin = light.filter((l) => l.indoor_outdoor_context === 'outdoor' || l.measurement_type === 'device_daylight').reduce((s, l) => s + (toMs(l.end_time) - toMs(l.start_time)), 0) / 6e4;
  const morning = light.filter((l) => (l.indoor_outdoor_context === 'outdoor' || l.measurement_type === 'device_daylight' || Number(l.illuminance_lux) >= 1000) && localClockMinutes(l.start_time, l.tz) < 12 * 60).length;
  wrap.append(section('Light exposure (7 days)', badge('recorded'),
    light.length ? h('ul', { class: 'plain' },
      h('li', {}, `Outdoor or daylight time recorded: ${dur(outdoorMin)}`),
      h('li', {}, `Periods of morning daylight recorded: ${morning}`),
      h('li', {}, `Light-sensor data: ${Math.round(sensorH)} h${sensorH ? '' : ' (import a light-sensor file in More → Import for measured lux)'}`))
      : emptyNote('No light exposure recorded in the last 7 days.'),
    h('p', { class: 'note' }, 'Light is the main signal that sets the body clock: light in the biological morning tends to shift it earlier, light in the late evening later (Khalsa et al. 2003). This is general information, not a light-therapy prescription.'),
    refList(['khalsa2003', 'brown2022'])));

  // Reference measurements
  const labs = state.tables.laboratory_measurements;
  wrap.append(section('Lab results', badge('reference'),
    labs.length ? h('ul', { class: 'plain' }, labs.map((l) => h('li', {}, `${l.analyte === 'dlmo' ? 'DLMO' : l.analyte} ${l.analyte === 'dlmo' ? clock(l.measured_value) : `${l.measured_value} ${l.measured_unit}`} · ${new Date(l.collection_timestamp).toLocaleDateString()}`)))
      : emptyNote('No laboratory measurements. If you take part in a study or do a saliva melatonin test, results can be added in More → Research.')));
  return wrap;
}

function pressureChart(sp, tz) {
  const pts = sp.trajectory.filter((_, i) => i % 3 === 0).slice(-576 / 3);
  const W = 320;
  const H = 120;
  const t0 = pts[0].t;
  const t1 = pts.at(-1).t;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => H - 18 - v * (H - 28);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.S).toFixed(1)}`).join('');
  let bands = '';
  let start = null;
  pts.forEach((p, i) => {
    if (p.asleep && start == null) start = p.t;
    if ((!p.asleep || i === pts.length - 1) && start != null) { bands += `<rect x="${x(start).toFixed(1)}" y="0" width="${(x(p.t) - x(start)).toFixed(1)}" height="${H - 18}" class="band"/>`; start = null; }
  });
  const days = [];
  for (let t = Math.ceil(t0 / 21600000) * 21600000; t < t1; t += 21600000) days.push(`<text x="${x(t).toFixed(1)}" y="${H - 4}" class="ax">${clock(localClockMinutes(t, tz)).replace(':00', '')}</text>`);
  const el = h('div', { class: 'timing' });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated sleep pressure over the last 72 hours; shaded areas are recorded sleep">${bands}<path d="${path}" class="sp"/>${days.join('')}</svg>`;
  return h('div', {}, el, h('p', { class: 'note' }, 'Last 72 hours. Shaded: recorded sleep. Higher = more sleep pressure (relative).'));
}
