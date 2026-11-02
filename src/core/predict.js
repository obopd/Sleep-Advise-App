// Turns model outputs into versioned, append-only model_predictions records (Layer 4 → storage).
// Unavailable predictions are stored with predicted_value = null and a status, never as 0.

import { estimateSleepPressure, SLEEP_PRESSURE_MODEL } from './models/sleepPressure.js';
import { CIRCADIAN_MODELS } from './models/circadian.js';
import { toIso, toMs, HOUR_MS } from './time.js';
import { uuid } from './repo.js';

function record(state, model, result, T, now) {
  const ok = result.status === 'ok';
  return {
    id: uuid(),
    user_id: state.user.id,
    prediction_timestamp: toIso(T),
    target_variable: model.target,
    predicted_value: ok ? Math.round(result.value * 1000) / 1000 : null,
    predicted_unit: model.unit,
    prediction_interval_lower: null, // no validated interval exists for these models
    prediction_interval_upper: null,
    confidence_or_quality_status: result.status,
    model_name: model.name,
    model_version: model.version,
    input_data_window: { ...result.window, details: result.details ?? (result.reason ? { reason: result.reason } : undefined), tz: state.user.timezone },
    input_data_coverage: result.coverage == null ? null : Math.round(result.coverage * 1000) / 1000,
    validation_status: model.validation_status,
    generated_at: toIso(now),
  };
}

/** Run every model as of T. Returns { records, results } (results keyed by model name). */
export function runModels(state, T = Date.now(), now = Date.now()) {
  const results = {};
  const records = [];
  const sp = estimateSleepPressure(state.tables.sleep_episodes, T);
  results[SLEEP_PRESSURE_MODEL.name] = sp;
  records.push(record(state, SLEEP_PRESSURE_MODEL, sp, T, now));
  for (const m of CIRCADIAN_MODELS) {
    const r = m.predict({ state, T });
    results[m.name] = r;
    records.push(record(state, m, r, T, now));
  }
  return { records, results };
}

/**
 * Records to append now: at most one per model version every `minHours` (default 20 h), so
 * history builds up daily without flooding storage.
 */
export function predictionsToStore(state, records, now = Date.now(), minHours = 20) {
  return records.filter((r) => {
    const last = state.tables.model_predictions
      .filter((p) => p.model_name === r.model_name && p.model_version === r.model_version)
      .reduce((m, p) => Math.max(m, toMs(p.generated_at)), -Infinity);
    return now - last >= minHours * HOUR_MS;
  });
}
