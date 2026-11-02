// Every recommendation and model parameter in the engine cites one of these keys.
// Evidence grades used across the app:
//   A = clinical practice guideline, consensus statement or meta-analysis
//   B = controlled laboratory / experimental studies
//   C = observational or limited evidence; a reasonable default, not settled science

export const REFERENCES = {
  borbely1982: 'Borbély AA. A two process model of sleep regulation. Hum Neurobiol. 1982;1(3):195-204.',
  daan1984: 'Daan S, Beersma DG, Borbély AA. Timing of human sleep: recovery process gated by a circadian pacemaker. Am J Physiol. 1984;246(2 Pt 2):R161-83.',
  roenneberg2003: 'Roenneberg T, Wirz-Justice A, Merrow M. Life between clocks: daily temporal patterns of human chronotypes. J Biol Rhythms. 2003;18(1):80-90.',
  roenneberg2004: 'Roenneberg T, Kuehnle T, Pramstaller PP, et al. A marker for the end of adolescence. Curr Biol. 2004;14(24):R1038-9.',
  wittmann2006: 'Wittmann M, Dinich J, Merrow M, Roenneberg T. Social jetlag: misalignment of biological and social time. Chronobiol Int. 2006;23(1-2):497-509.',
  burgess2003: 'Burgess HJ, Savic N, Sletten T, Roach G, Gilbert SS, Dawson D. The relationship between the dim light melatonin onset and sleep on a regular schedule in young healthy adults. Behav Sleep Med. 2003;1(2):102-14.',
  sletten2010: 'Sletten TL, Vincenzi S, Redman JR, Lockley SW, Rajaratnam SM. Timing of sleep and its relationship with the endogenous melatonin rhythm. Front Neurol. 2010;1:137.',
  benloucif2005: 'Benloucif S, Guico MJ, Reid KJ, et al. Stability of melatonin and temperature as circadian phase markers and their relation to sleep times in humans. J Biol Rhythms. 2005;20(2):178-88.',
  lavie1986: "Lavie P. Ultrashort sleep-waking schedule. III. 'Gates' and 'forbidden zones' for sleep. Electroencephalogr Clin Neurophysiol. 1986;63(5):414-25.",
  strogatz1987: 'Strogatz SH, Kronauer RE, Czeisler CA. Circadian pacemaker interferes with sleep onset at specific times each day: role in insomnia. Am J Physiol. 1987;253(1 Pt 2):R172-8.',
  khalsa2003: 'Khalsa SB, Jewett ME, Cajochen C, Czeisler CA. A phase response curve to single bright light pulses in human subjects. J Physiol. 2003;549(Pt 3):945-52.',
  gooley2011: 'Gooley JJ, Chamberlain K, Smith KA, et al. Exposure to room light before bedtime suppresses melatonin onset and shortens melatonin duration in humans. J Clin Endocrinol Metab. 2011;96(3):E463-72.',
  brown2022: 'Brown TM, Brainard GC, Cajochen C, et al. Recommendations for daytime, evening, and nighttime indoor light exposure to best support physiology, sleep, and wakefulness in healthy adults. PLoS Biol. 2022;20(3):e3001571.',
  burgess2010: 'Burgess HJ, Revell VL, Molina TA, Eastman CI. Human phase response curves to three days of daily melatonin: 0.5 mg versus 3.0 mg. J Clin Endocrinol Metab. 2010;95(7):3325-31.',
  auger2015: 'Auger RR, Burgess HJ, Emens JS, et al. Clinical practice guideline for the treatment of intrinsic circadian rhythm sleep-wake disorders. J Clin Sleep Med. 2015;11(10):1199-236.',
  eastman2009: 'Eastman CI, Burgess HJ. How to travel the world without jet lag. Sleep Med Clin. 2009;4(2):241-255.',
  watson2015: 'Watson NF, Badr MS, Belenky G, et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the AASM and SRS. Sleep. 2015;38(6):843-4.',
  hirshkowitz2015: "Hirshkowitz M, Whiton K, Albert SM, et al. National Sleep Foundation's sleep time duration recommendations: methodology and results summary. Sleep Health. 2015;1(1):40-43.",
  paruthi2016: 'Paruthi S, Brooks LJ, D\'Ambrosio C, et al. Recommended amount of sleep for pediatric populations: a consensus statement of the AASM. J Clin Sleep Med. 2016;12(6):785-6.',
  ohayon2017: "Ohayon M, Wickwire EM, Hirshkowitz M, et al. National Sleep Foundation's sleep quality recommendations: first report. Sleep Health. 2017;3(1):6-19.",
  drake2013: 'Drake C, Roehrs T, Shambroom J, Roth T. Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med. 2013;9(11):1195-200.',
  gardiner2023: 'Gardiner C, Weakley J, Burke LM, et al. The effect of caffeine on subsequent sleep: a systematic review and meta-analysis. Sleep Med Rev. 2023;69:101764.',
  ebrahim2013: 'Ebrahim IO, Shapiro CM, Williams AJ, Fenwick PB. Alcohol and sleep I: effects on normal sleep. Alcohol Clin Exp Res. 2013;37(4):539-49.',
  stutz2019: 'Stutz J, Eiholzer R, Spengler CM. Effects of evening exercise on sleep in healthy participants: a systematic review and meta-analysis. Sports Med. 2019;49(2):269-287.',
  kredlow2015: 'Kredlow MA, Capozzoli MC, Hearon BA, Calkins AW, Otto MW. The effects of physical activity on sleep: a meta-analytic review. J Behav Med. 2015;38(3):427-49.',
  phillips2017: 'Phillips AJK, Clerx WM, O\'Brien CS, et al. Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep. 2017;7(1):3216.',
  windred2024: 'Windred DP, Burns AC, Lane JM, et al. Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study. Sleep. 2024;47(1):zsad253.',
  fries2009: 'Fries E, Dettenborn L, Kirschbaum C. The cortisol awakening response (CAR): facts and future directions. Int J Psychophysiol. 2009;72(1):67-73.',
  clow2004: 'Clow A, Thorn L, Evans P, Hucklebridge F. The awakening cortisol response: methodological issues and significance. Stress. 2004;7(1):29-37.',
  milner2009: 'Milner CE, Cote KA. Benefits of napping in healthy adults: impact of nap length, time of day, age, and experience with napping. J Sleep Res. 2009;18(2):272-81.',
  crispim2011: 'Crispim CA, Zimberg IZ, dos Reis BG, et al. Relationship between food intake and sleep pattern in healthy individuals. J Clin Sleep Med. 2011;7(6):659-64.',
  edinger2021: 'Edinger JD, Arnedt JT, Bertisch SM, et al. Behavioral and psychological treatments for chronic insomnia disorder in adults: an AASM clinical practice guideline. J Clin Sleep Med. 2021;17(2):255-262.',
  qaseem2016: 'Qaseem A, Kansagara D, Forciea MA, Cooke M, Denberg TD. Management of chronic insomnia disorder in adults: a clinical practice guideline from the American College of Physicians. Ann Intern Med. 2016;165(2):125-33.',
  chung2016: 'Chung F, Abdullah HR, Liao P. STOP-Bang questionnaire: a practical approach to screen for obstructive sleep apnea. Chest. 2016;149(3):631-8.',
};

export const GRADE_LABEL = {
  A: 'Strong: guideline, consensus or meta-analysis',
  B: 'Moderate: controlled experiments',
  C: 'Limited: observational or emerging evidence',
};
