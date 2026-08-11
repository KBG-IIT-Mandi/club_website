import { useEffect, useId, useMemo, useRef } from "react";
import "./SpecimenCard.css";
import { disciplineFor } from "../../lib/discipline";

/* ═══════════════════════════════════════════════════════════════════════════
   SPECIMEN CARD — one project rendered as an experiment dossier.

     EXPERIMENT 02          STATUS      ACTIVE
     DynaSync               DISCIPLINE  AI × BIOLOGY
                            STACK       PYTHON · SCIKIT-LEARN · MNE-PYTHON

   Everything factual: DISCIPLINE is derived from the real tech[]; STATUS,
   TEAM, PROGRESS and links render ONLY when projects.json carries them (spec
   schema extension — absent today). Nothing is invented.

   The microscopy thumbnail is procedural — value noise seeded from the
   project name, drawn once to a canvas, no animation loop, no fake
   photography. The hover sparkline is a seeded random walk drawn by a CSS
   stroke-dashoffset animation; under reduced motion the global block kills
   the animation and the trace simply appears fully drawn (final state is the
   plain hover declaration, never the keyframe).

   Disclosure pattern: <h2><button aria-expanded aria-controls>…</button></h2>
   toggling a case-study drawer. The drawer stays in the DOM (grid 0fr→1fr
   height animation) and is `inert` while closed so its links leave the tab
   order and the accessibility tree. When it opens, the body content lands in
   three delayed steps — summary, stack, links — pure transition-delay.

   The GHOST NUMERAL is the same EXPERIMENT index rendered enormous behind
   the dossier — the vault's shelf mark, aria-hidden, clipped by its own
   inset:0 wrapper (not the card, whose overflow must stay visible so focus
   rings survive).

   `index` is the ARCHIVE position (names the experiment, never renumbers);
   `order` is the position in the currently visible list (drives the .row
   stagger, so a filtered view still cascades 0·1·2 with no dead gaps).
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── deterministic PRNG — same name, same microscopy, every visit ────────── */

const hashSeed = (str) => {
  let h = 2166136261; /* FNV-1a */
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ── the microscopy field — 2-octave value noise, drawn once ─────────────── */

const THUMB_SIZE = 240; /* internal px; CSS shows 120 (2x for retina) */

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const makeValueNoise = (rand, cells) => {
  const w = cells + 1;
  const g = new Float64Array(w * w);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.min(Math.floor(x), cells - 1);
    const yi = Math.min(Math.floor(y), cells - 1);
    const fx = fade(x - xi);
    const fy = fade(y - yi);
    const a = g[yi * w + xi];
    const b = g[yi * w + xi + 1];
    const c = g[(yi + 1) * w + xi];
    const d = g[(yi + 1) * w + xi + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
};

/* Tokens arrive as computed strings; parse both #rrggbb and rgb(r, g, b) so a
   future token change cannot silently break the thumbnail. */
const parseColor = (value, fallback) => {
  const v = (value || "").trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return fallback;
};

const drawMicroscopy = (canvas, name) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;

  /* Read the live tokens so the mutation palette reaches a fresh mount. */
  const styles = getComputedStyle(canvas);
  const ground = parseColor(styles.getPropertyValue("--depth-2"), [11, 20, 34]);
  const bio = parseColor(styles.getPropertyValue("--bio"), [182, 255, 46]);

  const rand = mulberry32(hashSeed(name || "specimen"));
  const coarse = makeValueNoise(rand, 5);
  const fine = makeValueNoise(rand, 11);

  const img = ctx.createImageData(THUMB_SIZE, THUMB_SIZE);
  const d = img.data;
  for (let y = 0; y < THUMB_SIZE; y++) {
    for (let x = 0; x < THUMB_SIZE; x++) {
      const u = x / THUMB_SIZE;
      const v = y / THUMB_SIZE;
      const n = 0.66 * coarse(u * 5, v * 5) + 0.34 * fine(u * 11, v * 11);
      /* Only the upper reaches of the field fluoresce — soft lime blobs on
         the --depth-2 ground, plus a whisper of base texture. */
      const glow = smoothstep(0.52, 0.82, n) * 0.6 + n * 0.05;
      const i = (y * THUMB_SIZE + x) * 4;
      d[i] = ground[0] + (bio[0] - ground[0]) * glow;
      d[i + 1] = ground[1] + (bio[1] - ground[1]) * glow;
      d[i + 2] = ground[2] + (bio[2] - ground[2]) * glow;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

/* Membrane silhouettes cycle so a column of dossiers never repeats. */
const MEMBRANES = ["membrane", "membrane membrane--2", "membrane membrane--3", "membrane membrane--4"];

const LIVE_STATUS = /^(active|live|ongoing|running)$/i;

const SpecimenCard = ({ project, index = 0, order = index, expanded = false, onToggle }) => {
  const p = project || {};
  const uid = useId();
  const drawerId = `${uid}-drawer`;
  const canvasRef = useRef(null);

  const name = typeof p.name === "string" ? p.name : "";
  const tech = Array.isArray(p.tech) ? p.tech.filter((t) => typeof t === "string") : [];
  const discipline = disciplineFor(p.tech);

  /* Optional spec-extension fields — rendered ONLY when real. */
  const status = typeof p.status === "string" && p.status.trim() ? p.status.trim() : null;
  const team =
    typeof p.team === "number" || (typeof p.team === "string" && p.team.trim()) ? p.team : null;
  const progress =
    typeof p.progress === "number" && Number.isFinite(p.progress)
      ? Math.min(100, Math.max(0, Math.round(p.progress)))
      : null;
  const links =
    p.links && typeof p.links === "object" && !Array.isArray(p.links)
      ? Object.entries(p.links).filter(([, href]) => typeof href === "string" && href)
      : [];

  /* The activity trace: a seeded random walk. Same specimen, same trace. */
  const sparkPoints = useMemo(() => {
    const rand = mulberry32(hashSeed(`${name || "specimen"}::trace`));
    const pts = [];
    let level = 0.5;
    for (let i = 0; i < 24; i++) {
      level = Math.min(1, Math.max(0, level + (rand() - 0.5) * 0.42));
      pts.push(`${((i / 23) * 120).toFixed(1)},${(28 - level * 24).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [name]);

  /* Draw the microscopy once per specimen. Static image — no loop, nothing to
     pause, nothing for reduced motion to disable. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawMicroscopy(canvas, name);
  }, [name]);

  return (
    <article
      className={`specimen row${expanded ? " is-open" : ""}`}
      style={{ "--i": order }}
    >
      <span className="specimen__ghost" aria-hidden="true">
        <span className="specimen__ghost-no">{String(index + 1).padStart(2, "0")}</span>
      </span>
      <h2 className="specimen__h">
        <button
          type="button"
          className="specimen__head"
          aria-expanded={expanded}
          aria-controls={drawerId}
          onClick={onToggle}
          data-cursor="open"
        >
          <span className={`specimen__thumb ${MEMBRANES[index % MEMBRANES.length]}`} aria-hidden="true">
            <canvas ref={canvasRef} />
          </span>
          <span className="specimen__id">
            <span className="specimen__no">
              EXPERIMENT {String(index + 1).padStart(2, "0")}
            </span>
            {name && <span className="specimen__name">{name}</span>}
          </span>
          <svg className="specimen__spark" viewBox="0 0 120 32" aria-hidden="true">
            <polyline className="specimen__spark-line" points={sparkPoints} pathLength="1" />
          </svg>
          <span className="specimen__glyph" aria-hidden="true">+</span>
        </button>
      </h2>

      <dl className="specimen__meta">
        <div className="specimen__meta-row">
          <dt>Discipline</dt>
          <dd>{discipline.label}</dd>
        </div>
        {status && (
          <div className="specimen__meta-row">
            <dt>Status</dt>
            {/* ACTIVE is the one metadata value that is literally alive. */}
            <dd className={LIVE_STATUS.test(status) ? "is-live" : undefined}>{status}</dd>
          </div>
        )}
        {team != null && (
          <div className="specimen__meta-row">
            <dt>Team</dt>
            <dd>{team}</dd>
          </div>
        )}
        {progress != null && (
          <div className="specimen__meta-row">
            <dt>Progress</dt>
            <dd className="specimen__progress">
              <span className="specimen__progress-track" aria-hidden="true">
                <span className="specimen__progress-fill" style={{ width: `${progress}%` }} />
              </span>
              <span>{progress}%</span>
            </dd>
          </div>
        )}
        {tech.length > 0 && (
          <div className="specimen__meta-row">
            <dt>Stack</dt>
            <dd>{tech.join(" · ")}</dd>
          </div>
        )}
      </dl>

      <div id={drawerId} className="specimen__drawer" inert={!expanded}>
        <div className="specimen__drawer-clip">
          <div className="specimen__body">
            {p.summary && <p className="specimen__summary">{p.summary}</p>}
            {tech.length > 0 && (
              <div className="tag-row">
                {tech.map((t, ti) => (
                  <span key={ti} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {links.length > 0 && (
              <div className="specimen__links">
                {links.map(([label, href]) => (
                  <a
                    key={label}
                    className="btn-ghost"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    data-cursor="explore"
                  >
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default SpecimenCard;
