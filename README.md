# KBG — The Living Interface

The official website of the **Kamand Bioengineering Group (KBG)**, IIT Mandi —
built as a living laboratory rather than a club website. A breathing 3D cell
greets the visitor; scrolling descends through it, macro to micro, five levels
deep: organism → tissue → cell → protein → code, one per KBG track.

Built with React + Vite. Content is loaded at runtime from the
[KBG_Links](https://github.com/KBG-IIT-Mandi/KBG_Links) repo, so the site can be
updated without a redeploy.

## Stack

| | |
|---|---|
| Framework | React 19 |
| Build | Vite 7 |
| Routing | react-router-dom 7 |
| 3D | three (custom ShaderMaterials — no helper layers) |
| Scroll | GSAP 3 + ScrollTrigger (`@gsap/react`) |
| Fonts | Self-hosted Archivo variable + IBM Plex Mono 500 |

No CDN dependencies at runtime — everything ships from the same origin.

### Bundle discipline

The three.js library, the cell scene (`cellScene`), the GSAP field
(`Descent`) and the race (`/race`, engine + 3D scene) are lazy chunks —
three.js itself is one shared chunk reused by both 3D experiences. The main
bundle stays ~84 KB gz; the hero headline and CTAs are plain HTML/CSS and
never wait on a 3D engine. Order of arrival: text → GSAP field → organism,
each layer enhancing the one before it.

## Getting started

```bash
npm install
npm run dev            # local dev server with HMR
npm run build          # production build into dist/
npm run preview        # serve the production build locally
npm run lint           # eslint
npm test               # vitest — engine determinism + invariant suites
npm run test:watch     # vitest in watch mode
npm run validate:race  # Monte Carlo validation of the race model
                       #   (default 1000 seeded races; --n N to change)
```

## Structure

```
src/
  Components/
    Organism/       cellScene.js (three, framework-free) · OrganismCanvas
                    (lifecycle, quality ladder) · Descent (the scroll journey)
    Chrome/         Grain, LabCursor (probe cursor), FocusShift (route focus-pull)
    SpecimenCard/   projects as experiment dossiers
    Constellation/  the team as a force-directed research network
    NavBar, Footer  instrument rail + telemetry block
  Pages/            Home, About, Team, Events, Projects, Race, NotFound
  race/engine/      the Virtual Sperm Race headless simulation (framework-free,
                    fully deterministic; see SCIENCE.md + SOURCES.md):
                    rng · distributions · biologyParameters (the registry) ·
                    stages · cohorts · movement · stateMachine · scheduler ·
                    engine (+ *.test.js vitest suites)
  Pages/Race/       raceScene.js (three, framework-free) · Race.jsx + panels
  config/api.js     Content endpoints + stale-while-revalidate fetch cache
  lib/discipline.js tech[] → discipline map (single source)
  index.css         Design tokens — declared here ONLY
  App.css           Shared primitives (.shell, .tag, .entry, .membrane, reveals)
scripts/
  raceValidation.mjs  1000-seed Monte Carlo report with tolerance checks
```

**Styling convention:** design tokens are declared in `src/index.css` and
nowhere else. Every other stylesheet consumes them via `var()` and is scoped to
its own page/component class. Please keep it that way.

## Design

Two worlds alternate across the site:

- **The Lab** — near-black (`--void #030507`), immersive, telemetry-labelled.
- **The Journal** — warm ivory (`--ivory #F2EFE6`), editorial, long-form.

Two accents carry the club's thesis and are never interchangeable:

| Token | Value | Means |
|---|---|---|
| `--bio` | `#B6FF2E` | biological / alive / active (GFP fluorescence) |
| `--data` | `#4FA8FF` | computational / informational (logo heritage) |

The signature element is the **specimen field**: a single three.js scene that
is both the hero organism (membrane deforms toward the cursor like a
microscope probe) and the descent (scroll scrubs the camera through the
membrane while the interior particle cloud morphs through five stages — the
protein stage is a double helix, the club's logo motif returned as a
life-form).

Performance is a design feature: DPR caps, an FPS ladder that sheds particle
load and finally swaps to a CSS poster, IntersectionObserver/visibility
pausing, and a full `prefers-reduced-motion` build where the journey becomes
stacked sections and the organism renders a single static frame.

Easter egg: the Konami code mutates the palette (the race's shaders read the
CSS variables too, so the mutation reaches the tract).

### The Race (`/race`)

**Virtual Sperm Race** — an educational, biologically calibrated stochastic
simulation of the journey from deposition to fertilization. 10⁸ cells are
carried as weighted statistical cohorts; ~240 weighted "finalists" are
simulated individually through capacitation, hyperactivation and the
fertilization pipeline; a three.js scene renders a stylized 3D tract. Seeded
and fully deterministic: the same seed + configuration replays the same race
at any frame rate, speed, or particle count. Biology Mode can honestly end
with **no fertilization**; Arcade Mode's guaranteed finish is a labelled game
mechanic. Every biological number lives in a single registry with source,
confidence and distribution (`src/race/engine/biologyParameters.js`), and the
in-app "Assumptions & sources" panel renders it verbatim.

**Educational simulation — not medical or fertility advice.** The model, its
assumptions and its limits are documented in [SCIENCE.md](SCIENCE.md); full
citations in [SOURCES.md](SOURCES.md).

### Content

All page content lives in
**[KBG-IIT-Mandi/KBG_Links](https://github.com/KBG-IIT-Mandi/KBG_Links)** — one
JSON file per page (`home.json`, `about.json`, `team.json`, `events.json`,
`projects.json`, `navbar.json`, `footer.json`) plus event posters in `Events/`
and member photos in `Teams/`. Edit that repo; the change is live on the next
page load — no code change and no redeploy.

Two constraints on that repo:

- It must stay **public** — the site reads it unauthenticated over
  `raw.githubusercontent.com`.
- Image paths inside the JSON are **absolute URLs** into the same repo.

Optional schema extensions the site already honours when present:

- `projects.json` per project: `status`, `team` (count), `progress` (0–100),
  `discipline`, `links { github, report }` — extra dossier rows appear.
- `team.json` per member: `projects: ["BioSense", …]` — draws real
  member↔project edges in the constellation.

Responses are cached in `sessionStorage` stale-while-revalidate with an 8s
timeout, so a return visit paints without waiting on the network.

## Deployment

`deploy.sh` builds the site and ships `dist/` to the club server, using a
release-directory + symlink swap so the switch is atomic and the previous
release stays available for rollback. TLS is handled by Caddy.

```bash
./deploy.sh
```

## License

© Kamand Bioengineering Group, IIT Mandi.
