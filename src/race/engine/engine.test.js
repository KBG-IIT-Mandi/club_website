import { describe, it, expect } from 'vitest';
import { createSimulation } from './engine.js';
import { paramDef, PARAM_LIST, makeParams } from './biologyParameters.js';
import { sToMin, sToH } from './units.js';

describe('biological timeline sanity', () => {
  it('cells enter cervical mucus within minutes', () => {
    for (const seed of [1, 2, 3]) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed);
      sim.runUntil((s) => s.population.ever.cervix > 0);
      expect(sToMin(sim.t)).toBeLessThan(30);
    }
  }, 30000);

  it('first tubal arrivals land in the rapid-transport window (~5–40 min)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed * 7);
      sim.runUntil((s) => s.population.ever.tube > 0);
      const min = sToMin(sim.t);
      expect(min).toBeGreaterThan(2);
      expect(min).toBeLessThan(60);
    }
  }, 30000);

  it('tube arrivals total in the thousands, not millions (of ~180M deposited)', () => {
    const sim = createSimulation({ ovulationOffsetH: 4 }, 42);
    sim.runUntil('outcome');
    const tube = sim.getSnapshot().funnel.find((f) => f.id === 'tube').ever;
    expect(tube).toBeGreaterThan(100);
    expect(tube).toBeLessThan(100000);
  }, 30000);

  it('capacitation requirements are hours-scale, log-normal-ish (median ≈ 6 h)', () => {
    const sim = createSimulation({ ovulationOffsetH: 4 }, 9);
    sim.runUntil((s) => s.finalists.length >= 150 || s.t > 6 * 3600);
    const reqs = sim.peekFinalists().map((a) => sToH(a.capReqS)).sort((a, b) => a - b);
    expect(reqs.length).toBeGreaterThan(50);
    const median = reqs[Math.floor(reqs.length / 2)];
    expect(median).toBeGreaterThan(3.5);
    expect(median).toBeLessThan(9);
    expect(reqs[0]).toBeGreaterThanOrEqual(1);            // truncation floor
    expect(reqs[reqs.length - 1]).toBeLessThanOrEqual(24); // truncation ceiling
  }, 30000);

  it('the capacitated window is bounded to 50–240 min per cell', () => {
    const sim = createSimulation({ ovulationOffsetH: 4 }, 10);
    sim.runUntil((s) => s.finalists.length >= 100 || s.t > 6 * 3600);
    for (const a of sim.peekFinalists()) {
      expect(a.windowS).toBeGreaterThanOrEqual(50 * 60);
      expect(a.windowS).toBeLessThanOrEqual(240 * 60);
    }
  }, 30000);

  it('ovulation offset changes the outcome landscape (old egg fails)', () => {
    const old = createSimulation({ ovulationOffsetH: -40 }, 3);
    old.runUntil('outcome');
    expect(old.outcome.type).toBe('no-fertilization');

    const timely = createSimulation({ ovulationOffsetH: 4 }, 3);
    timely.runUntil('outcome');
    expect(timely.outcome).not.toBeNull();
  }, 60000);
});

describe('arcade vs biology mode', () => {
  it('the arcade override actually fires, is labelled, and only exists in arcade mode', () => {
    /* Force races an incompetent oocyte cannot win naturally: the override
       must grant the finish. Deterministic sweep — assert it fires within
       the first few seeds rather than hiding behind an if. */
    const overrides = { 'oocyte.competenceProb': 0.3 };
    let seen = null;
    for (let seed = 1; seed <= 10 && !seen; seed += 1) {
      const sim = createSimulation({ mode: 'arcade', ovulationOffsetH: 4, paramOverrides: overrides }, seed);
      sim.runUntil('outcome');
      const o = sim.getSnapshot().outcome;
      if (o.type === 'fertilization' && o.arcadeOverride) seen = { sim, o };
    }
    expect(seen).not.toBeNull();
    expect(seen.o.winner.history.some((h) => /arcade/i.test(h.cause))).toBe(true);
    expect(seen.sim.getSnapshot().events.some((e) => e.type === 'arcade' && /OVERRIDE/.test(e.detail))).toBe(true);
  }, 60000);

  it('biology mode NEVER carries an arcade override', () => {
    for (const seed of [42, 7]) {
      const sim = createSimulation({ ovulationOffsetH: 4 }, seed);
      sim.runUntil('outcome');
      const o = sim.getSnapshot().outcome;
      if (o.type === 'fertilization') expect(o.arcadeOverride).toBe(false);
    }
  }, 30000);
});

describe('snapshot contract', () => {
  it('snapshots are JSON-serializable and self-consistent', () => {
    const sim = createSimulation({ ovulationOffsetH: 4 }, 6);
    sim.step(3 * 3600);
    const s = sim.getSnapshot();
    const round = JSON.parse(JSON.stringify(s));
    expect(round.tBio).toBe(s.tBio);
    expect(round.funnel).toEqual(s.funnel);
    expect(s.seed).toBe(6);
    expect(s.stages).toHaveLength(10);
  });
});

describe('parameter registry integrity', () => {
  it('every parameter carries units, distribution, bounds, source, confidence, kind and an explanation', () => {
    expect(PARAM_LIST.length).toBeGreaterThan(40);
    for (const d of PARAM_LIST) {
      expect(d.id).toMatch(/^[a-z]+\.[a-zA-Z0-9]+$/);
      expect(typeof d.value).toBe('number');
      expect(d.units.length).toBeGreaterThan(0);
      expect(d.dist.length).toBeGreaterThan(0);
      expect(Array.isArray(d.bounds)).toBe(true);
      expect(d.value).toBeGreaterThanOrEqual(d.bounds[0]);
      expect(d.value).toBeLessThanOrEqual(d.bounds[1]);
      expect(d.url ?? d.source).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(d.confidence);
      expect(['measured', 'inferred', 'gameplay']).toContain(d.kind);
      expect(d.explain.length).toBeGreaterThan(30);
    }
  });

  it('overrides are clamped to registry bounds', () => {
    const p = makeParams({ 'oocyte.viabilityT50H': 999, 'capacitation.medianH': -5 });
    expect(p.get('oocyte.viabilityT50H')).toBe(paramDef('oocyte.viabilityT50H').bounds[1]);
    expect(p.get('capacitation.medianH')).toBe(paramDef('capacitation.medianH').bounds[0]);
  });

  it('unknown parameters throw instead of silently defaulting', () => {
    expect(() => paramDef('made.up')).toThrow(/unknown/);
    expect(() => makeParams({}).get('made.up')).toThrow(/unknown/);
  });
});
