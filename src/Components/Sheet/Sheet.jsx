import "./Sheet.css";

/**
 * <Sheet /> — the site's engineered overlay.
 *
 * Mount ONCE, in App.jsx, above <Routes>, so it survives navigation instead of
 * tearing down and rebuilding per route. It sits OVER the 3D helix shader
 * (<HelixField />) and under <main>: the shader is the biology, this is the
 * engineering drawn on top of it.
 *
 * Three layers now: the 40px grid, the 8-tooth gear, the broken frame. The
 * helix spine and its lumen are gone — the double helix is now rendered in 3D
 * by the shader, not drawn as flat SVG strands. Pure decoration behind <main>:
 * no JSON, no endpoint, no route, no render guard.
 *
 * The gear animation is transform-only and compositor-only, so
 * prefers-reduced-motion is honoured for free by the global block in index.css.
 */
export default function Sheet() {
  return (
    <div className="sheet" aria-hidden="true">
      {/* GRID — 40px, --grid-line, 1.5:1. The engineering paper over the field. */}
      <div className="sheet__grid" />

      {/* THE GEAR — 8 teeth, tooth at 12 o'clock, indexes 45deg every 3s. */}
      <div className="sheet__gear">
        <svg viewBox="0 0 144 144" aria-hidden="true" focusable="false">
          <g fill="none" stroke="var(--grid-line)" strokeWidth="1.5">
            <path d="M61.49,8.87 L82.51,8.87 L80.21,22.68 L101.07,31.32 L109.21,19.93 L124.07,34.79 L112.68,42.93 L121.32,63.79 L135.13,61.49 L135.13,82.51 L121.32,80.21 L112.68,101.07 L124.07,109.21 L109.21,124.07 L101.07,112.68 L80.21,121.32 L82.51,135.13 L61.49,135.13 L63.79,121.32 L42.93,112.68 L34.79,124.07 L19.93,109.21 L31.32,101.07 L22.68,80.21 L8.87,82.51 L8.87,61.49 L22.68,63.79 L31.32,42.93 L19.93,34.79 L34.79,19.93 L42.93,31.32 L63.79,22.68 Z" />
            <circle cx="72" cy="72" r="58" strokeWidth="0.75" strokeDasharray="10 14" />
            <circle cx="72" cy="72" r="18" />
          </g>
        </svg>
      </div>

      {/* THE FRAME — 2px --deep, broken at 71% on the top rail. Never closes. */}
      <div className="sheet__frame" />
    </div>
  );
}
