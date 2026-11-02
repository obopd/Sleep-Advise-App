// First launch: four short steps. Enough for a first plan before any night is logged.
import { h, icon } from './dom.js';
import { toggle, timeInput, field } from './dialogs.js';
import { app, update } from './store.js';
import { sampleState } from './sample.js';
import { todayKey } from './dom.js';

export function renderOnboarding(root) {
  const a = {
    age: app.state.profile.age ?? '',
    mctq: { workdays: 5, workOnset: '23:30', workWake: '07:00', freeOnset: '00:30', freeWake: '08:30', freeAlarm: false },
    workWake: '',
  };
  let step = 0;

  const finish = () => update({ ...app.state, profile: { ...app.state.profile, age: a.age ? Number(a.age) : '', mctq: a.mctq, workWake: a.workWake, onboarded: true } });

  const steps = [
    () => {
      const age = h('input', { type: 'number', inputmode: 'numeric', class: 'ob-age', min: 6, max: 110, placeholder: '25', value: a.age, 'aria-label': 'Age', oninput: (e) => { a.age = e.target.value; } });
      return [
        h('div', { class: 'brand', 'aria-hidden': 'true' }, icon('moon')),
        h('h1', { class: 'display' }, 'Let’s find your sleep rhythm'),
        h('p', {}, 'Four quick questions. Your answers set a first plan; logging a few nights makes it yours.'),
        h('p', { style: 'color:var(--fg);font-weight:600' }, 'How old are you?'),
        age,
      ];
    },
    () => [
      h('h1', { class: 'display' }, 'On workdays…'),
      h('p', {}, 'A normal recent week. "Asleep" means actually asleep, not just in bed.'),
      h('div', { class: 'group' },
        field('I fall asleep at', timeInput(a.mctq.workOnset, (v) => { a.mctq.workOnset = v; }, 'Workdays asleep at')),
        field('I wake up at', timeInput(a.mctq.workWake, (v) => { a.mctq.workWake = v; }, 'Workdays wake at'))),
    ],
    () => [
      h('h1', { class: 'display' }, 'On free days…'),
      h('p', {}, 'Days without work or school.'),
      h('div', { class: 'group' },
        field('I fall asleep at', timeInput(a.mctq.freeOnset, (v) => { a.mctq.freeOnset = v; }, 'Free days asleep at')),
        field('I wake up at', timeInput(a.mctq.freeWake, (v) => { a.mctq.freeWake = v; }, 'Free days wake at')),
        field('I use an alarm', toggle(a.mctq.freeAlarm, (v) => { a.mctq.freeAlarm = v; }, 'Alarm on free days'))),
    ],
    () => {
      if (!a.workWake) a.workWake = a.mctq.workWake;
      return [
        h('h1', { class: 'display' }, 'Must you be up by a set time?'),
        h('p', {}, 'For work or school. Your bedtime is planned around it.'),
        h('div', { class: 'group' }, field('Up by', timeInput(a.workWake, (v) => { a.workWake = v; }, 'Up by'))),
        h('button', { type: 'button', class: 'link-btn', style: 'justify-self:start', onclick: () => { a.workWake = ''; finish(); } }, 'No fixed time'),
      ];
    },
  ];

  const paint = () => {
    root.replaceChildren(
      h('div', { class: 'dots', 'aria-hidden': 'true' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
      h('div', { class: 'ob-body' }, steps[step]()),
      h('div', { class: 'ob-actions' },
        h('button', { type: 'button', class: 'big-btn', onclick: () => {
          if (step < steps.length - 1) { step++; paint(); } else finish();
        } }, step < steps.length - 1 ? 'Next' : 'Show my plan'),
        step === 0
          ? h('button', { type: 'button', class: 'link-btn', onclick: () => update({ ...sampleState(todayKey()), settings: app.state.settings, profile: { ...sampleState(todayKey()).profile, onboarded: true } }, 'Sample data loaded') }, 'Look around with sample data')
          : h('button', { type: 'button', class: 'link-btn', onclick: () => { step--; paint(); } }, 'Back')));
  };
  paint();
}
