#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   MONTE CARLO VALIDATION — Virtual Sperm Race
   Runs N seeded races headlessly and reports the statistics the model
   claims, with tolerance checks (confidence bands, never exact counts):

     · first-arrival timing percentiles (mucus, tubes)
     · stage-by-stage survivor distributions (the attrition funnel)
     · capacitation-requirement percentiles vs the stated model assumption
     · chemotactically-responsive fraction vs the 2–12% literature band
     · fertilization / no-fertilization frequency
     · outcome sensitivity to ovulation timing
     · invariant violations (conservation, monotone funnel, polyspermy,
       negative/NaN counts, illegal transitions)

   Usage:  node scripts/raceValidation.mjs [--n 1000] [--seed0 1]
   Exit code 1 if any tolerance or invariant fails.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createSimulation } from '../src/race/engine/engine.js';
import { canTransition } from '../src/race/engine/stateMachine.js';
import { sToMin, sToH } from '../src/race/engine/units.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const N = flag('n', 1000);
const SEED0 = flag('seed0', 1);

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
};

console.log(`\nVIRTUAL SPERM RACE — Monte Carlo validation  ·  N = ${N}\n`);

/* ── main ensemble: default config, ovulation +4 h ─────────────────────── */

const firstMucusMin = [];
const firstTubeMin = [];
const funnelSamples = { cervix: [], uterus: [], utj: [], tube: [], nearOocyte: [] };
const capReqH = [];
const responsiveFracs = [];
const fusionTimesH = [];
const failReasons = {};
let fert = 0;
let incompetentEggs = 0;
let violations = 0;
const t0 = Date.now();

for (let i = 0; i < N; i += 1) {
  const seed = SEED0 + i * 7919;
  const sim = createSimulation({ ovulationOffsetH: 4 }, seed);

  let sawMucus = false;
  let sawTube = false;

  while (!sim.outcome && sim.t < sim.maxBioTimeS) {
    sim.step(sim.t < 7200 ? 120 : 600); // fine steps early: arrival percentiles need resolution
    const pop = sim.population;
    if (!sawMucus && pop.ever.cervix > 0) { sawMucus = true; firstMucusMin.push(sToMin(sim.t)); }
    if (!sawTube && pop.ever.tube > 0) { sawTube = true; firstTubeMin.push(sToMin(sim.t)); }
    if (pop.audit() !== sim.totalCount) violations += 1;
  }

  const s = sim.getSnapshot();
  if (!s.audit.conserved) violations += 1;
  const by = Object.fromEntries(s.funnel.map((f) => [f.id, f.ever]));
  funnelSamples.cervix.push(by.cervix);
  funnelSamples.uterus.push(by.uterus);
  funnelSamples.utj.push(by.utj);
  funnelSamples.tube.push(by.tube);
  funnelSamples.nearOocyte.push(by.nearOocyte);
  for (let k = 1; k < s.funnel.length; k += 1) {
    if (s.funnel[k].ever > s.funnel[k - 1].ever) violations += 1;
  }
  const fusedCount = s.finalists.filter((f) => f.state === 'fused').length;
  if (fusedCount > 1) violations += 1;
  for (const a of sim.peekFinalists()) {
    capReqH.push(sToH(a.capReqS));
    for (let k = 1; k < a.history.length; k += 1) {
      if (!canTransition(a.history[k].from, a.history[k].to)) violations += 1;
    }
    if (!Number.isFinite(a.energy) || a.energy < 0) violations += 1;
  }
  if (s.outcome.type === 'fertilization') {
    fert += 1;
    fusionTimesH.push(sToH(s.outcome.tBio));
    const w = s.outcome.winner;
    if (!w.history.some((h) => h.to === 'capacitated')) violations += 1;
    if (s.outcome.arcadeOverride) violations += 1; // biology mode must never override
  } else {
    failReasons[s.outcome.reason] = (failReasons[s.outcome.reason] ?? 0) + 1;
  }
  if (s.outcome.oocyteCompetent === false) incompetentEggs += 1;
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`ensemble complete in ${secs}s  ·  ${(N / ((Date.now() - t0) / 1000)).toFixed(1)} races/s\n`);

/* ── report ────────────────────────────────────────────────────────────── */

const sorted = (a) => [...a].sort((x, y) => x - y);

console.log('FIRST-ARRIVAL TIMING (minutes)');
const fm = sorted(firstMucusMin);
const ft = sorted(firstTubeMin);
console.log(`  mucus entry   p10 ${fmt(pct(fm, 0.1))}  p50 ${fmt(pct(fm, 0.5))}  p90 ${fmt(pct(fm, 0.9))}`);
console.log(`  tube arrival  p10 ${fmt(pct(ft, 0.1))}  p50 ${fmt(pct(ft, 0.5))}  p90 ${fmt(pct(ft, 0.9))}`);
check('mucus entry begins within minutes (p50 < 20 min)', pct(fm, 0.5) < 20);
check('rapid transport: first tube arrivals p50 within 5–40 min', pct(ft, 0.5) >= 5 && pct(ft, 0.5) <= 40, `p50 = ${fmt(pct(ft, 0.5))}`);

console.log('\nATTRITION FUNNEL (survivors ever reaching each stage, p10/p50/p90)');
for (const [k, arr] of Object.entries(funnelSamples)) {
  const srt = sorted(arr);
  console.log(`  ${k.padEnd(11)} ${String(Math.round(pct(srt, 0.1))).padStart(9)}  ${String(Math.round(pct(srt, 0.5))).padStart(9)}  ${String(Math.round(pct(srt, 0.9))).padStart(9)}`);
}
const tubeP50 = pct(sorted(funnelSamples.tube), 0.5);
check('of ~180M deposited, thousands reach the tubes (p50 in 500–20000)', tubeP50 >= 500 && tubeP50 <= 20000, `p50 = ${Math.round(tubeP50)}`);
const cervixP50 = pct(sorted(funnelSamples.cervix), 0.5);
check('~1% order of deposit enters mucus (p50 in 0.1%–3%)', cervixP50 >= 0.001 * 180e6 && cervixP50 <= 0.03 * 180e6, `p50 = ${(cervixP50 / 180e6 * 100).toFixed(2)}%`);

console.log('\nCAPACITATION (in-vitro-equivalent requirement, hours)');
const cr = sorted(capReqH);
console.log(`  p10 ${fmt(pct(cr, 0.1))}  p50 ${fmt(pct(cr, 0.5))}  p90 ${fmt(pct(cr, 0.9))}`);
check('median ≈ 6 h (4.5–8)', pct(cr, 0.5) >= 4.5 && pct(cr, 0.5) <= 8, `p50 = ${fmt(pct(cr, 0.5))}h`);
check('p10 ≈ 4 h (2.5–5.5)', pct(cr, 0.1) >= 2.5 && pct(cr, 0.1) <= 5.5, `p10 = ${fmt(pct(cr, 0.1))}h`);
check('p90 ≈ 10 h (7–14)', pct(cr, 0.9) >= 7 && pct(cr, 0.9) <= 14, `p90 = ${fmt(pct(cr, 0.9))}h`);

/* The 2–12% band (Cohen-Dayag 1995) is an IN VITRO statistic: capacitating
   conditions active, no oocyte consuming armed cells. The model analogue:
   late ovulation with a long periovulatory ramp, sampled hourly AFTER
   full-rate capacitating conditions begin but BEFORE the oocyte arrives. */
console.log('\nCHEMOTACTICALLY RESPONSIVE FRACTION');
console.log('(in-vitro analogue: capacitating conditions on, oocyte not yet present;');
console.log(' hourly armed/alive-tubal average over the 7 h before oocyte arrival, n = 150)');
for (let i = 0; i < 150; i += 1) {
  const sim = createSimulation(
    { ovulationOffsetH: 30, paramOverrides: { 'capacitation.periovulatoryLeadH': 8 } },
    SEED0 + 5_000_000 + i * 271
  );
  const ovT = sim.oocyte.ovulationAt;
  const samples = [];
  for (let h = 7; h >= 1; h -= 1) {
    const tSample = ovT - h * 3600;
    sim.runUntil(() => sim.t >= tSample);
    const s = sim.getSnapshot();
    if (s.totals.tubal >= 50) samples.push(s.totals.capacitated / s.totals.tubal);
  }
  if (samples.length >= 4) {
    responsiveFracs.push(samples.reduce((a, x) => a + x, 0) / samples.length);
  }
}
const rf = sorted(responsiveFracs);
console.log(`  p10 ${fmt(pct(rf, 0.1) * 100)}%  p50 ${fmt(pct(rf, 0.5) * 100)}%  p90 ${fmt(pct(rf, 0.9) * 100)}%  ·  n = ${rf.length}`);
check('median responsive fraction inside the 2–12% literature band', pct(rf, 0.5) >= 0.02 && pct(rf, 0.5) <= 0.12, `p50 = ${fmt(pct(rf, 0.5) * 100)}%`);

console.log('\nOUTCOMES (ovulation +4 h — near-ideal timing)');
console.log(`  fertilization ${fert}/${N} (${fmt(fert / N * 100)}%)  ·  fusion time p50 ${fmt(pct(sorted(fusionTimesH), 0.5))}h`);
console.log(`  failures: ${JSON.stringify(failReasons)}  ·  incompetent oocytes: ${incompetentEggs} (${fmt(incompetentEggs / N * 100)}%)`);
check('near-ideal timing fertilizes most runs (55–95%)', fert / N >= 0.55 && fert / N <= 0.95, `${fmt(fert / N * 100)}%`);
check('Biology Mode really can end with NO fertilization at ideal timing', fert < N, `${N - fert} no-fert runs`);
check('oocyte competence draw tracks its parameter (80% ± CI)',
  Math.abs(incompetentEggs / N - 0.2) < 3 * Math.sqrt(0.2 * 0.8 / N), `${fmt(incompetentEggs / N * 100)}%`);
check('but the outcome is not hard-coded (some spread or timing variance)',
  new Set(fusionTimesH.map((t) => t.toFixed(1))).size > 5);

/* ── ovulation-timing sensitivity (smaller sub-ensembles) ──────────────── */

console.log('\nOVULATION-TIMING SENSITIVITY (n = 24 each)');
const sens = [];
for (const off of [-30, -12, 0, 12, 30, 48]) {
  let f = 0;
  for (let i = 0; i < 24; i += 1) {
    const sim = createSimulation({ ovulationOffsetH: off }, SEED0 + 1_000_000 + i * 353);
    sim.runUntil('outcome');
    if (sim.outcome.type === 'fertilization') f += 1;
  }
  sens.push({ off, rate: f / 24 });
  console.log(`  ovulation ${String(off).padStart(3)}h → ${fmt(f / 24 * 100, 0)}% fertilization`);
}
const at = (off) => sens.find((s) => s.off === off).rate;
check('deeply stale oocyte (−30 h) essentially never fertilizes', at(-30) <= 0.1);
check('the fertile plateau (0…+12 h) outperforms −30 h decisively', at(0) - at(-30) >= 0.5);
check('sperm aging degrades +48 h below the plateau', at(48) < at(12));

console.log('\nINVARIANTS');
check('zero invariant violations across the whole ensemble', violations === 0, `${violations} violations`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
