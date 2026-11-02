// Turns the user's profile, sleep diary and circadian estimate into a personal sleep
// schedule, a daily timeline and ranked habit recommendations. Every item carries an
// evidence grade (A/B/C, see references.js) and citation keys.

import { parseHHMM, wrap, signedDiff, addDays } from './time.js';
import { validNights, summarize } from './sleepMetrics.js';
import { estimatePhase, inWindow } from './circadian.js';
import { chronotypeFromNights, chronotypeFromProfile } from './chronotype.js';
import { resolveSleepNeed } from './sleepNeed.js';
import { habitFrequencies, personalAssociations, caffeineCutoffHours, HABIT_LABELS } from './habits.js';
import { clinicalFlags } from './safety.js';

export const SLEEP_LATENCY_BUFFER = 15; // minutes allowed to fall asleep (Ohayon 2017: ≤ 30 normal)
export const SHIFT_PER_DAY = 15; // conservative gradual shift, minutes per day (Eastman & Burgess 2009)
export const ALIGN_TOLERANCE = 30;

const round5 = (m) => wrap(Math.round(m / 5) * 5);

export function buildPlan({ profile = {}, entries = [], measured = [], today = null } = {}) {
  const nights = validNights(entries);
  const summary = summarize(entries);
  const need = resolveSleepNeed(profile);
  const needMin = need.target * 60;
  const phase = estimatePhase({ nights, measured, profile, today });
  const chronotype =
    chronotypeFromNights(summary?.nights ?? [], Number(profile?.mctq?.workdays ?? 5)) ??
    chronotypeFromProfile(profile);

  const flags = clinicalFlags({ summary, profile, needHours: need.target });
  const dataQuality = {
    nights: nights.length,
    enough: nights.length >= 7,
    message:
      nights.length >= 14
        ? 'Two or more weeks of diary data: estimates are as good as a diary allows.'
        : nights.length >= 7
          ? 'One week of data: estimates are usable but will improve with another week.'
          : `Log at least 7 nights (you have ${nights.length}) for personal estimates. The plan below relies more on your questionnaire answers.`,
  };

  if (!phase) {
    return { ready: false, need, summary, chronotype, flags, dataQuality, phase: null };
  }

  // ---- 1. Schedule -------------------------------------------------------
  const naturalOnset = phase.sleepGate;
  const constraintWake = parseHHMM(profile?.workWake);
  let target;
  let alignment;

  if (constraintWake == null) {
    target = { onset: naturalOnset, wake: wrap(naturalOnset + needMin) };
    alignment = { status: 'aligned', minutes: 0, steps: [] };
  } else {
    const requiredOnset = wrap(constraintWake - needMin);
    const delta = signedDiff(requiredOnset, naturalOnset); // > 0: body clock is later than required
    target = { onset: requiredOnset, wake: constraintWake };
    if (delta > ALIGN_TOLERANCE) {
      alignment = { status: 'advance', minutes: delta, steps: transitionSteps(naturalOnset, requiredOnset, constraintWake, today) };
    } else if (delta < -ALIGN_TOLERANCE) {
      // Body is earlier than needed: the user can sleep at natural times and wake before the constraint.
      target = { onset: naturalOnset, wake: wrap(naturalOnset + needMin) };
      alignment = { status: 'early', minutes: -delta, steps: [] };
    } else {
      alignment = { status: 'aligned', minutes: Math.abs(delta), steps: [] };
    }
  }

  const schedule = {
    lightsOut: round5(target.onset - SLEEP_LATENCY_BUFFER),
    sleepOnset: round5(target.onset),
    wake: round5(target.wake),
    freeDayLatestWake: round5(target.wake + 60),
    needHours: need.target,
    lightsOutInWmz: inWindow(target.onset - SLEEP_LATENCY_BUFFER, phase.wmzStart, phase.wmzEnd),
  };

  // ---- 2. Daily timeline ---------------------------------------------------
  const bed = schedule.lightsOut;
  const wake = schedule.wake;
  const timeline = [
    {
      time: wake,
      title: 'Wake up at the same time every day',
      detail: 'A fixed wake time is the strongest anchor for your body clock. On free days, get up no more than 1 h later.',
      grade: 'A',
      refs: ['phillips2017', 'windred2024', 'wittmann2006'],
    },
    {
      time: wrap(wake + 15),
      title: 'Get outdoor light in the morning',
      detail:
        'Spend at least 30 min outdoors within the first hour after waking; even an overcast sky is far brighter than indoor light. ' +
        'Light after your core-temperature minimum shifts your clock earlier.',
      grade: 'B',
      refs: ['khalsa2003', 'brown2022'],
    },
    {
      time: wrap(bed - caffeineCutoffHours(100) * 60),
      title: 'Caffeine cutoff (regular coffee or tea)',
      detail: `Have your last regular coffee about 8.8 h before bed. For large doses (over 150 mg, e.g. pre-workout or energy drinks), stop by ${fmtShort(wrap(bed - caffeineCutoffHours(200) * 60))}.`,
      grade: 'A',
      refs: ['gardiner2023', 'drake2013'],
    },
    napWindow(wake, bed),
    {
      time: wrap(bed - 4 * 60),
      title: 'Latest alcohol, if any',
      detail: 'Alcohol helps you fall asleep but fragments the second half of the night and suppresses REM sleep, more so at higher doses. Less is better.',
      grade: 'A',
      refs: ['ebrahim2013'],
    },
    {
      time: wrap(bed - 3 * 60),
      title: 'Finish your last large meal and start dimming the lights',
      detail:
        'From now on, keep lighting dim and warm (≤ 10 lux melanopic EDI, roughly a dim lamp, not overhead lights). ' +
        'Evening light suppresses and delays melatonin. Heavy late meals are linked with poorer sleep (limited evidence).',
      grade: 'A',
      refs: ['brown2022', 'gooley2011', 'crispim2011'],
    },
    {
      time: wrap(bed - 60),
      title: 'Wind down; no vigorous exercise from here',
      detail:
        'Regular exercise improves sleep. Moderate evening exercise is fine, but end vigorous sessions at least 1 h before bed. Put bright screens away or dim them.',
      grade: 'A',
      refs: ['kredlow2015', 'stutz2019'],
    },
    {
      time: bed,
      title: 'Lights out',
      detail: 'Dark (≤ 1 lux melanopic EDI), quiet and cool. If you are not asleep after ~20 min, get up and do something calm in dim light until you feel sleepy.',
      grade: 'A',
      refs: ['brown2022', 'edinger2021'],
    },
  ].filter(Boolean);
  timeline.sort((a, b) => wrap(a.time - wake) - wrap(b.time - wake));

  // ---- 3. Recommendations --------------------------------------------------
  const recs = [];

  if (alignment.status === 'advance') {
    recs.push({
      priority: 1,
      title: `Shift your body clock ${fmtDur(alignment.minutes)} earlier`,
      detail:
        `Your estimated melatonin onset (≈ ${fmtShort(phase.dlmo)}) means your body is ready to sleep around ${fmtShort(naturalOnset)}, ` +
        `but you need to be asleep by ${fmtShort(schedule.sleepOnset)} to get ${need.target} h before ${fmtShort(constraintWake)}. ` +
        `Keep your wake time fixed and move lights-out ${SHIFT_PER_DAY} min earlier each day (about ${alignment.steps.length} days) instead of jumping all at once: ` +
        `going to bed during your wake maintenance zone (≈ ${fmtShort(phase.wmzStart)}–${fmtShort(phase.wmzEnd)}) usually means lying awake. ` +
        'Use bright morning light right after waking and keep evenings dim. This is what moves the clock.',
      grade: 'B',
      refs: ['eastman2009', 'khalsa2003', 'lavie1986', 'strogatz1987'],
    });
    recs.push({
      priority: 3,
      title: 'Optional: low-dose melatonin (talk to a clinician first)',
      detail:
        `Low-dose melatonin (0.5 mg) taken in the early evening, several hours before your melatonin onset (around ${fmtShort(wrap(phase.dlmo - 240))}–${fmtShort(wrap(phase.dlmo - 180))}), ` +
        'shifts the clock earlier. Its timing matters more than its dose. Supplement quality varies widely; check with a clinician, especially if pregnant, on medication or under 18.',
      grade: 'B',
      refs: ['burgess2010', 'auger2015'],
    });
  } else if (alignment.status === 'early') {
    recs.push({
      priority: 2,
      title: 'Your body clock runs early, which is fine for your schedule',
      detail:
        `You naturally get sleepy around ${fmtShort(naturalOnset)}. Following that and waking at ${fmtShort(schedule.wake)} fits your obligations. ` +
        'If you want to stay up later, bright light in the evening (before your core-temperature minimum) shifts the clock later.',
      grade: 'B',
      refs: ['khalsa2003'],
    });
  }

  if (schedule.lightsOutInWmz && alignment.status !== 'advance') {
    recs.push({
      priority: 1,
      title: 'Your planned bedtime falls in your wake maintenance zone',
      detail: `Between ≈ ${fmtShort(phase.wmzStart)} and ${fmtShort(phase.wmzEnd)} your circadian alerting signal peaks, so falling asleep then is hard.`,
      grade: 'B',
      refs: ['lavie1986', 'strogatz1987'],
    });
  }

  if (chronotype && chronotype.socialJetlag > 60) {
    recs.push({
      priority: 2,
      title: `Reduce social jetlag (${fmtDur(chronotype.socialJetlag)})`,
      detail:
        `Your mid-sleep shifts by ${fmtDur(chronotype.socialJetlag)} between workdays and free days, like flying across time zones every weekend. ` +
        `Keep free-day wake time before ${fmtShort(schedule.freeDayLatestWake)}.`,
      grade: 'C',
      refs: ['wittmann2006', 'roenneberg2003'],
    });
  }

  if (summary && summary.count >= 7 && (summary.onsetSD > 60 || (summary.sri != null && summary.sri < 70))) {
    recs.push({
      priority: 1,
      title: 'Make your sleep timing more regular',
      detail:
        `Your sleep onset varies by about ±${fmtDur(summary.onsetSD)}` +
        (summary.sri != null ? ` (Sleep Regularity Index ${Math.round(summary.sri)}/100)` : '') +
        '. Sleep regularity predicts health outcomes even more strongly than sleep duration. Fixing your wake time first is the easiest lever.',
      grade: 'C',
      refs: ['phillips2017', 'windred2024'],
    });
  }

  if (summary && summary.count >= 7 && summary.avgEfficiency < 0.85 && summary.avgTib > needMin) {
    recs.push({
      priority: 1,
      title: "Don't spend extra time in bed awake",
      detail:
        `Your sleep efficiency is ${Math.round(summary.avgEfficiency * 100)} % (healthy: ≥ 85 %). Use the bed only for sleep, ` +
        'get up if you are awake for more than ~20 minutes, and avoid going to bed early to "catch up". These are the stimulus-control and sleep-restriction parts of CBT-I.',
      grade: 'A',
      refs: ['edinger2021', 'ohayon2017'],
    });
  }

  if (summary && summary.count >= 7 && summary.avgTst < (need.min * 60)) {
    recs.push({
      priority: 1,
      title: `You are sleeping ${fmtDur(needMin - summary.avgTst)} less than your target`,
      detail: `You average ${fmtDur(summary.avgTst)} against a target of ${need.target} h (${need.group}: ${need.min}–${need.max} h). Protect the full sleep window in the schedule above.`,
      grade: 'A',
      refs: need.refs,
    });
  }

  // Habit-driven advice, from how often each problem habit actually occurs in the diary.
  const habits = habitFrequencies(summary?.nights ? entries.filter((e) => summary.nights.some((n) => n.date === e.date)) : []);
  const habitAdvice = {
    lateCaffeine: { grade: 'A', refs: ['gardiner2023', 'drake2013'], text: 'Move caffeine earlier; see the cutoff in your timeline. Caffeine has a ~5 h half-life, so an afternoon coffee is still about half-active at bedtime.' },
    lateAlcohol: { grade: 'A', refs: ['ebrahim2013'], text: 'Avoid alcohol in the 4 h before bed. It worsens second-half sleep and REM sleep.' },
    lateVigorousExercise: { grade: 'A', refs: ['stutz2019'], text: 'Finish vigorous workouts at least 1 h before bedtime.' },
    lowMorningLight: { grade: 'B', refs: ['khalsa2003', 'brown2022'], text: 'Get ≥ 30 min of outdoor light soon after waking to anchor your clock.' },
    lateScreens: { grade: 'B', refs: ['gooley2011', 'brown2022'], text: 'Dim screens and room lights in the last hour (ideally the last 3 h) before bed.' },
    lateMeal: { grade: 'C', refs: ['crispim2011'], text: 'Try finishing larger meals at least 3 h before bed.' },
    longOrLateNap: { grade: 'B', refs: ['milner2009'], text: 'Keep naps ≤ 20–30 min and in the early afternoon.' },
  };
  for (const [key, adv] of Object.entries(habitAdvice)) {
    const f = habits.freq[key] ?? 0;
    if (habits.n >= 3 && f >= 0.3) {
      recs.push({
        priority: 2,
        title: `${HABIT_LABELS[key]} on ${Math.round(f * 100)} % of nights`,
        detail: adv.text,
        grade: adv.grade,
        refs: adv.refs,
      });
    }
  }

  recs.sort((a, b) => a.priority - b.priority);

  return {
    ready: true,
    need,
    phase,
    chronotype,
    summary,
    schedule,
    alignment,
    timeline,
    recommendations: recs,
    insights: personalAssociations(entries),
    habitFrequency: habits,
    flags,
    dataQuality,
  };
}

function napWindow(wake, bed) {
  const start = wrap(wake + 6 * 60);
  const end = wrap(bed - 7 * 60);
  if (signedDiff(start, end) < 30) return null;
  return {
    time: start,
    title: 'Nap window, only if needed',
    detail: `If you need a nap, keep it to 20–30 min and finish by ${fmtShort(end)} so it doesn't take away sleep pressure you need at night.`,
    grade: 'B',
    refs: ['milner2009'],
  };
}

/**
 * Day-by-day stepwise phase-advance plan. Wake time stays fixed at the required time
 * (a fixed wake time plus morning light is what pulls the clock earlier); lights-out
 * moves earlier by SHIFT_PER_DAY so you are never in bed long before you can sleep.
 */
export function transitionSteps(fromOnset, toOnset, fixedWake, today) {
  const total = signedDiff(toOnset, fromOnset);
  const days = Math.ceil(total / SHIFT_PER_DAY);
  const steps = [];
  for (let d = 1; d <= days; d++) {
    const onset = wrap(fromOnset - Math.min(total, d * SHIFT_PER_DAY));
    steps.push({
      day: d,
      date: today ? addDays(today, d - 1) : null,
      lightsOut: round5(onset - SLEEP_LATENCY_BUFFER),
      wake: round5(fixedWake),
    });
  }
  return steps;
}

function fmtShort(min) {
  const w = Math.round(wrap(min)) % 1440;
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
}

function fmtDur(min) {
  const a = Math.round(Math.abs(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
