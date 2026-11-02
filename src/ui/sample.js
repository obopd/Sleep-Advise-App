// Three weeks of example records, clearly flagged (state.meta.sample) and shown with a banner.
import { emptyState, addRecord } from '../core/repo.js';
import { localToInstant, instantToLocal, toIso, deviceTimeZone, DAY_MS, MIN_MS } from '../core/time.js';

export function sampleState(now = Date.now(), tz = deviceTimeZone()) {
  let s = emptyState(now, tz);
  const add = (t, f) => { const r = addRecord(s, t, f); if (!r.issues.some((i) => i.level === 'error')) s = r.state; };
  const at = (date, hhmm) => localToInstant(`${date}T${hhmm}`, tz).ms;
  const today = instantToLocal(now, tz).slice(0, 10);
  const day = (n) => instantToLocal(Date.parse(`${today}T12:00:00Z`) + n * DAY_MS, 'UTC').slice(0, 10);
  for (let i = -21; i < 0; i++) {
    const d = day(i);
    const next = day(i + 1);
    const dow = new Date(`${next}T12:00:00Z`).getUTCDay();
    const free = dow === 0 || dow === 6;
    const lateCoffee = i % 3 === 0;
    const bed = free ? at(next, '00:50') : at(d, i % 2 ? '23:40' : '23:55');
    const lat = lateCoffee ? 40 : 15;
    const wake = free ? at(next, '09:20') : at(next, '06:45');
    add('sleep_episodes', { episode_type: 'main', start_time: toIso(bed), attempt_time: toIso(bed + 10 * MIN_MS), sleep_latency_minutes: lat, wake_after_sleep_onset_minutes: lateCoffee ? 25 : 10, final_awakening_time: toIso(wake), end_time: toIso(wake + (free ? 25 : 10) * MIN_MS), subjective_quality: lateCoffee ? 2 : 4, morning_refreshment: lateCoffee ? 2 : 3, day_type: free ? 'free_day' : 'workday', alarm_used: !free });
    add('substance_events', { event_type: 'caffeine', start_time: toIso(at(d, '08:00')), amount: 95, unit: 'mg', product: 'coffee' });
    if (lateCoffee) add('substance_events', { event_type: 'caffeine', start_time: toIso(at(d, '16:30')), amount: 95, unit: 'mg', product: 'coffee' });
    if (dow === 6) add('substance_events', { event_type: 'alcohol', start_time: toIso(at(d, '21:30')), amount: 2, unit: 'standard_drink', product: 'wine' });
    add('meal_events', { start_time: toIso(at(d, i % 4 ? '19:30' : '21:45')), meal_category: 'dinner', approximate_size: 'medium' });
    if (i % 2) add('light_exposure_events', { start_time: toIso(at(d, '07:30')), end_time: toIso(at(d, '08:05')), measurement_type: 'self_report', indoor_outdoor_context: 'outdoor', self_reported_brightness: 'daylight' });
    add('subjective_observations', { timestamp: toIso(at(d, '18:00')), measure: 'stress', rating: 2 + (Math.abs(i) % 3), scale_definition: 'stress_1_5: 1 none – 5 extreme' });
    if (i % 5 === 0) add('sleep_episodes', { episode_type: 'nap', start_time: toIso(at(d, '14:10')), attempt_time: toIso(at(d, '14:10')), sleep_latency_minutes: 5, end_time: toIso(at(d, '14:40')) });
    if (i % 3 === 1) add('activity_events', { start_time: toIso(at(d, '18:30')), end_time: toIso(at(d, '19:10')), activity_type: 'run', intensity: 'moderate' });
  }
  s.user.onboarded = true;
  s.user.consent = { local_storage: toIso(now) };
  s.user.profile = { birthday: '1997-05-14', schedule_type: 'regular', shift_work: 'no', work_wake_time: '06:45', mctq: { workdays: 5, workOnset: '00:00', workWake: '06:45', freeOnset: '01:05', freeWake: '09:20', freeAlarm: false } };
  s.meta = { sample: true };
  return s;
}
