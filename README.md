# Sleep Advisor

A research-based sleep advisor. It estimates your **circadian hormone rhythm** (melatonin, cortisol) and **sleep pressure** from a sleep diary. It then builds a personal **sleep schedule** and **habit plan**, with each recommendation carrying an evidence grade and a citation.

> Educational wellness tool, not a medical device. Hormone curves are *model estimates* from sleep timing. Only saliva or blood assays measure hormones. If you have a measured DLMO, you can enter it, and it overrides the estimate.

## Run it

No dependencies, no build step. Requires Node 18+.

```bash
npm start   # http://localhost:5173
npm test    # engine unit tests (node:test)
```

Click **Explore with sample data** on the first screen to see a two-week demo.

## What it does

| Feature | How | Key sources |
|---|---|---|
| Circadian phase (DLMO) | Priority: measured DLMO → light-driven model (with wearable light data) → habitual sleep onset − 2 h → questionnaire | Burgess 2003; Sletten 2010; Cheng 2021 |
| Light-driven circadian model | Forger, Jewett & Kronauer 1999 oscillator (matches the Arcascope `circadian` reference implementation); DLMO = CBTmin − 7 h | Forger 1999; Cheng 2021 |
| Shift-plan prediction | Simulates the proposed schedule (fixed wake, earlier lights-out, morning light, dim evenings) and predicts the clock shift day by day | Forger 1999; Khalsa 2003 |
| Wake maintenance zone, sleep gate, temperature minimum | Offsets from DLMO (WMZ = the 3 h before DLMO) | Shekleton 2013; Lavie 1986; Benloucif 2005 |
| Melatonin / cortisol curves | Relative curves anchored to DLMO and wake time, incl. cortisol awakening response and evening-light melatonin suppression | Clow 2004; Fries 2009; Gooley 2011 |
| Sleep pressure | Two-process model, Process S (τ rise 18.2 h, τ decay 4.2 h) | Borbély 1982; Daan 1984 |
| Chronotype & social jetlag | MCTQ MSFsc, from the questionnaire or the diary | Roenneberg 2003/2004; Wittmann 2006 |
| Sleep need | Age-based consensus ranges | Watson 2015; Hirshkowitz 2015; Paruthi 2016 |
| Regularity | Sleep Regularity Index | Phillips 2017; Windred 2024 |
| Schedule | Fits your work wake-time to your clock; if your clock runs late, a 15 min/day shift plan with morning light, dim evenings and optional clinician-guided low-dose melatonin | Eastman & Burgess 2009; Khalsa 2003; Burgess 2010; Auger 2015 |
| Habits | Caffeine cutoff (8.8 h / 13.2 h), alcohol, exercise timing, light, meals, naps; plus *your own* with/without comparisons | Gardiner 2023; Drake 2013; Ebrahim 2013; Stutz 2019; Brown 2022; Milner 2009 |
| Safety flags | Insomnia pattern (→ CBT-I), short sleep, STOP-Bang items for sleep apnea, shift work | Qaseem 2016; Edinger 2021; Chung 2016 |

### Why the simple sleep-timing estimate is still the default

In a real-world validation (Cheng et al. 2021, *Sleep*), light- and activity-driven models and the "bedtime − 2 h" rule both predicted DLMO with about 1 h error for people on regular schedules. The app therefore uses the light model only when there is **measured** light data (≥ 30 % coverage). Otherwise it shows the model only as a cross-check. The model's real advantage, predicting how a *planned* change will move the clock, is used for the shift plan.

## Import real data (Sleep log tab)

- **Apple Health** `export.xml`, streamed so large exports work: Watch sleep stages or iPhone "In Bed" become nightly timing, latency and WASO, and Apple Watch *Time in Daylight* becomes outdoor light exposure.
- **Sleep diary CSV**: `date, bedTime, wakeTime` plus optional fields (common column aliases accepted).
- **Light-sensor CSV** (Actiwatch, ActTrust, other loggers): timestamp (or Date + Time) and lux, aggregated to 10-minute bins.

Imported timing replaces diary timing for that night; habits you logged are kept.

The full reference list is in `src/engine/references.js` and on the in-app **Science** tab.

## Project layout

```
index.html              app shell
src/engine/             pure, framework-free science engine (fully unit-tested)
  time.js               clock maths, circular statistics
  sleepMetrics.js       per-night metrics, summaries, Sleep Regularity Index
  chronotype.js         MCTQ chronotype and social jetlag
  circadian.js          DLMO estimation, hormone & Process S/C curves
  forger99.js           Forger 1999 light-driven circadian oscillator (RK4)
  lightModel.js         light series (measured / imputed), model phase, plan prediction
  importers.js          Apple Health XML, sleep CSV, light CSV parsers
  sleepNeed.js          age-based sleep need
  habits.js             habit flags and personal associations
  safety.js             clinical red flags
  recommend.js          schedule, timeline and ranked recommendations
  references.js         citations and evidence grades
src/ui/                 browser UI (vanilla JS, SVG chart, localStorage)
tests/                  node:test suite
```

The engine has no DOM dependencies, so it can be reused unchanged in a mobile app (React Native, Capacitor) or on a server.

## Privacy

All data stays in the browser's `localStorage`. Export and import (JSON) live on the Sleep log tab.

## Ideas for next steps

- Activity (step-count) driven model input, which Cheng 2021 found works as well as light for day workers and better for shift workers.
- Google Health Connect / Fitbit import (requires a native wrapper; neither offers a browser file export of sleep stages).
- Reminders for morning logging and the evening dim-light cue (the app is already installable as an offline PWA).
