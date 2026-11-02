// App state shared by all screens. Screens call update(); the app re-renders.
import { buildPlan } from '../engine/recommend.js';
import { load, save } from './storage.js';
import { snack } from './dialogs.js';
import { todayKey } from './dom.js';

const listeners = new Set();

export const app = {
  state: load(),
  plan: null,
};

export function computePlan() {
  const s = app.state;
  app.plan = buildPlan({ profile: s.profile, entries: s.entries, measured: s.measured, lightLog: s.lightLog ?? {}, today: todayKey() });
  return app.plan;
}

export function update(next, message) {
  app.state = next;
  if (!save(next)) snack('Could not save on this device.');
  else if (message) snack(message);
  computePlan();
  listeners.forEach((fn) => fn());
}

export const onChange = (fn) => listeners.add(fn);

computePlan();
