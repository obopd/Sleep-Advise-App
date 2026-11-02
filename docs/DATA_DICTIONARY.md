# Data dictionary

Generated from `src/core/schema.js` and `src/core/features.js` by `node scripts/gen-dictionary.mjs`. Do not edit by hand.

Categories: **observed** (user or device), **derived** (calculated), **prediction** (model output), **reference** (laboratory). They are stored and exported separately.

Conventions: all instants are UTC ISO-8601; `tz` is the IANA zone in which the event happened; empty = not recorded (never zero).

## sleep_episodes (observed)

One sleep opportunity (main sleep, nap or other). Episodes may cross midnight, happen in the daytime, and several may occur in one day.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `episode_type` | enum |  | main, nap, other | yes | Main sleep, nap, or other sleep episode. |
| `start_time` | timestamptz |  |  | yes | Got into bed (start of the time-in-bed period). Not the same as falling asleep. |
| `attempt_time` | timestamptz |  |  |  | Started trying to sleep (lights out). |
| `onset_time` | timestamptz |  |  |  | Estimated sleep onset. Missing if unknown; never assumed equal to start_time. |
| `final_awakening_time` | timestamptz |  |  |  | Final awakening. |
| `end_time` | timestamptz |  |  |  | Got out of bed (end of time in bed). Missing while the episode is in progress. |
| `sleep_latency_minutes` | numeric | min |  |  | Minutes from attempt_time to sleep onset as reported (if onset_time is not given). |
| `wake_after_sleep_onset_minutes` | numeric | min |  |  | Total minutes awake between sleep onset and final awakening (WASO). |
| `awakenings_count` | int | count |  |  | Number of night-time awakenings remembered. |
| `subjective_quality` | int | score 1–5 |  |  | Self-rated sleep quality (1 very poor – 5 very good). |
| `morning_refreshment` | int | score 1–5 |  |  | How refreshed on waking (1 not at all – 5 very). |
| `day_type` | enum |  | workday, free_day, unknown |  | Type of the day that follows waking (work/school or free). Needed for chronotype and social-jetlag analysis. |
| `alarm_used` | boolean |  |  |  | Woke by alarm. Free days without an alarm are needed for chronotype estimation (MCTQ). |
| `quality_flags` | jsonb |  |  |  | Data-quality notes, e.g. DST ambiguity at entry, sensor disagreement. |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Where the value came from (provenance). |
| `tz` | text |  |  | yes | IANA time zone the user was in when the event happened; used to reconstruct local clock time. |
| `created_at` | timestamptz |  |  | yes | When the record was first stored (UTC). |
| `updated_at` | timestamptz |  |  | yes | When the record was last changed (UTC). |
| `revisions` | jsonb |  |  |  | Earlier versions of the record, kept when it is corrected. Original observations are never lost. |

## light_exposure_events (observed)

A period of light exposure, either user-reported or measured by a sensor. Lux is only stored when measured; spectral/melanopic values only when the sensor reports them.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `start_time` | timestamptz |  |  | yes | Start of the period. |
| `end_time` | timestamptz |  |  | yes | End of the period. |
| `measurement_type` | enum |  | self_report, sensor, device_daylight | yes | Self-reported; sensor lux measurement; or device daylight classification without lux (e.g. Apple Watch "Time in Daylight"). |
| `illuminance_lux` | numeric | lux |  |  | Measured photopic illuminance (mean over the period). Only from a sensor. |
| `spectral_measurement` | jsonb |  |  |  | Spectral data if the sensor provides it. Never derived from lux. |
| `melanopic_edi_lux` | numeric | lux (melanopic EDI) |  |  | Melanopic equivalent daylight illuminance if measured. Never derived from lux. |
| `sensor_source` | text |  |  |  | Device or app that measured the light. |
| `sensor_position` | enum |  | wrist, chest, eye_level, phone, desk, unknown |  | Where the sensor was worn or placed. |
| `indoor_outdoor_context` | enum |  | outdoor, indoor, mixed, unknown |  | Where the user was. |
| `self_reported_brightness` | enum |  | dim, normal_indoor, bright_indoor, daylight |  | User’s description when no sensor was used. |
| `measurement_quality` | jsonb |  |  |  | Coverage, gaps or other quality notes. |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Where the value came from (provenance). |
| `tz` | text |  |  | yes | IANA time zone the user was in when the event happened; used to reconstruct local clock time. |
| `created_at` | timestamptz |  |  | yes | When the record was first stored (UTC). |
| `updated_at` | timestamptz |  |  | yes | When the record was last changed (UTC). |
| `revisions` | jsonb |  |  |  | Earlier versions of the record, kept when it is corrected. Original observations are never lost. |

## meal_events (observed)

A meal or snack. An unrecorded meal does not mean the user did not eat.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `start_time` | timestamptz |  |  | yes | Meal start. |
| `end_time` | timestamptz |  |  |  | Meal end. |
| `meal_category` | enum |  | breakfast, lunch, dinner, snack, other | yes | Meal category. |
| `approximate_size` | enum |  | small, medium, large |  | Approximate size. |
| `calories_kcal` | numeric | kcal |  |  | Optional calorie estimate. |
| `macronutrients` | jsonb | g |  |  | Optional {protein_g, carbohydrate_g, fat_g}. |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Where the value came from (provenance). |
| `tz` | text |  |  | yes | IANA time zone the user was in when the event happened; used to reconstruct local clock time. |
| `created_at` | timestamptz |  |  | yes | When the record was first stored (UTC). |
| `updated_at` | timestamptz |  |  | yes | When the record was last changed (UTC). |
| `revisions` | jsonb |  |  |  | Earlier versions of the record, kept when it is corrected. Original observations are never lost. |

## substance_events (observed)

Caffeine or alcohol intake. New event types can be added to event_type without a new table.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `event_type` | enum |  | caffeine, alcohol | yes | Substance. |
| `start_time` | timestamptz |  |  | yes | Consumption time. |
| `amount` | numeric |  |  | yes | Amount, in `unit`. |
| `unit` | enum |  | mg, standard_drink, ml, serving | yes | Unit of `amount`. Caffeine in mg; alcohol in standard drinks (≈10 g ethanol) or ml. |
| `product` | text |  |  |  | e.g. coffee, tea, energy drink, beer, wine. |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Where the value came from (provenance). |
| `tz` | text |  |  | yes | IANA time zone the user was in when the event happened; used to reconstruct local clock time. |
| `created_at` | timestamptz |  |  | yes | When the record was first stored (UTC). |
| `updated_at` | timestamptz |  |  | yes | When the record was last changed (UTC). |
| `revisions` | jsonb |  |  |  | Earlier versions of the record, kept when it is corrected. Original observations are never lost. |

## subjective_observations (observed)

Momentary self-ratings (stress, energy, daytime sleepiness). Each rating stores its scale so ratings stay interpretable.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `timestamp` | timestamptz |  |  | yes | When the rating was given. |
| `measure` | enum |  | stress, energy, sleepiness | yes | What was rated. |
| `rating` | int |  |  | yes | Rating on `scale_definition`. |
| `scale_definition` | text |  |  | yes | Scale used, e.g. "stress_1_5: 1 none – 5 extreme", "KSS_1_9". |
| `optional_context` | text |  |  |  | Free-text note about unusual events. |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Where the value came from (provenance). |
| `tz` | text |  |  | yes | IANA time zone the user was in when the event happened; used to reconstruct local clock time. |
| `created_at` | timestamptz |  |  | yes | When the record was first stored (UTC). |
| `updated_at` | timestamptz |  |  | yes | When the record was last changed (UTC). |
| `revisions` | jsonb |  |  |  | Earlier versions of the record, kept when it is corrected. Original observations are never lost. |

## activity_events (observed)

Physical activity.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `start_time` | timestamptz |  |  | yes | Start. |
| `end_time` | timestamptz |  |  | yes | End. |
| `activity_type` | text |  |  | yes | e.g. walk, run, cycling, gym. |
| `intensity` | enum |  | light, moderate, vigorous, unknown |  | Perceived intensity. |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Where the value came from (provenance). |
| `tz` | text |  |  | yes | IANA time zone the user was in when the event happened; used to reconstruct local clock time. |
| `created_at` | timestamptz |  |  | yes | When the record was first stored (UTC). |
| `updated_at` | timestamptz |  |  | yes | When the record was last changed (UTC). |
| `revisions` | jsonb |  |  |  | Earlier versions of the record, kept when it is corrected. Original observations are never lost. |

## medication_events (observed, sensitive)

Medication or supplement intake. Sensitive: stored only if the user enables this category.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `medication_identifier` | text |  |  | yes | Name as entered by the user. |
| `kind` | enum |  | medication, supplement |  | Medication or supplement. |
| `dose` | numeric |  |  |  | Dose, in `unit`. |
| `unit` | text |  |  |  | Dose unit, e.g. mg. |
| `timestamp` | timestamptz |  |  | yes | Time taken (or start date for ongoing). |
| `status` | enum |  | current, historical |  | Whether the entry is current or historical. |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Where the value came from (provenance). |
| `tz` | text |  |  | yes | IANA time zone the user was in when the event happened; used to reconstruct local clock time. |
| `created_at` | timestamptz |  |  | yes | When the record was first stored (UTC). |
| `updated_at` | timestamptz |  |  | yes | When the record was last changed (UTC). |
| `revisions` | jsonb |  |  |  | Earlier versions of the record, kept when it is corrected. Original observations are never lost. |

## daily_features (derived)

Feature values computed for a time window (not necessarily a calendar day). Recomputed features are appended with their feature_version.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `feature_window_start` | timestamptz |  |  | yes | Window start (UTC). |
| `feature_window_end` | timestamptz |  |  | yes | Window end (UTC); also the "as of" time — no later data is used. |
| `feature_name` | text |  |  | yes | See docs/DATA_DICTIONARY.md, Features. |
| `feature_value` | numeric |  |  |  | Value; null when unavailable (never 0 for missing). |
| `feature_unit` | text |  |  |  | Unit. |
| `data_coverage` | numeric | fraction 0–1 |  |  | Share of the window covered by the required observations. |
| `feature_version` | text |  |  | yes | Version of the feature definitions. |
| `generated_at` | timestamptz |  |  | yes | When computed. |

## model_predictions (prediction)

Append-only model outputs. Never overwritten when a model changes; never stored as measurements.

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `user_id` | uuid |  |  | yes | Owner of the record. |
| `prediction_timestamp` | timestamptz |  |  | yes | The time the prediction is about (or the as-of time for state estimates). |
| `target_variable` | text |  |  | yes | e.g. sleep_pressure_proxy, dlmo_clock_time. |
| `predicted_value` | numeric |  |  |  | Value; null when no prediction could be made. |
| `predicted_unit` | text |  |  |  | Unit of the value. |
| `prediction_interval_lower` | numeric |  |  |  | Only filled when the model provides a validated interval. Never invented. |
| `prediction_interval_upper` | numeric |  |  |  | As above. |
| `confidence_or_quality_status` | enum |  | ok, insufficient_data, unsupported_population, missing_required_features, invalid_input | yes | Whether a prediction could be made and why not. |
| `model_name` | text |  |  | yes | Model identifier. |
| `model_version` | text |  |  | yes | Model version. |
| `input_data_window` | jsonb |  |  | yes | {start, end} of the input data used. |
| `input_data_coverage` | numeric | fraction 0–1 |  |  | Share of required inputs present. |
| `validation_status` | enum |  | experimental_unvalidated, validated_external, validated_internal | yes | Validation status of the model for this use. |
| `generated_at` | timestamptz |  |  | yes | When generated. |

## laboratory_measurements (reference, sensitive)

Reference measurements for research validation, keyed by a research participant ID (not the account ID).

| Column | Type | Unit | Allowed values | Required | Description |
|---|---|---|---|---|---|
| `id` | uuid |  |  | yes | Stable internal identifier. |
| `participant_id` | text |  |  | yes | Pseudonymous research ID. |
| `collection_timestamp` | timestamptz |  |  | yes | Sample collection time (UTC). |
| `tz` | text |  |  | yes | Time zone at collection. |
| `analyte` | enum |  | melatonin, cortisol, dlmo | yes | What was measured. "dlmo" = laboratory-derived DLMO clock time. |
| `measured_value` | numeric |  |  | yes | Value in measured_unit. |
| `measured_unit` | enum |  | pg/mL, nmol/L, ug/dL, clock_minutes | yes | Unit. DLMO is stored as minutes after local midnight. |
| `sample_type` | enum |  | saliva, plasma, serum, urine, derived | yes | Sample type. |
| `assay_method` | text |  |  |  | Assay (e.g. RIA, ELISA, LC-MS/MS) or DLMO threshold method. |
| `laboratory_identifier` | text |  |  |  | Lab name or code. |
| `quality_control_status` | enum |  | passed, failed, pending, not_reported |  | QC status. |
| `protocol_deviation` | text |  |  |  | Deviations (e.g. light during sampling, late sample). |
| `source` | enum |  | user, phone_sensor, wearable, import_apple_health, import_csv, import_light_csv, derived, laboratory, migration_v1 | yes | Always "laboratory". |
| `created_at` | timestamptz |  |  | yes | When stored. |

## Features (derived, version 1.0.0)

Computed "as of" an instant T from data at or before T only. Each has a `data_coverage` (0–1).

| Feature | Unit | Definition |
|---|---|---|
| `total_sleep_24h` | min | Total sleep time (onset→final awakening − WASO) within the 24 h before T. |
| `total_sleep_48h` | min | As above, 48 h. |
| `total_sleep_72h` | min | As above, 72 h. |
| `time_in_bed_24h` | min | Time in bed within the 24 h before T. |
| `mean_daily_sleep_7d` | min/day | Total sleep in the 7 days before T divided by the number of 24 h blocks that contain a logged main sleep. |
| `minutes_since_last_awakening` | min | Elapsed time since the most recent final awakening at or before T. |
| `minutes_since_last_sleep_episode` | min | Elapsed time since the end of the most recent sleep episode (any type). |
| `onset_sd_7d` | min | Circular SD of local clock time of main-sleep onset, 7 days. Needs ≥ 3 onsets. |
| `wake_sd_7d` | min | Circular SD of local clock time of final awakening (main sleep), 7 days. Needs ≥ 3. |
| `onset_mean_clock_7d` | clock_minutes_local | Circular mean local clock time of main-sleep onset, 7 days. |
| `wake_mean_clock_7d` | clock_minutes_local | Circular mean local clock time of final awakening, 7 days. |
| `waso_mean_7d` | min | Mean reported wake after sleep onset, main sleep, 7 days. |
| `latency_mean_7d` | min | Mean time from trying to sleep to sleep onset, 7 days (episodes where it is known). |
| `nap_minutes_7d` | min | Time in bed for naps, 7 days. |
| `nap_count_7d` | count | Number of naps, 7 days. |
| `sleep_regularity_index_7d` | index −100…100 | Sleep Regularity Index (Phillips 2017) from minute-by-minute sleep/wake state 24 h apart, using only pairs of 24 h blocks that both contain a logged main sleep. Needs ≥ 2 such pairs. |
| `social_jetlag_28d` | min | \|mid-sleep on free days − mid-sleep on workdays\| (Wittmann 2006), main sleeps of the last 28 days labelled with day type. Needs ≥ 2 workdays and ≥ 1 alarm-free free day. |
| `light_lux_hours_1h` | lux·h | Integrated sensor illuminance in the hour before T. Null when no sensor data; coverage = fraction of the window with sensor data. |
| `light_lux_hours_3h` | lux·h | As above, 3 h. |
| `light_lux_hours_6h` | lux·h | As above, 6 h. |
| `light_lux_hours_12h` | lux·h | As above, 12 h. |
| `outdoor_minutes_24h` | min | Self-reported outdoor/daylight periods in the 24 h before T. |
| `minutes_since_last_caffeine` | min | Elapsed time since the last recorded caffeine. |
| `caffeine_mg_8h` | mg | Recorded caffeine (mg) in the 8 h before T. Null if nothing recorded. |
| `caffeine_mg_24h` | mg | As above, 24 h. |
| `minutes_since_last_alcohol` | min | Elapsed time since the last recorded alcohol. |
| `alcohol_drinks_24h` | standard drinks | Recorded alcohol in the 24 h before T. |
| `minutes_since_last_meal` | min | Elapsed time since the end (or start) of the last recorded meal. |
| `activity_minutes_24h` | min | Recorded activity in the 24 h before T. |
| `minutes_since_last_activity` | min | Elapsed time since the end of the last recorded activity. |
| `stress_latest` | rating (scale per record) | Most recent stress rating at or before T. |
| `stress_mean_24h` | rating | Mean stress rating in the 24 h before T. |
| `chronotype_msfsc` | clock_minutes_local | MCTQ mid-sleep on free days corrected for sleep debt (questionnaire). |
