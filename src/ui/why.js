// "Why?" sheets: the plain one-liner on screen, the evidence one tap away.
import { h, localizeTimes } from './dom.js';
import { openSheet } from './dialogs.js';
import { REFERENCES } from '../core/references.js';

const GRADE_TEXT = {
  A: 'Strong evidence',
  B: 'Good evidence',
  C: 'Early evidence',
};

export function evidenceBadge(grade) {
  if (!grade) return null;
  return h('span', { class: `evidence ${grade}` }, h('i'), GRADE_TEXT[grade]);
}

export function refList(refs = []) {
  const items = refs.filter((r) => REFERENCES[r]);
  if (!items.length) return null;
  return h('div', { class: 'q' }, h('span', {}, 'Sources'), h('ol', { class: 'refs' }, items.map((r) => h('li', {}, REFERENCES[r]))));
}

/** item: { title, short?, detail? | text?, grade?, refs? } */
export function openWhy(item) {
  openSheet({
    title: localizeTimes(item.title),
    body: h('div', { class: 'why', style: 'display:grid;gap:14px' },
      item.short ? h('p', {}, h('b', {}, localizeTimes(item.short))) : null,
      h('p', { class: 'muted' }, localizeTimes(item.detail ?? item.text ?? '')),
      evidenceBadge(item.grade),
      refList(item.refs)),
  });
}

export function openHowItWorks() {
  const sec = (title, text, refs) => h('div', { class: 'how' }, h('h3', { class: 'display' }, title), h('p', {}, text), refs ? h('p', { class: 'note' }, refs.map((r) => REFERENCES[r]?.split('.')[0]).join(' · ')) : null);
  openSheet({
    title: 'How it works',
    body: h('div', { style: 'display:grid;gap:18px' },
      sec('Your body clock', 'Your body releases melatonin in the evening and cortisol in the morning on a roughly 24-hour clock. The app estimates that clock from when you sleep: melatonin usually starts rising about 2 hours before you fall asleep.', ['burgess2003', 'sletten2010']),
      sec('Not a blood test', 'These are estimates, usually within about an hour. Only a saliva or blood test measures hormones. If you have a test result, add it in Settings and the app will use it.', ['cheng2021']),
      sec('Light moves the clock', 'Morning daylight moves your clock earlier; bright light at night moves it later. That is why your plan says when to go outside and when to dim the lights.', ['khalsa2003', 'brown2022']),
      sec('Sleep pressure', 'The longer you are awake, the sleepier you get. Sleep clears it. Long or late naps use some of it up.', ['borbely1982', 'daan1984']),
      sec('Your plan', 'Bedtime is set from your age-based sleep need and when you must be up. If your clock is later than that, the app moves bedtime 15 minutes a day and uses a light-based body clock model to predict how long it takes.', ['watson2015', 'forger1999', 'eastman2009']),
      sec('Your data', 'Everything stays on this phone. The app is for wellbeing and learning, not a medical device. If a red flag shows up, talk to a doctor.', null)),
  });
}
