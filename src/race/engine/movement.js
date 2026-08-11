/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — FINALIST AGENTS & MOVEMENT SOLVER
   Cells that pass the uterotubal junction graduate from the statistical
   layer to individually-simulated "finalists" (capped, weighted — see
   sim.finalistMax). Each carries the statistical weight of the arrivals it
   represents, so HUD counts stay honest while the fertilization endgame is
   played out cell-by-cell.

   Motion is an Euler–Maruyama step of

     dx = [ v·e(θ) + flow + thermotaxis + chemotaxis ]·dt + √(2·Dt·dt)·N(0,I)
     dθ = [ rheotaxis + chemotaxis-turn ]·dt + √(2·Dr·dt)·N(0,1)

   with the biology gates hard-wired:
     · chemotaxis terms exist ONLY for states in CHEMOTACTIC (capacitated
       window) and ONLY inside the chemoattractant radius of the oocyte
     · thermotaxis is a weak tubal drift, capacitated cells only
     · hyperactivation multiplies VCL, angular noise and energy cost and
       CUTS effective straight-line progress (LIN drops) — not a speed boost
     · walls align and slide (hydrodynamic boundary behaviour), no bounce
       teleports; X/Y chromosome carries exactly zero motility effect

   Coordinates: sMm axial (along current stage, mm), uUm lateral (µm from
   centreline), θ measured from the +axial direction.
   ═══════════════════════════════════════════════════════════════════════════ */

import { S_PER_HOUR, S_PER_MIN, UM_PER_MM } from './units.js';
import { normal, logNormal, latentTraitZ, truncated } from './distributions.js';
import { STAGES, STAGE_INDEX } from './stages.js';
import { S, CHEMOTACTIC } from './stateMachine.js';

const IST = STAGE_INDEX.isthmus;
const AMP = STAGE_INDEX.ampulla;

/* Spotlight callsigns — deterministic pick via the 'names' stream. */
const CALLSIGNS = [
  'VEGA', 'RIGEL', 'ALTAIR', 'MIRA', 'DENEB', 'SPICA', 'ATLAS', 'LYRA',
  'NOVA', 'ORION', 'CETUS', 'HYDRA', 'PAVO', 'INDUS', 'FORNAX', 'CARINA',
  'AQUILA', 'CYGNUS', 'DORADO', 'PHOENIX', 'VELA', 'CORVUS', 'LUPUS', 'ARA',
];

/**
 * Individualize one finalist out of an arriving cohort. Traits re-add the
 * idiosyncratic ε the cohort aggregate averaged out (one-factor copula),
 * so two finalists from one cohort are siblings, not clones.
 */
export function createFinalist(cohort, weight, t, rngF, rngNames, params, id) {
  const p = params;
  const q = cohort.qz;
  const lamV = p.get('motion.loadingSpeed');
  const lamE = p.get('motion.loadingEnergy');
  const lamC = p.get('motion.loadingCapacitation');

  const zV = latentTraitZ(rngF, q, lamV);
  const vsl0 = p.get('motion.vslMedianUmS') * Math.exp(0.35 * zV);
  const zE = latentTraitZ(rngF, q, lamE);
  const energy = clamp(0.72 + 0.12 * zE, 0.2, 0.98);
  const zC = latentTraitZ(rngF, q, lamC);
  const capTimeS = truncated(
    rngF,
    (r) => p.get('capacitation.medianH') * S_PER_HOUR * Math.exp(0.36 * zC + 0.12 * normal(r)),
    1 * S_PER_HOUR,
    24 * S_PER_HOUR
  );
  const windowS = truncated(
    rngF,
    (r) => p.get('capacitation.windowMedianMin') * S_PER_MIN * Math.exp(0.4 * normal(r)),
    50 * S_PER_MIN,
    240 * S_PER_MIN
  );
  const survivalCapS = logNormal(rngF, p.get('survival.tractMedianH') * S_PER_HOUR, 0.5);

  /* Only a subpopulation is capacitation-competent at all (PNAS95). */
  const canCapacitate = rngF.nextFloat() < p.get('capacitation.everCapacitatesProb');

  /* Sex chromosome LAST, after every motility-relevant draw, and used by
     nothing but the inspector display. No fictional X/Y speed advantage. */
  const sexChromosome = rngF.nextFloat() < 0.5 ? 'X' : 'Y';

  const csIdx = rngNames.nextInt(CALLSIGNS.length);

  return {
    id,
    callsign: `SPZ-${String(id + 1).padStart(3, '0')} · ${CALLSIGNS[csIdx]}`,
    weight,
    cohortQz: q,
    sexChromosome,
    state: S.UNCAP,
    history: [{ t, from: null, to: S.UNCAP, cause: 'passed the uterotubal junction' }],
    active: false,          // bound in the reservoir until release
    stage: IST,
    sMm: 8 + rngF.nextFloat() * 10, // the reservoir is the distal (caudal) isthmus
    uUm: (rngF.nextFloat() * 2 - 1) * 300,
    theta: (rngF.nextFloat() * 2 - 1) * 0.6,
    vsl0UmS: vsl0,
    energy,
    arrivedAt: t,
    canCapacitate,
    /* capReqS is capacitation WORK (in-vitro-rate seconds). The engine maps
       it to a completion time via the reservoir-suppression model — bound
       cells arm slowly until the periovulatory ramp. */
    capReqS: capTimeS,
    capDoneAt: null,        // stamped by the engine at creation
    windowS,                // capacitated-state lifetime, drawn now
    windowEndsAt: null,     // stamped at capacitation completion
    survivalCapAt: t + survivalCapS,
    phase: 'reservoir',     // reservoir → search → cumulus → zona → penetrating
    zonaBound: false,       // binding is RETAINED across ticks (sequential hazards)
    penetrationEndsAt: null,
    whyEnded: null,
    /* CASA ring buffer: [t, xUm, yUm] triplets for VCL/VSL/VAP. */
    track: [],
  };
}

/* ── the SDE step ───────────────────────────────────────────────────────── */

/**
 * Advance one active finalist by dt seconds.
 * ctx: { params, rng, oocyte: {present, sMmInAmpulla, viability} }
 * Returns axial overflow into the next stage (mm) when the cell crosses the
 * isthmus→ampulla boundary; stage/phase transitions themselves are the
 * engine's job.
 */
export function integrateAgent(a, t, dt, ctx) {
  const p = ctx.params;
  const rng = ctx.rng;
  const st = STAGES[a.stage];
  const sFrac = clamp(a.sMm / Math.max(st.lengthMm, 1e-9), 0, 1);

  const hyper = a.state === S.HYPER;
  const eScale = motilityScale(a.energy, p);

  /* Velocity semantics: vsl0 is the cell's intrinsic straight-line speed.
     VCL — what it actually traces — is vclFactor larger; hyperactivation
     raises VCL further but LIN collapses, so net progress drops. */
  const vcl = a.vsl0UmS * p.get('motion.vclFactor') * (hyper ? p.get('motion.hyperVclFactor') : 1) * eScale;
  const vEff = a.vsl0UmS * (hyper ? p.get('motion.hyperLinFactor') : 1) * eScale;

  const flow = st.flowUmS(p, sFrac, t); // µm/s, + toward oocyte

  /* dθ terms ─ rheotaxis: turn to face INTO the flow (θ → 0 when flow < 0,
     θ → π when flow > 0 would push forward; facing upstream is the observed
     behaviour and, in the isthmus countercurrent, points at the oocyte). */
  let dTheta = 0;
  if (Math.abs(flow) > 1) {
    const target = flow < 0 ? 0 : Math.PI;
    dTheta += p.get('motion.rheotaxisAlignRatePerS') * angleTo(a.theta, target) * dt;
  }

  /* Chemotaxis — the armed window only, near the oocyte only. */
  let chemoAx = 0;
  let chemoLat = 0;
  if (
    ctx.oocyte.present &&
    CHEMOTACTIC.has(a.state) &&
    a.stage === AMP
  ) {
    const dxUm = (ctx.oocyte.sMmInAmpulla - a.sMm) * UM_PER_MM;
    const dyUm = -a.uUm;
    const dist = Math.hypot(dxUm, dyUm);
    const R = p.get('motion.chemotaxisRadiusUm');
    if (dist < R && dist > 1) {
      const g = 1 - dist / R; // gradient strength rises toward the source
      const dir = Math.atan2(dyUm, dxUm);
      dTheta += p.get('motion.chemotaxisTurnGainPerS') * g * angleTo(a.theta, dir) * dt;
      chemoAx = p.get('motion.chemotaxisDriftUmS') * g * Math.cos(dir);
      chemoLat = p.get('motion.chemotaxisDriftUmS') * g * Math.sin(dir);
    }
  }

  /* Thermotaxis — weak axial drift, tube only, capacitated only. */
  const thermo =
    CHEMOTACTIC.has(a.state) && (a.stage === IST || a.stage === AMP)
      ? p.get('motion.thermotaxisDriftUmS')
      : 0;

  /* Rotational noise (hyperactivation widens it) + drift. */
  const Dr = p.get('motion.rotDiffusionRadPerS') * (hyper ? p.get('motion.hyperRotDiffusionFactor') : 1);
  a.theta += dTheta + Math.sqrt(2 * Dr * dt) * normal(rng);
  a.theta = wrapAngle(a.theta);

  /* Translational step, µm. */
  const Dt = p.get('motion.transDiffusionUm2PerS');
  const noise = Math.sqrt(2 * Dt * dt);
  let dxUm = (vEff * Math.cos(a.theta) + flow + thermo + chemoAx) * dt + noise * normal(rng);
  let duUm = (vEff * Math.sin(a.theta) + chemoLat) * dt + noise * normal(rng);

  a.sMm += dxUm / UM_PER_MM;
  a.uUm += duUm;

  /* Walls: hydrodynamic alignment — clamp to the local half-width and relax
     the heading toward the NEAREST wall tangent at the registry's alignment
     rate, with a slight inward cant so cells slide along the boundary
     rather than grinding into it. No bounce, no teleport. */
  const halfUm = st.halfWidthMm * st.widthProfile(sFrac) * UM_PER_MM;
  if (Math.abs(a.uUm) > halfUm) {
    a.uUm = Math.sign(a.uUm) * halfUm;
    const inward = a.uUm > 0 ? -1 : 1;
    const tangent = Math.abs(angleTo(a.theta, 0)) <= Math.abs(angleTo(a.theta, Math.PI)) ? 0 : Math.PI;
    const target = tangent + inward * 0.15; // cant is display-geometry, not biology
    const k = Math.min(1, p.get('motion.wallAlignRatePerS') * dt);
    a.theta = wrapAngle(a.theta + k * angleTo(a.theta, target));
  }
  if (a.sMm < 0) a.sMm = 0; // the countercurrent cannot flush a cell back through the UTJ

  /* Energy: dE/dt = −(base + speed·(v/v₀)² + hyper), scaled to per-second. */
  const vRel = vcl / (p.get('motion.vslMedianUmS') * p.get('motion.vclFactor'));
  const drainPerH =
    p.get('energy.baseCostPerHour') +
    p.get('energy.speedCostPerHour') * vRel * vRel +
    (hyper ? p.get('energy.hyperCostPerHour') : 0);
  a.energy = clamp(a.energy - (drainPerH / S_PER_HOUR) * dt, 0, 1);

  /* CASA track (thin to ~1 sample/s, 40 s window). */
  const tr = a.track;
  if (!tr.length || t - tr[tr.length - 1][0] >= 1) {
    tr.push([t, a.sMm * UM_PER_MM, a.uUm, vcl]);
    while (tr.length > 40) tr.shift();
  }

  return a.sMm > st.lengthMm ? a.sMm - st.lengthMm : 0;
}

/** Immobilization hazard rate (per s) — rises as reserves empty. */
export function immobilizeLambdaPerS(a, p) {
  const knee = p.get('energy.motilityKneeE');
  if (a.energy >= knee) return 0;
  const frac = 1 - a.energy / knee;
  return (p.get('energy.immobilizeHazardMaxPerHour') * frac) / S_PER_HOUR;
}

/** Velocity scaling with energy: smooth failure below the knee. */
export function motilityScale(energy, p) {
  const knee = p.get('energy.motilityKneeE');
  if (energy >= knee) return 1;
  return clamp(energy / knee, 0.05, 1) ** 1.5;
}

/* ── CASA metrics: VCL, VSL, VAP, LIN, STR over the track window ────────── */

export function casaMetrics(a) {
  const tr = a.track;
  if (tr.length < 3) return null;
  const dur = tr[tr.length - 1][0] - tr[0][0];
  if (dur <= 0) return null;
  let path = 0;
  for (let i = 1; i < tr.length; i += 1) {
    path += Math.hypot(tr[i][1] - tr[i - 1][1], tr[i][2] - tr[i - 1][2]);
  }
  /* VCL from the instantaneous record (sampling at 1 Hz underestimates the
     true curvilinear path, so we report the mean recorded VCL instead). */
  const vcl = tr.reduce((s, x) => s + x[3], 0) / tr.length;
  const vsl = Math.hypot(tr[tr.length - 1][1] - tr[0][1], tr[tr.length - 1][2] - tr[0][2]) / dur;
  /* VAP: 5-point smoothed path. */
  let vap = 0;
  const sm = [];
  for (let i = 0; i < tr.length; i += 1) {
    const lo = Math.max(0, i - 2);
    const hi = Math.min(tr.length - 1, i + 2);
    let sx = 0, sy = 0;
    for (let j = lo; j <= hi; j += 1) { sx += tr[j][1]; sy += tr[j][2]; }
    sm.push([sx / (hi - lo + 1), sy / (hi - lo + 1)]);
  }
  for (let i = 1; i < sm.length; i += 1) {
    vap += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  }
  vap /= dur;
  return {
    vcl, vsl, vap,
    lin: vcl > 0 ? vsl / vcl : 0,
    str: vap > 0 ? vsl / vap : 0,
    pathUm: path,
  };
}

/* ── helpers ────────────────────────────────────────────────────────────── */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const wrapAngle = (t) => {
  while (t > Math.PI) t -= 2 * Math.PI;
  while (t < -Math.PI) t += 2 * Math.PI;
  return t;
};

/** Shortest signed angular distance from θ to target. */
const angleTo = (theta, target) => wrapAngle(target - theta);
