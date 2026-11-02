import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppleHealthXml, AppleHealthParser, parseAppleDate, sleepCsvToRecords, lightCsvToRecords, parseCsv } from '../src/core/importers.js';
import { entrain, simulate, cbtMinTimes, STEPS_PER_DAY, DT_H } from '../src/core/forger99.js';
import { emptyState, addRecord } from '../src/core/repo.js';
import { validateCollection } from '../src/core/validate.js';

const xml = `<?xml version="1.0"?><HealthData>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Phone" startDate="2026-10-01 22:30:00 -0700" endDate="2026-10-02 07:00:00 -0700" value="HKCategoryValueSleepAnalysisInBed"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-01 23:00:00 -0700" endDate="2026-10-02 02:00:00 -0700" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-02 02:20:00 -0700" endDate="2026-10-02 06:45:00 -0700" value="HKCategoryValueSleepAnalysisAsleepDeep"><MetadataEntry key="x" value="y"/></Record>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-02 14:00:00 -0700" endDate="2026-10-02 14:20:00 -0700" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKQuantityTypeIdentifierTimeInDaylight" sourceName="Watch" unit="min" startDate="2026-10-02 07:10:00 -0700" endDate="2026-10-02 07:40:00 -0700" value="30"/>
</HealthData>`;

test('apple: exact instants from offsets; stages → onset, final awakening, WASO; naps kept; daylight without lux', () => {
  assert.equal(new Date(parseAppleDate('2026-10-01 23:00:00 -0700')).toISOString(), '2026-10-02T06:00:00.000Z');
  const r = parseAppleHealthXml(xml);
  const watchMain = r.sleep_episodes.find((e) => e.quality_flags.device_source === 'Watch' && e.episode_type === 'main');
  assert.equal(watchMain.onset_time, '2026-10-02T06:00:00.000Z');
  assert.equal(watchMain.final_awakening_time, '2026-10-02T13:45:00.000Z');
  assert.equal(watchMain.wake_after_sleep_onset_minutes, 20);
  assert.ok(r.sleep_episodes.some((e) => e.episode_type === 'nap'));
  assert.ok(r.sleep_episodes.some((e) => e.quality_flags.in_bed_only)); // phone In Bed kept, no onset invented
  assert.equal(r.light_exposure_events[0].measurement_type, 'device_daylight');
  assert.equal(r.light_exposure_events[0].illuminance_lux, undefined);
});

test('apple: streaming in small chunks gives the same result; records validate; device vs device overlap flagged as info only for different sources', () => {
  const p = new AppleHealthParser();
  for (let i = 0; i < xml.length; i += 7) p.push(xml.slice(i, i + 7));
  assert.deepEqual(p.finish(), parseAppleHealthXml(xml));
  let s = emptyState(0, 'America/Los_Angeles');
  for (const e of parseAppleHealthXml(xml).sleep_episodes) {
    const res = addRecord(s, 'sleep_episodes', e, { source: 'import_apple_health' });
    assert.ok(!res.issues.some((i) => i.level === 'error'), JSON.stringify(res.issues));
    s = res.state;
  }
  // Phone "In Bed" and Watch stages overlap with the same import source → reported for review
  assert.ok(validateCollection('sleep_episodes', s.tables.sleep_episodes).some((i) => i.code === 'overlapping_sleep'));
});

test('sleep CSV: rows → timestamped episodes crossing midnight', () => {
  const r = sleepCsvToRecords('Date,Bedtime,Wake,Latency,Quality,Free day\n2026-10-01,11:15 PM,7:05 AM,20,4,no\n10/02/2026,00:40,08:30,10,5,yes\nbad,,,\n', 'America/New_York');
  assert.equal(r.nights, 2);
  assert.equal(r.skipped, 1);
  const [a, b] = r.tables.sleep_episodes;
  assert.equal(a.start_time, '2026-10-02T03:15:00.000Z');
  assert.equal(a.final_awakening_time, '2026-10-02T11:05:00.000Z');
  assert.equal(b.start_time, '2026-10-03T04:40:00.000Z');
  assert.equal(b.day_type, 'free_day');
  assert.throws(() => sleepCsvToRecords('foo,bar\n1,2', 'UTC'));
});

test('light CSV: 10-min bins, local times flagged, explicit offsets exact, implausible values rejected', () => {
  const r = lightCsvToRecords('Device: X\nTimestamp,Lux\n2026-10-02 07:01:00,100\n2026-10-02T07:05:00,300\n2026-10-02 07:12:00,50\n2026-10-02 07:13:00,-4\n', 'UTC');
  assert.equal(r.samples, 3);
  assert.equal(r.rejected, 1);
  assert.equal(r.records[0].illuminance_lux, 200);
  assert.equal(r.records[0].start_time, '2026-10-02T07:00:00.000Z');
  assert.equal(r.records[0].measurement_quality.timezone_assumed, true);
  const z = lightCsvToRecords('timestamp,lux\n2026-10-02T07:01:00+09:00,10\n', 'UTC');
  assert.equal(z.records[0].start_time, '2026-10-01T22:00:00.000Z');
  assert.equal(z.records[0].measurement_quality.timezone_assumed, false);
  assert.deepEqual(parseCsv('a;b\n"x;1";2\n'), [['a', 'b'], ['x;1', '2']]);
});

function dayLux(wakeH, sleepH, lux) {
  return new Float64Array(STEPS_PER_DAY).map((_, i) => {
    const t = i * DT_H;
    const awake = sleepH > wakeH ? t >= wakeH && t < sleepH : t >= wakeH || t < sleepH;
    return awake ? lux : 0;
  });
}

test('Forger 1999 model: physiological phase; morning light advances, evening light delays (PRC)', () => {
  const base = dayLux(7, 23, 250);
  const init = entrain(base, 30);
  const cbt0 = cbtMinTimes(simulate(new Float64Array([...base, ...base, ...base]), init).x).at(-1) % 24;
  assert.ok(cbt0 > 3.5 && cbt0 < 5.5, `CBTmin ${cbt0}`);
  const pulse = (h) => {
    const d = Float64Array.from(base);
    for (let i = Math.round(h / DT_H); i < Math.round((h + 2) / DT_H); i++) d[i] = 10000;
    return cbtMinTimes(simulate(new Float64Array([...d, ...base, ...base]), init).x).at(-1) % 24;
  };
  assert.ok(pulse(7) < cbt0 - 0.1);
  assert.ok(pulse(20) > cbt0 + 0.1);
});
