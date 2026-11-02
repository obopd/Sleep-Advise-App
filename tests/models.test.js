import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entrain, simulate, cbtMinTimes, STEPS_PER_DAY, DT_H,
  modelPhase, predictShift, routineDay, LUX,
  parseAppleHealthXml, AppleHealthParser, parseSleepCsv, parseLightCsv, parseCsv, mergeEntries, mergeLightLog,
  estimatePhase, validNights, buildPlan, parseHHMM, fmtClock, addDays,
} from '../src/engine/index.js';

const h = parseHHMM;
const hours = (clockMin) => clockMin / 60;

function dayLux(wakeH, sleepH, lux) {
  return new Float64Array(STEPS_PER_DAY).map((_, i) => {
    const t = i * DT_H;
    const awake = sleepH > wakeH ? t >= wakeH && t < sleepH : t >= wakeH || t < sleepH;
    return awake ? lux : 0;
  });
}

test('Forger99: entrained phase is physiological for a 23:00–07:00 sleeper', () => {
  const day = dayLux(7, 23, 250);
  const x = simulate(new Float64Array([...day, ...day]), entrain(day, 30)).x;
  const cbt = cbtMinTimes(x).at(-1) % 24;
  // CBTmin is typically ~2–3 h before habitual wake (textbook ~04:00–05:00)
  assert.ok(cbt > 3.5 && cbt < 5.5, `CBTmin ${cbt}`);
});

test('Forger99: later sleep schedule gives later phase', () => {
  const early = dayLux(7, 23, 250);
  const late = dayLux(9, 1, 250);
  const cbt = (d) => cbtMinTimes(simulate(new Float64Array([...d, ...d]), entrain(d, 30)).x).at(-1) % 24;
  const diff = cbt(late) - cbt(early);
  assert.ok(diff > 1.5 && diff < 2.5, `diff ${diff}`);
});

test('Forger99: morning bright light advances, evening bright light delays (PRC)', () => {
  const base = dayLux(7, 23, 250);
  const init = entrain(base, 30);
  const cbt0 = cbtMinTimes(simulate(new Float64Array([...base, ...base, ...base]), init).x).at(-1) % 24;
  const withPulse = (startH) => {
    const d = Float64Array.from(base);
    for (let i = Math.round(startH / DT_H); i < Math.round((startH + 2) / DT_H); i++) d[i] = 10000;
    return cbtMinTimes(simulate(new Float64Array([...d, ...base, ...base]), init).x).at(-1) % 24;
  };
  assert.ok(withPulse(7) < cbt0 - 0.1, 'morning light should advance');
  assert.ok(withPulse(20) > cbt0 + 0.1, 'evening light should delay');
});

const diaryNight = (date, bed = '23:00', wake = '07:00') => ({ date, bedTime: bed, wakeTime: wake, latencyMin: 15, morningLightMin: 20 });

test('modelPhase uses measured light and reports coverage', () => {
  const entries = Array.from({ length: 7 }, (_, i) => diaryNight(addDays('2026-10-01', i)));
  const m = modelPhase(entries);
  assert.ok(m);
  assert.equal(m.measuredFraction, 0);
  const dlmoH = hours(m.dlmo);
  assert.ok(dlmoH > 20 && dlmoH < 23, `dlmo ${fmtClock(m.dlmo)}`);
  // add full-coverage measured light identical to a 250 lux day
  const lightLog = {};
  for (let i = 0; i < 9; i++) lightLog[addDays('2026-10-01', i)] = Array.from({ length: 144 }, (_, b) => (b >= 42 && b < 138 ? 250 : 0));
  const m2 = modelPhase(entries, lightLog);
  assert.ok(m2.measuredFraction > 0.9);
  const p = estimatePhase({ nights: validNights(entries), entries, lightLog });
  assert.equal(p.source, 'light-model');
});

test('predictShift: fixed early wake + morning light + dim evening advances the clock', () => {
  const current = { bed: h('01:00'), out: h('09:00'), morningLightMin: 0, screensUntil: null, napStart: null, napMin: 0 };
  const steps = Array.from({ length: 8 }, (_, i) => ({ lightsOut: h('01:00') - 15 * (i + 1), wake: h('07:00') }));
  const days = predictShift(current, steps);
  assert.equal(days.length, 15);
  assert.ok(days.at(-1).shiftMin < -60, `final shift ${days.at(-1).shiftMin}`);
  // Never shifts more than ~1.5 h in a single day
  for (let i = 1; i < days.length; i++) assert.ok(Math.abs(days[i].shiftMin - days[i - 1].shiftMin) < 90);
});

test('routineDay paints dark sleep and outdoor morning light', () => {
  const d = routineDay({ bed: h('23:00'), out: h('07:00'), morningLightMin: 30, screensUntil: null, napStart: null, napMin: 0 });
  const at = (clock) => d[Math.floor(h(clock) / 6)];
  assert.equal(at('03:00'), LUX.dark);
  assert.equal(at('07:10'), LUX.outdoor);
  assert.equal(at('12:00'), LUX.indoor);
  assert.equal(at('21:00'), LUX.evening);
});

const appleXml = `<?xml version="1.0"?>
<HealthData locale="en_US">
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Phone" startDate="2026-10-01 22:30:00 -0700" endDate="2026-10-02 07:00:00 -0700" value="HKCategoryValueSleepAnalysisInBed"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-01 22:40:00 -0700" endDate="2026-10-01 23:00:00 -0700" value="HKCategoryValueSleepAnalysisInBed"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-01 23:00:00 -0700" endDate="2026-10-02 02:00:00 -0700" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-02 02:00:00 -0700" endDate="2026-10-02 02:20:00 -0700" value="HKCategoryValueSleepAnalysisAwake"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-02 02:20:00 -0700" endDate="2026-10-02 04:00:00 -0700" value="HKCategoryValueSleepAnalysisAsleepDeep">
  <MetadataEntry key="x" value="y"/>
 </Record>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-02 04:00:00 -0700" endDate="2026-10-02 06:45:00 -0700" value="HKCategoryValueSleepAnalysisAsleepREM"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-02 14:00:00 -0700" endDate="2026-10-02 14:20:00 -0700" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKQuantityTypeIdentifierTimeInDaylight" sourceName="Watch" unit="min" startDate="2026-10-02 07:10:00 -0700" endDate="2026-10-02 07:40:00 -0700" value="30"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" startDate="2026-10-02 07:10:00 -0700" endDate="2026-10-02 07:40:00 -0700" value="900"/>
</HealthData>`;

test('Apple Health: sleep stages become one night with latency and WASO', () => {
  const r = parseAppleHealthXml(appleXml);
  assert.equal(r.nights, 1);
  const e = r.entries[0];
  assert.equal(e.date, '2026-10-01');
  assert.equal(e.bedTime, '22:40');
  assert.equal(e.latencyMin, 20);
  assert.equal(e.wakeTime, '06:45');
  assert.equal(e.wasoMin, 20);
  assert.equal(e.morningLightMin, 30);
  assert.equal(r.lightLog['2026-10-02'][43], LUX.outdoor); // 07:10 bin
});

test('Apple Health: streaming in tiny chunks gives the same result', () => {
  const p = new AppleHealthParser();
  for (let i = 0; i < appleXml.length; i += 7) p.push(appleXml.slice(i, i + 7));
  assert.deepEqual(p.finish().entries, parseAppleHealthXml(appleXml).entries);
});

test('CSV parser handles quotes and semicolons', () => {
  assert.deepEqual(parseCsv('a;b\n"x;1";"he said ""hi"""\n'), [['a', 'b'], ['x;1', 'he said "hi"']]);
});

test('sleep diary CSV with aliases and 12 h times', () => {
  const r = parseSleepCsv('Date,Bedtime,Wake,Latency,Quality,Free day\n2026-10-01,11:15 PM,7:05 AM,20,4,no\n10/02/2026,23:40,08:30,10,5,yes\nbad,,,\n');
  assert.equal(r.entries.length, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.entries[0].bedTime, '23:15');
  assert.equal(r.entries[0].wakeTime, '07:05');
  assert.equal(r.entries[1].date, '2026-10-02');
  assert.equal(r.entries[1].freeDay, true);
  assert.throws(() => parseSleepCsv('foo,bar\n1,2'));
});

test('light CSV aggregates to 10-min bins (single timestamp and split date/time)', () => {
  const a = parseLightCsv('Device: X\nTimestamp,Lux\n2026-10-02 07:01:00,100\n2026-10-02T07:05:00,300\n2026-10-02 07:12:00,50\n');
  assert.equal(a.samples, 3);
  assert.equal(a.lightLog['2026-10-02'][42], 200);
  assert.equal(a.lightLog['2026-10-02'][43], 50);
  const b = parseLightCsv('Date,Time,White Light\n10/02/2026,11:05 PM,12\n');
  assert.equal(b.lightLog['2026-10-02'][138], 12);
});

test('merging keeps user habits and prefers device timing', () => {
  const merged = mergeEntries(
    [{ date: '2026-10-01', bedTime: '23:00', wakeTime: '07:00', caffeine: [{ time: '08:00', mg: 95 }], freeDay: false }],
    [{ date: '2026-10-01', bedTime: '22:40', wakeTime: '06:45', freeDay: true }],
  );
  assert.equal(merged[0].bedTime, '22:40');
  assert.equal(merged[0].caffeine.length, 1);
  assert.equal(merged[0].freeDay, false);
  const log = mergeLightLog({ d: [1, null] }, { d: [null, 5] });
  assert.deepEqual(log.d, [1, 5]);
});

test('plan includes a model prediction for a phase advance', () => {
  const entries = Array.from({ length: 14 }, (_, i) => diaryNight(addDays('2026-10-01', i), '01:00', '07:00'));
  const plan = buildPlan({ profile: { age: 30, workWake: '07:00' }, entries });
  assert.equal(plan.alignment.status, 'advance');
  const pred = plan.alignment.prediction;
  assert.ok(pred && pred.days.length >= plan.alignment.steps.length);
  assert.ok(pred.finalShiftMin < 0);
});
