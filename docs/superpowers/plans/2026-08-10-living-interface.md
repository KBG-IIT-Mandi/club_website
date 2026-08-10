# The Living Interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the KBG club site into "The Living Interface" — a breathing 3D cell hero the visitor scrolls *into* (macro→micro descent through five real KBG domains), a specimen archive for projects, a research constellation for the team, and a two-world (dark lab / warm ivory journal) design system.

**Architecture:** One lazy-loaded three.js scene (`cellScene.js`, framework-free) drives both the hero organism and the descent journey via a single `setProgress(0..1)` uniform contract; a React wrapper (`OrganismCanvas`) owns lifecycle/quality; GSAP ScrollTrigger scrubs scroll→progress over a CSS-sticky canvas (native scroll, never hijacked). All page content keeps loading at runtime from KBG_Links JSON via the untouched `src/config/api.js`.

**Tech Stack:** React 19, Vite 7, react-router-dom 7, three (npm), gsap + ScrollTrigger (npm), self-hosted Archivo variable + IBM Plex Mono 500.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-living-interface-design.md` — token values, palette roles, and copy rules come from there verbatim.
- No CDN dependencies at runtime; everything ships from origin (repo rule).
- Design tokens declared ONLY in `src/index.css`; page styles scope under `.p-home` / `.p-about` / `.p-team` / `.p-events` / `.p-projects` (repo rule).
- `src/config/api.js` endpoints, `fetchData`, `prefetch` signatures unchanged.
- `--bio` (#B6FF2E) marks biological/alive/active only; `--data` (#4FA8FF) computational only; `--bio-dim`/`--data-deep` never as text.
- Content JSON shape is external truth: render fields only when present; never invent numbers (no fake progress bars).
- Main JS bundle (excluding lazy three chunk) ≤ 120KB gz. Hero headline/CTAs paint as HTML/CSS before the three chunk loads.
- `prefers-reduced-motion`: static cell frame, descent un-pins to stacked sections, no autonomous animation.
- Verification contract per task (repo has no unit-test infra): `npm run lint` clean, `npm run build` clean, and Playwright browser check (screenshot + zero console errors) where the task changes anything visible.
- Commits: describe the change only; no AI attribution anywhere.

---

### Task 1: Dependencies + foundation tokens (the two worlds)

**Files:**
- Modify: `package.json` (add `three`, `gsap`)
- Modify: `src/index.css` (full token overhaul; keep @font-face, reset, focus, reduced-motion structure)
- Modify: `index.html` (theme-color → `#030507`, description keeps club name)

**Interfaces:**
- Produces: CSS custom properties per spec palette table (`--void #030507`, `--depth-1 #070D16`, `--depth-2 #0B1422`, `--bio #B6FF2E`, `--bio-dim #5E8A1E`, `--data #4FA8FF`, `--data-deep #1177E1`, `--specimen #E8F4FF`, `--specimen-2 #8CA3C3`, `--ivory #F2EFE6`, `--ivory-2 #E7E2D3`, `--ink #141609`, `--ink-2 #5C5F4C`); type scale adding `--fs-display: clamp(4rem, 10vw, 10rem)`; world classes `.world-lab` (void ground, specimen text) and `.world-journal` (ivory ground, ink text); mono label primitive `.tag` (Plex Mono 500, 0.6875rem, ls 0.14em, uppercase); `.mutated` Konami class overriding `--bio: #FF3DF2`, `--bio-dim: #8A1E7A`.
- Consumes: existing @font-face blocks (unchanged).

- [ ] Step 1: `npm install three gsap` — lockfile updates only, no CDN.
- [ ] Step 2: Rewrite `src/index.css` `:root` with the spec palette + keep spacing/layout/z scales; replace cyanotype tokens; keep `--font-sans`/`--font-mono`; base `body` ground becomes `--void`/`--specimen`; `h1`-`h6`/links restyled to new palette (links: `--bio` underline on lab, `--ink` on journal via `.world-journal a`).
- [ ] Step 3: Add `.world-lab`, `.world-journal`, `.tag`, `.mutated` blocks; keep `:focus-visible` (ring color → `--data`) and the reduced-motion block.
- [ ] Step 4: `npm run build` + `npm run lint` — clean. Site will look broken (old components reference dead tokens) — acceptable mid-phase; Task 4 removes them.
- [ ] Step 5: Commit `Rebuild design tokens for the Living Interface two-world system`.

### Task 2: Global chrome — Grain, LabCursor, FocusShift, Konami

**Files:**
- Create: `src/Components/Chrome/Grain.jsx` + `Grain.css`
- Create: `src/Components/Chrome/LabCursor.jsx` + `LabCursor.css`
- Create: `src/Components/Chrome/FocusShift.jsx` + `FocusShift.css`
- Create: `src/CustomHooks/useKonami.jsx`
- Modify: `src/App.jsx`
- Delete: `src/Components/Background/HelixField.jsx`, `HelixField.css`, `src/Components/Sheet/Sheet.jsx`, `Sheet.css`

**Interfaces:**
- Produces: `<Grain/>` (fixed aria-hidden SVG feTurbulence overlay, opacity 0.04, pointer-events none); `<LabCursor/>` (mounts only when `matchMedia('(pointer:fine)')` && !reduced-motion; dot + lagging ring; reads `data-cursor="observe|explore|open"` from hovered `[data-cursor]` ancestor and shows the mono label; never `cursor:none` on body until ready); `<FocusShift>{children}</FocusShift>` (on location change: 240ms blur(4px)+opacity out, then in — CSS class toggle, skipped under reduced motion); `useKonami(onFire)` (↑↑↓↓←→←→BA keydown sequence → toggles `document.documentElement.classList('mutated')`).
- Consumes: tokens from Task 1.

- [ ] Step 1: Implement the four units above; App.jsx mounts `<Grain/>`, `<LabCursor/>`, wraps `<Routes>` in `<FocusShift>`, calls `useKonami`; HelixField/Sheet imports and files removed.
- [ ] Step 2: `npm run dev` + Playwright: navigate `/`, verify cursor ring follows pointer, `data-cursor` label flips on a link, route change blurs, zero console errors.
- [ ] Step 3: lint + build clean; commit `Add lab chrome: grain, probe cursor, focus-pull transitions, mutation egg`.

### Task 3: NavBar + Footer reskin

**Files:**
- Modify: `src/Components/NavBar.jsx`, `src/Components/NavBar.css`
- Modify: `src/Components/Footer/Footer.jsx`, `Footer.css`

**Interfaces:**
- Consumes: `navbar.json`/`footer.json` via existing `fetchData` (shape unchanged); tokens; `.tag`.
- Produces: nav = mono `.tag` links + `SYSTEM STATUS ● EVOLVING` tick (CSS pulse on the ●, `--bio`); brand mark = inline SVG that morphs blob→monogram at `scrollY > 40` (two `<path d>` swapped with 300ms CSS transition on `d` via `attribute` swap + cross-fade fallback); footer = telemetry block (mono rows: IIT MANDI 31.78°N 76.99°E, `LAST SIGNAL` = KBG_Links last-commit fetched from `https://api.github.com/repos/KBG-IIT-Mandi/KBG_Links/commits?per_page=1` with `fetchData`, row hidden on failure) + existing footer.json links.

- [ ] Step 1: Implement; mobile menu keeps current toggle behavior, restyled full-void overlay.
- [ ] Step 2: Playwright: desktop + 320px nav screenshots, tick pulsing, footer rows render, no console errors. lint+build clean.
- [ ] Step 3: Commit `Reskin nav and footer as lab telemetry chrome`.

### Task 4: cellScene — the organism (isolated, framework-free)

**Files:**
- Create: `src/Components/Organism/cellScene.js`

**Interfaces:**
- Produces (exact contract, consumed by Tasks 5–6):
```js
export function createCellScene(canvas, { quality = 'high' } = {}) → {
  setProbe(ndcX, ndcY, strength /*0..1*/),  // cursor probe; membrane bulges toward it
  setProgress(p /*0..1 descent*/),          // 0 = hero organism … 1 = code grid
  resize(w, h, dpr),
  start(), stop(), renderOnce(),            // rAF loop control; renderOnce for static frame
  onFps(cb /*(fps)=>void, called每2s*/),
  setQuality('high'|'low'),                 // sheds particle counts + segments
  dispose(),                                // full GL teardown
}
```
- Scene: `IcosahedronGeometry(1.15, quality==='high'?96:48)` membrane with custom ShaderMaterial — vertex: 3D simplex noise (inlined GLSL, two octaves) displacement `amp = 0.10 + 0.035*sin(uTime*0.55)` (the breathing) + probe bulge `exp(-6.0*d²)*uProbeStrength*0.28` toward `uProbe`; fragment: fresnel rim `pow(1-dot(n,v),2.6)` in `--bio` lime, interior translucency toward `--data` blue, alpha 0.55; additive `Points` nucleus cloud (900/450 pts) + 24 organelle blobs (InstancedMesh, low-poly spheres); slow y-rotation 0.05 rad/s.
- Descent (progress bands, cross-faded ±0.06 around each boundary): 0–.2 organism (as above) · .2–.4 tissue (membrane alpha→0.1, camera z 3.2→2.2, organelles scatter to voronoi-ish plane field) · .4–.6 cell (single organelle grows to center, nucleus tightens) · .6–.8 protein (points morph to helix-ribbon parametric curve positions) · .8–1 code (points snap to 3D grid lattice, color lerps fully to `--data`, size shrinks). Implementation: precomputed `Float32Array` position targets per stage per point; per-frame lerp `pos = mix(stageA[i], stageB[i], smoothstep(band))` done in vertex shader via two position attributes + `uStageMix` (swap attribute pairs on band change — no per-frame CPU writes).
- Colors passed as uniforms from getComputedStyle so the Konami mutation reaches the shader.

- [ ] Step 1: Implement `cellScene.js` (~450 lines, zero React imports).
- [ ] Step 2: Temporary harness: mount in `main.jsx` behind `?scene` query flag; Playwright screenshot at progress 0 / 0.5 / 1 (`window.__scene.setProgress` exposed only under the flag); verify no WebGL errors in console.
- [ ] Step 3: lint+build; commit `Add the organism: raymarch-free breathing cell scene with descent morphs`.

### Task 5: OrganismCanvas — React lifecycle wrapper

**Files:**
- Create: `src/Components/Organism/OrganismCanvas.jsx` + `OrganismCanvas.css`

**Interfaces:**
- Consumes: `createCellScene` contract (Task 4).
- Produces: `<OrganismCanvas ref={handle} interactive className/>` where `handle.current = { setProgress(p) }`; lazy `import('three')` chunk after mount (hero HTML paints first); DPR cap 1.75/1.3 (fine/coarse pointer); FPS ladder via `onFps`: <34fps → `setQuality('low')`, second strike → `stop()` + `.is-fallback` class (CSS radial-gradient membrane poster in the same box); IntersectionObserver + visibilitychange pause/resume; `prefers-reduced-motion` → `renderOnce()` at progress 0, no loop; pointermove (interactive && pointer:fine) → `setProbe` in NDC, easing strength 0→1 over 300ms; full `dispose()` on unmount; `aria-hidden` canvas.

- [ ] Step 1: Implement; remove Task 4's `?scene` harness, wire a temporary mount on Home to verify.
- [ ] Step 2: Playwright: hero renders, probe deforms membrane on mousemove (screenshot diff at two pointer positions), reduced-motion emulation renders single static frame, zero console errors. lint+build.
- [ ] Step 3: Commit `Wrap the organism in a lifecycle-safe canvas with quality ladder`.

### Task 6: The Descent — scroll journey

**Files:**
- Create: `src/Components/Organism/Descent.jsx` + `Descent.css`
- Create: `src/Components/Organism/stages.js`

**Interfaces:**
- Consumes: `OrganismCanvas` handle; gsap + ScrollTrigger.
- Produces: `stages.js` exports `export const STAGES = [{ id:'organism', level:'LEVEL 01 · ORGANISM', title:'Bio Instrumentation', copy:'EEG, ECG and biosensor hardware that listens to living systems.', to:'/projects' }, …]` (five, per spec §Home.2 — real KBG tracks verbatim); `<Descent organismHandle={ref}/>` renders `<section class="descent" style="height:500vh">` with sticky viewport child; `ScrollTrigger.create({ trigger, start:'top top', end:'bottom bottom', scrub:0.6, onUpdate: st => handle.setProgress(st.progress) })`; stage overlays absolutely positioned, each visible in its progress band via opacity/translate tweens on one timeline; reduced-motion → no ScrollTrigger, height:auto, five stacked `.world-lab` sections with the same DOM.
- gsap registered once in `Descent.jsx` (`gsap.registerPlugin(ScrollTrigger)`).

- [ ] Step 1: Implement stages + Descent; hero and descent share ONE `OrganismCanvas` mounted in Home's sticky wrapper (Task 7 finalizes; here use the temporary Home mount).
- [ ] Step 2: Playwright: scroll to 5 depths, screenshot each stage overlay, verify progress-linked morphs and that native keyboard PageDown scrolls (no hijack). lint+build.
- [ ] Step 3: Commit `Add the descent: pinned macro-to-micro journey through five KBG domains`.

### Task 7: Home assembly

**Files:**
- Modify: `src/Pages/Home/Home.jsx`, `src/Pages/Home/Home.css` (full rewrite)

**Interfaces:**
- Consumes: `home.json` (hero/highlights/sections/tracks — shape unchanged), `projects.json` first 3, `events.json` upcoming, `OrganismCanvas`, `Descent`, `SpecimenCard` (Task 8 — teaser renders a simplified inline dossier until then, then swaps), `.world-*`.
- Produces: page structure per spec §Home: (1) hero viewport — telemetry HUD corners (mono, numbers drift ±0.3 every 2s via rAF-throttled state), display headline `Life is now an engineering medium.` (from code, not JSON — brand line), sub from `home.json.hero.subtitle`, CTAs `ENTER THE LAB`→/projects + `JOIN THE COLLECTIVE`→`hero.cta.href`, `data-cursor="observe"` on canvas region; (2) `<Descent/>`; (3) `.world-journal` band from `home.json.sections`; (4) specimens teaser; (5) sample tray (upcoming events as `.tag` sample labels); (6) join membrane CTA (blob `border-radius` morph @12s keyframes, static under reduced motion).

- [ ] Step 1: Implement; hero text is server-of-first-paint (no canvas dependency).
- [ ] Step 2: Playwright 320/1280: full-page screenshots, LCP element = headline (assert via performance API), console clean. lint+build.
- [ ] Step 3: Commit `Assemble the Living Interface homepage`.

### Task 8: Specimen system — discipline map + SpecimenCard + Projects page

**Files:**
- Create: `src/lib/discipline.js`
- Create: `src/Components/SpecimenCard/SpecimenCard.jsx` + `SpecimenCard.css`
- Modify: `src/Pages/Projects/Projects.jsx`, `Projects.css` (full rewrite)

**Interfaces:**
- Produces: `disciplineFor(tech: string[]) → {id, label}` — keyword map: MNE/EEG/ESP32/Arduino→`bio-instrumentation` "BIO INSTRUMENTATION"; TensorFlow/Scikit/ML/DL/NumPy→`ai-biology` "AI × BIOLOGY"; Computational Biology/Genetic→`synbio` "SYNTHETIC BIOLOGY"; Unity/C#→`simulation` "SIMULATION"; default `bioengineering` "BIOENGINEERING". `<SpecimenCard project index expanded onToggle/>` renders `EXPERIMENT {String(index+1).padStart(2,'0')}`, name, mono metadata table (STATUS/TEAM/PROGRESS rows only if fields exist; DISCIPLINE always, derived), procedural microscopy thumb (120×120 canvas, deterministic PRNG seeded by name — value-noise blobs in `--bio` on `--depth-2`), hover sparkline (24-pt polyline, seeded PRNG, CSS draw animation), click expands case-study drawer (summary, STACK chips, links when present) — `data-cursor="open"`.
- Consumes: `projects.json` (current shape; optional spec-extension fields honored).

- [ ] Step 1: Implement all three; Projects page = archive list of SpecimenCards + `.tag` filter row by discipline (derived), skeleton + `SIGNAL LOST — RETRY` fetch-failure state (button re-calls fetchData).
- [ ] Step 2: Playwright: archive renders 7 dossiers, hover shows sparkline, click expands drawer, filter works, failure state via offline route check. lint+build. Home teaser swaps to real SpecimenCard.
- [ ] Step 3: Commit `Turn projects into the specimen archive`.

### Task 9: Team — the Research Constellation

**Files:**
- Create: `src/Components/Constellation/Constellation.jsx` + `Constellation.css`
- Modify: `src/Pages/Team/Team.jsx`, `Team.css` (full rewrite)

**Interfaces:**
- Consumes: `team.json`, `projects.json`, `disciplineFor`.
- Produces: `<Constellation members projects/>` — canvas 2D force sim (~60 nodes max: KBG center pinned, discipline hubs ring, members, projects; spring toward ideal edge length 90px, node repulsion, velocity damping 0.85, sim settles then only animates on interaction); edges: project↔discipline (derived), member↔project when `member.projects[]` exists, else member↔discipline when bio matches discipline keywords, else member↔KBG; hover (nearest node <24px) → connected set at full `--bio`/`--data`, rest 15% opacity, mono name label; click member → side panel card (photo in membrane-blob mask, role, bio, socials). Touch/reduced-motion/no-canvas → `<MemberGrid/>` fallback (same card, static grid). Both DOM-render all member data for a11y (canvas `aria-hidden`).

- [ ] Step 1: Implement; Team page = title + Constellation + roles legend.
- [ ] Step 2: Playwright: graph settles, hover highlight screenshot, click opens card, 320px falls back to grid, console clean. lint+build.
- [ ] Step 3: Commit `Map the team as a living research constellation`.

### Task 10: Events sample log + About journal + NotFound

**Files:**
- Modify: `src/Pages/Events/Events.jsx`, `Events.css`; `src/Pages/About/About.jsx`, `About.css`; `src/Pages/NotFound/NotFound.jsx`, `NotFound.css` (full rewrites)

**Interfaces:**
- Consumes: `events.json`, `about.json`, tokens, `.world-*`, `.tag`.
- Produces: Events — upcoming (`--bio` `SAMPLE {date}` tags) vs past (neutral `ARCHIVED`), posters inside membrane masks (`border-radius: 58% 42% 55% 45% / 45% 52% 48% 55%`, unique per index via 4 variants), ivory description blocks; About — full `.world-journal`: 900-weight display title, 200-weight pull-quote mission, history + aboutLong at 68ch, features as margin-noted list, contact block with socials; NotFound — `SPECIMEN NOT FOUND` display + CSS petri dish (bordered circle, one drifting dot) + home link.

- [ ] Step 1: Implement all three pages.
- [ ] Step 2: Playwright screenshots each at 320/1280; console clean; lint+build.
- [ ] Step 3: Commit `Rebuild events, about and 404 in the two-world system`.

### Task 11: Polish, audit, verify (final gate)

**Files:**
- Modify: whatever the audit flags; `README.md` (stack table + design section updated to match reality)

**Interfaces:** consumes everything; produces the shipped site.

- [ ] Step 1: Restraint pass (frontend-design "remove one accessory"): cut any motion that fails the one-sentence meaning test; verify only signature moments move.
- [ ] Step 2: Multi-agent review workflow — correctness (hooks/leaks/teardown), a11y (contrast, focus, reduced-motion), perf (bundle sizes via `vite build` report; main ≤120KB gz), copy register; fix confirmed findings.
- [ ] Step 3: Playwright sweep: all 6 routes × 4 viewports (320/768/1280/1920) screenshots; console-error assertion; reduced-motion emulation sweep; keyboard-only walk of nav + archive drawer + constellation fallback.
- [ ] Step 4: README update (stack: three + gsap now real; palette table swapped; HelixField section replaced by Organism section).
- [ ] Step 5: Final `npm run lint` + `npm run build`; commit `Polish and verify the Living Interface`.

## Self-review notes

- Spec coverage: every spec section maps to a task (hero/descent 4–7, archive 8, constellation 9, events/about/404 10, chrome 2–3, tokens 1, perf/a11y/verification 5/11). Konami: Task 1 (palette class) + Task 2 (listener) + Task 4 (shader reads computed style).
- Schema extensions need no site task beyond conditional rendering (Tasks 8–9 honor optional fields).
- Type consistency: `setProgress`/`setProbe`/`setQuality`/`onFps` names identical in Tasks 4, 5, 6; `disciplineFor` identical in 8, 9.
- Deviation from template TDD: justified under Global Constraints (no unit-test infra in repo; browser-verified acceptance per task instead).
