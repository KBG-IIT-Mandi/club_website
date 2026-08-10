import "./Grain.css";

/**
 * <Grain /> — one fixed film-grain overlay over everything.
 *
 * A static SVG feTurbulence texture (no animation — animating baseFrequency
 * repaints the whole viewport every frame for a texture nobody can track).
 * Subtlety is the point: opacity 0.04. pointer-events: none, aria-hidden.
 */
export default function Grain() {
  return (
    <svg className="grain" aria-hidden="true" focusable="false">
      <filter id="grain-noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.72"
          numOctaves="2"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-noise)" />
    </svg>
  );
}
