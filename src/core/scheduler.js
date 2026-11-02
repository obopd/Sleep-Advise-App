// Sleep scheduler (spec Screen 6). Plans the next sleep opportunity for a desired wake
// time at ANY time of day (supports night shifts and daytime sleep).
//
// Outputs are kept distinct:
//   opportunity      — recommended time to be in bed trying to sleep (a recommendation)
//   predictedOnset   — when you are likely to fall asleep, from your own recent latency
//                      (a prediction; only given with ≥ 3 nights of latency data)
// Never recommends less sleep than the lower end of the user's recommended range.
// Gradual shifts: if your recent sleep onset is much later than the opportunity, a stepwise
// plan is offered (step size is a conservative app choice, documented, not a biological constant).

import { analysisEpisodes } from './sleep.js';
import { resolveSleepNeed } from './sleepNeed.js';
import { MIN_MS, HOUR_MS, DAY_MS, localClockMinutes, circularMean, circularDiff, toIso } from './time.js';

export const SCHEDULER_VERSION = 'scheduler-1.0.0';
export const DEFAULT_LATENCY_MIN = 15; // used only when the user has no latency data; flagged
export const SHIFT_STEP_MIN = 15; // per day, conservative app choice
export const SHIFT_TRIGGER_MIN = 60;

export function planSleep(state, { wakeMs, now = Date.now(), durationHours = null }) {
  const need = resolveSleepNeed(state.user.profile);
  const notes = [];
  const sleepH = durationHours ?? need.target;
  if (sleepH < need.min) notes.push({ code: 'below_range', text: `Planned sleep (${sleepH} h) is below the recommended ${need.min}–${need.max} h for your age group.` });

  const eps = analysisEpisodes(state.tables.sleep_episodes, now);
  const mains = eps.filter((e) => e.type === 'main' && !e.inProgress && (e.wake ?? now) > now - 14 * DAY_MS);
  const lat = mains.filter((e) => e.latency != null).map((e) => e.latency).sort((a, b) => a - b);
  const medianLatency = lat.length ? lat[Math.floor(lat.length / 2)] : null;
  const latency = medianLatency ?? DEFAULT_LATENCY_MIN;
  if (medianLatency == null) notes.push({ code: 'default_latency', text: `No recent fall-asleep times recorded, so ${DEFAULT_LATENCY_MIN} min is allowed for falling asleep.` });

  const start = wakeMs - (sleepH * 60 + latency) * MIN_MS;
  const available = (wakeMs - now) / MIN_MS;
  if (available < need.min * 60) {
    notes.push({ code: 'not_enough_time', text: `There are ${Math.max(0, Math.round(available / 6) / 10)} h until this wake time, less than the ${need.min} h minimum. Consider a later wake time if possible, or a nap later.` });
  }

  const predictedOnset = lat.length >= 3 ? { time: toIso(Math.max(start, now) + medianLatency * MIN_MS), basis: `Median time to fall asleep on your last ${lat.length} recorded nights (${Math.round(medianLatency)} min).` } : null;

  // Gradual shift when the plan is much earlier than your recent sleep onset (regular schedules only).
  let gradual = null;
  const tz = state.user.timezone;
  const recentOnsets = mains.filter((e) => e.onset != null && (e.wake ?? now) > now - 7 * DAY_MS).map((e) => localClockMinutes(e.onset, e.tz ?? tz));
  if (state.user.profile?.shift_work !== 'yes' && recentOnsets.length >= 3) {
    const habitual = circularMean(recentOnsets);
    const planned = localClockMinutes(start + latency * MIN_MS, tz);
    const lateBy = circularDiff(planned, habitual); // > 0: you usually fall asleep later than planned
    if (lateBy > SHIFT_TRIGGER_MIN) {
      const days = Math.ceil(lateBy / SHIFT_STEP_MIN);
      gradual = {
        habitualOnsetClock: habitual,
        lateByMin: Math.round(lateBy),
        stepMin: SHIFT_STEP_MIN,
        days,
        text: `You usually fall asleep about ${Math.round(lateBy / 15) * 15} min later than this plan. Going to bed much earlier at once often means lying awake; moving bedtime about ${SHIFT_STEP_MIN} min earlier each night over ~${days} nights is a more practical way to get there.`,
      };
    }
  }

  return {
    version: SCHEDULER_VERSION,
    wake: toIso(wakeMs),
    opportunity: { start: toIso(start), end: toIso(wakeMs), sleepHours: sleepH, latencyAllowanceMin: Math.round(latency) },
    predictedOnset,
    need,
    gradual,
    notes,
    adaptive: state.user.profile?.shift_work === 'yes' || state.user.profile?.schedule_type === 'irregular',
  };
}

/** Next occurrence (after now) of a local clock time, as epoch ms. */
export function nextLocalTime(hhmm, tz, now = Date.now(), localToInstant) {
  const found = [];
  for (let d = -1; d < 3; d++) {
    const date = new Date(now + d * DAY_MS).toISOString().slice(0, 10);
    const { ms } = localToInstant(`${date}T${hhmm}`, tz);
    if (ms != null && ms > now + HOUR_MS) found.push(ms);
  }
  return found.length ? Math.min(...found) : null;
}
