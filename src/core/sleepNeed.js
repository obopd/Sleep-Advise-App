// Age-based sleep-duration recommendations (hours of actual sleep per 24 h).
// Children/teens: AASM pediatric consensus (Paruthi 2016).
// Adults: AASM/SRS consensus (Watson 2015, ≥7 h) and NSF ranges (Hirshkowitz 2015).

/** Whole years between a 'YYYY-MM-DD' birthday and today (local date). Null if invalid. */
export function ageFromBirthday(birthday, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Age from the profile: birthday when given, else an older saved age. */
export function profileAge(profile, today = new Date()) {
  return ageFromBirthday(profile?.birthday, today) ?? (Number(profile?.age_years_reported ?? profile?.age) || null);
}

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
  const base = sleepNeedForAge(profileAge(profile));
  const personal = Number(profile?.preferred_sleep_hours ?? profile?.personalNeedHours);
  if (Number.isFinite(personal) && personal > 0) {
    const clamped = Math.min(base.max, Math.max(base.min, personal));
    return { ...base, target: clamped, personal: true, clamped: clamped !== personal };
  }
  return { ...base, personal: false, clamped: false };
}
