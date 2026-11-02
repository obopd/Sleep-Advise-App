// Habit evaluation for each diary night, plus personal associations between habits and
// sleep outcomes. Thresholds come from the cited literature; personal associations are
// descriptive (your own nights with vs without the habit), not proof of cause.

import { parseHHMM, forward, signedDiff } from './time.js';
import { computeNight } from './sleepMetrics.js';

export const CAFFEINE_HALF_LIFE_H = 5; // typical adult; ranges ~2–10 h

/**
 * Hours before bedtime that caffeine should stop. Gardiner 2023 meta-analysis: a
 * standard coffee (~107 mg) should be taken ≥ 8.8 h before bed; a large dose
 * (~217 mg, pre-workout) ≥ 13.2 h.
 */
export function caffeineCutoffHours(mg) {
  return mg > 150 ? 13.2 : 8.8;
}

const hoursBefore = (eventClock, bedClock) => forward(eventClock, bedClock) / 60;

/** Evaluate habits for one diary entry. Returns flags and raw values. */
export function evaluateHabits(entry) {
  const night = computeNight(entry);
  if (!night) return null;
  const bed = night.bed;
  const flags = {};
  const values = {};

  // Caffeine.
  const doses = (entry.caffeine || [])
    .map((d) => ({ t: parseHHMM(d.time), mg: Number(d.mg) || 0 }))
    .filter((d) => d.t != null && d.mg > 0);
  if (doses.length) {
    values.caffeineMg = doses.reduce((s, d) => s + d.mg, 0);
    values.caffeineAtBedMg = doses.reduce(
      (s, d) => s + d.mg * Math.pow(0.5, hoursBefore(d.t, bed) / CAFFEINE_HALF_LIFE_H),
      0,
    );
    flags.lateCaffeine = doses.some((d) => hoursBefore(d.t, bed) < caffeineCutoffHours(d.mg));
  } else {
    flags.lateCaffeine = false;
  }

  // Alcohol: dose-dependent disruption of second-half sleep (Ebrahim 2013).
  const drinks = Number(entry.alcoholDrinks) || 0;
  const alcT = parseHHMM(entry.alcoholLastTime);
  values.alcoholDrinks = drinks;
  flags.alcohol = drinks > 0;
  flags.lateAlcohol = drinks > 0 && (alcT == null || hoursBefore(alcT, bed) < 4);

  // Exercise: beneficial overall (Kredlow 2015); vigorous ending < 1 h before bed can
  // impair sleep onset (Stutz 2019).
  const exT = parseHHMM(entry.exerciseEnd);
  const intensity = entry.exerciseIntensity || 'none';
  flags.exercised = intensity !== 'none' && exT != null;
  flags.lateVigorousExercise = intensity === 'vigorous' && exT != null && hoursBefore(exT, bed) < 1;

  // Light: morning outdoor light advances the clock (Khalsa 2003); evening light delays
  // and suppresses melatonin (Gooley 2011; Brown 2022: dim from 3 h before bed).
  const morningLight = Number(entry.morningLightMin) || 0;
  values.morningLightMin = morningLight;
  flags.lowMorningLight = morningLight < 30;
  const screens = parseHHMM(entry.screensUntil);
  if (screens != null) {
    values.screensBeforeBedMin = -signedDiff(bed, screens); // minutes before bed screens ended
    flags.lateScreens = signedDiff(bed, screens) > -60; // bright screens within the last hour
  } else {
    flags.lateScreens = false;
  }

  // Meals: large late meals associated with worse sleep (Crispim 2011; limited evidence).
  const meal = parseHHMM(entry.lastMealTime);
  flags.lateMeal = meal != null && hoursBefore(meal, bed) < 3;

  // Naps: short (≤ 30 min) early-afternoon naps are fine; long or late naps reduce
  // night-time sleep pressure (Milner & Cote 2009).
  const napStart = parseHHMM(entry.napStart);
  const napMin = Number(entry.napMin) || 0;
  flags.napped = napMin > 0;
  flags.longOrLateNap =
    napMin > 30 || (napMin > 0 && napStart != null && hoursBefore(napStart + napMin, bed) < 7);

  return { date: entry.date, night, flags, values };
}

export const HABIT_LABELS = {
  lateCaffeine: 'Caffeine too close to bedtime',
  lateAlcohol: 'Alcohol within 4 h of bed',
  lateVigorousExercise: 'Vigorous exercise < 1 h before bed',
  lowMorningLight: 'Under 30 min of morning outdoor light',
  lateScreens: 'Screens / bright light in the last hour',
  lateMeal: 'Last meal < 3 h before bed',
  longOrLateNap: 'Long (>30 min) or late nap',
  exercised: 'Exercised that day',
};

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * Compare your nights with vs without each habit. Needs ≥ 3 nights in each group.
 * Positive deltas mean the metric was higher on nights WITH the habit.
 */
export function personalAssociations(entries, minPerGroup = 3) {
  const evals = entries.map(evaluateHabits).filter(Boolean);
  const out = [];
  for (const key of Object.keys(HABIT_LABELS)) {
    const yes = evals.filter((e) => e.flags[key]);
    const no = evals.filter((e) => e.flags[key] === false);
    if (yes.length < minPerGroup || no.length < minPerGroup) continue;
    const metric = (group, f) => avg(group.map(f).filter((v) => v != null));
    const d = (f) => {
      const a = metric(yes, f);
      const b = metric(no, f);
      return a == null || b == null ? null : a - b;
    };
    // Confounding check: if the habit mostly happens on free days (or mostly on workdays),
    // differences may reflect the day type (e.g. sleeping in), not the habit.
    const freeShare = (g) => g.filter((e) => e.night.freeDay).length / g.length;
    const confoundedByFreeDays = Math.abs(freeShare(yes) - freeShare(no)) >= 0.5;
    out.push({
      habit: key,
      confoundedByFreeDays,
      label: HABIT_LABELS[key],
      nWith: yes.length,
      nWithout: no.length,
      deltaLatency: d((e) => e.night.latency),
      deltaTst: d((e) => e.night.tst),
      deltaEfficiency: d((e) => e.night.efficiency),
      deltaQuality: d((e) => e.night.quality),
    });
  }
  return out;
}

/** How often each problem habit occurred over the given entries (0–1). */
export function habitFrequencies(entries) {
  const evals = entries.map(evaluateHabits).filter(Boolean);
  const freq = {};
  for (const key of Object.keys(HABIT_LABELS)) {
    freq[key] = evals.length ? evals.filter((e) => e.flags[key]).length / evals.length : 0;
  }
  return { n: evals.length, freq, evals };
}
