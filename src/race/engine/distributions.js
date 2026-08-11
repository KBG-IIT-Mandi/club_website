/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — DISTRIBUTIONS
   Every sampler takes the injected RNG stream as its first argument; nothing
   here owns randomness. Choices per the modeling brief:

     · log-normal   positive quantities (speed, survival, capacitation time)
     · beta         bounded fractions (progressive motility)
     · bernoulli /  gates and survival
       binomial
     · poisson      contraction & state-transition event counts
     · truncated    where biology imposes hard limits
     · gaussian     one latent quality factor correlates speed, progression,
       copula       energy and morphology instead of independent draws

   Binomial gate passage: exact inversion for small populations, numerically
   safe Poisson / normal approximations for large ones (a cohort of 10⁸ must
   not iterate 10⁸ times, and exp(-λ) must not underflow).
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── standard normal ────────────────────────────────────────────────────── */

/** Box-Muller (cosine branch). Two uniforms per draw, stateless — no cached
    spare, so draw sequences stay position-independent across call sites. */
export function normal(rng) {
  const u1 = rng.nextFloatOpen();
  const u2 = rng.nextFloat();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export const normalScaled = (rng, mu, sigma) => mu + sigma * normal(rng);

/* Abramowitz & Stegun 7.1.26 — max abs error 1.5e-7, plenty for gating. */
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export const normalCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

/* Acklam's rational approximation of the inverse normal CDF (~1e-9 rel err).
   Used for stratified cohort quantiles and quantile-parameterised lognormals. */
export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/* ── log-normal ─────────────────────────────────────────────────────────── */

/** Parameterised by MEDIAN (not mean) — medians are what the sources quote. */
export const logNormal = (rng, median, sigmaLog) =>
  median * Math.exp(sigmaLog * normal(rng));

/** σ_log from a quoted quantile: e.g. median 6h with p90 = 10h. */
export const sigmaLogFromQuantile = (median, q, atP) =>
  Math.log(q / median) / normalQuantile(atP);

/** Deterministic log-normal quantile — used to place stratified cohorts. */
export const logNormalQuantile = (median, sigmaLog, p) =>
  median * Math.exp(sigmaLog * normalQuantile(p));

/* ── gamma / beta ───────────────────────────────────────────────────────── */

/** Marsaglia & Tsang (2000). For shape < 1, boosts via U^(1/shape). */
export function gamma(rng, shape) {
  if (shape < 1) {
    const u = rng.nextFloatOpen();
    return gamma(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.nextFloatOpen();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function beta(rng, a, b) {
  const x = gamma(rng, a);
  const y = gamma(rng, b);
  return x / (x + y);
}

/** Beta re-parameterised by (mean, concentration) — how motility fractions
    are quoted: a population mean and how tightly individuals cluster. */
export const betaMeanConc = (rng, mean, conc) =>
  beta(rng, mean * conc, (1 - mean) * conc);

/* ── bernoulli / binomial ───────────────────────────────────────────────── */

export const bernoulli = (rng, p) => (rng.nextFloat() < p ? 1 : 0);

/** Exact inversion (BINV). Cost ~ n·p iterations — callers route here only
    when that is small. One uniform per draw. */
function binomialInv(rng, n, p) {
  const q = 1 - p;
  const s = p / q;
  let f = Math.pow(q, n); // safe: only called when n·p is small, so q^n ≫ 0
  let u = rng.nextFloat();
  let k = 0;
  while (u > f && k < n) {
    u -= f;
    k += 1;
    f *= s * (n - k + 1) / k;
  }
  return k;
}

/**
 * Binomial(n, p) — the gate sampler.
 *   exact inversion        n·min(p,q) ≤ 30
 *   poisson approximation  p ≤ 1e-3  (λ = n·p; classic rare-event regime)
 *   normal approximation   otherwise (variance n·p·q ≥ ~30 here, CLT holds)
 * Result is always an integer in [0, n].
 */
export function binomial(rng, n, p) {
  n = Math.floor(n);
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (p > 0.5) return n - binomial(rng, n, 1 - p); // keep the small tail exact
  const np = n * p;
  if (np <= 30) {
    if (p <= 1e-3 && n > 1000) return Math.min(n, poisson(rng, np));
    return binomialInv(rng, n, p);
  }
  const k = Math.round(np + Math.sqrt(np * (1 - p)) * normal(rng));
  return Math.min(n, Math.max(0, k));
}

/* ── poisson ────────────────────────────────────────────────────────────── */

export function poisson(rng, lambda) {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    /* Knuth — exp(-λ) is well above underflow for λ < 30. */
    const limit = Math.exp(-lambda);
    let k = 0;
    let prod = rng.nextFloat();
    while (prod > limit) {
      k += 1;
      prod *= rng.nextFloat();
    }
    return k;
  }
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng)));
}

/** Next inter-arrival time of a Poisson process with the given rate (per s). */
export const exponential = (rng, ratePerS) =>
  -Math.log(rng.nextFloatOpen()) / ratePerS;

/* ── truncation ─────────────────────────────────────────────────────────── */

/** Rejection with a clamp backstop — biology imposes the bounds, the clamp
    only fires in the (astronomically rare) 32-strike case. */
export function truncated(rng, sampler, lo, hi) {
  for (let i = 0; i < 32; i += 1) {
    const x = sampler(rng);
    if (x >= lo && x <= hi) return x;
  }
  return Math.min(hi, Math.max(lo, sampler(rng)));
}

/* ── the latent-quality copula ──────────────────────────────────────────── */

/**
 * One standard-normal latent factor q per sperm/cohort induces realistic
 * correlations between traits (a fast cell tends to be a progressive,
 * well-formed, well-fuelled cell) without asserting a full measured
 * covariance matrix, which no source provides.
 *
 *   z_trait = loading·q + √(1−loading²)·ε ,  ε ~ N(0,1)
 *
 * z_trait is standard normal with corr(z_i, z_j) = loading_i · loading_j —
 * a one-factor Gaussian copula. Feed z through each trait's own marginal
 * (log-normal, beta quantile, …) to get the correlated trait value.
 */
export function latentTraitZ(rng, q, loading) {
  return loading * q + Math.sqrt(1 - loading * loading) * normal(rng);
}
