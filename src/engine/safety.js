// Clinical red flags. The app is a wellness and education tool, not a diagnostic device:
// these checks only suggest when to talk to a clinician.

export function clinicalFlags({ summary, profile, needHours }) {
  const flags = [];
  const s = summary;

  if (s && s.count >= 7 && s.insomniaSymptomRate >= 3 / 7) {
    flags.push({
      level: 'warning',
      title: 'Trouble sleeping often',
      short: 'If this goes on for months, see a doctor. CBT-I therapy works best.',
      text:
        'On 3 or more nights per week you took over 30 minutes to fall asleep or were awake over 30 minutes during the night. ' +
        'If this lasts 3 months or more and affects your days, talk to a clinician. Cognitive behavioural therapy for insomnia (CBT-I) ' +
        'is the recommended first-line treatment, ahead of sleeping pills.',
      refs: ['qaseem2016', 'edinger2021'],
    });
  }

  if (s && s.count >= 7 && s.avgTst != null && s.avgTst < 6 * 60) {
    flags.push({
      level: 'warning',
      title: 'Very short sleep',
      short: 'Under 6 h on average. That affects your health.',
      text: 'You average under 6 hours of sleep. Regularly sleeping under 7 hours is linked with adverse health outcomes in adults.',
      refs: ['watson2015'],
    });
  }

  if (s && s.count >= 7 && s.avgTst != null && needHours && s.avgTst > (needHours + 2) * 60) {
    flags.push({
      level: 'info',
      title: 'Very long sleep',
      short: 'Still tired after long sleep? Mention it to a doctor.',
      text: 'You consistently sleep well beyond the recommended range. If you still feel unrefreshed, mention it to a clinician.',
      refs: ['watson2015'],
    });
  }

  const sb = profile?.screening || {};
  const osaSigns = ['snoring', 'tired', 'observedApnea', 'highBloodPressure'].filter((k) => sb[k]).length;
  if (sb.observedApnea || osaSigns >= 2) {
    flags.push({
      level: 'warning',
      title: 'Check for sleep apnea',
      short: 'Snoring plus tiredness can mean apnea. A doctor can test for it.',
      text:
        'Loud snoring, daytime tiredness, someone seeing you stop breathing in your sleep, or high blood pressure are STOP-Bang screening items. ' +
        'Two or more of these, or witnessed breathing pauses, warrant a medical evaluation. Sleep apnea is common and treatable.',
      refs: ['chung2016'],
    });
  }

  if (profile?.shiftWork) {
    flags.push({
      level: 'info',
      title: 'Shift work',
      short: 'This plan assumes daytime work. Shift work needs a special plan.',
      text:
        'The schedule logic assumes a day-active routine. Rotating or night shifts need a specialised plan; ask an occupational or sleep medicine clinician.',
      refs: ['auger2015'],
    });
  }

  return flags;
}
