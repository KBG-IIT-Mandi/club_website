import { describe, it, expect } from 'vitest';
import { createSimulation, loadReplay } from './engine.js';

/* The reproducibility contract: same config + seed ⇒ same outcome,
   regardless of how the caller slices time (frame rate, animation speed,
   fast-forward) and regardless of the visual particle count. */

const CONFIG = { ovulationOffsetH: 4 };
const SEED = 20260811;
const T_CHECK = 12 * 3600;

const fingerprint = (sim) => {
  const s = sim.getSnapshot();
  return JSON.stringify({
    outcome: s.outcome && { type: s.outcome.type, reason: s.outcome.reason, winner: s.outcome.winner?.callsign, t: s.outcome.tBio },
    funnel: s.funnel.map((f) => f.ever),
    totals: s.totals,
    finalists: s.finalists.map((f) => [f.id, f.state, f.phase, f.sMm, f.energy, f.weight]),
    t: s.tBio,
  });
};

describe('determinism across step patterns', () => {
  it('one big jump ≡ 7 s slices ≡ ragged 1234.5 s slices', () => {
    /* The engine freezes at the outcome, so slice loops must break on it —
       all variants freeze at the SAME instant, which is itself the test. */
    const a = createSimulation(CONFIG, SEED).step(T_CHECK);

    const b = createSimulation(CONFIG, SEED);
    while (b.t < T_CHECK && !b.outcome) b.step(Math.min(7, T_CHECK - b.t));

    const c = createSimulation(CONFIG, SEED);
    while (c.t < T_CHECK && !c.outcome) c.step(Math.min(1234.5, T_CHECK - c.t));

    const fa = fingerprint(a);
    expect(fingerprint(b)).toBe(fa);
    expect(fingerprint(c)).toBe(fa);
  }, 30000);

  it('simulated animation speeds (frame-sized slices at 1×…86400×) agree', () => {
    // A 60 fps frame at speed k advances k/60 biological seconds.
    const speeds = [600, 86400];
    const prints = speeds.map((k) => {
      const sim = createSimulation(CONFIG, SEED);
      const dt = k / 60;
      while (sim.t < T_CHECK && !sim.outcome) sim.step(Math.min(dt, T_CHECK - sim.t));
      return fingerprint(sim);
    });
    expect(prints[1]).toBe(prints[0]);
  }, 30000);
});

describe('statistical result vs presentation', () => {
  it('visual particle count cannot touch the outcome', () => {
    const runs = [400, 1800, 3000].map((visualCount) => {
      const sim = createSimulation({ ...CONFIG, visualCount }, SEED);
      sim.runUntil('outcome');
      return sim.outcomeHash();
    });
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
  }, 30000);

  it('different seeds actually differ (the RNG is doing something)', () => {
    const h1 = createSimulation(CONFIG, 1).runUntil('outcome').outcomeHash();
    const h2 = createSimulation(CONFIG, 2).runUntil('outcome').outcomeHash();
    expect(h1).not.toBe(h2);
  }, 30000);
});

describe('outcome invariance across drive styles (frame-loop vs fast-forward)', () => {
  /* Regression: outcome.tBio was once stamped from the caller's slice
     boundary, and the engine kept simulating past the outcome — both made
     the recorded outcome depend on HOW the race was driven. Seeds 1 and 2
     are the exact reproduction seeds from the adversarial audit. */
  it.each([1, 2, 7, 20260811])('seed %i: runUntil ≡ 9.7 s frame slices, to the exact fusion tick', (seed) => {
    const a = createSimulation(CONFIG, seed);
    a.runUntil('outcome');

    const b = createSimulation(CONFIG, seed);
    while (!b.outcome) b.step(9.7); // a 60 fps frame at ~600×: the UI's real drive

    expect(b.outcome.tBio).toBe(a.outcome.tBio);
    expect(b.outcomeHash()).toBe(a.outcomeHash());
    expect(JSON.stringify(b.getSnapshot().funnel)).toBe(JSON.stringify(a.getSnapshot().funnel));
  }, 60000);

  it('the world freezes at the outcome: stepping further changes nothing', () => {
    const sim = createSimulation(CONFIG, 42);
    sim.runUntil('outcome');
    const t = sim.t;
    const hash = sim.outcomeHash();
    const funnel = JSON.stringify(sim.getSnapshot().funnel);
    sim.step(6 * 3600);
    sim.step(0.5);
    expect(sim.t).toBe(t);
    expect(sim.outcomeHash()).toBe(hash);
    expect(JSON.stringify(sim.getSnapshot().funnel)).toBe(funnel);
  }, 30000);
});

describe('replay', () => {
  it('serializes, reloads, and reproduces the recorded outcome exactly', () => {
    const sim = createSimulation(CONFIG, SEED);
    sim.runUntil('outcome');
    const json = sim.serializeReplay();
    const { sim: replayed, verified } = loadReplay(json);
    expect(verified).toBe(true);
    expect(replayed.getSnapshot().outcome?.type).toBe(sim.getSnapshot().outcome?.type);
    expect(replayed.getSnapshot().outcome?.winner?.callsign)
      .toBe(sim.getSnapshot().outcome?.winner?.callsign);
  }, 30000);

  it('rejects unknown versions', () => {
    expect(() => loadReplay({ version: 99 })).toThrow(/version/);
  });
});
