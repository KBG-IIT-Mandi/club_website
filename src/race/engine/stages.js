/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — ANATOMICAL STAGES
   A stylized cross-section, not a racetrack and not a scale drawing: lengths
   are real-order-of-magnitude mm (SI, engine-side); the renderer owns a
   SEPARATE display transform (displayFrac of screen width per stage), so
   centimetres are never mapped 1:1 to pixels.

   Two kinds of stage:
     'anatomical'  has physical length, flow, geometry — cells traverse it
     'process'     a biological checkpoint at (or around) a location —
                   capacitation/release, cumulus, zona, fusion, block

   Flow sign convention: +1 points TOWARD the oocyte along the local axis.
   Flow fields return µm/s. Hazards live in the parameter registry; each
   stage lists WHICH hazards and gates apply so the engine and the UI's
   "why was this cell filtered?" panel read one truth.
   ═══════════════════════════════════════════════════════════════════════════ */

import { S_PER_MIN } from './units.js';

/**
 * @typedef {Object} StageDef
 * @property {string} id
 * @property {string} name          display name (lab-plate register)
 * @property {'anatomical'|'process'} kind
 * @property {number} lengthMm      physical extent along the local axis
 * @property {number} halfWidthMm   channel half-width at widest
 * @property {number} displayFrac   share of the map strip the renderer gives it
 * @property {?string} entryGate    registry id prefix of the logistic gate at entry
 * @property {number} axialPersistence  fraction of VSL that becomes NET axial
 *   progress for the statistical layer. A cell swims at VSL but wanders: in
 *   guided mucus most of VSL is axial (~0.5); in the open uterus almost none
 *   is (~0.1 — crossing unaided takes hours, which is why contraction waves
 *   dominate transport). Inferred from transit-time evidence in SUAREZ06.
 * @property {string[]} hazards     registry ids of hazards active inside
 * @property {(p: {get:(id:string)=>number}, sFrac:number, tBio:number) => number} flowUmS
 *                                  axial flow, µm/s, + toward oocyte
 * @property {(sFrac:number) => number} widthProfile  0..1 of halfWidthMm
 * @property {string} confidence
 * @property {string} explain       stage card copy shown in the UI
 */

/** @type {StageDef[]} */
export const STAGES = [
  {
    id: 'vagina',
    name: 'VAGINAL DEPOSITION',
    kind: 'anatomical',
    axialPersistence: 0.0,
    lengthMm: 15,
    halfWidthMm: 12,
    displayFrac: 0.1,
    entryGate: null,
    hazards: ['vagina.motileHalfLifeMin'],
    flowUmS: () => 0,
    widthProfile: (s) => 1 - 0.55 * s,
    confidence: 'high',
    explain:
      'The ejaculate pools at the posterior fornix, against the cervix. Vaginal acidity is lethal within the hour and roughly a third of the deposit flows back out — the clock starts immediately: reach mucus or die.',
  },
  {
    id: 'cervix',
    name: 'CERVICAL MUCUS',
    kind: 'anatomical',
    axialPersistence: 0.5,
    lengthMm: 25,
    halfWidthMm: 2,
    displayFrac: 0.14,
    entryGate: 'cervix.entry',
    hazards: ['cervix.transitMortalityPerHour'],
    /* Mucus micro-currents oppose entry near the os, ease deeper in. */
    flowUmS: (p, s) => -4 * (1 - s),
    widthProfile: (s) => 0.35 + 0.65 * Math.abs(Math.sin(s * Math.PI * 3)) * 0.4 + 0.25 * s,
    confidence: 'medium',
    explain:
      'Midcycle mucus is a directional filter: aligned glycoprotein strands admit only progressively motile, normally-formed cells — the first great selection. Crypts also hold sperm and release them over hours, spreading arrivals in time.',
  },
  {
    id: 'uterus',
    name: 'UTERINE CAVITY',
    kind: 'anatomical',
    axialPersistence: 0.1,
    lengthMm: 50,
    halfWidthMm: 20,
    displayFrac: 0.18,
    entryGate: null,
    hazards: ['uterus.transitMortalityPerHour'],
    flowUmS: (p) => p.get('transport.uterineFlowUmS'),
    widthProfile: (s) => 0.25 + 0.75 * Math.sin(Math.min(1, s * 1.15) * Math.PI * 0.85),
    confidence: 'medium',
    explain:
      'Fifty millimetres of open cavity — an eternity at 35 µm/s. Crossing is mostly not swum: cervico-fundal contraction waves (~1–2/min around ovulation) carry sperm in minutes. The price of entry is a leukocyte response that clears most of the field.',
  },
  {
    id: 'utj',
    name: 'UTEROTUBAL JUNCTION',
    kind: 'anatomical',
    axialPersistence: 0.3,
    lengthMm: 8,
    halfWidthMm: 0.4,
    displayFrac: 0.08,
    entryGate: 'utj',
    hazards: ['uterus.transitMortalityPerHour'],
    flowUmS: (p) => -0.4 * p.get('transport.tubalCountercurrentUmS'),
    widthProfile: (s) => 0.3 + 0.7 * Math.pow(Math.abs(Math.cos(s * Math.PI * 2.5)), 2) * 0.5 + 0.15,
    confidence: 'medium',
    explain:
      'A sub-millimetre, mucus-plugged gauntlet and the tightest gate in the tract: of the millions deposited, thousands pass. Animal knockouts show it reads surface proteins as much as swimming force — selection, not a lottery of speed.',
  },
  {
    id: 'isthmus',
    name: 'ISTHMUS · RESERVOIR',
    kind: 'anatomical',
    axialPersistence: 0.15,
    lengthMm: 20,
    halfWidthMm: 1,
    displayFrac: 0.14,
    entryGate: null,
    hazards: ['isthmus.reservoirMortalityPerHour'],
    flowUmS: (p) => -p.get('transport.tubalCountercurrentUmS'),
    widthProfile: (s) => 0.4 + 0.2 * Math.sin(s * Math.PI * 6) + 0.3 * s,
    confidence: 'medium',
    explain:
      'Arrivals bind the tubal epithelium and go quiet: motility suppressed, viability preserved — a holding pattern that can outlast a day. The reservoir synchronises sperm readiness with ovulation, which is why arriving first settles nothing.',
  },
  {
    id: 'capacitation',
    name: 'CAPACITATION · RELEASE',
    kind: 'process',
    axialPersistence: 0.0,
    lengthMm: 0,
    halfWidthMm: 1,
    displayFrac: 0.06,
    entryGate: null,
    hazards: ['capacitation.prematureArHazardPerHour'],
    flowUmS: () => 0,
    widthProfile: () => 1,
    confidence: 'medium',
    explain:
      'Hours of biochemical rearming — membrane cholesterol stripped, signalling rewired — on an individual, stochastic clock (median ≈ 6 h here; a stated model assumption). Completion triggers hyperactivation, breaks epithelial binding, and opens a temporary (~1–4 h) window of fertilizing competence. Arm too early and the window closes; arm too late and the oocyte ages out.',
  },
  {
    id: 'ampulla',
    name: 'AMPULLA NAVIGATION',
    kind: 'anatomical',
    axialPersistence: 0.2,
    lengthMm: 60,
    halfWidthMm: 5,
    displayFrac: 0.16,
    entryGate: null,
    hazards: ['ampulla.mortalityPerHour'],
    flowUmS: (p) => -0.5 * p.get('transport.tubalCountercurrentUmS'),
    widthProfile: (s) => 0.3 + 0.7 * s,
    confidence: 'medium',
    explain:
      'The wide, folded final chamber. Hyperactivated swimmers search labyrinthine mucosa with sharpened turning; a weak thermal gradient and — only within ~2 mm, only for capacitated cells — a chemoattractant gradient bias the search. There is no long-range homing signal.',
  },
  {
    id: 'cumulus',
    name: 'CUMULUS OOPHORUS',
    kind: 'process',
    axialPersistence: 0.0,
    lengthMm: 0.15,
    /* The EXPANDED complex is millimetres across — this is the contact
       envelope; lengthMm is the matrix thickness a cell must shear through. */
    halfWidthMm: 1.5,
    displayFrac: 0.05,
    entryGate: null,
    hazards: [],
    flowUmS: () => 0,
    widthProfile: () => 1,
    confidence: 'medium',
    explain:
      'The oocyte travels wrapped in a cloud of cumulus cells in a hyaluronan matrix. Shearing through takes the mechanical force of hyperactivated beating plus surface hyaluronidase — an uncapacitated cell stalls here.',
  },
  {
    id: 'zona',
    name: 'ZONA PELLUCIDA',
    kind: 'process',
    axialPersistence: 0.0,
    lengthMm: 0.02,
    halfWidthMm: 0.075,
    displayFrac: 0.05,
    entryGate: null,
    hazards: [],
    flowUmS: () => 0,
    widthProfile: () => 1,
    confidence: 'medium',
    explain:
      'Species-specific receptor binding on the glycoprotein shell, the induced acrosome reaction, then minutes of penetration — three separate probabilistic steps. A cell that fired its acrosome prematurely cannot even bind.',
  },
  {
    id: 'fusion',
    name: 'OOLEMMA · FUSION',
    kind: 'process',
    axialPersistence: 0.0,
    lengthMm: 0.005,
    halfWidthMm: 0.06,
    displayFrac: 0.04,
    entryGate: null,
    hazards: [],
    flowUmS: () => 0,
    widthProfile: () => 1,
    confidence: 'high',
    explain:
      'Membrane fusion. Within moments the egg fires its cortical reaction — the zona hardens and the membrane block engages, and every other contender is locked out. One fusion, ever; in this simulation the block is modelled as immediate.',
  },
];

export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));

/* Cumulative axial position (mm) of each stage's entry along the tract. */
export const STAGE_START_MM = (() => {
  const starts = [];
  let acc = 0;
  for (const s of STAGES) {
    starts.push(acc);
    acc += s.lengthMm;
  }
  return starts;
})();

export const TRACT_LENGTH_MM = STAGE_START_MM[STAGES.length - 1] + STAGES[STAGES.length - 1].lengthMm;

/* First stage of "the tubes" — at or past this counts as tubal for the HUD. */
export const TUBAL_FROM = STAGE_INDEX.isthmus;

/* Poisson clock helper — expected waits are quoted in minutes throughout. */
export const perMinToPerS = (ratePerMin) => ratePerMin / S_PER_MIN;
