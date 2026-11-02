// Age-based sleep-duration recommendations (hours of actual sleep per 24 h).
// Children/teens: AASM pediatric consensus (Paruthi 2016).
// Adults: AASM/SRS consensus (Watson 2015, ≥7 h) and NSF ranges (Hirshkowitz 2015).

export function sleepNeedForAge(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) {
    return { min: 7, max: 9, target: 8, group: 'Adult (age not set)', refs: ['watson2015', 'hirshkowitz2015'] };
  }
  if (a < 6) return { min: 10, max: 13, target: 11, group: 'Child under 6', refs: ['paruthi2016'], outOfScope: true };
  if (a <= 12) return { min: 9, max: 12, target: 10, group: 'Child 6–12', refs: ['paruthi2016'] };
  if (a <= 17) return { min: 8, max: 10, target: 9, group: 'Teen 13–17', refs: ['paruthi2016'] };
  if (a < 65) return { min: 7, max: 9, target: 8, group: 'Adult 18–64', refs: ['watson2015', 'hirshkowitz2015'] };
  return { min: 7, max: 8, target: 7.5, group: 'Adult 65+', refs: ['hirshkowitz2015'] };
}

/**
 * Resolve the sleep-duration target. A personal value (e.g. what the user sleeps on long
 * vacations once rested) is honoured but clamped to the recommended range.
 */
export function resolveSleepNeed(profile) {
  const base = sleepNeedForAge(profile?.age);
  const personal = Number(profile?.personalNeedHours);
  if (Number.isFinite(personal) && personal > 0) {
    const clamped = Math.min(base.max, Math.max(base.min, personal));
    return { ...base, target: clamped, personal: true, clamped: clamped !== personal };
  }
  return { ...base, personal: false, clamped: false };
}
