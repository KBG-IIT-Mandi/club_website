/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — BIOLOGY PARAMETER REGISTRY
   The engine consumes ONLY this registry: no biological number may live in a
   component or solver. Each entry carries units, distribution, bounds, a
   source, a confidence grade, an explanation of what turning the knob does,
   and an honesty flag:

     kind: 'measured'  a value a cited source actually reports
           'inferred'  derived or calibrated from cited evidence
           'gameplay'  a model-resolution or game-mechanic choice with no
                       biological claim attached

   WHO reference limits used here are PERCENTILES of a fertile-population
   distribution (5th centile = lower reference limit). They are not
   definitions of fertile/infertile and not averages — see SCIENCE.md.

   Sources (full citations in SOURCES.md):
     WHO6       WHO laboratory manual for the examination and processing of
                human semen, 6th ed. (2021)
     SUAREZ06   Suarez & Pacey, Hum Reprod Update 12(1):23-37 (2006)
     SETTLAGE73 Settlage, Motoshima & Tredway, Fertil Steril 24:655 (1973)
     PMC3749807 Marín-Briggiler et al. (functional capacitation kinetics)
     PMC6001750 Puga Molina et al. (capacitation signaling & variability)
     PNAS95     Cohen-Dayag et al., PNAS 92:11039 (1995)
     NLM        MedlinePlus: Pregnancy - identifying fertile days (007015)
     KUNZ96     Kunz et al., Hum Reprod 11:627 (1996) — uterine peristalsis
     MIKI13     Miki & Clapham, Curr Biol 23:443 (2013) — rheotaxis
     BAHAT03    Bahat et al., Nat Med 9:149 (2003) — thermotaxis
     CALIBRATED end-to-end funnel calibration in this repo (see explain +
                scripts/raceValidation.mjs); no direct measurement exists
   ═══════════════════════════════════════════════════════════════════════════ */

const SRC = {
  WHO6: 'https://www.who.int/publications/i/item/9789240030787',
  SUAREZ06: 'https://academic.oup.com/humupd/article/12/1/23/607817',
  SETTLAGE73: 'https://pubmed.ncbi.nlm.nih.gov/4737661/',
  PMC3749807: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3749807/',
  PMC6001750: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6001750/',
  PNAS95: 'https://www.pnas.org/doi/10.1073/pnas.92.24.11039',
  NLM: 'https://www.nlm.nih.gov/medlineplus/ency/article/007015.htm',
  KUNZ96: 'https://doi.org/10.1093/HUMREP/11.3.627',
  MIKI13: 'https://doi.org/10.1016/j.cub.2013.02.007',
  BAHAT03: 'https://doi.org/10.1038/nm0203-149',
  REPO: 'SCIENCE.md',
};

/** @typedef {'measured'|'inferred'|'gameplay'} ParamKind */

const P = [];
/* Compact declaration helper: validates shape once at module load. */
const def = (id, value, units, dist, bounds, sourceKey, confidence, kind, explain) => {
  if (bounds && (value < bounds[0] || value > bounds[1])) {
    throw new Error(`param ${id}: default ${value} outside bounds [${bounds}]`);
  }
  P.push({ id, value, units, dist, bounds, source: sourceKey, url: SRC[sourceKey], confidence, kind, explain });
};

/* ── SEMEN SAMPLE — the statistical starting population ─────────────────── */

def('semen.volumeMl', 3.0, 'mL',
  'log-normal(median 3.0, σlog 0.35)', [1, 6], 'WHO6', 'high', 'measured',
  'Ejaculate volume. WHO 6th ed lower reference limit (5th centile) is 1.4 mL; the median of the fertile-population distribution is ~3 mL. Total sperm = volume × concentration.');

def('semen.concentrationMPerMl', 60, 'million/mL',
  'log-normal(median 60, σlog 0.6)', [2, 250], 'WHO6', 'high', 'measured',
  'Sperm concentration. WHO 6th ed 5th centile is 16 M/mL, median ≈ 66 M/mL. Treated as a population percentile scale, never a fertile/infertile cutoff.');

def('semen.progressiveMotilityMean', 0.55, 'fraction',
  'beta(mean 0.55, concentration 18)', [0.05, 0.95], 'WHO6', 'high', 'measured',
  'Mean fraction of progressively motile sperm. WHO 6th ed 5th centile is 30%, median ≈ 55%. Sampled per-race from a beta so repeated races vary like repeated samples.');

def('semen.motilityConcentration', 18, 'unitless',
  'fixed', [4, 100], 'WHO6', 'low', 'inferred',
  'Beta concentration for progressive motility: how tightly a given sample clusters around its mean. Higher = less between-race variation. Chosen to reproduce the WHO centile spread.');

def('semen.normalMorphologyMean', 0.14, 'fraction',
  'beta(mean 0.14, concentration 30)', [0.01, 0.6], 'WHO6', 'medium', 'measured',
  'Fraction with normal morphology (strict criteria). WHO 6th ed 5th centile 4%, median ≈ 14%. A morphology proxy feeds the cervix and uterotubal-junction gates.');

/* ── MOTION — µm/s scale, CASA-style metrics ────────────────────────────── */

def('motion.vslMedianUmS', 35, 'µm/s',
  'log-normal(median 35, σlog 0.35), latent-correlated', [5, 120], 'SUAREZ06', 'medium', 'inferred',
  'Median straight-line velocity (VSL) of progressive sperm at body temperature, inferred from the CASA literature range of ~25–55 µm/s (the WHO manual describes CASA methodology but publishes no kinematic reference values). Per-cohort values come from the latent-quality copula.');

def('motion.vclFactor', 1.8, 'unitless',
  'fixed', [1.2, 3], 'SUAREZ06', 'medium', 'inferred',
  'VCL/VSL ratio for activated (non-hyperactivated) motility, giving LIN = VSL/VCL ≈ 0.55 — inferred from typical CASA values for progressive cells; no source publishes a reference ratio.');

def('motion.hyperVclFactor', 1.6, 'unitless',
  'fixed', [1.1, 2.5], 'SUAREZ06', 'medium', 'measured',
  'Hyperactivation multiplies curvilinear velocity (VCL) by ~1.5–2×. It raises thrust and lateral head displacement — it is NOT a straight-line speed boost.');

def('motion.hyperLinFactor', 0.55, 'unitless',
  'fixed', [0.2, 0.9], 'SUAREZ06', 'medium', 'measured',
  'Hyperactivation cuts linearity (LIN): high-amplitude asymmetric beating turns sharply and loses straight-line progress. Applied as a multiplier on effective VSL.');

def('motion.rotDiffusionRadPerS', 0.15, 'rad²/s',
  'fixed', [0.01, 2], 'SUAREZ06', 'low', 'inferred',
  'Rotational diffusion Dr of the heading angle: orientation noise of a progressive swimmer. Inferred from track wander in CASA imagery; no direct human in-tract measurement exists.');

def('motion.hyperRotDiffusionFactor', 3.0, 'unitless',
  'fixed', [1, 10], 'SUAREZ06', 'medium', 'inferred',
  'Hyperactivated beating multiplies angular noise — the widened, erratic turning that helps escape epithelial binding and penetrate cumulus.');

def('motion.transDiffusionUm2PerS', 4, 'µm²/s',
  'fixed', [0, 50], 'SUAREZ06', 'low', 'inferred',
  'Translational noise Dt around the mean path (active fluctuation, far above thermal Brownian motion for a 60 µm cell).');

def('motion.rheotaxisAlignRatePerS', 0.25, '1/s',
  'fixed', [0, 2], 'MIKI13', 'medium', 'measured',
  'Rate of turning to face INTO an oncoming flow (positive rheotaxis). Demonstrated as a major long-range guidance cue in the mammalian tract.');

def('motion.thermotaxisDriftUmS', 1.5, 'µm/s',
  'fixed', [0, 10], 'BAHAT03', 'low', 'measured',
  'Weak drift up the ~1–2 °C isthmus→ampulla temperature gradient. Applies ONLY in the tubal stages and only to capacitated cells — a nudge, not a homing beacon.');

def('motion.chemotaxisRadiusUm', 2000, 'µm',
  'fixed', [200, 10000], 'PNAS95', 'low', 'inferred',
  'Range of the cumulus/follicular-fluid chemoattractant gradient around the oocyte. Gradients are short-range; chemotaxis is a final-approach cue, not a tract-wide GPS.');

def('motion.chemotaxisDriftUmS', 8, 'µm/s',
  'fixed', [0, 40], 'PNAS95', 'low', 'inferred',
  'Peak drift a CAPACITATED, responsive cell gains up the chemoattractant gradient inside the chemotaxis radius. Uncapacitated cells get exactly zero.');

def('motion.chemotaxisTurnGainPerS', 0.8, '1/s',
  'fixed', [0, 5], 'PNAS95', 'low', 'inferred',
  'Turning-rate bias toward the gradient for responsive cells. With the drift term, this is the whole of chemotaxis in the model.');

def('motion.wallAlignRatePerS', 0.5, '1/s',
  'fixed', [0, 5], 'SUAREZ06', 'medium', 'measured',
  'Hydrodynamic wall interaction: swimmers align and slide along boundaries rather than bouncing. Contact never teleports a cell.');

/* Latent-quality copula loadings — corr(trait_i, trait_j) = λi·λj. */
def('motion.loadingSpeed', 0.75, 'unitless', 'fixed', [0, 1], 'REPO', 'low', 'inferred',
  'Copula loading of swimming speed on the latent quality factor. Fast cells tend to be progressive, well-formed and well-fuelled; no source publishes the full covariance, so loadings are stated assumptions.');
def('motion.loadingProgressive', 0.65, 'unitless', 'fixed', [0, 1], 'REPO', 'low', 'inferred',
  'Copula loading of progressive-motility probability on latent quality.');
def('motion.loadingMorphology', 0.5, 'unitless', 'fixed', [0, 1], 'REPO', 'low', 'inferred',
  'Copula loading of the morphology proxy on latent quality.');
def('motion.loadingEnergy', 0.55, 'unitless', 'fixed', [0, 1], 'REPO', 'low', 'inferred',
  'Copula loading of initial energy reserve on latent quality.');
def('motion.loadingCapacitation', -0.3, 'unitless', 'fixed', [-1, 1], 'PMC6001750', 'low', 'inferred',
  'Loading of capacitation TIME on latent quality (negative: higher-quality cells tend to capacitate somewhat sooner). Weak, reflecting the large reported cell-to-cell spread.');

/* ── TRANSPORT — contractions do the long-haul work, not swimming ───────── */

def('transport.contractionRatePerMin', 1.5, 'waves/min',
  'poisson process', [0.1, 5], 'KUNZ96', 'medium', 'measured',
  'Cervico-fundal uterine peristalsis frequency in the late follicular phase (~1–2 waves/min). Each wave is a Poisson event that can carry a fraction of the uterine/cervical population forward — the mechanism behind minutes-scale first arrivals.');

def('transport.contractionRideFraction', 0.02, 'fraction/wave',
  'binomial per wave', [0.001, 0.2], 'CALIBRATED', 'low', 'inferred',
  'Fraction of a cervix/uterus cohort entrained by one contraction wave. Calibrated jointly with wave rate so that (a) first tubal arrivals occur ~5–15 min (Settlage 1973) and (b) total tubal arrivals stay in the thousands (Suarez & Pacey).');

def('transport.contractionJumpMm', 15, 'mm',
  'log-normal(median 15, σlog 0.5)', [2, 60], 'CALIBRATED', 'low', 'inferred',
  'Distance a wave carries entrained cells. 2–4 waves span the uterus, matching rapid-transport timing; swimming alone would take hours (50 mm at 35 µm/s ≈ 40 min per cm).');

def('transport.uterineFlowUmS', 12, 'µm/s',
  'fixed', [0, 100], 'SUAREZ06', 'low', 'inferred',
  'Slow bulk fluid drift toward the fundus around ovulation, aiding uterine crossing between waves.');

def('transport.tubalCountercurrentUmS', 8, 'µm/s',
  'fixed', [0, 100], 'SUAREZ06', 'medium', 'inferred',
  'Cilia-driven, uterus-directed flow in the isthmus. Sperm face INTO it (rheotaxis) and must out-swim it; it also carries the oocyte the other way post-ovulation.');

/* ── STAGE HAZARDS & GATES ──────────────────────────────────────────────── */

def('vagina.flowbackLossFraction', 0.35, 'fraction',
  'binomial once at t≈0', [0, 0.8], 'SUAREZ06', 'medium', 'measured',
  'Fraction of the ejaculate lost to flowback/spillage shortly after deposition; reported flowback recovers roughly a third of sperm.');

def('vagina.motileHalfLifeMin', 30, 'min',
  'exponential hazard', [5, 240], 'SUAREZ06', 'medium', 'measured',
  'Motility half-life in vaginal acidity for cells still outside cervical mucus. The vagina is hostile: enter mucus within roughly an hour or die. λ = ln2 / t½ feeds p = 1 − exp(−λ·dt).');

def('vagina.mucusEntryMedianMin', 3, 'min',
  'exponential clock per cohort', [0.5, 30], 'SUAREZ06', 'high', 'measured',
  'Sperm appear in cervical mucus within a couple of minutes of deposition. Median wait before a motile cohort presents at the cervical os.');

def('cervix.entryMeanPass', 0.001, 'fraction/attempt',
  'logistic gate on traits', [0.0002, 0.3], 'SUAREZ06', 'medium', 'inferred',
  'DEPOSIT-referenced mean pass PER ATTEMPT (attempts recur on the mucus-entry clock while the cell survives vaginal pH). Because the gate loads on the same latent quality as every later gate, passers are the selected top of the field; integrated over the survival window ~1% of the deposit enters mucus — the literature order. The first great filter: only progressing, normally-formed cells thread the mucus microarchitecture.');

def('cervix.entryBetaVsl', 1.2, 'per z', 'logistic coefficient', [0, 4], 'SUAREZ06', 'low', 'inferred',
  'Gate weight on straight-line velocity z-score: mucus strands filter by progression. +1σ VSL multiplies pass odds by e^(1.7·1.2) in the scaled logistic.');
def('cervix.entryBetaProgressive', 1.4, 'per z', 'logistic coefficient', [0, 4], 'SUAREZ06', 'low', 'inferred',
  'Gate weight on progressive-motility z-score. Non-progressive cells essentially cannot enter mucus.');
def('cervix.entryBetaMorphology', 0.7, 'per z', 'logistic coefficient', [0, 4], 'SUAREZ06', 'low', 'inferred',
  'Gate weight on the morphology proxy: mucus penetration correlates with normal head geometry.');

def('cervix.transitMortalityPerHour', 2.0, '1/h',
  'exponential hazard', [0, 6], 'SUAREZ06', 'low', 'inferred',
  'Loss rate inside mucus (trapping in crypts, immune clearance, exhaustion). With contraction waves lifting most entrants within the hour, roughly a third are lost in the mucus itself — the decisive filtering in this model happens at the entry gate and the uterotubal junction, which is where the end-to-end funnel (validated by the Monte Carlo report) does its selecting. Crypt storage is folded into the transit-time spread rather than a separate pool.');

def('uterus.transitMortalityPerHour', 0.35, '1/h',
  'exponential hazard', [0, 2], 'SUAREZ06', 'low', 'inferred',
  'Loss rate crossing the uterine cavity — leukocytic reaction dominates. Most cells that enter the uterus never find the tubal ostium.');

def('utj.meanPass', 0.0005, 'fraction',
  'logistic gate on traits', [0.0001, 0.1], 'SUAREZ06', 'medium', 'inferred',
  'DEPOSIT-referenced mean probability of negotiating the uterotubal junction, the tightest anatomical selection point. Cells actually reaching it are the latent-quality elite, whose conditional pass runs ~1-2%; calibrated end-to-end so ~10⁸-scale ejaculates put low thousands into the tubes (Suarez & Pacey: "only a few thousand").');

def('utj.betaVsl', 0.7, 'per z', 'logistic coefficient', [0, 4], 'SUAREZ06', 'low', 'inferred',
  'UTJ gate weight on VSL z-score: active progression is required to hold position in the narrow, mucus-filled junction.');
def('utj.betaMorphology', 1.0, 'per z', 'logistic coefficient', [0, 4], 'SUAREZ06', 'low', 'inferred',
  'UTJ gate weight on morphology: in animal models, surface-protein/shape defects fail specifically here — the junction reads the cell, not just its speed.');
def('utj.betaEnergy', 0.5, 'per z', 'logistic coefficient', [0, 4], 'CALIBRATED', 'low', 'inferred',
  'UTJ gate weight on remaining energy: depleted cells cannot force the passage.');

def('isthmus.reservoirMortalityPerHour', 0.015, '1/h',
  'exponential hazard', [0, 0.5], 'SUAREZ06', 'medium', 'inferred',
  'Loss rate while bound to isthmic epithelium. The reservoir is protective — binding suppresses motility and preserves fertility for hours to days, letting early arrivals WAIT without dying. Early ≠ winning.');

def('ampulla.mortalityPerHour', 0.1, '1/h',
  'exponential hazard', [0, 1], 'SUAREZ06', 'low', 'inferred',
  'Loss rate for released, hyperactivated cells searching the ampulla — the high-energy final phase.');

def('survival.tractMedianH', 48, 'h',
  'log-normal(median 48, σlog 0.5) per-cohort cap', [6, 120], 'NLM', 'medium', 'measured',
  'Overall viability cap in favourable tract conditions: survival declines over days, with the literature ceiling around 5 days. Modelled as a declining hazard, not a cliff at day 5.');

/* ── CAPACITATION — the biochemical arming sequence ─────────────────────── */

def('capacitation.medianH', 6, 'h',
  'log-normal(median 6, σlog 0.36)', [1, 24], 'PMC3749807', 'medium', 'measured',
  'MODEL ASSUMPTION, derived from experimental literature (not a universal constant): individual capacitation-completion time, log-normal with median ≈ 6 h, p10 ≈ 4 h, p90 ≈ 10 h. Functional human capacitation requires hours of tract/medium exposure and varies widely between cells and individuals.');

def('capacitation.windowMedianMin', 100, 'min',
  'log-normal(median 100, σlog 0.4), truncated [50, 240]', [50, 240], 'PNAS95', 'medium', 'measured',
  'The capacitated (chemotactically responsive) state is TEMPORARY: cells hold it for ~50–240 min, then lose fertilizing competence. This turnover is why only a small fraction is responsive at any instant.');

def('capacitation.responsiveFractionRef', 0.08, 'fraction',
  'emergent — checked, not imposed', [0.02, 0.12], 'PNAS95', 'medium', 'measured',
  'Reference check: 2–12% of a capacitating population is chemotactically responsive at any given time. The model does not force this number; it emerges from the capacitation-time and window distributions, and the Monte Carlo report verifies it stays in range.');

def('capacitation.prematureArHazardPerHour', 0.03, '1/h',
  'exponential hazard while capacitated', [0, 0.5], 'PMC6001750', 'low', 'inferred',
  'Risk of premature acrosome reaction while capacitated but away from the zona — such cells lose fertilizing ability. One reason arming early is not an advantage.');

def('capacitation.everCapacitatesProb', 0.35, 'probability/cell',
  'bernoulli at tube entry', [0.05, 1], 'PNAS95', 'medium', 'inferred',
  'Fraction of tubal sperm that are capacitation-COMPETENT at all. In capacitating conditions only a subpopulation ever achieves the capacitated state; combined with the temporary (50–240 min) window this is what holds the instantaneously responsive fraction down at the observed 2–12% — not a slower clock.');

def('capacitation.reservoirSuppressionFactor', 0.2, 'unitless',
  'clock-rate multiplier while bound pre-ovulation', [0.05, 1], 'SUAREZ06', 'medium', 'inferred',
  'Epithelial binding in the isthmic reservoir holds sperm quiescent and DELAYS capacitation — the reservoir\'s documented role of preserving fertility and synchronizing sperm readiness with ovulation. The capacitation clock runs at this fraction of its in-vitro rate while bound before the periovulatory phase; without this, every cell would arm hours before a late oocyte existed and expire pointlessly.');

def('capacitation.periovulatoryLeadH', 2, 'h',
  'ramp onset before ovulation', [0, 12], 'SUAREZ06', 'low', 'inferred',
  'Periovulatory tract signalling (follicular-phase endocrine shifts) restores full-rate capacitating conditions this many hours BEFORE ovulation, so the reservoir begins arming its holdings as the oocyte becomes imminent.');

def('isthmus.releaseJitterMin', 20, 'min',
  'exponential(median ≈ 14 min) after capacitation', [1, 120], 'SUAREZ06', 'low', 'inferred',
  'Delay between capacitation/hyperactivation onset and detachment from the isthmic epithelium. Hyperactivated beating breaks the binding; release is staggered, not a mass start.');

/* ── OOCYTE — the finish line has its own clock ─────────────────────────── */

def('oocyte.viabilityT50H', 18, 'h',
  'logistic decay, T50 configurable 12–24', [12, 24], 'NLM', 'medium', 'measured',
  'Post-ovulation age at which oocyte fertilizability has fallen to 50%. The classical window is 12–24 h; modelled as a CONTINUOUS logistic decay, not a cliff.');

def('oocyte.viabilityDecayKH', 3, 'h',
  'logistic slope', [0.5, 8], 'NLM', 'low', 'inferred',
  'Steepness of the viability decay (smaller = sharper). With T50 = 18 h and k = 3 h, viability is ~88% at 12 h and ~12% at 24 h.');

def('oocyte.competenceProb', 0.8, 'probability/race',
  'bernoulli once per race', [0.3, 1], 'REPO', 'medium', 'inferred',
  'Probability the ovulated oocyte is itself fertilization-competent (mature, euploid enough to fuse). Conventional IVF fertilizes ~70–80% of mature oocytes even with normal sperm — the egg fails a meaningful fraction of cycles on its own. Drawn once per race; an incompetent oocyte cannot be fused no matter how perfect the swim, which is one honest reason Biology Mode can end with no fertilization at ideal timing.');

def('oocyte.pickupDelayMin', 30, 'min',
  'fixed', [0, 120], 'SUAREZ06', 'low', 'inferred',
  'Time from ovulation until the fimbria deliver the cumulus-oocyte complex into the ampulla — before this the finish line simply is not there yet.');

def('oocyte.cumulusBaseHazardPerMin', 0.04, '1/min',
  'exponential hazard in contact', [0, 1], 'SUAREZ06', 'low', 'inferred',
  'Rate of penetrating the cumulus matrix WITHOUT hyperactivation. Hyperactivated cells multiply this substantially — the mechanical point of hyperactivation.');

def('oocyte.cumulusHyperFactor', 5, 'unitless',
  'fixed', [1, 20], 'SUAREZ06', 'medium', 'inferred',
  'Multiplier on cumulus-penetration rate for hyperactivated cells: high-amplitude flagellar force is what shears through the matrix.');

def('oocyte.zonaBindProb', 0.5, 'probability/contact',
  'bernoulli per contact', [0.01, 1], 'SUAREZ06', 'low', 'inferred',
  'Probability a cumulus-penetrating cell achieves species-specific zona pellucida binding on a given contact.');

def('oocyte.zonaContactRatePerMin', 0.5, 'contacts/min',
  'poisson contact process', [0.05, 5], 'CALIBRATED', 'low', 'inferred',
  'Rate at which a cell inside the cumulus presents at the zona surface. With the bind probability this yields the effective binding hazard λ = rate × P(bind).');

def('oocyte.zonaArHazardPerMin', 0.4, '1/min',
  'exponential hazard while bound', [0, 5], 'PMC6001750', 'medium', 'measured',
  'Rate of the zona-induced acrosome reaction after binding — a required, separate probabilistic step. Cells that already reacted prematurely cannot bind.');

def('oocyte.zonaPenetrationMedianMin', 15, 'min',
  'log-normal(median 15, σlog 0.4)', [2, 90], 'SUAREZ06', 'low', 'inferred',
  'Time for an acrosome-reacted cell to digest/force through the zona. During this window another cell can still beat it — the finish is probabilistic to the last µm.');

def('oocyte.fusionProb', 0.9, 'probability',
  'bernoulli', [0.1, 1], 'SUAREZ06', 'low', 'inferred',
  'Probability that a zona-penetrating cell fuses with the oolemma. On success the zona/membrane block fires and the simulation admits no further entries (polyspermy block, modelled as immediate).');

/* ── ENERGY — dE/dt = −(base + speed·(v/v₀)² + hyper) ───────────────────── */

def('energy.baseCostPerHour', 0.012, 'fraction/h',
  'linear drain', [0, 0.2], 'CALIBRATED', 'low', 'inferred',
  'Housekeeping metabolic drain. Alone it allows ~3.5 days of basal viability, consistent with days-scale tract survival.');

def('energy.speedCostPerHour', 0.02, 'fraction/h at v₀',
  'quadratic in v/v₀', [0, 0.5], 'CALIBRATED', 'low', 'inferred',
  'Drain of swimming at the reference VSL v₀; scales with (v/v₀)². Fast cells burn hotter — speed is not free.');

def('energy.hyperCostPerHour', 0.25, 'fraction/h',
  'linear drain while hyperactivated', [0, 1], 'SUAREZ06', 'medium', 'inferred',
  'Extra drain of hyperactivated beating — hours, not days, of budget. Why arming happens near the goal, and why the capacitated window closing matters.');

def('energy.motilityKneeE', 0.25, 'fraction',
  'sigmoid on E', [0.05, 0.6], 'CALIBRATED', 'low', 'inferred',
  'Energy level at which motility begins to fail: below it, velocity scales down smoothly and the immobilization hazard rises. Individual reserves differ, so exhaustion is staggered, never synchronized.');

def('energy.immobilizeHazardMaxPerHour', 0.8, '1/h',
  'hazard as E→0', [0, 5], 'CALIBRATED', 'low', 'inferred',
  'Ceiling of the immobilization hazard reached at zero energy. p(dt) = 1 − exp(−λ(E)·dt).');

/* ── MODEL RESOLUTION (no biological claim) ─────────────────────────────── */

def('sim.cohortCount', 24, 'cohorts',
  'stratified quantiles of latent quality', [8, 64], 'REPO', 'high', 'gameplay',
  'Resolution of the statistical layer: the tens-of-millions population is carried as weighted cohorts stratified on latent quality. Statistical outcomes must be invariant to render count and stable in cohort count (validated in tests).');

def('sim.finalistMax', 240, 'agents',
  'stratified resampling of tube arrivals', [32, 1024], 'REPO', 'high', 'gameplay',
  'Cap of the individually-simulated layer (tube arrivals). Each finalist carries a statistical weight; stratified resampling preserves cohort proportions.');

def('sim.cohortDtS', 30, 's',
  'fixed grid', [5, 120], 'REPO', 'high', 'gameplay',
  'Fixed biological timestep of the statistical layer. All cohort hazards integrate analytically over it, so results are independent of frame rate and step()-call slicing.');

def('sim.finalistDtS', 2, 's',
  'fixed grid', [0.5, 10], 'REPO', 'high', 'gameplay',
  'Fixed SDE timestep for finalists in open tube stages (µm-scale motion vs mm-scale anatomy tolerates 2 s).');

def('sim.fineDtS', 0.5, 's',
  'fixed grid', [0.1, 2], 'REPO', 'high', 'gameplay',
  'Fixed SDE substep used within 3 mm of the oocyte during the search phase, where the geometry is 10–100 µm scale. The cumulus/zona interaction itself is hazard-based and integrates at the finalist timestep.');

def('sim.maxBioTimeH', 96, 'h',
  'hard stop', [24, 168], 'REPO', 'high', 'gameplay',
  'Simulation horizon. If nothing can fertilize by then (all dead/expired, oocyte gone), the race ends NO FERTILIZATION — a legitimate biological outcome.');

/* ── ARCADE MODE — explicitly game mechanics, never biology ─────────────── */

def('arcade.guaranteedWinner', 1, 'boolean',
  'game rule', [0, 1], 'REPO', 'high', 'gameplay',
  'GAME MECHANIC: in Arcade Mode, if the oocyte window would close with no fusion, the best-positioned viable finalist is granted the win, labelled ARCADE OVERRIDE in the log. Biology Mode never does this.');

def('arcade.hazardRelief', 0.5, 'multiplier',
  'game rule', [0.1, 1], 'REPO', 'high', 'gameplay',
  'GAME MECHANIC: Arcade Mode halves attrition hazards so more named racers survive to be watched. Clearly labelled; never applied in Biology Mode.');

/* ═══════════════════════════════════════════════════════════════════════ */

export const PARAM_LIST = P;
const INDEX = new Map(P.map((d) => [d.id, d]));

/** Full definition (for the science panel / SCIENCE.md tooling). */
export function paramDef(id) {
  const d = INDEX.get(id);
  if (!d) throw new Error(`unknown biology parameter: ${id}`);
  return d;
}

/**
 * Value lookup with per-race overrides. `overrides` is a plain {id: value}
 * object (the UI's ovulation/presets controls write here); values are clamped
 * to the registry bounds so no control can push a parameter off its rails.
 */
export function makeParams(overrides = {}) {
  const get = (id) => {
    const d = paramDef(id);
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      const v = overrides[id];
      return d.bounds ? Math.min(d.bounds[1], Math.max(d.bounds[0], v)) : v;
    }
    return d.value;
  };
  return { get, overrides: { ...overrides } };
}
