import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHHMM, fmtClock, circularMean, circularSD, signedDiff, addDays,
  computeNight, summarize, sleepRegularityIndex, validNights,
  mctq, classify,
  estimatePhase, melatoninAt, cortisolAt, processS, dailyProfile, circadianAlertingAt,
  sleepNeedForAge, resolveSleepNeed,
  evaluateHabits, caffeineCutoffHours, personalAssociations,
  buildPlan, transitionSteps, REFERENCES,
} from '../src/engine/index.js';

const h = (s) => parseHHMM(s);

function diary(n, { bed = '23:00', wake = '07:00', latency = 15, start = '2026-10-01', extra = () => ({}) } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    date: addDays(start, i),
    bedTime: typeof bed === 'function' ? bed(i) : bed,
    wakeTime: typeof wake === 'function' ? wake(i) : wake,
    latencyMin: latency,
    wasoMin: 10,
    quality: 4,
    freeDay: i % 7 >= 5,
    ...extra(i),
  }));
}

test('time: circular mean handles midnight', () => {
  assert.equal(circularMean([h('23:30'), h('00:30')]), 0);
  assert.equal(fmtClock(circularMean([h('23:00'), h('01:00')])), '00:00');
  assert.equal(signedDiff(h('23:00'), h('01:00')), 120);
  assert.equal(signedDiff(h('01:00'), h('23:00')), -120);
  assert.ok(circularSD([h('23:00'), h('23:00')]) < 1);
  assert.ok(Math.abs(circularSD([h('22:00'), h('00:00')]) - 60) < 2);
});

test('sleep metrics: duration and efficiency across midnight', () => {
  const n = computeNight({ date: '2026-10-01', bedTime: '23:00', latencyMin: 20, wakeTime: '07:00', outOfBedTime: '07:20', wasoMin: 30 });
  assert.equal(n.onset, h('23:20'));
  assert.equal(n.sleepPeriod, 460);
  assert.equal(n.tst, 430);
  assert.equal(n.tib, 500);
  assert.equal(Math.round(n.efficiency * 100), 86);
  assert.equal(fmtClock(n.midSleep), '03:10');
});

test('SRI is 100 for a perfectly regular schedule and lower when irregular', () => {
  const regular = validNights(diary(7));
  assert.equal(Math.round(sleepRegularityIndex(regular)), 100);
  const irregular = validNights(diary(7, { bed: (i) => (i % 2 ? '23:00' : '02:00'), wake: (i) => (i % 2 ? '07:00' : '10:00') }));
  assert.ok(sleepRegularityIndex(irregular) < 70);
});

test('MCTQ: MSFsc corrects oversleep and computes social jetlag', () => {
  const r = mctq({ work: { onset: h('23:30'), wake: h('06:30') }, free: { onset: h('01:00'), wake: h('10:00') }, workdays: 5 });
  assert.equal(r.SDw, 420);
  assert.equal(r.SDf, 540);
  assert.equal(fmtClock(r.MSW), '03:00');
  assert.equal(fmtClock(r.MSF), '05:30');
  assert.equal(r.socialJetlag, 150);
  // SDweek = (420*5 + 540*2)/7 = 454.29 ; MSFsc = 05:30 - (540-454.29)/2 = 04:47
  assert.equal(fmtClock(r.MSFsc), '04:47');
  assert.equal(classify(r.MSFsc), 'Intermediate');
});

test('phase: DLMO ≈ habitual onset − 2 h; measured DLMO overrides', () => {
  const nights = validNights(diary(10, { bed: '23:45', latency: 15 }));
  const p = estimatePhase({ nights });
  assert.equal(p.source, 'diary');
  assert.equal(fmtClock(p.dlmo), '22:00');
  assert.equal(fmtClock(p.sleepGate), '00:00');
  assert.equal(fmtClock(p.cbtMin), '05:00');
  const m = estimatePhase({ nights, measured: [{ date: '2026-10-08', dlmo: '21:15' }] });
  assert.equal(m.source, 'measured');
  assert.equal(fmtClock(m.dlmo), '21:15');
});

test('phase falls back to questionnaire', () => {
  const p = estimatePhase({ profile: { mctq: { workOnset: '23:00', freeOnset: '23:00', workdays: 5 } } });
  assert.equal(p.source, 'questionnaire');
  assert.equal(fmtClock(p.dlmo), '21:00');
});

test('hormone curves have physiologically placed peaks', () => {
  const dlmo = h('21:00');
  const wake = h('07:00');
  let melPeak = 0, melMax = 0, corPeak = 0, corMax = 0;
  for (let t = 0; t < 1440; t += 5) {
    const m = melatoninAt(t, dlmo);
    if (m > melMax) { melMax = m; melPeak = t; }
    const c = cortisolAt(t, dlmo, wake);
    if (c > corMax) { corMax = c; corPeak = t; }
  }
  assert.equal(fmtClock(melPeak), '01:00'); // DLMO + 4 h
  assert.ok(corPeak >= h('07:20') && corPeak <= h('07:50'), `cortisol peak ${fmtClock(corPeak)}`);
  assert.ok(melatoninAt(h('14:00'), dlmo) < 0.05);
  // circadian alerting peaks in WMZ, troughs at CBTmin
  assert.ok(circadianAlertingAt(h('19:30'), dlmo) > 0.99);
  assert.ok(circadianAlertingAt(h('04:00'), dlmo) < 0.01);
});

test('process S rises while awake and falls while asleep', () => {
  const S = processS(h('23:00'), h('07:00'));
  assert.ok(S(h('22:55')) > S(h('12:00')));
  assert.ok(S(h('06:55')) < S(h('23:05')));
  const prof = dailyProfile({ dlmo: h('21:00') }, { onset: h('23:00'), wake: h('07:00') }, { brightLightUntil: h('23:00') });
  assert.equal(prof.length, 145);
  assert.ok(prof.some((p) => p.lightSuppressed));
});

test('sleep need by age', () => {
  assert.equal(sleepNeedForAge(15).target, 9);
  assert.equal(sleepNeedForAge(30).min, 7);
  assert.equal(sleepNeedForAge(70).max, 8);
  const r = resolveSleepNeed({ age: 30, personalNeedHours: 5 });
  assert.equal(r.target, 7);
  assert.ok(r.clamped);
});

test('habits: caffeine cutoff and late habits flagged', () => {
  assert.equal(caffeineCutoffHours(100), 8.8);
  assert.equal(caffeineCutoffHours(220), 13.2);
  const e = evaluateHabits({
    date: '2026-10-01', bedTime: '23:00', wakeTime: '07:00',
    caffeine: [{ time: '16:00', mg: 95 }], alcoholDrinks: 2, alcoholLastTime: '21:30',
    exerciseEnd: '22:30', exerciseIntensity: 'vigorous', morningLightMin: 5, screensUntil: '22:50',
    lastMealTime: '21:00', napStart: '17:00', napMin: 20,
  });
  assert.ok(e.flags.lateCaffeine);
  assert.ok(Math.abs(e.values.caffeineAtBedMg - 95 * 0.5 ** (7 / 5)) < 0.01);
  assert.ok(e.flags.lateAlcohol);
  assert.ok(e.flags.lateVigorousExercise);
  assert.ok(e.flags.lowMorningLight);
  assert.ok(e.flags.lateScreens);
  assert.ok(e.flags.lateMeal);
  assert.ok(e.flags.longOrLateNap);
  const ok = evaluateHabits({ date: '2026-10-01', bedTime: '23:00', wakeTime: '07:00', caffeine: [{ time: '08:00', mg: 95 }], morningLightMin: 40 });
  assert.equal(ok.flags.lateCaffeine, false);
  assert.equal(ok.flags.lowMorningLight, false);
});

test('personal associations compare nights with vs without a habit', () => {
  const entries = diary(10, {
    extra: (i) => ({
      caffeine: [{ time: i % 2 ? '17:00' : '08:00', mg: 100 }],
      latencyMin: i % 2 ? 45 : 10,
    }),
  });
  const a = personalAssociations(entries).find((x) => x.habit === 'lateCaffeine');
  assert.ok(a);
  assert.equal(a.deltaLatency, 35);
  assert.equal(a.confoundedByFreeDays, false);
  const conf = personalAssociations(diary(14, { extra: (i) => ({ alcoholDrinks: i % 7 >= 5 ? 2 : 0 }) })).find((x) => x.habit === 'lateAlcohol');
  assert.equal(conf.nWith, 4);
  assert.equal(conf.confoundedByFreeDays, true); // alcohol only on free nights → flagged

});

test('plan: late chronotype with early work constraint gets gradual advance', () => {
  const entries = diary(14, { bed: '01:00', wake: '07:00' });
  const plan = buildPlan({ profile: { age: 30, workWake: '07:00' }, entries, today: '2026-10-15' });
  assert.ok(plan.ready);
  assert.equal(plan.alignment.status, 'advance');
  assert.equal(fmtClock(plan.schedule.wake), '07:00');
  assert.equal(fmtClock(plan.schedule.sleepOnset), '23:00');
  assert.equal(fmtClock(plan.schedule.lightsOut), '22:45');
  // natural onset = 01:15 onset (01:00 + 15 latency) → need 135 min advance → 9 steps of 15 min
  assert.equal(plan.alignment.steps.length, 9);
  assert.equal(fmtClock(plan.alignment.steps.at(-1).lightsOut), '22:45');
  assert.ok(plan.recommendations[0].title.includes('earlier'));
  assert.ok(plan.recommendations.some((r) => r.title.startsWith('Sleep ') && r.title.endsWith('more')));
});

test('plan: aligned schedule without constraint', () => {
  const plan = buildPlan({ profile: { age: 30 }, entries: diary(10, { bed: '22:45', wake: '07:00' }) });
  assert.equal(plan.alignment.status, 'aligned');
  assert.equal(fmtClock(plan.schedule.sleepOnset), '23:00');
  assert.equal(fmtClock(plan.schedule.wake), '07:00');
  assert.ok(plan.timeline.length >= 7);
});

test('plan: not ready without any data', () => {
  assert.equal(buildPlan({}).ready, false);
});

test('transition steps move 15 min/day', () => {
  const s = transitionSteps(h('01:00'), h('00:00'), h('08:00'), '2026-11-01');
  assert.equal(s.length, 4);
  assert.equal(s[0].date, '2026-11-01');
  assert.equal(fmtClock(s[0].lightsOut), '00:30');
  assert.equal(fmtClock(s[3].wake), '08:00');
});

test('every cited reference key exists', async () => {
  const plan = buildPlan({
    profile: { age: 30, workWake: '06:30', screening: { snoring: true, tired: true } },
    entries: diary(14, { bed: '01:30', wake: (i) => (i % 2 ? '06:30' : '10:00'), latency: 45,
      extra: () => ({ caffeine: [{ time: '18:00', mg: 200 }], alcoholDrinks: 3, morningLightMin: 0, screensUntil: '01:20', napMin: 60, napStart: '17:00' }) }),
  });
  const keys = [...plan.timeline, ...plan.recommendations, ...plan.flags].flatMap((x) => x.refs);
  for (const k of keys) assert.ok(REFERENCES[k], `missing reference ${k}`);
  assert.ok(plan.flags.some((f) => f.title.includes('apnea')));
  assert.ok(plan.flags.some((f) => f.title.includes('Trouble sleeping')));
});

test('every timeline item and recommendation has plain short text and an icon', () => {
  const plan = buildPlan({
    profile: { age: 30, workWake: '06:30' },
    entries: diary(14, { bed: '01:30', wake: '06:30', extra: () => ({ caffeine: [{ time: '18:00', mg: 200 }], morningLightMin: 0, screensUntil: '01:20' }) }),
  });
  for (const x of [...plan.timeline, ...plan.recommendations]) {
    assert.ok(x.icon, `icon missing: ${x.title}`);
    assert.ok(x.short && x.short.length < 120, `short missing/too long: ${x.title}`);
    assert.ok(x.title.length <= 40, `title too long: ${x.title}`);
  }
  // while shifting, tonight's bedtime is the first step, later than the goal
  assert.notEqual(plan.schedule.tonightLightsOut, plan.schedule.lightsOut);
});
