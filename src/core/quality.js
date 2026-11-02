// Data completeness (spec: "see how much data the system has collected and where information is missing").

import { analysisEpisodes } from './sleep.js';
import { validateCollection } from './validate.js';
import { DAY_MS, toMs } from './time.js';
import { OBSERVATION_TABLES } from './schema.js';

export function completeness(state, T = Date.now(), days = 14) {
  const w0 = T - days * DAY_MS;
  const eps = analysisEpisodes(state.tables.sleep_episodes, T);
  const mains = eps.filter((e) => e.type === 'main' && (e.wake ?? T) > w0);
  const daysWithMain = new Set();
  for (let d = 0; d < days; d++) {
    const b1 = T - d * DAY_MS;
    if (mains.some((e) => (e.wake ?? T) > b1 - DAY_MS && (e.wake ?? T) <= b1)) daysWithMain.add(d);
  }
  const share = (n) => (mains.length ? n / mains.length : null);
  const recent = (table, field = 'start_time') => state.tables[table].filter((r) => toMs(r[field] ?? r.timestamp) > w0).length;
  const sensorLight = state.tables.light_exposure_events.filter((l) => l.measurement_type === 'sensor' && toMs(l.end_time) > w0);
  const issues = OBSERVATION_TABLES.flatMap((t) => validateCollection(t, state.tables[t]).map((i) => ({ ...i, table: t })));
  return {
    days,
    daysWithMainSleep: daysWithMain.size,
    mainSleeps: mains.length,
    naps: eps.filter((e) => e.type === 'nap' && (e.end ?? T) > w0).length,
    withOnset: share(mains.filter((e) => e.onset != null).length),
    withWaso: share(mains.filter((e) => e.waso != null).length),
    withQuality: share(mains.filter((e) => e.quality != null).length),
    withDayType: share(mains.filter((e) => e.dayType !== 'unknown').length),
    counts: {
      light: recent('light_exposure_events'),
      sensorLightHours: Math.round(sensorLight.reduce((s, l) => s + (toMs(l.end_time) - toMs(l.start_time)), 0) / 36e5),
      meals: recent('meal_events'),
      caffeine: state.tables.substance_events.filter((s) => s.event_type === 'caffeine' && toMs(s.start_time) > w0).length,
      alcohol: state.tables.substance_events.filter((s) => s.event_type === 'alcohol' && toMs(s.start_time) > w0).length,
      stress: state.tables.subjective_observations.filter((o) => o.measure === 'stress' && toMs(o.timestamp) > w0).length,
      activity: recent('activity_events'),
      medications: state.tables.medication_events.filter((m) => toMs(m.timestamp) > w0).length,
    },
    issues,
  };
}
