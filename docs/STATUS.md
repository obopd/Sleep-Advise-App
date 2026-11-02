# Release report: v0.2.0 (research foundation)

Date: 2026-11-02. Branch: `claude/sleep-advisor-hormone-tracking-m7li3l`. Live: https://obopd.github.io/Sleep-Advise-App/

## Test results

| Suite | Result |
|---|---|
| `npm test` (8 files, unit + integration) | **68 / 68 pass**: data model & time 16, analytics & models 26, research 8, importers & Forger model 5, cloud client 5, profile/chronotype/references 3, SQL ↔ schema 3, zip 2 |
| `npm run test:db` (Postgres 16, migration run twice) | **Pass**: per-user isolation, anon, researcher access, append-only predictions, lab-write restrictions, check constraints, account deletion |
| `npm run test:ui` (iPhone 13, light + dark) | **Pass**: consent gate, onboarding, sleep logging, caffeine, nap, labels, every screen and More page, experimental opt-in, ZIP download, no page errors, no horizontal overflow |

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
* SQL schema with RLS (tested on Postgres); local data deletion; CSP

### Implemented but not fully tested
* Cloud sign-up/sign-in/sync/account deletion: client tested against a fake server and SQL/RLS tested on Postgres, but **not yet run against a real Supabase project**. Sync is last-write-wins per record (no three-way merge, no offline queue).
* "Model check" screen (UI over the tested pairing/metrics code), exercised only with sample data.
* Sleep-pressure chart and timing chart: visual check only.

### Requires external credentials or hardware
* Supabase project (URL + anon key in `src/ui/config.js`), email settings.
* Wearable cloud APIs (Fitbit, Oura, Withings, Garmin): vendor registration + a server for secrets.
* HealthKit / Health Connect live sync: native app.
* Light sensors for the light-driven model (any logger exporting timestamp + lux).

### Requires laboratory data or scientific validation
* Both DLMO baselines (`dlmo_sleep_timing_proxy`, `dlmo_forger1999_light`): experimental; need paired laboratory DLMO.
* Sleep-pressure proxy: no individual validation exists; constants are group-level.
* Any prediction interval: none until estimated from validation data.
* Cortisol model: deferred; needs a defined target and precisely timed samples.

### Not implemented
* Reminders / notifications; app passcode
* Three-way merge sync and offline queue
* Spectral/melanopic sensor parsers
* Server-side jobs (scheduled feature/prediction generation)

## Outstanding defects / limitations
* Local storage capacity (~5 MB typical): long periods of 10-minute light data (≈ 144 rows/day) may fill it; IndexedDB is the planned fix.
* Imported Apple Health records get the user's *current* time zone (the export has offsets but no IANA zone); flagged per record.
* The Today screen's "last 7 days" bars group sleep by 24 h blocks ending now, which can split differently from how users think of nights.
* Data entered in the earlier app version is migrated; habits recorded there as "minutes outside in the morning" have assumed start times (flagged in each record).

## Environment variables / configuration
None required. Optional public configuration in `src/ui/config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. No secrets anywhere in the app.

## Database setup
Optional. Supabase → SQL Editor → run `supabase/migrations/0001_init.sql` (idempotent). Details: docs/SETUP.md, docs/DATABASE.md.

## Deployment
GitHub Pages from the branch root (already live). Bump `CACHE` in `sw.js` after changes.

## Before real users
1. Create the Supabase project and test sync and deletion end to end on real phones.
2. Write a user-facing privacy notice and terms; decide data retention for cloud backups.
3. Add reminders and an app lock.
4. Have the recommendation wording and safety flags reviewed by a sleep clinician.
5. For research use: a protocol, ethics approval, consent documents and a data-management plan before collecting any laboratory measurements.
