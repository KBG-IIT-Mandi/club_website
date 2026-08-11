/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — PRESETS
   Semen-profile presets position a race on the WHO fertile-population
   percentile scale. They are sample profiles, NOT diagnoses: WHO reference
   limits are distribution percentiles, and none of these labels means
   "fertile" or "infertile" (see SCIENCE.md).
   ═══════════════════════════════════════════════════════════════════════════ */

export const SEMEN_PRESETS = [
  {
    id: 'who-median',
    label: 'WHO MEDIAN',
    note: '≈50th centile of the fertile population — the default field.',
    config: { volumeMl: 3.0, concentrationMPerMl: 60, progressiveMotilityMean: null, label: 'WHO median semen profile' },
  },
  {
    id: 'high',
    label: 'DENSE FIELD',
    note: '≈90th centile: bigger starting field, same downstream selection.',
    config: { volumeMl: 4.5, concentrationMPerMl: 120, progressiveMotilityMean: null, label: 'Dense field (≈90th centile)' },
  },
  {
    id: 'reference-limit',
    label: '5TH CENTILE',
    note: 'At the WHO lower reference limits — a percentile, not a verdict.',
    config: { volumeMl: 1.5, concentrationMPerMl: 16, progressiveMotilityMean: 0.32, label: 'Near WHO 5th-centile limits' },
  },
  {
    id: 'low-motility',
    label: 'LOW MOTILITY',
    note: 'Progressive motility ≈20%: gates and hazards bite much harder.',
    config: { volumeMl: 3.0, concentrationMPerMl: 60, progressiveMotilityMean: 0.2, label: 'Low progressive motility profile' },
  },
];

export const OVULATION_PRESETS = [
  { id: 'ov+4', label: 'OVULATION T+4H', offsetH: 4, note: 'Race starts just before the egg — reservoir waits are short.' },
  { id: 'ov0', label: 'AT DEPOSITION', offsetH: 0, note: 'Simultaneous start for both clocks.' },
  { id: 'ov+18', label: 'OVULATION T+18H', offsetH: 18, note: 'Long reservoir hold — capacitation timing decides everything.' },
  { id: 'ov-20', label: '20H BEFORE', offsetH: -20, note: 'The oocyte is already old at deposition — fertilization is a long shot.' },
];

export const SPEED_STEPS = [1, 60, 600, 3600, 86400];
