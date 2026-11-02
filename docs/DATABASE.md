# Database

The same tables exist in two places:

* **On the device** (`localStorage` key `sleep-advisor:v2`): `{ schema_version, user, research, tables, settings, meta }`, where `tables` holds one array per table below.
* **In Supabase** (optional): `supabase/migrations/0001_init.sql`. A test (`tests/sql-schema.test.js`) fails if a column in `src/core/schema.js` is missing from the SQL.

Full column list: [DATA_DICTIONARY.md](DATA_DICTIONARY.md).

## Tables

| Table | Category | Notes |
|---|---|---|
| `user_profiles` (SQL) / `user` (device) | profile | Kept separate from observations. `profile_preferences` (birthday, schedule type, wake time, preferred sleep, MCTQ answers, difficulties, tracking choices), `consent` (per category, timestamped), `timezone`. |
| `sleep_episodes` | observed | One sleep opportunity. `start_time` = into bed, `attempt_time` = tried to sleep, `onset_time` = fell asleep, `final_awakening_time`, `end_time` = out of bed. Never one field for several concepts. Multiple episodes per day, naps, daytime sleep, missing end = in progress. |
| `light_exposure_events` | observed | `self_report`, `sensor` (needs lux) or `device_daylight` (no lux). Lux/melanopic/spectral only from sensors (DB constraint). |
| `meal_events`, `substance_events`, `activity_events`, `subjective_observations` | observed | `substance_events.event_type` extends without new tables. Ratings store their scale. |
| `medication_events` | observed, **sensitive** | Only if the user enables it; excluded from exports unless chosen. |
| `daily_features` | derived | Rolling windows (not calendar days), `feature_version`, `data_coverage`. |
| `model_predictions` | prediction | Append-only (no UPDATE policy). Null value + status when unavailable; interval only if validated (constraints forbid half intervals and a value without status `ok`). |
| `research_participants` | research | Pseudonymous `participant_id` ↔ user; consent version; withdrawal time. |
| `laboratory_measurements` | reference | Keyed by `participant_id`, not the account. |
| `app_researchers` | access | Approved researchers (added by the project owner in the SQL editor). |

Indexes: `(user_id, start_time)` or `(user_id, measure/event_type, time)` on every event table; `(participant_id, analyte, collection_timestamp)` on lab data.

## Time

* Instants are `timestamptz` (UTC). The IANA zone where the event happened is stored in `tz` so local clock time can be reconstructed exactly, across DST changes and travel.
* Durations are elapsed time between instants (a 23:00→07:00 night is 7 h on the spring-forward night, 9 h on fall-back).
* Entry of a local time that does not exist (DST gap) moves it forward by the gap; an ambiguous local time (fall-back) takes the earlier instant. The form tells the user.
* Episodes are never assigned to "the calendar day they started": features use rolling windows ending at an "as of" time.

## Provenance and corrections

* `source` on every record: `user`, `phone_sensor`, `wearable`, `import_apple_health`, `import_csv`, `import_light_csv`, `derived`, `laboratory`, `migration_v1`.
* A device record never overwrites a user record. When both describe the same sleep, both are stored; analysis uses the user's entry (documented in SCIENCE.md) and the data-quality screen notes the disagreement.
* Corrections append the previous version to `revisions` (with `replaced_at`, `reason`); the original observation is never lost.

## Access control (Row Level Security)

Tested on real Postgres by `npm run test:db`:

* Each user can read and write only their own rows (all observation, feature and prediction tables).
* Predictions: select / insert / delete own; **no update**.
* Anonymous callers see nothing.
* Laboratory measurements: the participant reads their own (through their enrolment); only approved researchers can add laboratory-sourced records; a participant may add a self-reported result (`source = 'user'`).
* Researchers can read enrolment and lab tables but **not** anyone's diary.
* `delete_my_account()` (security definer, authenticated only) deletes the auth user; all owned rows cascade; enrolment and its lab records are deleted too.

## Consent, withdrawal and deletion

* Local storage consent is required at onboarding (timestamped). Research use is off by default; toggling it records the consent version and time.
* **Withdrawal** sets `withdrawn_at` (cloud) / `research.enrolled = false` (device): no further use. Data already exported to a study is governed by that study's protocol and ethics approval.
* **Device deletion** (More → Privacy) removes all local copies, including the v1 backup.
* **Account deletion** removes the cloud copy, including research enrolment and lab rows linked to it. Pseudonymous research exports made earlier cannot be traced back without the enrolment row.
* **Retention**: kept until the user deletes it. No server backups in local-only mode. With Supabase, the project's backup policy applies (document it for real deployments).

## Migrations

* Device: `repo.migrateV1()` converts the v1 nightly diary to events once and keeps the v1 object in `meta.v1_archive`; the v1 key is left untouched until the user deletes all data.
* Server: add new numbered files in `supabase/migrations/`; each must be safe to re-run (the DB test runs every file twice).
