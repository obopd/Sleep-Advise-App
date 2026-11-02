// One definition of every table: used for validation, CSV export columns and the data
// dictionary. supabase/migrations/0001_init.sql mirrors these definitions; a test checks
// that every column listed here exists in the SQL.
//
// Data categories (spec §2.1) are recorded per table so they are never mixed:
//   observed   — supplied by the user or a device
//   derived    — calculated from observations
//   prediction — produced by a model
//   reference  — laboratory measurement

export const SOURCES = ['user', 'phone_sensor', 'wearable', 'import_apple_health', 'import_csv', 'import_light_csv', 'derived', 'laboratory', 'migration_v1'];

const common = [
  { name: 'id', type: 'uuid', required: true, description: 'Stable internal identifier.' },
  { name: 'user_id', type: 'uuid', required: true, description: 'Owner of the record.' },
];
const audit = [
  { name: 'source', type: 'enum', values: SOURCES, required: true, description: 'Where the value came from (provenance).' },
  { name: 'tz', type: 'text', required: true, description: 'IANA time zone the user was in when the event happened; used to reconstruct local clock time.' },
  { name: 'created_at', type: 'timestamptz', required: true, description: 'When the record was first stored (UTC).' },
  { name: 'updated_at', type: 'timestamptz', required: true, description: 'When the record was last changed (UTC).' },
  { name: 'revisions', type: 'jsonb', description: 'Earlier versions of the record, kept when it is corrected. Original observations are never lost.' },
];

export const TABLES = {
  sleep_episodes: {
    category: 'observed',
    description: 'One sleep opportunity (main sleep, nap or other). Episodes may cross midnight, happen in the daytime, and several may occur in one day.',
    fields: [
      ...common,
      { name: 'episode_type', type: 'enum', values: ['main', 'nap', 'other'], required: true, description: 'Main sleep, nap, or other sleep episode.' },
      { name: 'start_time', type: 'timestamptz', required: true, description: 'Got into bed (start of the time-in-bed period). Not the same as falling asleep.' },
      { name: 'attempt_time', type: 'timestamptz', description: 'Started trying to sleep (lights out).' },
      { name: 'onset_time', type: 'timestamptz', description: 'Estimated sleep onset. Missing if unknown; never assumed equal to start_time.' },
      { name: 'final_awakening_time', type: 'timestamptz', description: 'Final awakening.' },
      { name: 'end_time', type: 'timestamptz', description: 'Got out of bed (end of time in bed). Missing while the episode is in progress.' },
      { name: 'sleep_latency_minutes', type: 'numeric', unit: 'min', min: 0, max: 720, description: 'Minutes from attempt_time to sleep onset as reported (if onset_time is not given).' },
      { name: 'wake_after_sleep_onset_minutes', type: 'numeric', unit: 'min', min: 0, max: 1440, description: 'Total minutes awake between sleep onset and final awakening (WASO).' },
      { name: 'awakenings_count', type: 'int', unit: 'count', min: 0, max: 100, description: 'Number of night-time awakenings remembered.' },
      { name: 'subjective_quality', type: 'int', unit: 'score 1–5', min: 1, max: 5, description: 'Self-rated sleep quality (1 very poor – 5 very good).' },
      { name: 'morning_refreshment', type: 'int', unit: 'score 1–5', min: 1, max: 5, description: 'How refreshed on waking (1 not at all – 5 very).' },
      { name: 'day_type', type: 'enum', values: ['workday', 'free_day', 'unknown'], description: 'Type of the day that follows waking (work/school or free). Needed for chronotype and social-jetlag analysis.' },
      { name: 'alarm_used', type: 'boolean', description: 'Woke by alarm. Free days without an alarm are needed for chronotype estimation (MCTQ).' },
      { name: 'quality_flags', type: 'jsonb', description: 'Data-quality notes, e.g. DST ambiguity at entry, sensor disagreement.' },
      ...audit,
    ],
  },
  light_exposure_events: {
    category: 'observed',
    description: 'A period of light exposure, either user-reported or measured by a sensor. Lux is only stored when measured; spectral/melanopic values only when the sensor reports them.',
    fields: [
      ...common,
      { name: 'start_time', type: 'timestamptz', required: true, description: 'Start of the period.' },
      { name: 'end_time', type: 'timestamptz', required: true, description: 'End of the period.' },
      { name: 'measurement_type', type: 'enum', values: ['self_report', 'sensor'], required: true, description: 'Self-reported context or sensor measurement.' },
      { name: 'illuminance_lux', type: 'numeric', unit: 'lux', min: 0, max: 200000, description: 'Measured photopic illuminance (mean over the period). Only from a sensor.' },
      { name: 'spectral_measurement', type: 'jsonb', description: 'Spectral data if the sensor provides it. Never derived from lux.' },
      { name: 'melanopic_edi_lux', type: 'numeric', unit: 'lux (melanopic EDI)', min: 0, max: 200000, description: 'Melanopic equivalent daylight illuminance if measured. Never derived from lux.' },
      { name: 'sensor_source', type: 'text', description: 'Device or app that measured the light.' },
      { name: 'sensor_position', type: 'enum', values: ['wrist', 'chest', 'eye_level', 'phone', 'desk', 'unknown'], description: 'Where the sensor was worn or placed.' },
      { name: 'indoor_outdoor_context', type: 'enum', values: ['outdoor', 'indoor', 'mixed', 'unknown'], description: 'Where the user was.' },
      { name: 'self_reported_brightness', type: 'enum', values: ['dim', 'normal_indoor', 'bright_indoor', 'daylight'], description: 'User’s description when no sensor was used.' },
      { name: 'measurement_quality', type: 'jsonb', description: 'Coverage, gaps or other quality notes.' },
      ...audit,
    ],
  },
  meal_events: {
    category: 'observed',
    description: 'A meal or snack. An unrecorded meal does not mean the user did not eat.',
    fields: [
      ...common,
      { name: 'start_time', type: 'timestamptz', required: true, description: 'Meal start.' },
      { name: 'end_time', type: 'timestamptz', description: 'Meal end.' },
      { name: 'meal_category', type: 'enum', values: ['breakfast', 'lunch', 'dinner', 'snack', 'other'], required: true, description: 'Meal category.' },
      { name: 'approximate_size', type: 'enum', values: ['small', 'medium', 'large'], description: 'Approximate size.' },
      { name: 'calories_kcal', type: 'numeric', unit: 'kcal', min: 0, max: 10000, description: 'Optional calorie estimate.' },
      { name: 'macronutrients', type: 'jsonb', unit: 'g', description: 'Optional {protein_g, carbohydrate_g, fat_g}.' },
      ...audit,
    ],
  },
  substance_events: {
    category: 'observed',
    description: 'Caffeine or alcohol intake. New event types can be added to event_type without a new table.',
    fields: [
      ...common,
      { name: 'event_type', type: 'enum', values: ['caffeine', 'alcohol'], required: true, description: 'Substance.' },
      { name: 'start_time', type: 'timestamptz', required: true, description: 'Consumption time.' },
      { name: 'amount', type: 'numeric', min: 0, max: 5000, required: true, description: 'Amount, in `unit`.' },
      { name: 'unit', type: 'enum', values: ['mg', 'standard_drink', 'ml', 'serving'], required: true, description: 'Unit of `amount`. Caffeine in mg; alcohol in standard drinks (≈10 g ethanol) or ml.' },
      { name: 'product', type: 'text', description: 'e.g. coffee, tea, energy drink, beer, wine.' },
      ...audit,
    ],
  },
  subjective_observations: {
    category: 'observed',
    description: 'Momentary self-ratings (stress, energy, daytime sleepiness). Each rating stores its scale so ratings stay interpretable.',
    fields: [
      ...common,
      { name: 'timestamp', type: 'timestamptz', required: true, description: 'When the rating was given.' },
      { name: 'measure', type: 'enum', values: ['stress', 'energy', 'sleepiness'], required: true, description: 'What was rated.' },
      { name: 'rating', type: 'int', min: 1, max: 9, required: true, description: 'Rating on `scale_definition`.' },
      { name: 'scale_definition', type: 'text', required: true, description: 'Scale used, e.g. "stress_1_5: 1 none – 5 extreme", "KSS_1_9".' },
      { name: 'optional_context', type: 'text', description: 'Free-text note about unusual events.' },
      ...audit,
    ],
  },
  activity_events: {
    category: 'observed',
    description: 'Physical activity.',
    fields: [
      ...common,
      { name: 'start_time', type: 'timestamptz', required: true, description: 'Start.' },
      { name: 'end_time', type: 'timestamptz', required: true, description: 'End.' },
      { name: 'activity_type', type: 'text', required: true, description: 'e.g. walk, run, cycling, gym.' },
      { name: 'intensity', type: 'enum', values: ['light', 'moderate', 'vigorous', 'unknown'], description: 'Perceived intensity.' },
      ...audit,
    ],
  },
  medication_events: {
    category: 'observed',
    sensitive: true,
    description: 'Medication or supplement intake. Sensitive: stored only if the user enables this category.',
    fields: [
      ...common,
      { name: 'medication_identifier', type: 'text', required: true, description: 'Name as entered by the user.' },
      { name: 'kind', type: 'enum', values: ['medication', 'supplement'], description: 'Medication or supplement.' },
      { name: 'dose', type: 'numeric', min: 0, description: 'Dose, in `unit`.' },
      { name: 'unit', type: 'text', description: 'Dose unit, e.g. mg.' },
      { name: 'timestamp', type: 'timestamptz', required: true, description: 'Time taken (or start date for ongoing).' },
      { name: 'status', type: 'enum', values: ['current', 'historical'], description: 'Whether the entry is current or historical.' },
      ...audit,
    ],
  },
  daily_features: {
    category: 'derived',
    description: 'Feature values computed for a time window (not necessarily a calendar day). Recomputed features are appended with their feature_version.',
    fields: [
      ...common,
      { name: 'feature_window_start', type: 'timestamptz', required: true, description: 'Window start (UTC).' },
      { name: 'feature_window_end', type: 'timestamptz', required: true, description: 'Window end (UTC); also the "as of" time — no later data is used.' },
      { name: 'feature_name', type: 'text', required: true, description: 'See docs/DATA_DICTIONARY.md, Features.' },
      { name: 'feature_value', type: 'numeric', description: 'Value; null when unavailable (never 0 for missing).' },
      { name: 'feature_unit', type: 'text', description: 'Unit.' },
      { name: 'data_coverage', type: 'numeric', unit: 'fraction 0–1', min: 0, max: 1, description: 'Share of the window covered by the required observations.' },
      { name: 'feature_version', type: 'text', required: true, description: 'Version of the feature definitions.' },
      { name: 'generated_at', type: 'timestamptz', required: true, description: 'When computed.' },
    ],
  },
  model_predictions: {
    category: 'prediction',
    description: 'Append-only model outputs. Never overwritten when a model changes; never stored as measurements.',
    fields: [
      ...common,
      { name: 'prediction_timestamp', type: 'timestamptz', required: true, description: 'The time the prediction is about (or the as-of time for state estimates).' },
      { name: 'target_variable', type: 'text', required: true, description: 'e.g. sleep_pressure_proxy, dlmo_clock_time.' },
      { name: 'predicted_value', type: 'numeric', description: 'Value; null when no prediction could be made.' },
      { name: 'predicted_unit', type: 'text', description: 'Unit of the value.' },
      { name: 'prediction_interval_lower', type: 'numeric', description: 'Only filled when the model provides a validated interval. Never invented.' },
      { name: 'prediction_interval_upper', type: 'numeric', description: 'As above.' },
      { name: 'confidence_or_quality_status', type: 'enum', values: ['ok', 'insufficient_data', 'unsupported_population', 'missing_required_features', 'invalid_input'], required: true, description: 'Whether a prediction could be made and why not.' },
      { name: 'model_name', type: 'text', required: true, description: 'Model identifier.' },
      { name: 'model_version', type: 'text', required: true, description: 'Model version.' },
      { name: 'input_data_window', type: 'jsonb', required: true, description: '{start, end} of the input data used.' },
      { name: 'input_data_coverage', type: 'numeric', unit: 'fraction 0–1', description: 'Share of required inputs present.' },
      { name: 'validation_status', type: 'enum', values: ['experimental_unvalidated', 'validated_external', 'validated_internal'], required: true, description: 'Validation status of the model for this use.' },
      { name: 'generated_at', type: 'timestamptz', required: true, description: 'When generated.' },
    ],
  },
  laboratory_measurements: {
    category: 'reference',
    sensitive: true,
    description: 'Reference measurements for research validation, keyed by a research participant ID (not the account ID).',
    fields: [
      { name: 'id', type: 'uuid', required: true, description: 'Stable internal identifier.' },
      { name: 'participant_id', type: 'text', required: true, description: 'Pseudonymous research ID.' },
      { name: 'collection_timestamp', type: 'timestamptz', required: true, description: 'Sample collection time (UTC).' },
      { name: 'tz', type: 'text', required: true, description: 'Time zone at collection.' },
      { name: 'analyte', type: 'enum', values: ['melatonin', 'cortisol', 'dlmo'], required: true, description: 'What was measured. "dlmo" = laboratory-derived DLMO clock time.' },
      { name: 'measured_value', type: 'numeric', required: true, description: 'Value in measured_unit.' },
      { name: 'measured_unit', type: 'enum', values: ['pg/mL', 'nmol/L', 'ug/dL', 'clock_minutes'], required: true, description: 'Unit. DLMO is stored as minutes after local midnight.' },
      { name: 'sample_type', type: 'enum', values: ['saliva', 'plasma', 'serum', 'urine', 'derived'], required: true, description: 'Sample type.' },
      { name: 'assay_method', type: 'text', description: 'Assay (e.g. RIA, ELISA, LC-MS/MS) or DLMO threshold method.' },
      { name: 'laboratory_identifier', type: 'text', description: 'Lab name or code.' },
      { name: 'quality_control_status', type: 'enum', values: ['passed', 'failed', 'pending', 'not_reported'], description: 'QC status.' },
      { name: 'protocol_deviation', type: 'text', description: 'Deviations (e.g. light during sampling, late sample).' },
      { name: 'source', type: 'enum', values: SOURCES, required: true, description: 'Always "laboratory".' },
      { name: 'created_at', type: 'timestamptz', required: true, description: 'When stored.' },
    ],
  },
};

export const OBSERVATION_TABLES = ['sleep_episodes', 'light_exposure_events', 'meal_events', 'substance_events', 'subjective_observations', 'activity_events', 'medication_events'];

/** Fields that hold instants, used for time-zone aware export and validation. */
export const timeFields = (table) => TABLES[table].fields.filter((f) => f.type === 'timestamptz').map((f) => f.name);
