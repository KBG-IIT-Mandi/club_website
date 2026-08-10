# The Living Interface — KBG site redesign

**Date:** 2026-08-10
**Scope:** Full-site transformation of kbg (React 19 + Vite) into a living-laboratory
experience. Homepage is the centerpiece; Projects, Team, Events, About are rebuilt in
the same world. Content continues to load at runtime from `KBG-IIT-Mandi/KBG_Links`.

## Concept

The website behaves like a biological system — responding, evolving, revealing as the
visitor explores. Not a club website: entering a living laboratory.

Headline (chosen): **"Life is now an engineering medium."**

## Design system

### Two worlds

1. **The Lab** (dark, cinematic): near-black, immersive 3D, telemetry. Hero, descent
   journey, specimen archive, constellation, footer.
2. **The Journal** (warm ivory, editorial): readable long-form. About page, homepage
   editorial band, event descriptions.

Sections alternate worlds. Only signature moments move; everything else is still.

### Palette (tokens, declared ONLY in `src/index.css`)

| Token | Value | Role |
|---|---|---|
| `--void` | `#030507` | lab ground (near-black, blue-biased) |
| `--depth-1` | `#070D16` | lab elevation 1 (panels) |
| `--depth-2` | `#0B1422` | lab elevation 2 (cards, drawers) |
| `--bio` | `#B6FF2E` | acid bio-lime — GFP fluorescence. Marks anything ALIVE/active |
| `--bio-dim` | `#5E8A1E` | bio strokes/rules (non-text) |
| `--data` | `#4FA8FF` | electric blue — computational. Inherited from KBG logo palette |
| `--data-deep` | `#1177E1` | blue fills, non-text (logo heritage) |
| `--specimen` | `#E8F4FF` | lab body copy (blue-white) |
| `--specimen-2` | `#8CA3C3` | lab captions/secondary |
| `--ivory` | `#F2EFE6` | journal ground (warm ivory) |
| `--ivory-2` | `#E7E2D3` | journal elevation |
| `--ink` | `#141609` | journal text (green-biased near-black) |
| `--ink-2` | `#5C5F4C` | journal secondary |

Rule: `--bio` = biological/alive/active. `--data` = computational/informational. Never
decorative interchange — the two accents encode the club's thesis (cells × circuits).
Konami code swaps `--bio`↔magenta `#FF3DF2` "mutation" palette (easter egg, CSS class).

### Typography

- **Display:** Archivo variable 900 (already self-hosted), uppercase,
  `clamp(64px, 10vw, 160px)` for hero/section heads. Tight leading (0.9).
- **Body:** Archivo 400/500. Journal sections at 18px/1.7.
- **Utility:** IBM Plex Mono 500 (already self-hosted) — telemetry, specimen labels,
  nav, metadata tables. 11–13px, letter-spacing 0.14em, uppercase.
- No new fonts. Personality comes from scale contrast: 160px display against 11px mono.

### Signature element (the one bold thing)

**The Specimen + The Descent**: a breathing 3D cell (three.js) in the hero whose
membrane deforms toward the cursor like a microscope probe, which the visitor then
*enters* on scroll — one continuous pinned journey Organism → Tissue → Cell → Protein
→ Code, each level introducing a real KBG domain. Everything else on the site is
disciplined and still.

## Page architecture

### Global chrome (all routes)

- `LabCursor` — dot + trailing ring; ring label morphs `OBSERVE` (canvas hover) /
  `EXPLORE` (links) / `OPEN` (specimens). Pointer-fine devices only; never on touch,
  reduced-motion, or forced-colors. System cursor stays visible until custom is ready.
- `Grain` — one fixed SVG feTurbulence overlay, opacity ≤ 0.05.
- `FocusShift` route transitions — microscope focus-pull: outgoing page blurs
  (4px)+dims 240ms, incoming sharpens. CSS only, skipped under reduced motion.
- NavBar reskin — mono links, live `SYSTEM STATUS ● EVOLVING` tick, logo morphs
  cell-blob→KBG monogram on scroll (SVG path morph).
- Footer — telemetry block: coordinates of IIT Mandi, session uptime, content-repo
  pulse (last-commit time of KBG_Links via GitHub API, cached, fail-silent).
- Konami listener toggling `.mutated` palette class.
- `HelixField` + `Sheet` retired (replaced by the new world; files removed).

### Home

1. **Hero — SPECIMEN 001.** Full-viewport void. Breathing translucent cell (three.js:
   icosphere + simplex vertex displacement, fresnel membrane, nucleus + organelle
   particles). Cursor = probe: raycast deforms membrane locally. Telemetry HUD (mono):
   `SPECIMEN 001 / CELLULAR ACTIVITY 94.7% / GENE EXPRESSION ACTIVE / SYSTEM STATUS
   EVOLVING` with live-drifting numbers. Headline sets in over it; CTAs `ENTER THE
   LAB` (→/projects) and `JOIN THE COLLECTIVE` (→mailto from home.json cta).
   Hero text is plain HTML/CSS and paints first; canvas mounts after first paint.
2. **The Descent** — GSAP ScrollTrigger pinned ~450vh. Camera travels INTO the cell;
   the same canvas morphs through five stages (scroll-scrubbed uniforms/particles):
   - ORGANISM → Bio Instrumentation (EEG/ECG devices, biosensors)
   - TISSUE → Biomaterials & Biomimetics (BioForge, biomimetic design)
   - CELL → Synthetic Biology & Biodesign (iGEM, GoGEC, genetic circuits)
   - PROTEIN → Molecular ML & Drug Design (drug development software)
   - CODE → AI × Biology (Neural Cellular Automata, OptiHive, medical imaging)
   Each stage: mono level-label, domain title, one line, link. Domains are KBG's real
   tracks, not invented ones.
3. **Journal band (ivory)** — Why KBG / What we do, from `home.json` sections.
4. **Live specimens teaser** — first 3 projects as mini specimen dossiers → /projects.
5. **Sample tray** — upcoming events as lab-sample labels → /events.
6. **Join membrane** — closing CTA on a slow-morphing blob mask.

### Projects — the Specimen Archive

Projects render as experiment dossiers, not cards:

```
EXPERIMENT 02          STATUS      ACTIVE
DynaSync               DISCIPLINE  AI × BIOLOGY
                       STACK       PYTHON · SCIKIT-LEARN · MNE
```

- Mono metadata table per project; procedural "microscopy" thumbnail (canvas noise
  seeded by project name — no fake photography).
- Hover: dossier lifts, live activity trace (animated sparkline) draws.
- Click: full-width case-study drawer expands in place (summary, stack, links).
- Fields shown only if real: STATUS/TEAM/PROGRESS render when present in
  `projects.json`; DISCIPLINE derived from `tech[]` keyword map (factual). No
  invented numbers.

### Team — the Research Constellation

- Canvas 2D force-directed graph: center node KBG; discipline hubs; member nodes;
  project nodes. Edges: project↔discipline (derived from tech map), member↔project
  when `team.json` gains `projects: []` (schema extension), else member↔discipline
  via bio keyword match, else member↔KBG.
- Hover member → connected nodes/edges light `--bio`, rest dims. Click → member card
  (photo through membrane-blob mask, role, bio, socials).
- Touch/no-canvas/reduced-motion fallback: member grid with membrane-mask portraits.

### Events — the Sample Log

- Each event = specimen tag: mono label `SAMPLE 2026-07-18 · KBG HACKATHON`,
  poster revealed through an organic membrane mask (blob `border-radius`), ivory
  description block. Upcoming = `--bio` tagged; past = archived neutral.

### About — the Journal

- Full ivory editorial: mission, history, features, contact from `about.json`.
  No new typeface — contrast comes from Archivo weight extremes (200 pull-quotes
  against 900 heads), generous measure, tiny mono margin-notes (the
  scientific-paper register).

### NotFound

- `SPECIMEN NOT FOUND` — empty petri dish (CSS), link home.

## Technical architecture

### Dependencies (npm, no CDN — repo rule preserved)

- `three` (organism + descent; single lazy chunk)
- `gsap` (+ ScrollTrigger; registered once)

### Module layout

```
src/
  Components/
    Organism/          three.js scene: cell, descent stages, quality ladder
      OrganismCanvas.jsx   mount/teardown, DPR cap, FPS ladder, IO pause
      cellScene.js         scene graph + shaders (no React inside)
      stages.js            descent stage definitions + uniform curves
    LabCursor/         custom cursor (pointer-fine only)
    Grain/             fixed noise overlay
    SpecimenCard/      dossier used by Projects + home teaser
    Constellation/     canvas graph + fallback grid
    NavBar, Footer     reskinned
  Pages/               Home, Projects, Team, Events, About, NotFound (rebuilt)
  config/api.js        UNCHANGED (endpoints + SWR cache)
  lib/discipline.js    tech[] → discipline keyword map (single source)
  index.css            new tokens (only file with :root) — world classes .lab/.journal
```

### Performance budget & ladder (inherits HelixField's proven discipline)

- Main JS bundle (no three): ≤ 120KB gz. three chunk lazy-loads after first paint;
  hero headline/CTAs are HTML/CSS and never wait on it.
- DPR cap 1.75 desktop / 1.3 mobile; FPS watchdog: <34fps sheds particles → DPR →
  static poster fallback. IntersectionObserver + visibilitychange pause the loop.
- Mobile: reduced particle counts, no membrane raycast (no cursor), same journey.
- `prefers-reduced-motion`: static rendered cell frame, descent becomes five plain
  sections (no pin), zero autonomous animation. All content readable with JS off
  except canvas moments (text never lives only in canvas).
- Lighthouse targets: LCP < 2.5s, CLS < 0.05, TBT < 200ms on mid-tier mobile.

### Accessibility

- Contrast: `--bio` on `--void` ≈ 15:1, `--specimen` 15:1+, `--ink` on `--ivory` 13:1+.
- `--bio-dim`, `--data-deep` never used as text.
- Focus-visible ring kept global; custom cursor never suppresses focus styles.
- Descent is native scroll (scrubbed, never hijacked); keyboard/PageDown works.
- Canvas elements `aria-hidden`; every canvas fact is also in DOM text.

### Content schema (KBG_Links) — optional extensions, graceful without

- `projects.json`: optional `status`, `team` (count), `progress` (0–100),
  `discipline`, `links {github, report}` per project.
- `team.json`: optional `projects: ["BioSense", …]` per member (powers constellation
  member↔project edges).
- Site renders fully with today's schema; extensions only add rows/edges.

## Error handling

- Content fetch failure: existing SWR cache + 8s timeout retained; pages render
  structural skeleton with mono `SIGNAL LOST — RETRY` state, retry button refetches.
- WebGL unavailable/context-lost: CSS radial-membrane poster replaces canvas;
  layout identical.
- GitHub pulse (footer) fail-silent; row hidden.

## Testing / verification

- `npm run lint` + `npm run build` clean.
- Playwright real-browser sweep at 320 / 768 / 1280 / 1920: screenshots of every
  page, console-error check, reduced-motion emulation pass.
- Manual FPS check of hero + descent via DevTools trace on CPU-throttled profile.
- Contrast spot-checks on both worlds.

## Phases

1. **Foundation** — tokens/worlds in index.css, deps, global chrome (cursor, grain,
   transitions, nav, footer), retire HelixField/Sheet.
2. **Organism** — isolated hero cell component + quality ladder + fallbacks.
3. **Descent** — isolated pinned journey wired to the same canvas.
4. **Pages** — Home assembly, Projects archive, Team constellation, Events, About,
   NotFound.
5. **Polish & audit** — motion restraint pass, a11y, perf ladder verification,
   Playwright sweep, Lighthouse.
