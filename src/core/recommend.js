// Transparent rule-based recommendations (Layer 5). Rules version: RULES_VERSION.
//
// Each recommendation has: action, reason, observations (the user's own data behind it),
// expected direction of benefit, limitations, and how it will be evaluated.
// Rules never diagnose, never suggest medication, melatonin or light therapy, and never
// suggest less sleep. Pattern rules need a minimum amount of data (MIN_NIGHTS).

import { analysisEpisodes } from './sleep.js';
import { DAY_MS, HOUR_MS, MIN_MS, toMs, localClockMinutes } from './time.js';
import { resolveSleepNeed } from './sleepNeed.js';
import { fmtMin, fmtClock } from './format.js';

export const RULES_VERSION = 'rules-1.0.0';
export const MIN_NIGHTS = 5;
// Gardiner et al. 2023 (meta-analysis): to avoid a reduction in total sleep, a standard
// coffee (~107 mg) should be taken at least 8.8 h before bedtime.
export const CAFFEINE_CUTOFF_H = 8.8;
// App analysis window for "alcohol in the evening" (not a physiological cutoff).
export const ALCOHOL_WINDOW_H = 6;

export function recommend(state, features, T = Date.now()) {
  const f = (n) => features.map[n]?.feature_value ?? null;
  const out = [];
  const eps = analysisEpisodes(state.tables.sleep_episodes, T);
  const mains14 = eps.filter((e) => e.type === 'main' && !e.inProgress && (e.wake ?? T) > T - 14 * DAY_MS);
  const need = resolveSleepNeed(state.user.profile);

  if (mains14.length < MIN_NIGHTS) {
    out.push({
      id: 'collect_data', priority: 0, icon: 'calendar',
      title: 'Log your sleep for a week',
      action: `Record each main sleep (and naps) for at least ${MIN_NIGHTS} nights.`,
      reason: 'Patterns and suggestions need enough of your own observations.',
      observations: [`${mains14.length} main sleep${mains14.length === 1 ? '' : 's'} recorded in the last 14 days.`],
      expected_benefit: 'Lets the app compare your nights and give suggestions based on your data.',
      limitations: 'Until then, only general information is shown.',
      evaluate: 'Recorded nights in the next 7 days.',
      evidence: null,
    });
    return out;
  }

  // Short sleep vs. age-based consensus range
  const meanSleep = f('mean_daily_sleep_7d');
  const covSleep = features.map.mean_daily_sleep_7d?.data_coverage ?? 0;
  if (meanSleep != null && covSleep >= 0.5 && meanSleep < need.min * 60) {
    out.push({
      id: 'short_sleep', priority: 1, icon: 'moon',
      title: 'Give yourself more time for sleep',
      action: `Plan a sleep opportunity of at least ${need.min} h on most nights; use the scheduler to pick a bedtime that fits your wake time.`,
      reason: `Your recorded sleep is below the ${need.min}–${need.max} h range recommended for your age group (${need.group}).`,
      observations: [`Average sleep over the last 7 days: ${fmtMin(meanSleep)} per day (${Math.round(covSleep * 100)} % of days recorded).`],
      expected_benefit: 'More total sleep; adults sleeping ≥ 7 h regularly have better health outcomes on average.',
      limitations: 'Recorded sleep may differ from actual sleep. Individual needs vary within the range.',
      evaluate: 'Average daily sleep and morning refreshment over the next 7–14 days.',
      evidence: { grade: 'A', refs: need.refs },
    });
  }

  // Irregular wake time
  const wakeSd = f('wake_sd_7d');
  if (wakeSd != null && wakeSd > 60) {
    out.push({
      id: 'irregular_wake', priority: 1, icon: 'repeat',
      title: 'Work toward a steadier wake-up time',
      action: 'Choose a realistic wake-up time that fits your obligations and move toward it gradually on most days, including free days where possible.',
      reason: 'Your wake-up time has varied a lot this week. Regular sleep timing is associated with better health outcomes, independent of sleep duration.',
      observations: [`Wake-up time varied by about ±${fmtMin(wakeSd)} (circular SD, last 7 days).`],
      expected_benefit: 'More regular timing; may make falling asleep at a consistent time easier.',
      limitations: 'The link between regularity and health is from observational studies. Fixed obligations may limit how regular you can be.',
      evaluate: 'Wake-time variability and sleep regularity over the next 14 days.',
      evidence: { grade: 'C', refs: ['phillips2017', 'windred2024'] },
    });
  }

  // Social jetlag
  const sj = f('social_jetlag_28d');
  if (sj != null && sj > 60) {
    out.push({
      id: 'social_jetlag', priority: 2, icon: 'calendar',
      title: 'Bring free days closer to workdays',
      action: 'On free days, try to keep wake-up time within about an hour of workdays while still getting enough sleep.',
      reason: 'Your sleep shifts later on free days than on workdays ("social jetlag").',
      observations: [`Mid-sleep differs by ${fmtMin(sj)} between free days and workdays (last 28 days).`],
      expected_benefit: 'A smaller weekly shift in sleep timing.',
      limitations: 'Sleeping in on free days can also be recovery from short workday sleep; do not cut sleep to reduce the shift.',
      evaluate: 'Workday/free-day mid-sleep difference over the next 4 weeks.',
      evidence: { grade: 'C', refs: ['wittmann2006', 'roenneberg2003'] },
    });
  }

  // Late caffeine
  const cafNights = nightsWith(state.tables.substance_events.filter((s) => s.event_type === 'caffeine'), mains14, CAFFEINE_CUTOFF_H);
  if (cafNights.length >= 3) {
    out.push({
      id: 'late_caffeine', priority: 2, icon: 'coffee',
      title: 'Have caffeine earlier in the day',
      action: `Try keeping caffeine at least ${CAFFEINE_CUTOFF_H} h before you plan to sleep.`,
      reason: `In a meta-analysis, a standard coffee within ${CAFFEINE_CUTOFF_H} h of bedtime reduced total sleep time on average.`,
      observations: [`Caffeine recorded within ${CAFFEINE_CUTOFF_H} h before trying to sleep on ${cafNights.length} of ${mains14.length} nights (last 14 days).`],
      expected_benefit: 'Possibly shorter time to fall asleep and more total sleep.',
      limitations: 'Sensitivity to caffeine varies widely between people. Unrecorded caffeine is not counted.',
      evaluate: 'Time to fall asleep and total sleep on nights with and without late caffeine (Insights).',
      evidence: { grade: 'A', refs: ['gardiner2023', 'drake2013'] },
    });
  }

  // Evening alcohol
  const alcNights = nightsWith(state.tables.substance_events.filter((s) => s.event_type === 'alcohol'), mains14, ALCOHOL_WINDOW_H);
  if (alcNights.length >= 2) {
    out.push({
      id: 'evening_alcohol', priority: 3, icon: 'glass',
      title: 'Notice how evening alcohol affects your sleep',
      action: 'Compare nights with and without alcohol in the evening; consider less or earlier alcohol if those nights are worse.',
      reason: 'Alcohol can shorten the time to fall asleep but disrupts sleep later in the night, more so at higher doses.',
      observations: [`Alcohol recorded within ${ALCOHOL_WINDOW_H} h before trying to sleep on ${alcNights.length} of ${mains14.length} nights.`],
      expected_benefit: 'Possibly fewer awakenings and better-rated sleep.',
      limitations: 'Effects depend on dose and timing; your own comparison needs more nights to be informative.',
      evaluate: 'Awakenings, time awake at night and sleep quality on nights with vs without alcohol.',
      evidence: { grade: 'A', refs: ['ebrahim2013'] },
    });
  }

  // Long naps
  const longNaps = eps.filter((e) => e.type === 'nap' && e.tib != null && e.tib > 30 && (e.end ?? T) > T - 7 * DAY_MS);
  if (longNaps.length >= 2) {
    out.push({
      id: 'long_naps', priority: 3, icon: 'nap',
      title: 'Keep naps short if night sleep suffers',
      action: 'If you need a nap, try keeping it under about 30 minutes.',
      reason: 'Longer naps reduce sleep pressure before the night and can leave you groggy on waking.',
      observations: [`${longNaps.length} naps longer than 30 min in the last 7 days.`],
      expected_benefit: 'Easier night-time sleep onset.',
      limitations: 'For shift workers and people with short night sleep, naps can be an important source of sleep.',
      evaluate: 'Time to fall asleep at night after nap days vs other days.',
      evidence: { grade: 'B', refs: ['milner2009'] },
    });
  }

  // Long time awake in bed
  const awakeNights = mains14.filter((e) => (e.latency != null && e.latency > 30) || (e.waso != null && e.waso > 30)).filter((e) => (e.wake ?? T) > T - 7 * DAY_MS);
  if (awakeNights.length >= 3) {
    out.push({
      id: 'awake_in_bed', priority: 1, icon: 'bed',
      title: 'Long periods awake in bed',
      action: 'If this continues for weeks and affects your days, talk to a doctor or sleep specialist. Cognitive behavioural therapy for insomnia (CBT-I) is the recommended first treatment.',
      reason: 'Taking over 30 minutes to fall asleep, or being awake over 30 minutes at night, on several nights a week is worth discussing with a professional if it persists.',
      observations: [`${awakeNights.length} of the last 7 days had > 30 min to fall asleep or > 30 min awake during the night.`],
      expected_benefit: 'Access to an effective, evidence-based treatment if needed.',
      limitations: 'This app does not diagnose sleep disorders.',
      evaluate: 'Nights with long wake periods over the next 2–4 weeks.',
      evidence: { grade: 'A', refs: ['edinger2021', 'qaseem2016', 'ohayon2017'] },
    });
  }

  // Missing onset data
  const noOnset = mains14.filter((e) => e.onset == null).length;
  if (noOnset / mains14.length > 0.5) {
    out.push({
      id: 'record_onset', priority: 4, icon: 'info',
      title: 'Add when you fell asleep',
      action: 'When you log sleep, add roughly how long it took to fall asleep.',
      reason: 'Without it, total sleep and sleep-pressure estimates cannot be calculated.',
      observations: [`${noOnset} of ${mains14.length} recent main sleeps have no fall-asleep time.`],
      expected_benefit: 'More complete analysis.',
      limitations: 'Estimates of when you fell asleep are naturally approximate.',
      evaluate: 'Share of nights with a fall-asleep time.',
      evidence: null,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/** Main sleeps preceded by an event within `hours` before the sleep attempt (same waking period). */
export function nightsWith(events, mains, hours) {
  return mains.filter((e) => events.some((x) => {
    const t = toMs(x.start_time);
    return t <= e.attempt && t >= e.attempt - hours * HOUR_MS;
  }));
}

export { fmtClock, localClockMinutes, MIN_MS };
