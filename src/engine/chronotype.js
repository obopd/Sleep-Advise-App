// Chronotype using the Munich ChronoType Questionnaire (MCTQ) method.
// Roenneberg et al. 2003, 2004; social jetlag: Wittmann et al. 2006.
//
// Chronotype = MSFsc: mid-sleep on free days, corrected for the oversleep that pays back
// workday sleep debt. It is only valid when free days are alarm-free.

import { wrap, signedDiff, circularMean, parseHHMM, forward } from './time.js';

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Core MCTQ computation.
 * @param {{ work: {onset:number, wake:number}, free: {onset:number, wake:number}, workdays?: number }} input
 *        onset/wake in minutes after midnight.
 */
export function mctq({ work, free, workdays = 5 }) {
  const freeDays = 7 - workdays;
  const SDw = forward(work.onset, work.wake);
  const SDf = forward(free.onset, free.wake);
  const MSW = wrap(work.onset + SDw / 2);
  const MSF = wrap(free.onset + SDf / 2);
  const SDweek = (SDw * workdays + SDf * freeDays) / 7;
  const MSFsc = SDf > SDw ? wrap(MSF - (SDf - SDweek) / 2) : MSF;
  const socialJetlag = Math.abs(signedDiff(MSW, MSF));
  return {
    SDw,
    SDf,
    SDweek,
    MSW,
    MSF,
    MSFsc,
    socialJetlag,
    sleepDebtPerWorkday: Math.max(0, SDweek - SDw),
    category: classify(MSFsc),
  };
}

/**
 * Descriptive chronotype bands based on MSFsc (hours after midnight). The MCTQ is a
 * continuous measure; these bands are labels for readability, centred on the adult
 * population distribution (mean around 04:00–04:30).
 */
export function classify(msfsc) {
  const h = signedDiff(0, msfsc) / 60;
  if (h < 2) return 'Extreme early';
  if (h < 3) return 'Early';
  if (h < 4) return 'Slightly early';
  if (h < 5) return 'Intermediate';
  if (h < 6) return 'Slightly late';
  if (h < 7) return 'Late';
  return 'Extreme late';
}

/** Build MCTQ inputs from the questionnaire stored in the user profile. */
export function chronotypeFromProfile(profile) {
  const q = profile?.mctq;
  if (!q) return null;
  const work = { onset: parseHHMM(q.workOnset), wake: parseHHMM(q.workWake) };
  const free = { onset: parseHHMM(q.freeOnset), wake: parseHHMM(q.freeWake) };
  if ([work.onset, work.wake, free.onset, free.wake].some((v) => v == null)) return null;
  const res = mctq({ work, free, workdays: Number(q.workdays ?? 5) });
  return { ...res, source: 'questionnaire', valid: q.freeAlarm !== true };
}

/**
 * Build MCTQ inputs from logged nights. Requires at least 2 workday and 1 free-day nights.
 * Free nights where an alarm was used are excluded (MCTQ validity requirement).
 */
export function chronotypeFromNights(nights, workdays = 5) {
  const work = nights.filter((n) => !n.freeDay);
  const free = nights.filter((n) => n.freeDay && !n.alarm);
  if (work.length < 2 || free.length < 1) return null;
  const agg = (ns) => ({
    onset: circularMean(ns.map((n) => n.onset)),
    wake: wrap(circularMean(ns.map((n) => n.onset)) + mean(ns.map((n) => n.sleepPeriod))),
  });
  const res = mctq({ work: agg(work), free: agg(free), workdays });
  return { ...res, source: 'diary', valid: true, nWork: work.length, nFree: free.length };
}
