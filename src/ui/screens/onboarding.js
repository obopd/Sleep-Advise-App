// SCREEN 1 — Onboarding. Each step says why it asks; everything except consent can be skipped.
import { h, icon } from '../dom.js';
import { toggle, field } from '../dialogs.js';
import { app, update } from '../store.js';
import { chips, multiChips } from '../kit.js';
import { sampleState } from '../sample.js';

export function renderOnboarding(root) {
  const s = app.state;
  const a = {
    consent: false,
    birthday: s.user.profile.birthday ?? '',
    schedule_type: null,
    work_wake_time: '',
    preferred_sleep_hours: null,
    mctq: { workdays: 5, workOnset: '', workWake: '', freeOnset: '', freeWake: '', freeAlarm: false },
    difficulties: [],
    tracking: { ...s.user.tracking },
    devices: [],
  };
  let step = 0;

  const finish = () => {
    const now = new Date().toISOString();
    const m = a.mctq;
    const mctqComplete = m.workOnset && m.workWake && m.freeOnset && m.freeWake;
    update({
      ...app.state,
      user: {
        ...app.state.user,
        onboarded: true,
        consent: { local_storage: now, research: null, cloud: null },
        tracking: a.tracking,
        profile: {
          ...app.state.user.profile,
          birthday: a.birthday || null,
          schedule_type: a.schedule_type,
          shift_work: ['rotating_shifts', 'night_shifts'].includes(a.schedule_type) ? 'yes' : a.schedule_type ? 'no' : 'unknown',
          work_wake_time: a.work_wake_time || null,
          preferred_sleep_hours: a.preferred_sleep_hours,
          mctq: mctqComplete ? m : null,
          sleep_difficulties: a.difficulties,
          devices: a.devices,
        },
      },
    });
  };

  const why = (t) => h('p', { class: 'why-line' }, icon('info'), h('span', {}, t));
  const time = (obj, k, label) => field(label, h('input', { type: 'time', class: 'time-input', value: obj[k], 'aria-label': label, onchange: (e) => { obj[k] = e.target.value; } }));

  const steps = [
    () => [
      h('div', { class: 'brand', 'aria-hidden': 'true' }, icon('moon')),
      h('h1', { class: 'display' }, 'A careful record of your sleep'),
      h('p', {}, 'Record sleep and the things around it (light, meals, caffeine, stress, activity) over weeks. The app shows your patterns, estimates sleep pressure, and suggests practical changes, always saying what is recorded and what is estimated.'),
      h('div', { class: 'banner' }, h('span', {}, 'It does not measure hormones. Melatonin and cortisol can only be measured with saliva or blood tests; your answers here cannot reveal them.')),
      h('div', { class: 'card' },
        h('b', {}, 'Privacy'),
        h('p', { class: 'explain' }, 'Your records are stored only on this phone. Nothing is uploaded, shared, or used for research unless you turn that on later. You can export or delete everything at any time.'),
        field('I agree to store my records on this device', toggle(a.consent, (v) => { a.consent = v; paint(); }, 'Consent'))),
    ],
    () => [
      h('h1', { class: 'display' }, 'Your age'),
      why('Recommended sleep amounts differ by age group (AASM, NSF). Used only for that.'),
      h('input', { type: 'date', class: 'ob-birthday', value: a.birthday, max: new Date().toISOString().slice(0, 10), 'aria-label': 'Birthday', onchange: (e) => { a.birthday = e.target.value; } }),
      h('p', { class: 'note' }, 'Your birthday keeps the age group up to date. Skip if you prefer.'),
    ],
    () => [
      h('h1', { class: 'display' }, 'Your schedule'),
      why('The planner works for any schedule, including nights and daytime sleep. Some estimates are not reliable for shift work, and the app will say so.'),
      h('div', { class: 'q' }, h('span', {}, 'My sleep schedule is'), chips([['regular', 'Regular'], ['irregular', 'Irregular'], ['rotating_shifts', 'Rotating shifts'], ['night_shifts', 'Night shifts']], a.schedule_type, (v) => { a.schedule_type = v; }, 'Schedule')),
      field('On work or school days I need to be up by', h('input', { type: 'time', class: 'time-input', value: a.work_wake_time, onchange: (e) => { a.work_wake_time = e.target.value; } })),
      h('div', { class: 'q' }, h('span', {}, 'Sleep I prefer (if you know)'), chips([[6.5, '6½ h'], [7, '7 h'], [7.5, '7½ h'], [8, '8 h'], [8.5, '8½ h'], [9, '9 h'], [null, 'Not sure']], a.preferred_sleep_hours, (v) => { a.preferred_sleep_hours = v; }, 'Preferred sleep')),
    ],
    () => [
      h('h1', { class: 'display' }, 'Typical sleep times'),
      why('These four times give your chronotype (Munich ChronoType Questionnaire). Your logged sleep will refine it.'),
      h('div', { class: 'group' }, h('div', { class: 'group-label' }, 'Work or school days'), time(a.mctq, 'workOnset', 'I fall asleep at'), time(a.mctq, 'workWake', 'I wake up at')),
      h('div', { class: 'group' }, h('div', { class: 'group-label' }, 'Free days'), time(a.mctq, 'freeOnset', 'I fall asleep at'), time(a.mctq, 'freeWake', 'I wake up at'), field('I use an alarm on free days', toggle(a.mctq.freeAlarm, (v) => { a.mctq.freeAlarm = v; }, 'Alarm'))),
      h('p', { class: 'note' }, '"Fall asleep" means actually asleep, not just in bed. Skip if your schedule changes too much.'),
    ],
    () => [
      h('h1', { class: 'display' }, 'Anything difficult?'),
      why('Helps the app point you to the right information. It is not a diagnosis, and nothing here is required.'),
      multiChips([['falling_asleep', 'Falling asleep'], ['staying_asleep', 'Staying asleep'], ['early_waking', 'Waking too early'], ['daytime_sleepiness', 'Sleepy in the day'], ['irregular_schedule', 'Irregular schedule'], ['snoring', 'Snoring or breathing pauses'], ['none', 'None']], a.difficulties, (v) => { a.difficulties = v; }, 'Difficulties'),
    ],
    () => [
      h('h1', { class: 'display' }, 'What to track'),
      why('Choose what you want to record. Each has a quick form; you never have to fill everything in. Medication data is sensitive and off unless you turn it on.'),
      ...[['light', 'Light exposure'], ['meals', 'Meals'], ['caffeine', 'Caffeine'], ['alcohol', 'Alcohol'], ['stress', 'Stress and energy'], ['activity', 'Physical activity'], ['medications', 'Medications and supplements']].map(([k, l]) => field(l, toggle(a.tracking[k], (v) => { a.tracking[k] = v; }, l))),
      h('div', { class: 'q' }, h('span', {}, 'Devices you may import from'), multiChips([['apple_watch', 'Apple Watch / iPhone'], ['light_sensor', 'Light sensor'], ['other_app', 'Another sleep app (CSV)'], ['none', 'None']], a.devices, (v) => { a.devices = v; }, 'Devices')),
      h('p', { class: 'note' }, 'Imports are files you choose (More → Import); nothing connects automatically.'),
    ],
  ];

  function paint() {
    const last = step === steps.length - 1;
    root.replaceChildren(
      h('div', { class: 'dots', 'aria-hidden': 'true' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
      h('div', { class: 'ob-body' }, steps[step]()),
      h('div', { class: 'ob-actions' },
        h('button', { type: 'button', class: 'big-btn', disabled: step === 0 && !a.consent ? true : null, onclick: () => { if (last) finish(); else { step++; paint(); } } }, last ? 'Start' : step === 0 ? 'Agree and continue' : 'Next'),
        step === 0
          ? h('button', { type: 'button', class: 'link-btn', onclick: () => update(sampleState()) }, 'Explore with sample data first')
          : h('div', { class: 'row-btns' },
              h('button', { type: 'button', class: 'link-btn', onclick: () => { step--; paint(); } }, 'Back'),
              h('button', { type: 'button', class: 'link-btn', onclick: () => { if (last) finish(); else { step++; paint(); } } }, 'Skip'))));
  }
  paint();
}
