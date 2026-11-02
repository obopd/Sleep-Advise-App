# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Sleep Advisor**: a phone-first PWA (Safari → Share → Add to Home Screen) that estimates the
user's body clock (melatonin / cortisol timing, sleep pressure) from their sleep times and builds a
research-based sleep schedule and habits. Same owner and design language as **Planner**
(github.com/obopd/APP-Design). No build step, no npm dependencies: plain HTML/CSS/JS ES modules.

## Design rules (same as Planner)

- **Minimalist, few words, plain language.** Each screen answers one question. Show the one-line
  `short` text; the evidence (`detail`, grade, sources) lives one tap away in the "Why?" sheet.
  Never put citations or jargon (DLMO, MSFsc, SRI…) on the main screens.
- Black & white by default; **Fraunces** (semi-bold, upright) for headings, times and numbers via
  `.display`; system sans-serif for small text. Check light + dark.
- **No system pop-ups** (`confirm`/`alert`/`prompt`) and **no native `<select>`**: use `ask`, `tell`,
  `snack`, `openSheet`, `segmented`, `toggle` from `src/ui/dialogs.js`.
- Opening a sheet must not focus a text field. No text selection except inputs.
- Floating icon-only **dock**: Tonight · Week · Settings. Adding uses + / big buttons, not the dock.
- Times follow the phone's 12/24 h setting: `fmtTime`, `timeParts`, and `localizeTimes` for
  engine text (the engine writes 24 h "HH:MM").
- Touch targets ≥ 40px; respect `env(safe-area-inset-*)`; no horizontal page scroll.

## Structure

```
index.html  sw.js (bump CACHE + keep SHELL in sync when files change)  manifest.webmanifest  icon.svg
fonts/        Fraunces (OFL)
src/engine/   pure science engine, no DOM, unit-tested (see README for the science)
src/ui/       app.js (shell, dock) · store.js (state + update) · storage.js (localStorage)
              tonight.js · week.js · settings.js · onboarding.js · logsheet.js · why.js
              dialogs.js · dom.js (h(), icons, time formatting) · theme.js · chart.js · sample.js
tests/        *.test.js (node:test, engine) · ui/smoke.mjs (Playwright, phone light+dark)
```

- Engine items carry `{ icon, title, short, detail, grade, refs }`. Keep `title` ≤ 40 chars and
  `short` one plain sentence; a test enforces it.
- State (`sleep-advisor:v1`): `{ profile, entries, measured, lightLog, settings }`. The profile stores
  `birthday` (age is derived with `profileAge`; older profiles may still have `age`). Never drop user
  data; if the shape changes, migrate in `storage.load()`.

## Workflow

| Task | How |
| --- | --- |
| Run | `npm start` → http://localhost:5173 |
| Engine tests | `npm test` |
| UI smoke test | `npm start` then `npm run test:ui` (iPhone 13, light + dark) |

Add a test with each feature, look at phone screenshots of UI changes in light and dark, and
keep this file current.
