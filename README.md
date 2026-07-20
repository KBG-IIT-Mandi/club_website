# KBG — Club Website

The official website of the **Kamand Bioengineering Group (KBG)**, IIT Mandi.

Built with React + Vite. Content is loaded at runtime from published Google
Sheets, so the site can be updated without a redeploy.

## Stack

| | |
|---|---|
| Framework | React 19 |
| Build | Vite 7 |
| Routing | react-router-dom 7 |
| Animation | GSAP 3 (ScrollTrigger, SplitText, CustomEase) — vendored locally |
| Background | Custom raymarched WebGL DNA-helix shader (`src/Components/Background/HelixField.jsx`) |

No CDN dependencies at runtime — everything ships from the same origin.

## Getting started

```bash
npm install
npm run dev      # local dev server with HMR
npm run build    # production build into dist/
npm run preview  # serve the production build locally
npm run lint     # eslint
```

## Structure

```
src/
  Components/     NavBar, Footer, Sheet, Background (WebGL helix)
  Pages/          Home, About, Team, Events, Projects, NotFound
  config/api.js   Google Sheets endpoints + stale-while-revalidate fetch cache
  index.css       Design tokens (colour, type scale, spacing) — declared here ONLY
  App.css         Shared layout primitives (.shell, .rule, .band, .entry)
```

**Styling convention:** design tokens are declared in `src/index.css` and nowhere
else. Every other stylesheet consumes them via `var()` and is scoped to its own
page/component class. Please keep it that way.

### Content

Page content comes from published Google Sheets, mapped in `src/config/api.js`.
To change copy, team members, events or projects, edit the sheet — no code
change or redeploy is needed.

## Design

The palette is a cyanotype "blueprint" scheme derived from the KBG logo:

| Token | Value |
|---|---|
| `--cyan` | `#36E4DF` |
| `--blue` | `#1177E1` |
| `--blue-deep` | `#114BF2` |

The background is a real WebGL shader, not an image: a raymarched signed-distance
DNA double helix. It adapts to the device — capped device-pixel-ratio, reduced
march steps on mobile, paused when off-screen via `IntersectionObserver`, and
fully disabled under `prefers-reduced-motion`.

## Deployment

`deploy.sh` builds the site and ships `dist/` to the club server, using a
release-directory + symlink swap so the switch is atomic and the previous
release stays available for rollback. TLS is handled by Caddy.

```bash
./deploy.sh
```

## License

© Kamand Bioengineering Group, IIT Mandi.
