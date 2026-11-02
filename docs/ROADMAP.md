# Roadmap

Phases follow the master specification.

| Phase | State |
|---|---|
| 1 Foundation (architecture, schema, migrations, auth client, shell) | Done |
| 2 Data collection (onboarding, sleep + behaviour logging, time handling, validation) | Done |
| 3 Basic analytics (durations, rolling history, regularity, data quality) | Done |
| 4 Sleep advisor (dashboard, trends, rules, scheduler) | Done |
| 5 Scientific modelling (features, sleep pressure, experimental circadian interface) | Done (experimental, unvalidated) |
| 6 Research infrastructure (versioning, predictions, exports, dictionary, metrics) | Done |
| 7 External integrations | File imports done; native/vendor APIs need a native app or credentials (INTEGRATIONS.md) |
| 8 Biological validation | Tools ready; needs a study and data |

## Next steps, in order
1. **Supabase project + real sync test**: create the project, run the migration, add config, test sign-up, sync, deletion on a real phone (Requires external credentials).
2. **Sync robustness**: per-record conflict handling with three-way merge (Planner has one to reuse), offline queue, sync on open/foreground.
3. **Reminders**: optional morning "log your sleep" and evening prompts (web push on iOS 16.4+ home-screen apps).
4. **App lock**: optional passcode for the app.
5. **Validation study plan (Phase 8)** with qualified researchers and ethics approval: dim-light salivary DLMO (documented threshold method), ≥ 7 days of prior diary + wrist light per DLMO; regular, irregular and shift-work groups; pre-registered metrics (circular MAE, signed error, per-group results) using `research.js`.
6. **Native wrapper** only if HealthKit/Health Connect sync becomes necessary.
7. **Cortisol model** only after a dataset with precisely timed awakening samples exists, and with the target defined first (SCIENCE.md §6).
