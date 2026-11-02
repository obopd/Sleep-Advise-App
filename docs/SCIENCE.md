# Scientific assumptions, models and limitations

Nothing in this app has been validated against biological measurements. Passing software tests shows the code does what it is written to do, not that its estimates are biologically accurate.

## 1. What is measured, derived, predicted

| Category | Examples | Label in the app |
|---|---|---|
| Observed | bedtime, wake time, caffeine, sensor lux | Recorded / Device |
| Derived | time in bed, total sleep, rolling averages, regularity | Calculated |
| Prediction | sleep-pressure proxy, experimental DLMO | Model estimate / Experimental |
| Reference | salivary melatonin, laboratory DLMO | Lab result |

No hormone concentration is displayed or stored as a prediction. The previous app version's melatonin and cortisol curves were removed.

## 2. Derived sleep values (`src/core/sleep.js`)

* Total sleep = (final awakening − onset) − WASO. **Onset is never assumed equal to bedtime**: it is used only when reported, or computed from a reported "time to fall asleep". Otherwise total sleep is unknown and shown as such.
* WASO is a reported total without timing; when missing it is treated as 0 for total sleep and flagged (`wasoMissing`).
* **Source conflicts**: when a device record and a user record overlap, the user's record is used for analysis (both are stored). Rationale: the user's diary is the primary instrument in this version; wearable sleep staging has known biases. This is a choice, documented here, and can be changed in one function (`analysisEpisodes`).

## 3. Features (`src/core/features.js`, version 1.0.0)

* Rolling windows (24/48/72 h, 7/28 days) ending at an as-of time T; nothing after T is used (tested for leakage).
* Coverage: sleep windows count the share of 24 h blocks containing a logged main sleep × share of episodes with known onset; light windows count the share of the window with sensor data.
* Missing data are null, never 0. An unlogged day is not treated as a day awake (the Sleep Regularity Index only compares pairs of logged days).
* Sleep Regularity Index: Phillips et al. 2017, minute epochs, 24 h lag.
* Social jetlag: Wittmann et al. 2006 (|MSF − MSW|), using only alarm-free free days.
* Chronotype: MCTQ MSFsc (Roenneberg et al. 2004), from the questionnaire.

## 4. Model A — sleep pressure (Process S)

* Structure and constants: Borbély 1982; Daan, Beersma & Borbély 1984 (τ rise 18.2 h during wake, τ decay 4.2 h during sleep, normalised 0–1). These constants are group-level fits to sleep-deprivation data; individual values differ.
* Input: 72 h of sleep intervals. Withheld (`insufficient_data`) unless each of the last three 24 h blocks has a logged main sleep, because an unlogged sleep would otherwise look like wakefulness; withheld (`missing_required_features`) when recent sleep lacks onset.
* Initial condition S = 0.5 at T − 72 h (assumption). Tested: moving it from 0 to 1 changes S at T by < 0.05 for a regular schedule.
* Output: unitless proxy. **No clinical thresholds.** The dashboard compares it only with the user's own typical value at sleep onset.
* Not modelled: WASO timing, the circadian process's interaction with S (shown separately), individual differences, caffeine.

## 5. Models B/C — circadian phase and predicted DLMO (experimental)

Both implement one interface (`predict({ state, T })` → status, value, coverage, window, details) so they can be replaced.

**`dlmo_sleep_timing_proxy` v0.1.0**: DLMO ≈ circular mean sleep onset (7 days) − 2 h.
* Source of the 2 h: Burgess et al. 2003 (regular sleepers, mean DLMO-to-sleep-onset ≈ 2 h). Cheng et al. 2021 report this kind of proxy at roughly 1 h mean absolute error in day workers and far worse in shift workers.
* Its central assumption, a fixed interval between DLMO and sleep, is known to be false for individuals; this is why it is labelled experimental.
* Population limits enforced in code: ≥ 5 nights with onset in 7 days, onset circular SD ≤ 60 min (an app rule, not a physiological constant), not shift work. Outside these: `unsupported_population` or `insufficient_data`, and no value.

**`dlmo_forger1999_light` v0.1.0**: Forger, Jewett & Kronauer 1999 oscillator driven by measured lux.
* Parameters from the Arcascope `circadian` reference implementation; DLMO = model CBTmin − 7 h (as in Cheng 2021).
* Needs sensor lux for ≥ 80 % of waking time over 7 days and recorded sleep every day. Sleep = 0 lux (eyes closed; common modelling assumption). Remaining waking gaps are filled with the median measured waking lux at the same clock hour; the filled fraction is stored with the prediction.
* Self-reported light is never converted to lux.

Neither model has a prediction interval: no interval is stored or shown until one has been estimated from validation data.

### What would justify a more complex model

A more complex model (e.g. individual parameter fitting, a neural network, or Kalman-filter phase tracking) should only be introduced when:
1. There are paired observations: at least several dozen laboratory DLMOs (dim-light saliva protocol, documented threshold), each with ≥ 7 days of preceding sleep records and, for light models, continuous wrist/chest lux.
2. Participants include regular sleepers, irregular sleepers and shift workers, so performance can be reported per group.
3. Evaluation uses participant-level splits and temporal ordering (tools exist in `research.js`), and is compared against the two baselines above on mean absolute error (circular), signed error and, if intervals are produced, interval coverage.
4. The complex model beats the baselines on held-out participants by a margin that matters (e.g. > 15 min MAE), with the improvement holding in each subgroup.

## 6. Cortisol (Model D, deferred)

Not implemented. A future target must be chosen precisely: post-awakening level, the awakening response increase, area under the curve, or a daily profile. These are different targets. Stress ratings alone are insufficient inputs. A validation study must record awakening time and sample times exactly (minutes matter for the awakening response).

## 7. Recommendations (`rules-1.0.0`)

Transparent rules; each shows action, reason, the user's own observations, expected benefit, limitations and how it will be evaluated, with evidence grade and sources. Thresholds and their sources:

| Rule | Threshold | Source / status |
|---|---|---|
| Too little data | < 5 main sleeps in 14 d | App rule |
| Short sleep | 7-day mean below age-group minimum | AASM/SRS (Watson 2015), NSF (Hirshkowitz 2015), AASM paediatric (Paruthi 2016) |
| Irregular wake time | circular SD > 60 min | App rule; regularity evidence: Phillips 2017, Windred 2024 (observational) |
| Social jetlag | > 60 min | App rule; concept: Wittmann 2006 |
| Late caffeine | within 8.8 h before trying to sleep, ≥ 3 nights / 14 | Gardiner et al. 2023 meta-analysis |
| Evening alcohol | within 6 h before trying to sleep, ≥ 2 nights | 6 h is an analysis window, not a physiological cut-off; effects: Ebrahim 2013 |
| Long naps | > 30 min, ≥ 2 in 7 d | Milner & Cote 2009 |
| Long time awake in bed | latency or WASO > 30 min on ≥ 3 of 7 d → see a professional if it persists | Edinger 2021, Qaseem 2016, Ohayon 2017 |

The rules never diagnose, never suggest medication, melatonin or light therapy, and never suggest reducing sleep.

## 8. Scheduler

* Recommended opportunity = wake time − (sleep target + the user's median time to fall asleep, else 15 min, flagged).
* Predicted onset is reported separately and only with ≥ 3 nights of latency data.
* Gradual shift advice when the plan is > 60 min earlier than recent onset: 15 min per night (a conservative app choice, not a biological constant). Not offered for shift work, where planning is per sleep.

## 9. Insights

Within-person comparisons, ≥ 5 nights per group, worded "On days when…, … on average". Exposures come from the waking period before each sleep, not calendar days. A note is added when the exposure is concentrated on workdays or free days. Median splits (personal, not population thresholds) are used for stress, evening light and meal timing.

## 10. Validation tools (`src/core/research.js`)

* Pairing uses only predictions generated, and with input windows ending, before the reference sample (no leakage).
* Metrics: MAE, RMSE, mean signed error, share within a threshold, interval coverage (only where intervals exist), circular arithmetic for clock times.
* Subgroups: regular / irregular / shift work.
* Splits: deterministic participant-level split; temporal split.
* A validation study needs qualified researchers, a protocol and ethics approval. See ROADMAP.md, Phase 8.

## References

Full list in `src/core/references.js` and in the app (More → How it works).
