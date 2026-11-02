# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Sleep Advisor**: a research-oriented sleep diary and advisor PWA (Safari → Add to Home Screen). It collects longitudinal sleep and behaviour records, gives transparent advice, estimates sleep pressure, and prepares data for validating circadian models against laboratory measurements. Same owner and design language as **Planner** (github.com/obopd/APP-Design). Plain HTML/CSS/JS ES modules, no build step, no npm dependencies. Read docs/ARCHITECTURE.md and docs/SCIENCE.md before changing behaviour.

## Scientific rules (mandatory)

- Keep **observed / derived / prediction / reference** separate in storage, exports and UI labels (`badge()` in src/ui/kit.js).
- Never show or store a fabricated hormone concentration. No numbers without a source. No invented constants, thresholds, coefficients or prediction intervals: cite the source in code comments and docs/SCIENCE.md, or mark them as app choices.
- Unavailable predictions: `predicted_value = null` + a status. Predictions are append-only and versioned.
- Missing data are null, never 0. No data after the as-of time in features (leakage tests exist).
- Times: UTC instants + IANA `tz`; durations from elapsed time; never calendar-day assumptions.
- Never overwrite user observations with device data; corrections go to `revisions`.
- Insights are associations, not causes, with minimum group sizes. Rules never diagnose or suggest medication, melatonin, light therapy or less sleep.

## Design rules (same as Planner)

- Minimalist, plain language, few words on main screens; detail and sources one tap away.
- Black & white; **Fraunces** for headings and numbers (`.display`); system sans for text; light + dark.
- No system pop-ups or native `<select>`: use `ask`, `tell`, `snack`, `openSheet`, `segmented`, `toggle`, `chips` (src/ui/dialogs.js, kit.js).
- Floating icon-only dock: Today · Log · Insights · Plan · More.
- Times follow the phone's 12/24 h setting. Touch targets ≥ 40px; safe-area insets; no horizontal scroll.
- User text only as text nodes; `innerHTML` only for static SVG built from numbers. CSP in index.html.

## Structure

See docs/ARCHITECTURE.md. Science and data in `src/core/` (no DOM). UI in `src/ui/` (screens in `src/ui/screens/`). SQL in `supabase/migrations/` (must mirror src/core/schema.js; a test checks). After schema changes run `node scripts/gen-dictionary.mjs`.

## Workflow

| Task | How |
| --- | --- |
| Run | `npm start` → http://localhost:5173 |
| Unit/integration tests | `npm test` |
| DB + RLS tests | `npm run test:db` (local Postgres) |
| Phone UI test | `npm start` then `npm run test:ui` (SHOTS=dir for screenshots) |

Add tests with each feature; look at phone screenshots of UI changes in light and dark; bump `CACHE` in sw.js and keep `SHELL` in sync with every loaded file; keep docs/STATUS.md and this file current.
