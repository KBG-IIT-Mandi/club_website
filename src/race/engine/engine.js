/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — THE HEADLESS SIMULATION
   createSimulation(config, seed) → a framework-free, fully deterministic
   machine. No DOM, no Date.now(), no Math.random() — reproducibility is the
   product. The renderer and React never reach in; they read snapshots.

   DETERMINISM MODEL (what the tests lean on)
   · All stochastic work happens at ABSOLUTE bio-time anchors:
       – cohort ticks at exact multiples of sim.cohortDtS
       – finalist SDE ticks at exact multiples of sim.finalistDtS
       – scheduled events at their exact (pre-drawn) times, ordered (t, seq)
     step(dt) merely moves the target clock; how the caller slices dt can
     never reorder a single RNG draw.
   · Streams are forked from (seed, label) alone: 'race', 'cohorts',
     'events', 'finalists', 'names'. The renderer forks its own 'visual'
     stream and is not even in this file — visual particle count cannot
     touch outcomes BY CONSTRUCTION.

   BIOLOGY GUARANTEES (enforced here, asserted in tests)
   · nothing fuses without capacitation; chemotaxis only inside the armed
     window and radius; at most ONE fusion ever (polyspermy block);
     fusion probability is weighted by continuous oocyte viability;
     Biology Mode may legitimately end with NO fertilization.
   ═══════════════════════════════════════════════════════════════════════════ */

import { S_PER_HOUR, S_PER_MIN, UM_PER_MM, MILLION, formatDuration, formatCount } from './units.js';
import { RNG, hashString } from './rng.js';
import { exponential, betaMeanConc, logNormal } from './distributions.js';
import { makeParams } from './biologyParameters.js';
import { STAGES, STAGE_INDEX } from './stages.js';
import { Population } from './cohorts.js';
import { S, TERMINAL, VIABLE, transition } from './stateMachine.js';
import { Scheduler } from './scheduler.js';
import {
  createFinalist, integrateAgent, immobilizeLambdaPerS, casaMetrics,
} from './movement.js';

const IST = STAGE_INDEX.isthmus;
const AMP = STAGE_INDEX.ampulla;
const EVENT_LOG_CAP = 300;

/* Arcade hazard relief must know which registry ids are RATES (scale down)
   versus HALF-LIVES (scale up). Explicit, so a new hazard can't silently
   dodge the mechanic. */
const RATE_IDS = new Set([
  'cervix.transitMortalityPerHour', 'uterus.transitMortalityPerHour',
  'isthmus.reservoirMortalityPerHour', 'ampulla.mortalityPerHour',
  'capacitation.prematureArHazardPerHour', 'energy.immobilizeHazardMaxPerHour',
]);
const HALFLIFE_IDS = new Set(['vagina.motileHalfLifeMin']);

export const DEFAULT_CONFIG = Object.freeze({
  mode: 'biology',            // 'biology' | 'arcade'
  ovulationOffsetH: 4,        // ovulation relative to deposition (t=0); may be negative
  volumeMl: 3.0,
  concentrationMPerMl: 60,
  progressiveMotilityMean: null, // null → sampled per race from the registry beta
  normalMorphologyMean: null,    // null → sampled per race
  paramOverrides: {},            // {registryId: value}, clamped to bounds
  label: 'WHO median semen profile',
  /* UI hint only. The engine stores it to PROVE it changes nothing. */
  visualCount: 2600,
});

export function createSimulation(userConfig = {}, seed = 1) {
  const config = { ...DEFAULT_CONFIG, ...userConfig, paramOverrides: { ...(userConfig.paramOverrides || {}) } };
  return new Simulation(config, seed >>> 0);
}

class Simulation {
  constructor(config, seed) {
    this.config = config;
    this.seed = seed;
    this.t = 0;
    this.outcome = null;
    this.fused = false;
    this.eventLog = [];
    this.eventSeq = 0;

    const root = new RNG(seed, 'race');
    this.rngRace = root.fork('race-traits');
    this.rngEvents = root.fork('events');
    this.rngFinalists = root.fork('finalists');
    this.rngNames = root.fork('names');

    /* Parameter view: overrides clamped by the registry; Arcade Mode's
       hazard relief wraps get() and is labelled a game mechanic. */
    const base = makeParams(config.paramOverrides);
    if (config.mode === 'arcade') {
      const relief = base.get('arcade.hazardRelief');
      this.params = {
        get: (id) => {
          const v = base.get(id);
          if (RATE_IDS.has(id)) return v * relief;
          if (HALFLIFE_IDS.has(id)) return v / relief;
          return v;
        },
      };
    } else {
      this.params = base;
    }
    const p = this.params;

    /* Per-race sample individuality (a semen analysis, not "the average man"). */
    this.raceTraits = {
      progressiveMean: config.progressiveMotilityMean ??
        betaMeanConc(this.rngRace, p.get('semen.progressiveMotilityMean'), p.get('semen.motilityConcentration')),
      morphologyMean: config.normalMorphologyMean ??
        betaMeanConc(this.rngRace, p.get('semen.normalMorphologyMean'), 30),
    };
    /* The egg has its own failure modes: competence is drawn once per race
       and revealed only in the outcome (see oocyte.competenceProb). */
    this.oocyteCompetent = this.rngRace.nextFloat() < p.get('oocyte.competenceProb');

    this.totalCount = Math.round(config.volumeMl * config.concentrationMPerMl * MILLION);

    this.population = new Population(
      {
        totalCount: this.totalCount,
        progressiveMean: this.raceTraits.progressiveMean,
        morphologyMean: this.raceTraits.morphologyMean,
      },
      p,
      root.fork('cohorts'),
      (e) => this.log(e.type, e.detail, e)
    );
    this.population.onTubeArrival = (cohort, t) => this.onTubeArrival(cohort, t);

    this.finalists = [];
    this.tubeArrivalsW = 0;
    this.everAmpullaW = 0;
    this.everNearOocyteW = 0;
    this.waveCount = 0;

    /* Grid anchors (absolute multiples — the determinism backbone). */
    this.cohortDt = p.get('sim.cohortDtS');
    this.finalistDt = p.get('sim.finalistDtS');
    this.fineDt = p.get('sim.fineDtS');
    this.nextCohortTickT = this.cohortDt;
    this.nextFinalistTickT = this.finalistDt;

    this.maxBioTimeS = p.get('sim.maxBioTimeH') * S_PER_HOUR;

    /* The oocyte has its own clock. Ovulation may precede deposition. */
    const tOv = config.ovulationOffsetH * S_PER_HOUR;
    this.oocyte = {
      ovulationAt: tOv,
      arrivesAt: tOv + p.get('oocyte.pickupDelayMin') * S_PER_MIN,
      present: false,
      /* Fertilization happens at the ampullary-isthmic junction — the
         proximal ampulla, not deep in the tube. */
      sMmInAmpulla: 0.15 * STAGES[AMP].lengthMm,
      closedAt: null,
    };

    this.scheduler = new Scheduler();
    if (tOv >= 0) this.scheduler.schedule(tOv, 'ovulation');
    else this.handleOvulation(0, true); // ovulated before the race began
    this.scheduler.schedule(Math.max(0, this.oocyte.arrivesAt), 'oocyte-arrives');
    /* Continuous decay closes the window when viability ≈ 2%. */
    const closeAge = p.get('oocyte.viabilityT50H') * S_PER_HOUR +
      p.get('oocyte.viabilityDecayKH') * S_PER_HOUR * Math.log(0.98 / 0.02);
    /* Clamped to 0: with a deeply negative ovulation offset the window may
       already be shut — the event then fires on the first step, never in
       negative time (the clock must not run backwards). */
    this.scheduler.schedule(Math.max(0, tOv + closeAge), 'oocyte-window-closed');
    this.scheduler.schedule(this.maxBioTimeS, 'horizon');
    this.scheduler.schedule(exponential(this.rngEvents, p.get('transport.contractionRatePerMin') / S_PER_MIN), 'wave');
    for (const c of this.population.cohorts) {
      if (c.stage === STAGE_INDEX.vagina) {
        this.scheduler.schedule(this.population.nextMucusEntryWait(), 'mucus', { cohortId: c.id });
      }
    }

    this.milestones = new Set();
    this.log('deposition', `${formatCount(this.totalCount)} cells deposited · ${config.volumeMl.toFixed(1)} mL × ${config.concentrationMPerMl} M/mL — flowback claims ${formatCount(this.population.flowbackLost)}`);
    if (config.mode === 'arcade') {
      this.log('arcade', 'ARCADE MODE — hazard relief + guaranteed finish are GAME MECHANICS, not biology');
    }
  }

  /* ── time control ─────────────────────────────────────────────────────── */

  step(dtBio) {
    if (dtBio > 0) this.advanceTo(this.t + dtBio);
    return this;
  }

  /**
   * runUntil(cond) — cond(sim) => bool, or the string 'outcome'.
   * Always terminates: the horizon event fires at sim.maxBioTimeH.
   */
  runUntil(cond, { chunkS = 600 } = {}) {
    const done = cond === 'outcome' ? () => this.outcome !== null : cond;
    while (!done(this) && this.t < this.maxBioTimeS && !this.outcome) {
      this.advanceTo(Math.min(this.t + chunkS, this.maxBioTimeS));
    }
    return this;
  }

  advanceTo(target) {
    /* THE WORLD FREEZES AT THE OUTCOME. Once the race resolves, no further
       stochastic work may run — otherwise funnel counters (and therefore
       the replay hash and the displayed telemetry) would depend on how far
       past the outcome the caller happened to advance, breaking the
       slicing-independence contract. */
    if (this.outcome) return;
    target = Math.min(target, this.maxBioTimeS);
    while (this.t < target) {
      const tNext = Math.min(target, this.nextCohortTickT, this.scheduler.peekTime());
      this.integrateFinalistsTo(tNext);
      if (this.outcome) { this.t = this.outcome.tBio; return; }
      this.t = tNext;
      let ev;
      while ((ev = this.scheduler.popDue(this.t))) {
        this.handleEvent(ev);
        if (this.outcome) return; // frozen at the resolving event
      }
      if (this.t >= this.nextCohortTickT) {
        this.cohortTick(this.cohortDt);
        this.nextCohortTickT += this.cohortDt;
        if (this.outcome) return;
      }
    }
  }

  /* ── the statistical heartbeat (Δ = sim.cohortDtS) ────────────────────── */

  cohortTick(dt) {
    const pop = this.population;
    pop.mortalityTick(this.t, dt);
    pop.progressTick(this.t, dt);
    pop.compact();

    /* Slow hazards on finalists (reservoir/ampulla mortality, premature AR,
       immobilization) live on this coarse grid — µm-scale motion does not
       need them at 2 s. Weighted mass dies with its representative. */
    const p = this.params;
    for (const a of this.finalists) {
      if (TERMINAL.has(a.state)) continue;
      let lambda = 0;
      if (a.phase === 'reservoir') lambda += p.get('isthmus.reservoirMortalityPerHour') / S_PER_HOUR;
      else lambda += p.get('ampulla.mortalityPerHour') / S_PER_HOUR;
      lambda += immobilizeLambdaPerS(a, p);
      if (lambda > 0 && this.rngFinalists.nextFloat() < 1 - Math.exp(-lambda * dt)) {
        const cause = a.energy <= p.get('energy.motilityKneeE')
          ? 'energy reserves exhausted — immobilized'
          : a.phase === 'reservoir' ? 'lost in the isthmic reservoir' : 'lost searching the ampulla';
        this.endAgent(a, a.energy <= p.get('energy.motilityKneeE') ? S.IMMOTILE : S.DEAD, cause);
        continue;
      }
      /* Premature acrosome reaction — armed, but away from the zona. */
      if ((a.state === S.CAPACITATED || a.state === S.HYPER) && a.phase !== 'zona' && a.phase !== 'penetrating') {
        const lam = p.get('capacitation.prematureArHazardPerHour') / S_PER_HOUR;
        if (this.rngFinalists.nextFloat() < 1 - Math.exp(-lam * dt)) {
          this.endAgent(a, S.PREMATURE_AR, 'acrosome fired early — fertilizing ability lost');
        }
      }
    }

    this.checkExtinction();
  }

  /* ── the individual layer (Δ = sim.finalistDtS, absolute grid) ────────── */

  integrateFinalistsTo(tEnd) {
    const p = this.params;
    while (this.nextFinalistTickT <= tEnd) {
      const t = this.nextFinalistTickT;
      const ctx = { params: p, rng: this.rngFinalists, oocyte: this.oocyteView(t) };
      for (const a of this.finalists) {
        if (!a.active || TERMINAL.has(a.state)) continue;
        if (a.phase === 'search') {
          /* Near the oocyte the geometry is 10–100 µm — substep finely.
             Substeps are INSIDE the atomic grid tick: slicing-safe. */
          const near = ctx.oocyte.present && a.stage === AMP &&
            Math.abs(a.sMm - ctx.oocyte.sMmInAmpulla) * UM_PER_MM < 3000;
          if (near) {
            const n = Math.max(1, Math.round(this.finalistDt / this.fineDt));
            for (let i = 0; i < n && a.phase === 'search'; i += 1) {
              this.moveAgent(a, t + i * this.fineDt, this.fineDt, ctx);
            }
          } else {
            this.moveAgent(a, t, this.finalistDt, ctx);
          }
        } else if (a.phase === 'cumulus' || a.phase === 'zona' || a.phase === 'penetrating') {
          this.interactionTick(a, t, this.finalistDt, ctx);
        }
      }
      this.nextFinalistTickT += this.finalistDt;
    }
  }

  moveAgent(a, t, dt, ctx) {
    const overflowMm = integrateAgent(a, t, dt, ctx);
    if (a.stage === IST && overflowMm > 0) {
      a.stage = AMP;
      a.sMm = Math.min(overflowMm, STAGES[AMP].lengthMm);
      this.everAmpullaW += a.weight;
      this.milestone('first-ampulla', `${a.callsign} enters the ampulla — the final chamber`, t);
    } else if (a.stage === AMP) {
      if (a.sMm >= STAGES[AMP].lengthMm) a.sMm = STAGES[AMP].lengthMm; // fimbrial end — nowhere further
      const o = ctx.oocyte;
      if (o.present) {
        const distUm = Math.hypot((o.sMmInAmpulla - a.sMm) * UM_PER_MM, a.uUm);
        /* Contact = touching the expanded cumulus complex (its halfWidth). */
        if (distUm < STAGES[STAGE_INDEX.cumulus].halfWidthMm * UM_PER_MM) {
          /* Only ARMED cells can work the matrix; uncapacitated
             passers-by drift on. */
          if (a.state === S.HYPER || a.state === S.CAPACITATED) {
            a.phase = 'cumulus';
            a.enteredCumulusAt = t;
            this.everNearOocyteW += a.weight;
            this.milestone('first-cumulus', `${a.callsign} reaches the cumulus cloud`, t);
          }
        }
      }
    }
  }

  /** Cumulus → zona → acrosome reaction → penetration → fusion, each its own
      probabilistic event; every hazard is p = 1 − exp(−λ·dt). */
  interactionTick(a, t, dt, ctx) {
    const p = this.params;
    const rng = this.rngFinalists;
    const o = ctx.oocyte;
    if (!o.present) { a.phase = 'search'; return; } // complex not there (yet/anymore)

    if (a.phase === 'cumulus') {
      const hyperBoost = a.state === S.HYPER ? p.get('oocyte.cumulusHyperFactor') : 1;
      const lam = (p.get('oocyte.cumulusBaseHazardPerMin') * hyperBoost) / S_PER_MIN;
      if (rng.nextFloat() < 1 - Math.exp(-lam * dt)) {
        a.phase = 'zona';
        this.milestone('first-zona', `${a.callsign} through the cumulus — at the zona surface`);
      }
      return;
    }

    if (a.phase === 'zona') {
      /* Two SEQUENTIAL hazards, binding retained across ticks: contact ×
         per-contact bind probability first, THEN the zona-induced acrosome
         reaction. Nesting both in one tick would collapse the sequence into
         an O(dt²) pseudo-hazard ~50× slower than the registry rates. */
      if (!a.zonaBound) {
        const lam = (p.get('oocyte.zonaContactRatePerMin') * p.get('oocyte.zonaBindProb')) / S_PER_MIN;
        if (rng.nextFloat() < 1 - Math.exp(-lam * dt)) a.zonaBound = true;
        return;
      }
      const lamAr = p.get('oocyte.zonaArHazardPerMin') / S_PER_MIN;
      if (rng.nextFloat() < 1 - Math.exp(-lamAr * dt)) {
        transition(a, S.AR, t, 'zona-induced acrosome reaction');
        a.phase = 'penetrating';
        a.penetrationEndsAt = t + logNormal(rng, p.get('oocyte.zonaPenetrationMedianMin') * S_PER_MIN, 0.4);
        this.log('acrosome', `${a.callsign} bound — acrosome reaction, digging through the zona`, {}, t);
      }
      return;
    }

    if (a.phase === 'penetrating' && t + dt >= a.penetrationEndsAt) {
      if (this.fused) {
        this.endAgent(a, S.DEAD, 'zona hardened by the cortical reaction — locked out', t + dt);
        return;
      }
      /* Fusion: bernoulli(fusionProb × current oocyte viability), and an
         incompetent oocyte cannot fuse at all — the egg has a veto. */
      const pFuse = this.oocyteCompetent ? p.get('oocyte.fusionProb') * o.viability : 0;
      if (rng.nextFloat() < pFuse) {
        this.declareWinner(a, t + dt, false);
      } else {
        this.endAgent(a, S.DAMAGED, this.oocyteCompetent
          ? 'spent acrosome, failed fusion — oocyte viability was too far gone'
          : 'spent acrosome, failed fusion — this oocyte could not be fertilized', t + dt);
      }
    }
  }

  /* ── events ───────────────────────────────────────────────────────────── */

  handleEvent(ev) {
    const p = this.params;
    switch (ev.type) {
      case 'wave': {
        const carried = this.population.applyWave(this.t);
        this.waveCount += 1;
        if (carried > 0 && (this.waveCount < 6 || carried > 50000)) {
          this.log('wave', `uterine contraction wave carries ${formatCount(carried)} forward`);
        }
        this.scheduler.schedule(
          this.t + exponential(this.rngEvents, p.get('transport.contractionRatePerMin') / S_PER_MIN),
          'wave'
        );
        break;
      }
      case 'mucus': {
        const before = this.population.ever.cervix;
        const persists = this.population.attemptMucusEntry(ev.payload.cohortId, this.t);
        const entered = this.population.ever.cervix - before;
        if (entered > 0) {
          this.milestone('first-mucus', `first cells swim into cervical mucus (${formatDuration(this.t)} in)`);
        }
        if (persists && !this.outcome) {
          this.scheduler.schedule(this.t + this.population.nextMucusEntryWait(), 'mucus', ev.payload);
        }
        break;
      }
      case 'ovulation':
        this.handleOvulation(this.t, false);
        break;
      case 'oocyte-arrives':
        this.oocyte.present = true;
        this.log('oocyte', 'the cumulus-oocyte complex settles in the ampulla — the finish line exists now');
        break;
      case 'oocyte-window-closed':
        this.oocyte.closedAt = this.t;
        if (!this.fused) {
          if (this.config.mode === 'arcade' && p.get('arcade.guaranteedWinner') >= 1) {
            const cand = this.bestCandidate();
            if (cand) {
              this.log('arcade', `ARCADE OVERRIDE — ${cand.callsign} granted the finish (game mechanic, not biology)`);
              this.declareWinner(cand, this.t, true);
              break;
            }
          }
          this.log('oocyte', 'oocyte viability window closed — no fertilization this cycle');
          this.setOutcome({ type: 'no-fertilization', reason: 'oocyte-expired' });
        }
        break;
      case 'cap-done': {
        const a = this.finalists[ev.payload.id];
        if (!a || TERMINAL.has(a.state) || a.state !== S.CAPACITATING) break;
        transition(a, S.CAPACITATED, this.t, 'capacitation complete');
        a.windowEndsAt = this.t + a.windowS;
        this.scheduler.schedule(a.windowEndsAt, 'window-expire', { id: a.id });
        this.scheduler.schedule(
          this.t + exponential(this.rngEvents, Math.LN2 / (p.get('isthmus.releaseJitterMin') * S_PER_MIN)),
          'release', { id: a.id }
        );
        this.milestone('first-capacitated', `${a.callsign} capacitated after ${formatDuration(this.t - a.arrivedAt)} — the arming is individual and temporary`);
        break;
      }
      case 'release': {
        const a = this.finalists[ev.payload.id];
        if (!a || a.state !== S.CAPACITATED) break;
        transition(a, S.HYPER, this.t, 'hyperactivated — released from the epithelium');
        a.active = true;
        a.phase = 'search';
        this.milestone('first-release', `${a.callsign} tears free of the reservoir, hyperactivated`);
        break;
      }
      case 'window-expire': {
        const a = this.finalists[ev.payload.id];
        if (!a || TERMINAL.has(a.state)) break;
        if (a.state === S.CAPACITATED || a.state === S.HYPER || a.state === S.AR) {
          this.endAgent(a, S.EXPIRED, 'capacitated window closed — fertilizing competence lost');
        }
        break;
      }
      case 'survival-cap': {
        const a = this.finalists[ev.payload.id];
        if (!a || TERMINAL.has(a.state)) break;
        this.endAgent(a, S.DEAD, 'viability span exhausted');
        break;
      }
      case 'horizon':
        if (!this.outcome) this.setOutcome({ type: 'no-fertilization', reason: 'horizon' });
        break;
      default:
        throw new Error(`unknown event ${ev.type}`);
    }
  }

  handleOvulation(t, preRace) {
    this.log('ovulation', preRace
      ? `ovulation occurred ${formatDuration(-this.oocyte.ovulationAt)} BEFORE deposition — the oocyte is already aging`
      : 'ovulation — an oocyte is released and the fimbria reach for it');
  }

  /* ── tube arrivals → finalists (stratified, weighted) ─────────────────── */

  onTubeArrival(cohort, t) {
    const n = cohort.count;
    this.tubeArrivalsW += n;
    const p = this.params;
    const cap = Math.round(p.get('sim.finalistMax'));
    const room = cap - this.finalists.length;
    if (room > 0) {
      /* Early trickles arrive as individuals (weight 1); later floods split
         across remaining slots. Weights always sum to real arrivals. */
      const k = Math.min(room, n);
      const w = n / k;
      for (let i = 0; i < k; i += 1) {
        const a = createFinalist(cohort, w, t, this.rngFinalists, this.rngNames, p, this.finalists.length);
        this.finalists.push(a);
        transition(a, S.CAPACITATING, t, 'tubal environment begins capacitation');
        /* Capacitation-incompetent cells attempt forever and never finish —
           they hold the reservoir, part of why any-instant responsiveness
           is a single-digit percentage. */
        if (a.canCapacitate) {
          a.capDoneAt = this.capCompletionTime(t, a.capReqS);
          this.scheduler.schedule(a.capDoneAt, 'cap-done', { id: a.id });
        }
        this.scheduler.schedule(a.survivalCapAt, 'survival-cap', { id: a.id });
      }
      this.milestone('first-tube', `first arrivals bind the isthmic reservoir (${formatDuration(t)} in) — early, but the wait decides nothing`);
    } else {
      /* Capacity reached: the arrival mass reinforces the nearest-quality
         RESERVOIR-BOUND sibling (arrivals bind the reservoir; mass must not
         teleport onto a cell already off searching). If it can only land on
         a further-along agent, patch the funnel counters it already passed
         so the funnel stays exactly monotone. */
      let best = null;
      let bestD = Infinity;
      for (const a of this.finalists) {
        if (TERMINAL.has(a.state)) continue;
        const d = Math.abs(a.cohortQz - cohort.qz) + (a.phase === 'reservoir' ? 0 : 100);
        if (d < bestD) { bestD = d; best = a; }
      }
      if (best) {
        best.weight += n;
        if (best.stage === AMP) this.everAmpullaW += n;
        if (best.phase === 'cumulus' || best.phase === 'zona' || best.phase === 'penetrating') {
          this.everNearOocyteW += n;
        }
      }
      /* If every finalist is terminal the arrivals simply perish untracked
         as individuals; conservation uses handedToFinalists, so the audit
         still balances. */
    }
  }

  /**
   * Reservoir-suppression capacitation model: while bound BEFORE the
   * periovulatory ramp, the capacitation clock runs at a suppressed rate;
   * from rampT (= ovulation − lead) it runs at the in-vitro rate. Piecewise
   * linear ⇒ closed-form completion time, schedulable at arrival.
   */
  capCompletionTime(arrivalT, capReqS) {
    const p = this.params;
    const f = p.get('capacitation.reservoirSuppressionFactor');
    const rampT = Math.max(0, this.oocyte.ovulationAt - p.get('capacitation.periovulatoryLeadH') * S_PER_HOUR);
    if (arrivalT >= rampT) return arrivalT + capReqS;
    const workBeforeRamp = (rampT - arrivalT) * f;
    if (workBeforeRamp >= capReqS) return arrivalT + capReqS / f;
    return rampT + (capReqS - workBeforeRamp);
  }

  /* ── outcomes ─────────────────────────────────────────────────────────── */

  bestCandidate() {
    let best = null;
    let bestScore = -Infinity;
    for (const a of this.finalists) {
      if (TERMINAL.has(a.state) || !VIABLE.has(a.state)) continue;
      const phaseRank = { penetrating: 4, zona: 3, cumulus: 2, search: 1, reservoir: 0 }[a.phase] ?? 0;
      const score = phaseRank * 1000 - Math.abs(a.sMm - this.oocyte.sMmInAmpulla);
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  declareWinner(a, t, arcadeOverride) {
    /* The polyspermy block is simulation-level and immediate: fused is
       checked before every fusion path, so a second winner is impossible. */
    if (this.fused) throw new Error('polyspermy block violated');
    if (a.state !== S.AR) {
      /* Arcade override may crown a cell that had not naturally reached AR.
         Walk it through the legal transitions — the state machine is law. */
      if (a.state === S.CAPACITATING) transition(a, S.CAPACITATED, t, 'arcade override');
      if (a.state === S.CAPACITATED) transition(a, S.HYPER, t, 'arcade override');
      if (a.state === S.HYPER) transition(a, S.AR, t, 'arcade override');
    }
    transition(a, S.FUSED, t, arcadeOverride ? 'ARCADE OVERRIDE fusion' : 'oolemma fusion');
    this.fused = true;
    a.phase = 'fused';
    this.log('fusion', `${a.callsign} fuses with the oolemma ${arcadeOverride ? '(ARCADE OVERRIDE)' : ''} — cortical reaction fires, the zona hardens`, {}, t);
    /* Post-fusion block: competitors at the zona are shut out, not "beaten".
       Agents already in a terminal state (e.g. window expired mid-approach)
       keep their own ending. */
    for (const b of this.finalists) {
      if (b === a || TERMINAL.has(b.state)) continue;
      if (b.phase === 'zona' || b.phase === 'penetrating' || b.phase === 'cumulus') {
        this.endAgent(b, S.DEAD, 'polyspermy block — the zona hardened first', t);
      }
    }
    this.setOutcome({
      type: 'fertilization',
      arcadeOverride,
      winner: this.describeFinalist(a, true),
    }, t);
  }

  endAgent(a, terminalState, cause, t = this.t) {
    transition(a, terminalState, t, cause);
    a.active = false;
    a.whyEnded = { t, cause, state: terminalState };
    if (a.weight >= 1 && (a.phase !== 'reservoir' || this.finalists.length <= 60)) {
      this.log('loss', `${a.callsign} — ${cause}`, {}, t);
    }
  }

  checkExtinction() {
    if (this.outcome || this.fused) return;
    const popAlive = this.population.counts().motile + this.population.residual;
    const finalistsViable = this.finalists.some((a) => VIABLE.has(a.state));
    if (popAlive === 0 && !finalistsViable) {
      this.log('extinction', 'no viable cells remain anywhere in the tract');
      this.setOutcome({ type: 'no-fertilization', reason: 'population-exhausted' });
    }
  }

  setOutcome(o, t = this.t) {
    if (this.outcome) return;
    this.outcome = {
      ...o,
      tBio: t,
      /* Post-hoc honesty: reveal the egg's own state only once it's over. */
      oocyteCompetent: this.oocyteCompetent,
      decisive: this.eventLog.slice(-14),
    };
  }

  /* ── views ────────────────────────────────────────────────────────────── */

  oocyteView(t) {
    const o = this.oocyte;
    return {
      present: o.present && !this.fused,
      sMmInAmpulla: o.sMmInAmpulla,
      viability: this.oocyteViability(t),
    };
  }

  oocyteViability(t) {
    const o = this.oocyte;
    if (t < o.ovulationAt) return 0;
    const ageH = (t - o.ovulationAt) / S_PER_HOUR;
    const t50 = this.params.get('oocyte.viabilityT50H');
    const k = this.params.get('oocyte.viabilityDecayKH');
    return 1 / (1 + Math.exp((ageH - t50) / k));
  }

  milestone(key, detail, t = this.t) {
    if (this.milestones.has(key)) return;
    this.milestones.add(key);
    this.log('milestone', detail, {}, t);
  }

  log(type, detail, extra = {}, t = this.t) {
    this.eventLog.push({ seq: this.eventSeq++, t, type, detail, ...extra });
    if (this.eventLog.length > EVENT_LOG_CAP) this.eventLog.shift();
  }

  describeFinalist(a, full = false) {
    const casa = casaMetrics(a);
    return {
      id: a.id,
      callsign: a.callsign,
      state: a.state,
      phase: a.phase,
      stage: STAGES[a.stage].id,
      sMm: round3(a.sMm),
      uUm: Math.round(a.uUm),
      weight: round3(a.weight),
      energy: round3(a.energy),
      vsl0UmS: round3(a.vsl0UmS),
      sexChromosome: a.sexChromosome,
      arrivedAt: a.arrivedAt,
      capDoneAt: a.capDoneAt,
      windowEndsAt: a.windowEndsAt,
      casa: casa && {
        vcl: round3(casa.vcl), vsl: round3(casa.vsl), vap: round3(casa.vap),
        lin: round3(casa.lin), str: round3(casa.str),
      },
      whyEnded: a.whyEnded,
      history: full ? [...a.history] : a.history.slice(-6),
    };
  }

  /** Serializable, framework-free view. Everything the UI shows lives here. */
  getSnapshot() {
    const pop = this.population;
    const { perStage, motile } = pop.counts();

    /* Expired-window and premature-AR cells are ALIVE but infertile — they
       stay in the alive/tubal denominators (the responsive-fraction
       statistic is measured against living cells, not fertile ones). */
    const DEAD_STATES = new Set([S.DEAD, S.IMMOTILE, S.FILTERED, S.DAMAGED, S.FUSED]);
    let aliveW = 0, capacitatedW = 0, nearOocyteW = 0, reservoirW = 0, ampullaW = 0,
      cumulusW = 0, zonaW = 0;
    for (const a of this.finalists) {
      if (DEAD_STATES.has(a.state)) continue;
      aliveW += a.weight;
      if (a.state === S.CAPACITATED || a.state === S.HYPER || a.state === S.AR) capacitatedW += a.weight;
      if (a.phase === 'reservoir') reservoirW += a.weight;
      else if (a.phase === 'search') ampullaW += a.weight;
      else if (a.phase === 'cumulus') { cumulusW += a.weight; nearOocyteW += a.weight; }
      else if (a.phase === 'zona' || a.phase === 'penetrating') { zonaW += a.weight; nearOocyteW += a.weight; }
    }

    const stages = STAGES.map((st, i) => {
      let count = 0;
      if (i <= STAGE_INDEX.utj) count = perStage[i];
      else if (i === IST) count = Math.round(reservoirW);
      else if (i === STAGE_INDEX.capacitation) count = Math.round(capacitatedW);
      else if (i === AMP) count = Math.round(ampullaW);
      else if (i === STAGE_INDEX.cumulus) count = Math.round(cumulusW);
      else if (i === STAGE_INDEX.zona) count = Math.round(zonaW);
      else if (i === STAGE_INDEX.fusion) count = this.fused ? 1 : 0;
      return { id: st.id, name: st.name, kind: st.kind, count };
    });

    return {
      tBio: this.t,
      seed: this.seed,
      mode: this.config.mode,
      label: this.config.label,
      outcome: this.outcome,
      oocyte: {
        ovulationAt: this.oocyte.ovulationAt,
        arrivesAt: this.oocyte.arrivesAt,
        present: this.oocyte.present && !this.fused,
        viability: round3(this.oocyteViability(this.t)),
        closedAt: this.oocyte.closedAt,
      },
      stages,
      totals: {
        deposited: this.totalCount,
        alive: motile + pop.residual + Math.round(aliveW),
        motile: motile + Math.round(aliveW),
        capacitated: Math.round(capacitatedW),
        tubal: Math.round(aliveW),
        nearOocyte: Math.round(nearOocyteW),
        flowback: pop.flowbackLost,
      },
      funnel: [
        { id: 'deposited', label: 'DEPOSITED', ever: pop.ever.deposited },
        { id: 'cervix', label: 'ENTERED MUCUS', ever: pop.ever.cervix },
        { id: 'uterus', label: 'REACHED UTERUS', ever: pop.ever.uterus },
        { id: 'utj', label: 'AT THE JUNCTION', ever: pop.ever.utj },
        { id: 'tube', label: 'REACHED THE TUBES', ever: pop.ever.tube },
        { id: 'ampulla', label: 'RELEASED · AMPULLA', ever: Math.round(this.everAmpullaW) },
        { id: 'nearOocyte', label: 'REACHED THE OOCYTE', ever: Math.round(this.everNearOocyteW) },
        { id: 'fused', label: 'FUSED', ever: this.fused ? 1 : 0 },
      ],
      raceTraits: {
        progressiveMean: round3(this.raceTraits.progressiveMean),
        morphologyMean: round3(this.raceTraits.morphologyMean),
      },
      finalists: this.finalists.map((a) => this.describeFinalist(a)),
      events: this.eventLog.slice(-60),
      waveCount: this.waveCount,
      audit: { conserved: pop.audit() === this.totalCount },
    };
  }

  /** Live references for the same-process renderer ONLY (read-only by
      contract). Tests and UI logic use getSnapshot(). */
  peekFinalists() {
    return this.finalists;
  }

  /* ── replay ───────────────────────────────────────────────────────────── */

  serializeReplay() {
    return JSON.stringify({
      version: 1,
      seed: this.seed,
      config: this.config,
      tBio: this.t,
      outcomeHash: this.outcomeHash(),
      outcomeType: this.outcome?.type ?? null,
    });
  }

  outcomeHash() {
    const s = this.getSnapshot();
    const sig = JSON.stringify([
      s.outcome?.type, s.outcome?.winner?.callsign, s.outcome?.tBio,
      s.funnel.map((f) => f.ever), s.totals.deposited,
    ]);
    return hashString(sig);
  }
}

/**
 * Rebuild a race from a serialized replay and re-run it to the recorded
 * time. Determinism IS the storage format; `verified` proves the outcome
 * reproduced exactly.
 */
export function loadReplay(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data.version !== 1) throw new Error(`unsupported replay version ${data.version}`);
  const sim = createSimulation(data.config, data.seed);
  sim.advanceTo(data.tBio);
  return { sim, verified: sim.outcomeHash() === data.outcomeHash };
}

const round3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
