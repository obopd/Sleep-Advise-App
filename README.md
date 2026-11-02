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
| Circadian phase (DLMO) | Habitual sleep onset − 2 h, recency-weighted over 14 nights; a measured DLMO overrides it | Burgess 2003; Sletten 2010 |
| Wake maintenance zone, sleep gate, temperature minimum | Fixed offsets from DLMO | Lavie 1986; Strogatz 1987; Benloucif 2005 |
| Melatonin / cortisol curves | Relative curves anchored to DLMO and wake time, incl. cortisol awakening response and evening-light melatonin suppression | Clow 2004; Fries 2009; Gooley 2011 |
| Sleep pressure | Two-process model, Process S (τ rise 18.2 h, τ decay 4.2 h) | Borbély 1982; Daan 1984 |
| Chronotype & social jetlag | MCTQ MSFsc, from the questionnaire or the diary | Roenneberg 2003/2004; Wittmann 2006 |
| Sleep need | Age-based consensus ranges | Watson 2015; Hirshkowitz 2015; Paruthi 2016 |
| Regularity | Sleep Regularity Index | Phillips 2017; Windred 2024 |
| Schedule | Fits your work wake-time to your clock; if your clock runs late, a 15 min/day shift plan with morning light, dim evenings and optional clinician-guided low-dose melatonin | Eastman & Burgess 2009; Khalsa 2003; Burgess 2010; Auger 2015 |
| Habits | Caffeine cutoff (8.8 h / 13.2 h), alcohol, exercise timing, light, meals, naps; plus *your own* with/without comparisons | Gardiner 2023; Drake 2013; Ebrahim 2013; Stutz 2019; Brown 2022; Milner 2009 |
| Safety flags | Insomnia pattern (→ CBT-I), short sleep, STOP-Bang items for sleep apnea, shift work | Qaseem 2016; Edinger 2021; Chung 2016 |

The full reference list is in `src/engine/references.js` and on the in-app **Science** tab.

## Project layout

```
index.html              app shell
src/engine/             pure, framework-free science engine (fully unit-tested)
  time.js               clock maths, circular statistics
  sleepMetrics.js       per-night metrics, summaries, Sleep Regularity Index
  chronotype.js         MCTQ chronotype and social jetlag
  circadian.js          DLMO estimation, hormone & Process S/C curves
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

- Import from wearables (Apple Health / Google Health Connect) to replace manual diary times.
- Light-sensor or wearable light data feeding a full light-driven circadian model (e.g. Kronauer/Forger) in place of the sleep-timing proxy.
- PWA install + reminders for morning logging and the evening dim-light cue.
