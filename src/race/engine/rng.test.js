import { describe, it, expect } from 'vitest';
import { RNG, splitmix32, hashString } from './rng.js';
import {
  normal, logNormal, beta, betaMeanConc, binomial, poisson, exponential,
  truncated, normalQuantile, normalCdf, latentTraitZ, sigmaLogFromQuantile,
} from './distributions.js';

describe('RNG core', () => {
  it('same seed + label reproduces the exact sequence', () => {
    const a = new RNG(12345, 'x');
    const b = new RNG(12345, 'x');
    for (let i = 0; i < 1000; i += 1) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('different labels give different streams', () => {
    const a = new RNG(12345, 'x');
    const b = new RNG(12345, 'y');
    let same = 0;
    for (let i = 0; i < 100; i += 1) if (a.nextUint32() === b.nextUint32()) same += 1;
    expect(same).toBeLessThan(3);
  });

  it('fork depends only on (seed, label path), never on draw position', () => {
    const r1 = new RNG(99, 'root');
    const r2 = new RNG(99, 'root');
    r2.nextFloat(); r2.nextFloat(); r2.nextFloat(); // burn the parent
    const f1 = r1.fork('child');
    const f2 = r2.fork('child');
    for (let i = 0; i < 100; i += 1) expect(f1.nextUint32()).toBe(f2.nextUint32());
  });

  it('nextFloat ∈ [0, 1) with fine granularity', () => {
    const r = new RNG(7, 'f');
    let min = 1, max = 0;
    for (let i = 0; i < 10000; i += 1) {
      const u = r.nextFloat();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      min = Math.min(min, u); max = Math.max(max, u);
    }
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });

  it('splitmix32 and hashString are stable', () => {
    const m = splitmix32(42);
    expect(m()).toBe(splitmix32(42)());
    expect(hashString('cohorts')).toBe(hashString('cohorts'));
    expect(hashString('cohorts')).not.toBe(hashString('finalists'));
  });
});

describe('distribution moments and bounds', () => {
  const N = 20000;

  it('normal: mean ≈ 0, var ≈ 1', () => {
    const r = new RNG(1, 'norm');
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i += 1) { const z = normal(r); s += z; s2 += z * z; }
    expect(Math.abs(s / N)).toBeLessThan(0.03);
    expect(s2 / N).toBeGreaterThan(0.95);
    expect(s2 / N).toBeLessThan(1.05);
  });

  it('logNormal: median matches the parameter', () => {
    const r = new RNG(2, 'ln');
    const xs = Array.from({ length: N }, () => logNormal(r, 6, 0.36)).sort((a, b) => a - b);
    const median = xs[N / 2];
    expect(median).toBeGreaterThan(5.7);
    expect(median).toBeLessThan(6.3);
    expect(xs[0]).toBeGreaterThan(0);
  });

  it('sigmaLogFromQuantile inverts correctly', () => {
    const sigma = sigmaLogFromQuantile(6, 10, 0.9);
    // median 6, p90 = 10 ⇒ exp(sigma * z90) = 10/6
    expect(6 * Math.exp(sigma * normalQuantile(0.9))).toBeCloseTo(10, 6);
  });

  it('beta: bounded in (0,1), mean ≈ a/(a+b)', () => {
    const r = new RNG(3, 'beta');
    let s = 0;
    for (let i = 0; i < N; i += 1) {
      const x = beta(r, 2, 5);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
      s += x;
    }
    expect(Math.abs(s / N - 2 / 7)).toBeLessThan(0.01);
    const rm = new RNG(4, 'betamc');
    let sm = 0;
    for (let i = 0; i < N; i += 1) sm += betaMeanConc(rm, 0.55, 18);
    expect(Math.abs(sm / N - 0.55)).toBeLessThan(0.01);
  });

  it('binomial exact regime: mean/var of Binomial(20, 0.3)', () => {
    const r = new RNG(5, 'binv');
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i += 1) {
      const k = binomial(r, 20, 0.3);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(20);
      s += k; s2 += k * k;
    }
    const mean = s / N;
    const varr = s2 / N - mean * mean;
    expect(Math.abs(mean - 6)).toBeLessThan(0.08);      // np = 6
    expect(Math.abs(varr - 4.2)).toBeLessThan(0.25);    // npq = 4.2
  });

  it('binomial edge cases and large-n regimes stay sane', () => {
    const r = new RNG(6, 'bedge');
    expect(binomial(r, 100, 0)).toBe(0);
    expect(binomial(r, 100, 1)).toBe(100);
    expect(binomial(r, 0, 0.5)).toBe(0);
    // poisson-approx regime: n = 1e8, p = 1e-6 ⇒ λ = 100
    let s = 0;
    for (let i = 0; i < 500; i += 1) {
      const k = binomial(r, 1e8, 1e-6);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1e8);
      s += k;
    }
    expect(s / 500).toBeGreaterThan(85);
    expect(s / 500).toBeLessThan(115);
    // normal-approx regime: n = 1e6, p = 0.4
    let s4 = 0;
    for (let i = 0; i < 200; i += 1) s4 += binomial(r, 1e6, 0.4);
    expect(Math.abs(s4 / 200 - 400000)).toBeLessThan(500);
    // symmetry: p > 0.5 routes through the small tail
    let s9 = 0;
    for (let i = 0; i < 2000; i += 1) s9 += binomial(r, 50, 0.9);
    expect(Math.abs(s9 / 2000 - 45)).toBeLessThan(0.35);
  });

  it('poisson: mean ≈ λ in both regimes', () => {
    const r = new RNG(7, 'pois');
    let sSmall = 0, sBig = 0;
    for (let i = 0; i < N; i += 1) sSmall += poisson(r, 3);
    for (let i = 0; i < 2000; i += 1) sBig += poisson(r, 300);
    expect(Math.abs(sSmall / N - 3)).toBeLessThan(0.05);
    expect(Math.abs(sBig / 2000 - 300)).toBeLessThan(2.5);
  });

  it('exponential: mean ≈ 1/rate, always positive', () => {
    const r = new RNG(8, 'exp');
    let s = 0;
    for (let i = 0; i < N; i += 1) {
      const x = exponential(r, 0.25);
      expect(x).toBeGreaterThan(0);
      s += x;
    }
    expect(Math.abs(s / N - 4)).toBeLessThan(0.15);
  });

  it('truncated respects hard bounds', () => {
    const r = new RNG(9, 'trunc');
    for (let i = 0; i < 5000; i += 1) {
      const x = truncated(r, (rr) => 6 * Math.exp(0.8 * normal(rr)), 2, 12);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThanOrEqual(12);
    }
  });

  it('normalQuantile / normalCdf round-trip', () => {
    for (const p of [0.001, 0.05, 0.25, 0.5, 0.9, 0.999]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 3);
    }
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
  });

  it('latent copula induces corr(z1, z2) ≈ λ1·λ2', () => {
    const r = new RNG(10, 'cop');
    const l1 = 0.75, l2 = 0.65;
    let s12 = 0, s1 = 0, s2 = 0, q1 = 0, q2 = 0;
    const M = 30000;
    for (let i = 0; i < M; i += 1) {
      const q = normal(r);
      const z1 = latentTraitZ(r, q, l1);
      const z2 = latentTraitZ(r, q, l2);
      s12 += z1 * z2; s1 += z1; s2 += z2; q1 += z1 * z1; q2 += z2 * z2;
    }
    const corr = (s12 / M - (s1 / M) * (s2 / M)) /
      Math.sqrt((q1 / M - (s1 / M) ** 2) * (q2 / M - (s2 / M) ** 2));
    expect(Math.abs(corr - l1 * l2)).toBeLessThan(0.02);
  });
});
