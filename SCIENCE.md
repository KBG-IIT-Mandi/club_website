# SCIENCE.md — Virtual Sperm Race

**Educational simulation — not medical or fertility advice.**

This document explains what the `/race` simulation actually claims: what is
established biology, what is inferred or calibrated, what is deliberately
simplified, and which parts are game mechanics with no biological claim at
all. The machine-readable version of everything here is
`src/race/engine/biologyParameters.js` — every number the engine consumes
lives in that registry with units, distribution, bounds, source, confidence
grade, and an honesty flag (`measured` / `inferred` / `gameplay`). Full
citations are in [SOURCES.md](SOURCES.md).

---

## 1. What the simulation teaches (established biology)

These points are well supported by the cited literature and the simulation
is built so they *emerge from the model*, rather than being scripted:

- **The fastest cell is not the winner.** First arrivals reach the tubes in
  minutes largely by riding uterine contractions (Settlage 1973; Suarez &
  Pacey 2006), then bind the isthmic epithelium and *wait*. Fertilization is
  decided hours later by capacitation timing, position, and chance. In the
  simulation the winner is typically a mid-pack arrival whose capacitation
  window happened to open at the right moment.
- **Transport is mostly not swimming.** A 50 mm uterus at ~35 µm/s of
  straight-line swimming is a multi-hour crossing; cervico-fundal
  peristalsis (~1–2 waves/min midcycle, Kunz 1996) does the long haul.
- **Selection, not combat.** Sperm never attack each other. Attrition comes
  from flowback, vaginal acidity, the mucus filter, immune clearance, the
  uterotubal junction, energy exhaustion, and clocks running out.
- **Capacitation is an arming sequence with an expiry date.** Hours-long
  (median ≈ 6 h here), individually stochastic, and the armed state lasts
  only ~50–240 min (Cohen-Dayag 1995). Arming early is not an advantage.
- **Chemotaxis is a final-approach cue for armed cells only.** Only
  capacitated cells respond, only within ~2 mm of the cumulus-oocyte
  complex. There is no tract-wide homing beacon. Thermotaxis is a weak
  tubal nudge (Bahat 2003), rheotaxis a long-range orientation cue
  (Miki & Clapham 2013).
- **Hyperactivation is violent turning, not a speed boost.** It raises
  curvilinear velocity and angular noise, cuts linearity (LIN), costs
  energy, and exists to break epithelial binding and shear through the
  cumulus matrix.
- **X/Y neutrality.** The sex chromosome is assigned after every
  motility-relevant draw and read by nothing but the inspector display.
  A statistical test asserts X- and Y-carrying finalists have identical
  speed distributions.
- **No fertilization is a legitimate outcome.** In Biology Mode the race
  can and does end with nothing fused — because the oocyte aged out,
  because every cell died or expired, or because this cycle's oocyte was
  not itself competent.

## 2. The two-layer population (how 10⁸ cells fit in a browser)

No particle ever represents one real sperm 1:1.

- **Statistical layer** (`cohorts.js`): the full deposit
  (volume × concentration, e.g. 180 million) is carried as ~24 integer-count
  cohorts stratified on a latent quality factor. Hazards are
  `p = 1 − exp(−λ·dt)` with binomial thinning; gates are scaled-logistic
  models on trait z-scores; contraction waves split cohorts binomially.
  Counts are audited: every cell is accounted for at every instant.
- **Individual layer** (`movement.js`): cells that pass the uterotubal
  junction become at most 240 individually-simulated "finalists," each
  carrying the statistical weight of the arrivals it represents
  (stratified resampling; weights always sum to true arrivals).
- **Visual layer** (`raceScene.js`): the 3D swarm is ~1–3k particles whose
  per-stage density follows a *log scale* of the true counts (a linear
  display of 10⁸ → 10³ is impossible). The renderer has its own RNG stream
  and no path back into the engine — **the statistical outcome is invariant
  to the particle count by construction**, and a test asserts it.

## 3. The latent-quality copula (why traits correlate)

Speed, progressive motility, morphology, energy reserve and capacitation
time are not independent: a one-factor Gaussian copula
(`z = λ·q + √(1−λ²)·ε`) ties them to a latent quality factor q. The
loadings are **stated assumptions** (`confidence: low`) — no source
publishes the full covariance — chosen so that gates that select on quality
compound realistically. A direct consequence worth naming: the population
that reaches the uterotubal junction is already the latent-quality elite,
so gate "mean pass" parameters are *deposit-referenced* and the conditional
pass rate for arrivals is much higher. The Monte Carlo report
(`npm run validate:race`) verifies the end-to-end funnel, not each gate in
isolation.

## 4. Timing distributions and how they were chosen

| Quantity | Model | Why |
|---|---|---|
| Mucus entry | exponential clock, median ≈ 3 min | sperm appear in mucus within minutes (Suarez & Pacey) |
| First tube arrivals | emergent: waves + gates | Settlage 1973 recovered sperm from tubes ≈ 5 min after insemination; the model's p50 lands ~10–30 min with a minutes-scale tail |
| Capacitation requirement | log-normal, median 6 h, σ_log 0.36 (p10 ≈ 4 h, p90 ≈ 10 h), truncated 1–24 h | **A model assumption derived from experimental literature** (Marín-Briggiler; Puga Molina): functional human capacitation needs hours of incubation and varies widely. It is not a universal constant. |
| Capacitated window | log-normal median 100 min, truncated 50–240 min | the transient responsive state of Cohen-Dayag 1995 |
| Ever-capacitates fraction | Bernoulli 0.35/cell | only a subpopulation achieves capacitation; with window turnover this reproduces the observed 2–12 % instantaneous responsive fraction — verified, not imposed. The Monte Carlo verifies it in the source's own context (an in-vitro analogue: capacitating conditions active, oocyte not yet present — in vivo near an egg, armed cells are consumed by it) |
| Reservoir suppression | capacitation clock runs at ×0.2 while bound, full rate from ovulation −2 h | the reservoir's documented role: binding preserves fertility and synchronises readiness with ovulation. The ×0.2 and 2 h lead are calibrated assumptions (`confidence: low/medium`). |
| Sperm survival | log-normal cap, median 48 h + stage hazards | days-scale survival with declining hazard — no cliff at day 5 |
| Oocyte viability | logistic decay, T50 = 18 h (configurable 12–24), k = 3 h | the classical 12–24 h window as a *continuous* curve |
| Oocyte competence | Bernoulli 0.8/race | conventional IVF fertilizes ~70–80 % of mature oocytes even with normal sperm; the egg fails some cycles on its own |

## 5. Deliberate simplifications

- **Geometry is stylized.** A folded 3D tube with log-scaled radii; real mm
  lengths are labelled but never mapped 1:1 to pixels. Mucosal folds,
  crypts and the tubal labyrinth are hazard terms, not meshes.
- **Cervical crypt storage** is folded into the mucus transit-time spread
  rather than modelled as an explicit reservoir.
- **Capacitation-window expiry is terminal** for fertilizing ability. The
  literature debates whether individual cells can re-arm; population-level
  replacement is what maintains coverage, and the model reproduces that
  with expiry + staggered arming instead.
- **The polyspermy block is instantaneous.** The real zona reaction takes
  minutes; modelling the (rare) real-world polyspermy failure mode is out
  of scope.
- **Immune response, pathology, cilia microstructure, seminal plasma
  biochemistry** are all folded into per-stage hazard rates.
- **Post-fusion biology** (pronuclei, embryo, implantation) is entirely out
  of scope — the simulation ends at membrane fusion.

## 6. Game mechanics (no biological claim)

Flagged `kind: 'gameplay'` in the registry and labelled in the UI:

- **Arcade Mode hazard relief** (×0.5 attrition) and the **guaranteed
  finish** (`ARCADE OVERRIDE` in the log and outcome). Biology Mode never
  applies either — a test asserts it.
- Model resolution: cohort count, finalist cap, fixed timesteps, the
  simulation horizon (96 h), and the visual particle budget.

## 7. Why this cannot predict fertility

The model is calibrated to *population-scale* literature and then driven by
seeded randomness. It knows nothing about any individual, and most
clinically decisive variables — genetics, tract pathology, endocrine state,
embryo viability, implantation — are not modelled at all. WHO reference
limits used for presets are **percentiles of a fertile-population
distribution** (the 5th centile is a lower reference limit, not a
fertile/infertile boundary, and not an average). Identical inputs replay
identical races; real biology never does. Treat every run as a story about
how the system works, never as a forecast about a person.

## 8. Reproducibility contract

- Seeded xoshiro128** RNG; streams derived from `(seed, label)` only.
  `Math.random()` appears exactly once — minting a fresh seed for a new
  race.
- All stochastic work happens on absolute biological-time grids and a
  deterministic event queue: frame rate, animation speed, and step slicing
  cannot reorder a single draw.
- The world freezes at the outcome: once the race resolves, no further
  stochastic work runs, so the recorded outcome, funnel, and replay hash
  are independent of how far past the finish the caller stepped.
- `npm test` covers determinism (including outcome invariance across
  frame-loop vs fast-forward drive styles), invariants (conservation
  through the finalist handoff, monotone funnel, ≤1 fusion, legal state
  transitions, chemotaxis gating, viability-window enforcement, X/Y
  neutrality) — 67 tests. `npm run validate:race` runs a 1000-seed Monte
  Carlo with tolerance checks against everything quantitative in this
  document.
