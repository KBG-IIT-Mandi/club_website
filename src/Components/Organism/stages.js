/**
 * The five levels of the descent — macro to micro, and every one of them a
 * real KBG track, not an invented department. Bands are ScrollTrigger
 * progress (0..1 across the whole specimen field) and match cellScene's
 * morph quarters: the cloud is purely stage i at p = i * 0.25.
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
    band: [0.05, 0.18],
  },
  {
    id: "tissue",
    level: "LEVEL 02 · TISSUE · 1 MM",
    title: "Biomaterials & Biomimetics",
    copy: "Design that borrows from living structure — BioForge challenges, biomimetic mechanisms, nature as blueprint.",
    to: "/events",
    band: [0.19, 0.32],
  },
  {
    id: "cell",
    level: "LEVEL 03 · CELL · 10 µM",
    title: "Synthetic Biology & Biodesign",
    copy: "Genetic circuits, iGEM and GoGEC — engineering the cell like it's hardware, because now it is.",
    to: "/projects",
    band: [0.44, 0.57],
  },
  {
    id: "protein",
    level: "LEVEL 04 · PROTEIN · 10 NM",
    title: "Molecular ML & Drug Design",
    copy: "Drug development software and molecular models — chemistry searched by algorithms instead of luck.",
    to: "/projects",
    band: [0.69, 0.82],
  },
  {
    id: "code",
    level: "LEVEL 05 · NEURAL CODE · PURE SIGNAL",
    title: "AI × Biology",
    copy: "Neural cellular automata, swarm optimisation, medical imaging — life, recompiled as computation.",
    to: "/projects",
    band: [0.87, 1.0],
    /* The finale never fades out — it rides the unpin with the signal waves
       still running. An ending that dissolves to empty dots reads as broken. */
    hold: true,
  },
];
