/**
 * The seven levels of the descent — macro to micro, and every one of them a
 * real KBG track or project. Bands are ScrollTrigger progress (0..1 across
 * the whole specimen field) and sit on the plateaus of cellScene's morph
 * sevenths: the cloud is purely stage i at p = i / 6.
 */
export const STAGES = [
  {
    id: "organism",
    level: "LEVEL 01 · ORGANISM · 0.1 M",
    /* The soft hyphen is hand-set typesetting, not auto-hyphenation: it only
       fires on viewports where INSTRUMENTATION (10.6× the font-size, measured)
       cannot fit one line, i.e. small phones. Desktop never sees it. */
    title: "Bio Instrumen­tation",
    copy: "EEG, ECG and biosensor hardware that listens to living systems — built, soldered and debugged in-house.",
    to: "/projects",
    band: [0.03, 0.12],
  },
  {
    id: "tissue",
    level: "LEVEL 02 · TISSUE · 1 MM",
    title: "Biomaterials & Biomimetics",
    copy: "Design that borrows from living structure — BioForge challenges, biomimetic mechanisms, nature as blueprint.",
    to: "/events",
    band: [0.15, 0.26],
  },
  {
    id: "cell",
    level: "LEVEL 03 · CELL · 10 µM",
    title: "Synthetic Biology & Biodesign",
    copy: "Genetic circuits, iGEM and GoGEC — engineering the cell like it's hardware, because now it is.",
    to: "/projects",
    band: [0.29, 0.38],
  },
  {
    id: "gamete",
    level: "LEVEL 04 · GAMETE · 55 µM",
    title: "Cell Motility & Biophysics",
    copy: "Flagellar propulsion, chemotaxis, the odds of one cell in a hundred million — simulated live in the tract.",
    to: "/race",
    linkLabel: "RUN THE RACE",
    band: [0.43, 0.53],
  },
  {
    id: "organelle",
    level: "LEVEL 05 · ORGANELLE · 1 µM",
    title: "Bioenergetics",
    copy: "Cristae, gradients, thirty-seven trillion cells running on one organelle's output — energy, measured and modeled.",
    to: "/projects",
    band: [0.58, 0.68],
  },
  {
    id: "protein",
    level: "LEVEL 06 · PROTEIN · 10 NM",
    title: "Molecular ML & Drug Design",
    copy: "Drug development software and molecular models — chemistry searched by algorithms instead of luck.",
    to: "/projects",
    band: [0.74, 0.85],
  },
  {
    id: "code",
    level: "LEVEL 07 · NEURAL CODE · PURE SIGNAL",
    title: "AI × Biology",
    copy: "Neural cellular automata, swarm optimisation, medical imaging — life, recompiled as computation.",
    to: "/projects",
    band: [0.9, 1.0],
    /* The finale never fades out — it rides the unpin with the signal waves
       still running. An ending that dissolves to empty dots reads as broken. */
    hold: true,
  },
];
