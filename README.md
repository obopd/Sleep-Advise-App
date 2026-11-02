# Sleep Advisor

A research-oriented sleep diary and advisor. It collects longitudinal records of sleep, light exposure, meals, caffeine, alcohol, stress, activity and medication. It shows patterns, estimates sleep pressure, and suggests practical routines, and it is built so that future researchers can test biological models against laboratory measurements.

> **Not a medical device. It does not measure hormones.** Melatonin and cortisol can only be measured with saliva or blood tests. Every value in the app is labelled as *recorded*, *calculated*, a *model estimate*, *experimental*, or a *lab result*. Circadian estimates are experimental, unvalidated and off by default.

Live: https://obopd.github.io/Sleep-Advise-App/ (Safari → Share → Add to Home Screen)

## Run and test

```bash
npm start            # http://localhost:5173 — no dependencies, no build step
npm test             # unit + integration tests
npm run test:db      # schema + Row Level Security on local Postgres
npm run test:ui      # phone-sized browser test (with npm start running)
```

## What it does

* **Records** timestamped events in UTC with the IANA time zone: sleep episodes (main, naps, daytime sleep, across midnight, several per day, in progress), light (self-report, sensor lux, device daylight), meals, caffeine, alcohol, stress/energy/sleepiness ratings, activity, medication. Every record has its source; corrections keep earlier versions.
* **Checks** data quality: impossible order, negative durations, units, implausible values, overlaps, duplicates, sensor vs user disagreement (both kept).
* **Calculates** versioned features over rolling windows with coverage. Missing data stay missing, never zero, and no data from after the as-of time are used.
* **Estimates** sleep pressure (two-process model, Process S) as an experimental proxy. Two experimental DLMO baselines (sleep timing; Forger 1999 light model) produce predictions only within their stated populations.
* **Advises** with transparent rules (action, reason, your data, expected benefit, limitations, how it is evaluated, evidence and sources). The scheduler works for any wake time and keeps the recommended sleep opportunity separate from the predicted sleep onset.
* **Exports** a ZIP of CSVs, with observations, features, predictions and lab results kept separate, plus a data dictionary and manifest. Includes leakage-safe prediction-vs-lab comparison tools.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Decisions, layers, files, screens, test layers |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, time rules, provenance, RLS, consent/withdrawal/deletion |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Every column and feature (generated) |
| [docs/SCIENCE.md](docs/SCIENCE.md) | Assumptions, models, thresholds, limitations, what validation would need |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Imports implemented; what needs native apps or credentials |
| [docs/PRIVACY.md](docs/PRIVACY.md) | Privacy and security |
| [docs/SETUP.md](docs/SETUP.md) | Setup, configuration, Supabase, deployment |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases and next steps |
| [docs/STATUS.md](docs/STATUS.md) | Current release report |
