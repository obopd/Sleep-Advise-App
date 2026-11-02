# Data model (on-device)

There is no server or backend. All data lives in the browser's storage on the user's phone (`localStorage` key `sleep-advisor:v2`) as one object:

```
{ schema_version: 2, user, research, tables: { <table>: [records] }, settings, meta }
```

`tables` holds one array per table below, defined once in `src/core/schema.js` (used for validation, exports and the generated [DATA_DICTIONARY.md](DATA_DICTIONARY.md)).

## Tables

| Table | Category | Notes |
|---|---|---|
| `user` (profile, consent, tracking choices, time zone) | profile | Kept separate from observations. |
| `sleep_episodes` | observed | `start_time` = into bed, `attempt_time` = tried to sleep, `onset_time` = fell asleep, `final_awakening_time`, `end_time` = out of bed. Never one field for several concepts. Multiple episodes per day, naps, daytime sleep; missing end = in progress. |
| `light_exposure_events` | observed | `self_report`, `sensor` (needs lux) or `device_daylight` (no lux). Lux / melanopic / spectral only from sensors (validated). |
| `meal_events`, `substance_events`, `activity_events`, `subjective_observations` | observed | `substance_events.event_type` extends without new tables. Ratings store their scale. |
| `medication_events` | observed, **sensitive** | Only if enabled; excluded from exports unless chosen. |
| `daily_features` | derived | Rolling windows, `feature_version`, `data_coverage` (computed on demand and exported). |
| `model_predictions` | prediction | Append-only; null value + status when unavailable; no invented intervals. |
| `laboratory_measurements` | reference | Keyed by the pseudonymous `participant_id`. |

## Time

* Instants are UTC ISO-8601 strings; the IANA zone where the event happened is stored in `tz`, so local clock time is reconstructed exactly across DST and travel.
* Durations are elapsed time between instants (a 23:00→07:00 night is 7 h on the spring-forward night, 9 h on fall-back).
* A local time that does not exist (DST gap) moves forward; an ambiguous one (fall-back) takes the earlier instant; the form tells the user.
* Features use rolling windows ending at an "as of" time, never "the calendar day the sleep started".

## Provenance and corrections

* `source` on every record (`user`, `wearable`, `import_apple_health`, `import_csv`, `import_light_csv`, `laboratory`, `migration_v1`, …).
* Device records never overwrite user records; both are kept, analysis uses the user's entry (SCIENCE.md), the data-quality screen notes the disagreement.
* Corrections append the previous version to `revisions`.

## Consent, backup, withdrawal and deletion

* Consent to store data on the device is required at onboarding (timestamped). Research use is off by default; toggling it records the consent version and time.
* **Backup**: More → Backup saves the whole object as a JSON file and restores it (replacing the data on the phone after confirmation). This is the only way data moves between phones.
* **Research sharing** happens only through files the user exports (More → Research & export), with a pseudonymous ID. Data already handed to a study follows that study's protocol and ethics approval.
* **Deletion**: More → Privacy removes all data from the phone, including the v1 backup copy. Exported or backup files are the user's own and are not affected.
* **Retention**: until the user deletes it. Clearing the browser's website data or removing the app also deletes it, so regular backup files are recommended.
* Storage limit: browsers allow roughly 5 MB per site; very long light-sensor imports may need IndexedDB (roadmap).

## Migrations

`repo.migrateV1()` converts the v1 nightly diary to events once and keeps the v1 object in `meta.v1_archive`. Future shape changes bump `schema_version` and migrate in `storage.load()`; user data is never dropped.
