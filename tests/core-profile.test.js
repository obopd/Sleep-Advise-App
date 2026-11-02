import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mctq, classify } from '../src/core/chronotype.js';
import { parseHHMM, fmtClock } from '../src/core/clock.js';
import { sleepNeedForAge, resolveSleepNeed, ageFromBirthday, profileAge } from '../src/core/sleepNeed.js';
import { REFERENCES } from '../src/core/references.js';
import { readFileSync, readdirSync } from 'node:fs';

const h = parseHHMM;

test('MCTQ: MSFsc corrects free-day oversleep; social jetlag', () => {
  const r = mctq({ work: { onset: h('23:30'), wake: h('06:30') }, free: { onset: h('01:00'), wake: h('10:00') }, workdays: 5 });
  assert.equal(fmtClock(r.MSW), '03:00');
  assert.equal(fmtClock(r.MSF), '05:30');
  assert.equal(r.socialJetlag, 150);
  assert.equal(fmtClock(r.MSFsc), '04:47');
  assert.equal(classify(r.MSFsc), 'Intermediate');
});

test('sleep need by age group and birthday', () => {
  const today = new Date(2026, 10, 2);
  assert.equal(ageFromBirthday('1996-11-02', today), 30);
  assert.equal(ageFromBirthday('1996-11-03', today), 29);
  assert.equal(profileAge({ age: 40 }, today), 40);
  assert.equal(sleepNeedForAge(15).target, 9);
  assert.equal(sleepNeedForAge(30).min, 7);
  assert.equal(sleepNeedForAge(70).max, 8);
  const r = resolveSleepNeed({ age: 30, personalNeedHours: 5 });
  assert.equal(r.target, 7);
});

test('every reference key cited anywhere in src/core exists', () => {
  const files = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : files.push(`${d}/${e.name}`)));
  walk(new URL('../src/core', import.meta.url).pathname);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/refs: \[([^\]]*)\]/g)) {
      for (const k of m[1].match(/'([a-z0-9]+)'/g) ?? []) assert.ok(REFERENCES[k.replace(/'/g, '')], `${f}: ${k}`);
    }
  }
});
