# Architecture

## Decision summary

| Decision | Choice | Why |
|---|---|---|
| App type | Installable PWA, plain HTML/CSS/JS ES modules, no build step | Existing working architecture; the owner builds from a phone (same as Planner); GitHub Pages hosting; nothing to compile or upgrade. |
| Storage | **On-device only** (browser `localStorage`); backup and export as files | No backend by the owner's decision: no accounts, no server, nothing leaves the phone except files the user saves. |
| Modelling | Pure JS modules in `src/core/` with no DOM access | Testable with `node --test`; replaceable; can move to Python later without touching the UI. |
| Next.js / TypeScript / Postgres (suggested in the spec) | Not adopted | The owner does not want a backend. The data model is defined once (`src/core/schema.js`) so a database could be added later without redesign. |

## Five layers

```
Layer 1  Data collection     src/ui/forms.js, screens/onboarding.js, core/importers.js
Layer 2  Data quality        core/validate.js (record + collection checks), core/time.js, core/quality.js
Layer 3  Features            core/sleep.js (per-episode values), core/features.js (rolling windows)
Layer 4  Models              core/models/sleepPressure.js, core/models/circadian.js, core/predict.js
Layer 5  Advice & feedback   core/recommend.js, core/scheduler.js, core/insights.js → src/ui/screens/*
Research                     core/research.js (exports, metrics, pairing, splits), core/zip.js
Storage                      core/repo.js (event store), src/ui/storage.js (device), backup file (More → Backup)
```

Data flows one way: records → validation → store → features (as of a time T) → models → advice. The UI never computes science; it renders what `src/ui/store.js#derive()` produced.

## Files

```
index.html  sw.js  manifest.webmanifest  icon.svg  fonts/
src/core/          science + data (no DOM)
  time.js          UTC instants, IANA zones, DST, durations, circular stats
  schema.js        table definitions (single source for validation, exports, dictionary)
  validate.js      data-quality checks
  repo.js          event store, revisions, append-only predictions, v1 migration
  sleep.js         per-episode derived values, source-conflict rule
  features.js      feature engineering (versioned)
  models/          sleepPressure.js (Model A), circadian.js (Models B/C, experimental)
  predict.js       versioned prediction records
  recommend.js     transparent rules
  scheduler.js     next sleep opportunity
  insights.js      within-person associations
  quality.js       completeness
  research.js      exports, data dictionary, metrics, pairing, splits
  importers.js     Apple Health XML, sleep CSV, light-sensor CSV
  forger99.js      published light-driven oscillator
  chronotype.js, clock.js, sleepNeed.js, references.js, format.js, zip.js
src/ui/            phone UI (Planner design language)
  app.js (shell, dock) · store.js · storage.js · forms.js · kit.js · dialogs.js · dom.js · theme.js · why.js · nav.js · sample.js
  screens/         today, log, insights, plan, more, biology, research, labform, onboarding
tests/             node:test suites, ui/smoke.mjs (Playwright)
docs/              this folder
```

## Screens (spec §5)

| Spec screen | Where |
|---|---|
| 1 Onboarding | First launch (`screens/onboarding.js`) |
| 2 Daily dashboard | Today tab |
| 3 Sleep logging | Log tab → Sleep, `forms.js#openSleepForm` |
| 4 Daily behaviour tracking | Log tab → Daytime, + buttons, `forms.js#EVENT_FORMS` |
| 5 Sleep insights | Insights tab |
| 6 Sleep scheduler | Plan tab |
| 7 Biological insights | More → Biology |
| 8 Research & data export | More → Research & export |

## Testing layers

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm test` | time, validation, store, features, models, rules, scheduler, insights, research metrics, importers, zip, no-network check |
| End-to-end | `npm start` + `npm run test:ui` | iPhone-sized browser, light + dark: consent gate, logging, labels, every screen, export and backup downloads, no errors, no overflow |

Software tests check software behaviour. They say nothing about biological validity; see SCIENCE.md.
