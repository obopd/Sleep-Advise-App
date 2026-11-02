// App state and everything derived from it (features, models, rules), recomputed after
// each change. Screens call update(); the shell re-renders.
import { load, save } from './storage.js';
import { snack } from './dialogs.js';
import { computeFeatures } from '../core/features.js';
import { recommend } from '../core/recommend.js';
import { completeness } from '../core/quality.js';
import { runModels, predictionsToStore } from '../core/predict.js';
import { appendPredictions } from '../core/repo.js';
import { deviceTimeZone } from '../core/time.js';

const listeners = new Set();
export const app = { state: load(), d: null };

export function derive() {
  const now = Date.now();
  const s = app.state;
  const features = computeFeatures(s, now);
  const models = runModels(s, now, now);
  // Store one set of versioned predictions per day once the user has data (append-only history).
  if (s.user.onboarded && !s.meta.sample) {
    const fresh = predictionsToStore(s, models.records, now);
    if (fresh.length) {
      app.state = appendPredictions(s, fresh);
      save(app.state);
    }
  }
  app.d = { now, features, f: (n) => features.map[n]?.feature_value ?? null, cov: (n) => features.map[n]?.data_coverage ?? 0, models: models.results, recs: recommend(app.state, features, now), quality: completeness(app.state, now) };
  return app.d;
}

export function update(next, message) {
  app.state = next;
  if (!save(next)) snack('Could not save on this device. Storage may be full or blocked.');
  else if (message) snack(message);
  derive();
  listeners.forEach((fn) => fn());
}

export const onChange = (fn) => listeners.add(fn);

/** Keep the profile's time zone current (travel). Events keep the zone they were recorded in. */
export function syncTimeZone() {
  const tz = deviceTimeZone();
  if (app.state.user.timezone !== tz) update({ ...app.state, user: { ...app.state.user, timezone: tz } }, `Time zone is now ${tz}`);
}

derive();
