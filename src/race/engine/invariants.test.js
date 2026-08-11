import { describe, it, expect } from 'vitest';
import { createSimulation } from './engine.js';
import { RNG } from './rng.js';
import { makeParams } from './biologyParameters.js';
import { Population } from './cohorts.js';
import { S, canTransition, CHEMOTACTIC } from './stateMachine.js';
import { createFinalist, integrateAgent } from './movement.js';
import { STAGE_INDEX, STAGES } from './stages.js';

const SEEDS = [11, 222, 3333];

describe('population invariants', () => {
  it('counts stay finite, non-negative and exactly conserved through a whole race', () => {
    for (const seed of SEEDS) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed);
      for (let i = 0; i < 24; i += 1) {
        sim.step(1800); // sample every 30 bio-minutes for 12 h
        const s = sim.getSnapshot();
        expect(s.audit.conserved).toBe(true);
        for (const st of s.stages) {
          expect(Number.isFinite(st.count)).toBe(true);
          expect(st.count).toBeGreaterThanOrEqual(0);
        }
        for (const v of Object.values(s.totals)) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        for (const f of s.funnel) {
          expect(Number.isFinite(f.ever)).toBe(true);
          expect(f.ever).toBeGreaterThanOrEqual(0);
        }
        if (s.outcome) break;
      }
    }
  }, 60000);

  it('the funnel is monotone: no stage sees more cells than the one before', () => {
    const sim = createSimulation({ ovulationOffsetH: 4 }, 77);
    sim.runUntil('outcome');
    const f = sim.getSnapshot().funnel;
    for (let i = 1; i < f.length; i += 1) {
      expect(f[i].ever).toBeLessThanOrEqual(f[i - 1].ever);
    }
  }, 30000);

  it('finalist weights conserve the tube handoff exactly', () => {
    /* The statistical→individual handoff must not create or lose mass:
       Σ weights over ALL finalists (living and dead) = cells that ever
       reached the tubes. */
    for (const seed of SEEDS) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed);
      sim.runUntil('outcome');
      const tube = sim.getSnapshot().funnel.find((f) => f.id === 'tube').ever;
      const weightSum = sim.peekFinalists().reduce((s, a) => s + a.weight, 0);
      const tol = 1e-6 * Math.max(1, tube); // w = n/k re-summed k times: float, not exact
      expect(Math.abs(weightSum - tube)).toBeLessThan(tol);
      expect(Math.abs(weightSum - sim.population.handedToFinalists)).toBeLessThan(tol);
    }
  }, 60000);

  it('cohort splitting under contraction waves conserves counts exactly', () => {
    const params = makeParams({});
    const pop = new Population(
      { totalCount: 5_000_000, progressiveMean: 0.55, morphologyMean: 0.14 },
      params, new RNG(5, 'test-cohorts'), () => {}
    );
    pop.onTubeArrival = () => {};
    const before = pop.audit();
    expect(before).toBe(5_000_000);
    // push some mass into the cervix/uterus, then hammer it with waves
    for (let i = 0; i < 40; i += 1) pop.attemptMucusEntry(pop.cohorts[i % pop.cohorts.length]?.id ?? 0, i * 60);
    for (let t = 0; t < 7200; t += 30) {
      pop.mortalityTick(t, 30);
      pop.progressTick(t, 30);
      if (t % 60 === 0) pop.applyWave(t);
      pop.compact();
      expect(pop.audit()).toBe(5_000_000);
      for (const c of pop.cohorts) {
        expect(c.count).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(c.count)).toBe(true);
      }
    }
  });
});

describe('fertilization invariants', () => {
  it('at most one fusion, and the winner passed through capacitation', () => {
    let sawFert = 0;
    for (const seed of [42, 7, 1234, 9, 555]) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed);
      sim.runUntil('outcome');
      const s = sim.getSnapshot();
      const fusedAgents = s.finalists.filter((f) => f.state === 'fused');
      expect(fusedAgents.length).toBeLessThanOrEqual(1);
      if (s.outcome?.type === 'fertilization') {
        sawFert += 1;
        const states = s.outcome.winner.history.map((h) => h.to);
        expect(states).toContain('capacitated');       // no fusion without capacitation
        expect(states).toContain('acrosome-reacted');  // and without the AR
        expect(states[states.length - 1]).toBe('fused');
      }
    }
    expect(sawFert).toBeGreaterThan(0); // the assertion actually exercised
  }, 60000);

  it('every recorded state transition is legal', () => {
    const sim = createSimulation({ ovulationOffsetH: 4 }, 31337);
    sim.runUntil('outcome');
    for (const a of sim.peekFinalists()) {
      const hist = a.history;
      for (let i = 1; i < hist.length; i += 1) {
        expect(
          canTransition(hist[i].from, hist[i].to),
          `${hist[i].from} → ${hist[i].to}`
        ).toBe(true);
        expect(hist[i].from).toBe(hist[i - 1].to);
      }
    }
  }, 30000);

  it('no fertilization when the oocyte window closed before the race', () => {
    for (const seed of SEEDS) {
      const sim = createSimulation({ ovulationOffsetH: -40 }, seed);
      sim.runUntil('outcome');
      const o = sim.getSnapshot().outcome;
      expect(o.type).toBe('no-fertilization');
    }
  }, 60000);

  it('every fusion happens while the oocyte is still viable, never after the window', () => {
    let fusions = 0;
    for (const seed of [42, 7, 9, 555, 2026]) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed);
      sim.runUntil('outcome');
      const o = sim.outcome;
      if (o.type !== 'fertilization') continue;
      fusions += 1;
      expect(sim.oocyteViability(o.tBio)).toBeGreaterThan(0.01);
      if (sim.oocyte.closedAt != null) expect(o.tBio).toBeLessThanOrEqual(sim.oocyte.closedAt);
      /* and nothing can fuse afterwards — the world is frozen */
      sim.step(24 * 3600);
      expect(sim.getSnapshot().finalists.filter((f) => f.state === 'fused')).toHaveLength(1);
    }
    expect(fusions).toBeGreaterThan(0);
  }, 60000);

  it('oocyte viability is 0 before ovulation and decays continuously after', () => {
    const sim = createSimulation({ ovulationOffsetH: 6 }, 1);
    expect(sim.oocyteViability(0)).toBe(0);
    expect(sim.oocyteViability(5 * 3600)).toBe(0);
    const v0 = sim.oocyteViability(6 * 3600);
    const v12 = sim.oocyteViability(18 * 3600);
    const v24 = sim.oocyteViability(30 * 3600);
    expect(v0).toBeGreaterThan(0.95);
    expect(v12).toBeGreaterThan(v24);
    expect(v24).toBeLessThan(0.15);
    expect(v12).toBeLessThan(v0);
  });

  it('long simulations terminate at the horizon with a legitimate outcome', () => {
    const sim = createSimulation({ ovulationOffsetH: -40, volumeMl: 1, concentrationMPerMl: 5 }, 8);
    sim.runUntil('outcome');
    expect(sim.outcome).not.toBeNull();
    expect(sim.t).toBeLessThanOrEqual(sim.maxBioTimeS);
    expect(['oocyte-expired', 'population-exhausted', 'horizon']).toContain(sim.outcome.reason);
  }, 60000);
});

describe('chemotaxis gating (the armed window only)', () => {
  const mkCtx = (params, rngLabel, present) => ({
    params,
    rng: new RNG(999, rngLabel),
    oocyte: { present, sMmInAmpulla: 9, viability: 1 },
  });

  const mkAgent = (state) => {
    const params = makeParams({});
    const cohort = { qz: 0.5 };
    const a = createFinalist(cohort, 1, 0, new RNG(4, 'agent'), new RNG(4, 'names'), params, 0);
    a.state = state;
    a.active = true;
    a.phase = 'search';
    a.stage = STAGE_INDEX.ampulla;
    a.sMm = 8.5;      // 500 µm from the oocyte — deep inside the gradient
    a.uUm = 0;
    a.theta = Math.PI / 2;
    return a;
  };

  it('an uncapacitated cell is BLIND to the oocyte: trajectory identical with and without it', () => {
    const params = makeParams({});
    const a1 = mkAgent(S.UNCAP);
    const a2 = mkAgent(S.UNCAP);
    const ctx1 = mkCtx(params, 'same', true);
    const ctx2 = mkCtx(params, 'same', false);
    for (let i = 0; i < 200; i += 1) {
      integrateAgent(a1, i, 0.5, ctx1);
      integrateAgent(a2, i, 0.5, ctx2);
    }
    expect(a1.sMm).toBe(a2.sMm);
    expect(a1.uUm).toBe(a2.uUm);
    expect(a1.theta).toBe(a2.theta);
  });

  it('a capacitated cell IS pulled by the gradient (same noise, different fate)', () => {
    const params = makeParams({});
    const a1 = mkAgent(S.CAPACITATED);
    const a2 = mkAgent(S.CAPACITATED);
    const ctx1 = mkCtx(params, 'same', true);
    const ctx2 = mkCtx(params, 'same', false);
    for (let i = 0; i < 200; i += 1) {
      integrateAgent(a1, i, 0.5, ctx1);
      integrateAgent(a2, i, 0.5, ctx2);
    }
    const d1 = Math.hypot((9 - a1.sMm) * 1000, a1.uUm);
    const d2 = Math.hypot((9 - a2.sMm) * 1000, a2.uUm);
    expect(d1).not.toBe(d2);       // the gradient entered the dynamics
    expect(d1).toBeLessThan(d2);   // and pulled the cell INWARD
  });

  it('the permission set is exactly the capacitated window', () => {
    expect(CHEMOTACTIC.has(S.UNCAP)).toBe(false);
    expect(CHEMOTACTIC.has(S.CAPACITATING)).toBe(false);
    expect(CHEMOTACTIC.has(S.EXPIRED)).toBe(false);
  });
});

describe('sex chromosome neutrality', () => {
  it('X- and Y-carrying finalists have statistically identical speed', () => {
    // Pool finalists across seeds; assignment is 50/50 and decoupled by design.
    const xs = [], ys = [];
    for (let seed = 1; seed <= 20; seed += 1) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed * 101);
      sim.runUntil((s) => s.finalists.length >= 100 || s.t > 6 * 3600);
      for (const a of sim.peekFinalists()) {
        (a.sexChromosome === 'X' ? xs : ys).push(a.vsl0UmS);
      }
    }
    const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
    const sd = (arr, m) => Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
    const mx = mean(xs), my = mean(ys);
    const pooled = sd([...xs, ...ys], mean([...xs, ...ys]));
    const se = pooled * Math.sqrt(1 / xs.length + 1 / ys.length);
    // |t| < 4 — generous CI; a real X/Y speed effect would blow far past it
    expect(Math.abs(mx - my) / se).toBeLessThan(4);
    // both actually populated
    expect(xs.length).toBeGreaterThan(200);
    expect(ys.length).toBeGreaterThan(200);
  }, 120000);
});

describe('stage definitions', () => {
  it('every stage carries geometry, flow, hazard metadata and copy', () => {
    for (const st of STAGES) {
      expect(st.lengthMm).toBeGreaterThanOrEqual(0);
      expect(st.halfWidthMm).toBeGreaterThan(0);
      expect(typeof st.flowUmS(makeParams({}), 0.5, 0)).toBe('number');
      expect(st.widthProfile(0)).toBeGreaterThan(0);
      expect(st.widthProfile(1)).toBeGreaterThan(0);
      expect(st.explain.length).toBeGreaterThan(40);
      expect(['high', 'medium', 'low']).toContain(st.confidence);
      expect(Array.isArray(st.hazards)).toBe(true);
    }
  });
});
