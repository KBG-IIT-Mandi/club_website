/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — STATISTICAL POPULATION (weighted cohorts)
   Tens of millions of sperm are carried as ~24 integer-count cohorts,
   stratified on the latent quality factor q. No per-sperm objects exist at
   this scale; the render layer never touches these counts, so the statistics
   are invariant to how many particles are drawn — by construction.

   Mechanics
     · continuous hazards      p(dt) = 1 − exp(−λ·dt), binomial thinning
     · gates                   scaled-logistic on trait z-scores; the
                               intercept is DERIVED from the registry's
                               target mean pass via the probit identity —
                               no free intercept constant exists
     · contraction waves       Poisson events; a binomial slice of each
                               cervix/uterus cohort splits off and jumps
                               forward (rapid transport). Splits and merges
                               conserve counts exactly (integers, audited)
     · tube arrival            counts hand off to the finalist layer through
                               onTubeArrival(); the Population's job ends at
                               the isthmus door

   Every count is an integer ≥ 0 at all times. audit() must equal the
   deposited total exactly, forever — tests enforce it.
   ═══════════════════════════════════════════════════════════════════════════ */

import { S_PER_HOUR, S_PER_MIN, MILLION, umToMm } from './units.js';
import { binomial, logNormal, normalCdf, normalQuantile, exponential } from './distributions.js';
import { STAGES, STAGE_INDEX } from './stages.js';

const LN2 = Math.log(2);
/* Probit↔logit calibration scale: σ(1.7x) ≈ Φ(x). With it, the intercept
   that hits a target population-mean pass rate has a closed form. */
const LOGIT_SCALE = 1.7;

const V = STAGE_INDEX.vagina;
const CX = STAGE_INDEX.cervix;
const UT = STAGE_INDEX.uterus;
const UTJ = STAGE_INDEX.utj;
const IST = STAGE_INDEX.isthmus;

export class Population {
  /**
   * @param {object} cfg   { totalCount, progressiveMean, morphologyMean }
   * @param {{get:(id:string)=>number}} params  registry view
   * @param {RNG} rng      'cohorts' stream — exclusively this layer's
   * @param {(entry:object)=>void} logEvent
   */
  constructor(cfg, params, rng, logEvent) {
    this.p = params;
    this.rng = rng;
    this.logEvent = logEvent;
    this.onTubeArrival = null; // set by the engine before first tick

    const K = Math.round(params.get('sim.cohortCount'));
    this.deposited = cfg.totalCount;

    /* t = 0: flowback claims its share before anything swims. */
    this.flowbackLost = binomial(rng, cfg.totalCount, params.get('vagina.flowbackLossFraction'));
    const pool = cfg.totalCount - this.flowbackLost;

    /* Progressive split (probit threshold shared with the copula). */
    const zc = normalQuantile(1 - cfg.progressiveMean); // z above which a cell is progressive
    const lamP = params.get('motion.loadingProgressive');
    const lamV = params.get('motion.loadingSpeed');
    const lamM = params.get('motion.loadingMorphology');
    const lamE = params.get('motion.loadingEnergy');
    const lamC = params.get('motion.loadingCapacitation');
    const sigV = 0.35; // σlog of the VSL marginal (motion.vslMedianUmS dist)
    const vslMedian = params.get('motion.vslMedianUmS');
    const capMedianS = params.get('capacitation.medianH') * S_PER_HOUR;
    const sigCap = 0.36; // σlog of the capacitation marginal

    /* Morphology enters gates as a continuous z; its population mean shifts
       the z so that better/worse samples (presets) move the gates. */
    const morphShift = normalQuantile(Math.min(0.999, Math.max(1e-3, cfg.morphologyMean))) -
      normalQuantile(0.14);

    this.cohorts = [];
    this.nextCohortId = 0;
    this.residual = 0;       // non-progressive cells: never leave the vagina pool
    this.lost = {            // terminal integer sinks, keyed for the funnel
      flowback: this.flowbackLost,
      vaginaDead: 0, vaginaResidualDead: 0,
      cervixFiltered: 0, cervixDead: 0,
      uterusDead: 0,
      utjFiltered: 0,
    };
    this.handedToFinalists = 0;
    this.ever = { deposited: cfg.totalCount, cervix: 0, uterus: 0, utj: 0, tube: 0 };

    /* Stratify: equal integer counts per quantile bin (largest-remainder). */
    const base = Math.floor(pool / K);
    let rem = pool - base * K;
    for (let i = 0; i < K; i += 1) {
      const count = base + (i < rem ? 1 : 0);
      const q = normalQuantile((i + 0.5) / K);
      /* p(progressive | q) from the one-factor probit. */
      const pProg = normalCdf((lamP * q - zc) / Math.sqrt(1 - lamP * lamP));
      const prog = binomial(rng, count, pProg);
      this.residual += count - prog;
      if (prog === 0) continue;
      this.cohorts.push({
        id: this.nextCohortId++,
        qz: q,
        count: prog,
        stage: V,
        progressMm: 0,
        enteredStageAt: 0,
        traits: {
          zV: lamV * q,
          vslUmS: vslMedian * Math.exp(sigV * lamV * q),
          zProg: lamP * q,
          zMorph: lamM * q + morphShift,
          e0: clamp(0.72 + 0.12 * lamE * q, 0.25, 0.95),
          capMedianS: capMedianS * Math.exp(sigCap * lamC * q),
        },
      });
    }
  }

  /* ── hazards: p = 1 − exp(−λ·dt) then binomial thinning ─────────────── */

  mortalityTick(t, dt) {
    const p = this.p;
    const phLambda = LN2 / (p.get('vagina.motileHalfLifeMin') * S_PER_MIN);
    const pPh = 1 - Math.exp(-phLambda * dt);

    /* The non-progressive residual dies on the same vaginal clock. */
    if (this.residual > 0) {
      const d = binomial(this.rng, this.residual, pPh);
      this.residual -= d;
      this.lost.vaginaResidualDead += d;
    }

    for (const c of this.cohorts) {
      if (c.count === 0) continue;
      let lambda = 0;
      let sink = null;
      if (c.stage === V) { lambda = phLambda; sink = 'vaginaDead'; }
      else if (c.stage === CX) { lambda = p.get('cervix.transitMortalityPerHour') / S_PER_HOUR; sink = 'cervixDead'; }
      else if (c.stage === UT || c.stage === UTJ) { lambda = p.get('uterus.transitMortalityPerHour') / S_PER_HOUR; sink = 'uterusDead'; }
      if (lambda <= 0) continue;
      const dead = binomial(this.rng, c.count, 1 - Math.exp(-lambda * dt));
      c.count -= dead;
      this.lost[sink] += dead;
    }
  }

  /* ── axial progression + boundary crossings ─────────────────────────── */

  progressTick(t, dt) {
    for (const c of this.cohorts) {
      if (c.count === 0 || c.stage === V) continue;
      const st = STAGES[c.stage];
      const flow = st.flowUmS(this.p, Math.min(1, c.progressMm / Math.max(st.lengthMm, 1e-9)), t);
      const axial = Math.max(0, c.traits.vslUmS * st.axialPersistence + flow);
      c.progressMm += umToMm(axial * dt);
      this.crossIfDue(c, t);
    }
  }

  crossIfDue(c, t) {
    while (c.count > 0 && c.stage !== V) {
      const st = STAGES[c.stage];
      if (c.progressMm < st.lengthMm) return;
      const overshoot = c.progressMm - st.lengthMm;
      if (c.stage === CX) {
        this.enterStage(c, UT, overshoot, t);
      } else if (c.stage === UT) {
        /* UTJ entry gate — the tightest selection in the tract. */
        const pass = binomial(this.rng, c.count, this.gatePass('utj', c, t));
        const failed = c.count - pass;
        this.lost.utjFiltered += failed;
        if (failed > 0) {
          this.logEvent({
            t, type: 'filtered', stage: 'utj', count: failed,
            detail: `${fmtM(failed)} rejected at the uterotubal junction — morphology/energy selection`,
          });
        }
        c.count = pass;
        if (pass > 0) this.enterStage(c, UTJ, overshoot, t);
      } else if (c.stage === UTJ) {
        /* Isthmus reached: this cohort's survivors become finalists. */
        this.ever.tube += c.count;
        this.handedToFinalists += c.count;
        if (this.onTubeArrival) this.onTubeArrival(c, t);
        c.count = 0;
      } else {
        return;
      }
    }
  }

  enterStage(c, stageIdx, overshootMm, t) {
    c.stage = stageIdx;
    c.progressMm = Math.min(overshootMm, STAGES[stageIdx].lengthMm);
    c.enteredStageAt = t;
    if (stageIdx === UT) this.ever.uterus += c.count;
    if (stageIdx === UTJ) this.ever.utj += c.count;
  }

  /* ── mucus entry attempts (per-cohort Poisson clock, engine-scheduled) ── */

  nextMucusEntryWait() {
    /* Exponential with the registry's median wait: λ = ln2 / median. */
    const medianS = this.p.get('vagina.mucusEntryMedianMin') * S_PER_MIN;
    return exponential(this.rng, LN2 / medianS);
  }

  attemptMucusEntry(cohortId, t) {
    const c = this.cohorts.find((x) => x.id === cohortId);
    if (!c || c.count === 0 || c.stage !== V) return false;
    const pass = binomial(this.rng, c.count, this.gatePass('cervix.entry', c, t));
    if (pass > 0) {
      c.count -= pass;
      /* Passers split into a new cervix cohort; the rest keep trying. */
      const nc = {
        ...c,
        id: this.nextCohortId++,
        count: pass,
        stage: CX,
        progressMm: 0,
        enteredStageAt: t,
        traits: c.traits,
      };
      this.cohorts.push(nc);
      this.ever.cervix += pass;
    }
    return c.count > 0; // caller reschedules while the pool persists
  }

  /* ── contraction waves — rapid transport, cohort splitting ──────────── */

  applyWave(t) {
    const p = this.p;
    const ride = p.get('transport.contractionRideFraction');
    const jumpMm = logNormal(this.rng, p.get('transport.contractionJumpMm'), 0.5);
    let carried = 0;
    /* Snapshot length: splits push new cohorts; a wave must not re-lift them. */
    const n = this.cohorts.length;
    for (let i = 0; i < n; i += 1) {
      const c = this.cohorts[i];
      if (c.count === 0 || (c.stage !== CX && c.stage !== UT)) continue;
      const k = binomial(this.rng, c.count, ride);
      if (k === 0) continue;
      carried += k;
      c.count -= k;
      const nc = {
        id: this.nextCohortId++,
        qz: c.qz,
        count: k,
        stage: c.stage,
        progressMm: c.progressMm + jumpMm,
        enteredStageAt: c.enteredStageAt,
        traits: c.traits,
      };
      this.cohorts.push(nc);
      this.crossIfDue(nc, t);
    }
    return carried;
  }

  /* ── gates: scaled logistic, intercept derived from target mean ─────── */

  gatePass(gateId, cohort, t) {
    const p = this.p;
    const z = cohort.traits;
    let mean, terms;
    if (gateId === 'cervix.entry') {
      mean = p.get('cervix.entryMeanPass');
      terms =
        p.get('cervix.entryBetaVsl') * z.zV +
        p.get('cervix.entryBetaProgressive') * z.zProg +
        p.get('cervix.entryBetaMorphology') * z.zMorph;
      var b2 = sq(p.get('cervix.entryBetaVsl')) + sq(p.get('cervix.entryBetaProgressive')) + sq(p.get('cervix.entryBetaMorphology'));
    } else if (gateId === 'utj') {
      mean = p.get('utj.meanPass');
      const zE = (this.cohortEnergy(cohort, t) - 0.5) / 0.2;
      terms =
        p.get('utj.betaVsl') * z.zV +
        p.get('utj.betaMorphology') * z.zMorph +
        p.get('utj.betaEnergy') * zE;
      b2 = sq(p.get('utj.betaVsl')) + sq(p.get('utj.betaMorphology')) + sq(p.get('utj.betaEnergy'));
    } else {
      throw new Error(`unknown gate ${gateId}`);
    }
    /* σ(1.7·(a + Σβz)) with a = Φ⁻¹(mean)·√(1+Σβ²) ⇒ population mean ≈ mean.
       (Probit identity; the approximation quality is validated MC-side.) */
    const a = normalQuantile(mean) * Math.sqrt(1 + b2);
    const x = LOGIT_SCALE * (a + terms);
    return 1 / (1 + Math.exp(-x));
  }

  /** Deterministic mean-energy model for gate purposes: reserves drain with
      time spent active (dE/dt registry costs, v ≈ VSL while in transit). */
  cohortEnergy(cohort, t) {
    const p = this.p;
    const hours = Math.max(0, t - 0) / S_PER_HOUR; // active since deposition
    const vRel = cohort.traits.vslUmS / p.get('motion.vslMedianUmS');
    const drain = (p.get('energy.baseCostPerHour') + p.get('energy.speedCostPerHour') * vRel * vRel) * hours;
    return clamp(cohort.traits.e0 - drain, 0, 1);
  }

  /* ── bookkeeping ────────────────────────────────────────────────────── */

  /** Drop exhausted cohort shells; merge same-lineage splits when the list
      balloons. Merging same-trait cohorts at similar progress is exact:
      counts add, traits are identical (splits never mutate traits). */
  compact() {
    this.cohorts = this.cohorts.filter((c) => c.count > 0);
    if (this.cohorts.length <= 96) return;
    const byKey = new Map();
    for (const c of this.cohorts) {
      const key = `${c.qz.toFixed(6)}|${c.stage}|${Math.round(c.progressMm / 2)}`;
      const prev = byKey.get(key);
      if (prev) {
        prev.count += c.count;
        prev.progressMm = Math.min(prev.progressMm, c.progressMm); // conservative
      } else {
        byKey.set(key, c);
      }
    }
    this.cohorts = [...byKey.values()];
  }

  counts() {
    const perStage = STAGES.map(() => 0);
    let vsum = 0;
    for (const c of this.cohorts) {
      perStage[c.stage] += c.count;
      vsum += c.count;
    }
    perStage[V] += this.residual;
    return { perStage, motile: vsum, residual: this.residual };
  }

  /** Exact conservation audit: must equal `deposited` at every instant. */
  audit() {
    const inPlay = this.cohorts.reduce((s, c) => s + c.count, 0) + this.residual;
    const lost = Object.values(this.lost).reduce((s, x) => s + x, 0);
    return inPlay + lost + this.handedToFinalists;
  }
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sq = (x) => x * x;
const fmtM = (n) => (n >= MILLION ? `${(n / MILLION).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`);
