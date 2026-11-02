# Roadmap

Phases follow the master specification.

| Phase | State |
|---|---|
| 1 Foundation (architecture, on-device schema, shell) | Done (no backend by design) |
| 2 Data collection (onboarding, sleep + behaviour logging, time handling, validation) | Done |
| 3 Basic analytics (durations, rolling history, regularity, data quality) | Done |
| 4 Sleep advisor (dashboard, trends, rules, scheduler) | Done |
| 5 Scientific modelling (features, sleep pressure, experimental circadian interface) | Done (experimental, unvalidated) |
| 6 Research infrastructure (versioning, predictions, exports, dictionary, metrics) | Done |
| 7 External integrations | File imports done; vendor cloud APIs out of scope (no backend); HealthKit needs a native app |
| 8 Biological validation | Tools ready; needs a study and data |

## Next steps, in order
1. **IndexedDB storage** for long light-sensor histories (localStorage is ~5 MB).
2. **Backup reminders**: a gentle prompt to save a backup file every few weeks.
3. **Reminders**: optional morning "log your sleep" and evening prompts (web push on iOS 16.4+ home-screen apps).
4. **App lock**: optional passcode for the app.
5. **Validation study plan (Phase 8)** with qualified researchers and ethics approval: dim-light salivary DLMO (documented threshold method), ≥ 7 days of prior diary + wrist light per DLMO; regular, irregular and shift-work groups; pre-registered metrics (circular MAE, signed error, per-group results) using `research.js`.
6. **Native wrapper** only if HealthKit/Health Connect sync becomes necessary.
7. **Cortisol model** only after a dataset with precisely timed awakening samples exists, and with the target defined first (SCIENCE.md §6).
