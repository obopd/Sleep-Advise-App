# Release report: v0.3.0 (on-device, no backend)

Date: 2026-11-02. Branch: `claude/sleep-advisor-hormone-tracking-m7li3l`. Live: https://obopd.github.io/Sleep-Advise-App/

## Test results

| Suite | Result |
|---|---|
| `npm test` (6 files, unit + integration) | **61 / 61 pass**: data model & time 17 (incl. no-network check), analytics & models 26, research 8, importers & Forger model 5, profile/chronotype/references 3, zip 2 |
| `npm run test:ui` (iPhone 13, light + dark) | **Pass**: consent gate, onboarding, sleep logging, caffeine, nap, labels, every screen and More page, experimental opt-in, export ZIP and backup downloads, no page errors, no horizontal overflow |

Scenarios covered: regular, delayed, irregular sleep; night-shift daytime sleep; naps and multiple episodes; missing onset, missing end, missing data; overlapping and duplicate entries; sensor vs user disagreement; invalid units; time-zone travel; DST spring-forward and fall-back; no-leakage features; prediction de-duplication; unsupported populations.

These tests check software behaviour only. **No model is biologically validated.**

## Feature status

### Implemented and tested
* Event data model (UTC + IANA zone, provenance, revisions), validation, v1 → v2 migration (lossless)
* Onboarding with consent; sleep logging (main/nap/other, across midnight, daytime, in progress, corrections); behaviour logging (light, meals, caffeine, alcohol, stress, energy, sleepiness, activity, medication)
* Feature engineering v1.0.0; sleep-pressure model (experimental proxy); circadian model interface with two experimental baselines and population checks; versioned append-only predictions
* Dashboard, insights (associations with minimum n), scheduler, rule-based recommendations
* Research export (ZIP of CSVs, data dictionary, manifest, pseudonymous IDs, sensitive opt-in); lab result entry; leakage-safe pairing; circular metrics; subgroup reporting; participant/temporal splits
* Apple Health / sleep CSV / light-sensor CSV imports
* Local backup file (save / restore); local data deletion; CSP; no-network guarantee (tested)

### Implemented but not fully tested
* Backup restore: format checked and covered by the download test; restore itself verified manually only.
* "Model check" screen (UI over the tested pairing/metrics code), exercised only with sample data.
* Sleep-pressure chart and timing chart: visual check only.

### Requires external credentials or hardware
* HealthKit / Health Connect live sync: native app.
* Light sensors for the light-driven model (any logger exporting timestamp + lux).

### Requires laboratory data or scientific validation
* Both DLMO baselines (`dlmo_sleep_timing_proxy`, `dlmo_forger1999_light`): experimental; need paired laboratory DLMO.
* Sleep-pressure proxy: no individual validation exists; constants are group-level.
* Any prediction interval: none until estimated from validation data.
* Cortisol model: deferred; needs a defined target and precisely timed samples.

### Not implemented
* Reminders / notifications; app passcode
* Spectral/melanopic sensor parsers
* IndexedDB storage
* By design (no backend): accounts, cloud sync, vendor cloud APIs (Fitbit, Oura, Withings, Garmin)

## Outstanding defects / limitations
* Local storage capacity (~5 MB typical): long periods of 10-minute light data (≈ 144 rows/day) may fill it; IndexedDB is the planned fix.
* Imported Apple Health records get the user's *current* time zone (the export has offsets but no IANA zone); flagged per record.
* The Today screen's "last 7 days" bars group sleep by 24 h blocks ending now, which can split differently from how users think of nights.
* Data entered in the earlier app version is migrated; habits recorded there as "minutes outside in the morning" have assumed start times (flagged in each record).

## Environment variables / configuration
None. No backend, no secrets.

## Database setup
None. Data is stored on the phone; see docs/DATABASE.md.

## Deployment
GitHub Pages from the branch root (already live). Bump `CACHE` in `sw.js` after changes.

## Before real users
1. Test backup/restore and migration from the earlier version on real iPhones.
2. Write a short user-facing privacy notice (the app keeps data only on the phone; backups are the user's files).
3. Add reminders and an app lock.
4. Have the recommendation wording and safety flags reviewed by a sleep clinician.
5. For research use: a protocol, ethics approval, consent documents and a data-management plan before collecting any laboratory measurements.
