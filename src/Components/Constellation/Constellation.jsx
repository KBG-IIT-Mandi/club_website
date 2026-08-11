import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Constellation.css";

/**
 * <Constellation members projects /> — the research constellation.
 *
 * A canvas-2D force-directed graph of the club: KBG pinned at the centre,
 * discipline hubs around it, one node per member (--bio, alive) and one per
 * project (--data, computational). The sim runs ~300 ticks once at mount and
 * renders settled; after that the canvas repaints ONLY on pointer interaction
 * — there is no perpetual rAF loop.
 *
 * The canvas is aria-hidden enhancement. Every member ALSO renders in the DOM
 * roster grid below it — that grid is the accessible record and the whole
 * interface on touch, reduced-motion, or canvas-less clients.
 */

/* Discipline classification is the lib's job — one map, one contract, shared
   with the Projects archive so a project can never file under one discipline
   in the dossier and another in the constellation. */
import {
  DISCIPLINES,
  disciplineFor,
  disciplineForMember,
} from "../../lib/discipline";

/* ── GRAPH ───────────────────────────────────────────────────────────────────
   Node types: kbg (pinned centre) · hub (discipline) · member · project.
   Hubs are created lazily — a discipline with no member and no project never
   appears. Edge priority per member: explicit member.projects[] (schema
   extension, may not exist yet) → bio/role keyword → the KBG centre itself. */

function buildGraph(members, projects) {
  const nodes = [];
  const edges = [];
  const add = (n) => nodes.push(n) - 1;

  const kbg = add({ type: "kbg", label: "KBG", r: 9 });

  const hubIndex = new Map();
  const hubFor = (id) => {
    if (!hubIndex.has(id)) {
      const d = DISCIPLINES.find((x) => x.id === id);
      const idx = add({ type: "hub", label: d ? d.label : String(id).toUpperCase(), r: 6 });
      hubIndex.set(id, idx);
      edges.push({ a: kbg, b: idx });
    }
    return hubIndex.get(id);
  };

  const projIndex = new Map();
  (Array.isArray(projects) ? projects : []).forEach((p) => {
    if (!p || typeof p.name !== "string" || !p.name.trim()) return;
    const idx = add({ type: "project", label: p.name, r: 4.5 });
    projIndex.set(p.name.trim().toLowerCase(), idx);
    edges.push({ a: idx, b: hubFor(disciplineFor(p.tech).id) });
  });

  (Array.isArray(members) ? members : []).forEach((m) => {
    if (!m) return;
    const idx = add({ type: "member", label: m.name || "RESEARCHER", r: 5.5, member: m });

    let linked = false;
    if (Array.isArray(m.projects)) {
      m.projects.forEach((pname) => {
        const pi = typeof pname === "string" ? projIndex.get(pname.trim().toLowerCase()) : undefined;
        if (pi !== undefined) {
          edges.push({ a: idx, b: pi });
          linked = true;
        }
      });
    }
    if (!linked) {
      const d = disciplineForMember(m);
      if (d) {
        edges.push({ a: idx, b: hubFor(d) });
        linked = true;
      }
    }
    if (!linked) edges.push({ a: idx, b: kbg });
  });

  return { nodes, edges };
}

function buildAdjacency(graph) {
  const adj = graph.nodes.map(() => ({ nodes: new Set(), edges: new Set() }));
  graph.edges.forEach((e, ei) => {
    adj[e.a].nodes.add(e.b);
    adj[e.a].edges.add(ei);
    adj[e.b].nodes.add(e.a);
    adj[e.b].edges.add(ei);
  });
  return adj;
}

/* ── PHYSICS ─────────────────────────────────────────────────────────────────
   Springs toward a 90px rest length, pairwise repulsion, velocity damping
   0.85, ~300 ticks at mount, then the layout is frozen. Deterministic PRNG so
   the settled constellation is identical on every visit. */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REST = 90;
const K_SPRING = 0.02;
const K_REPULSE = 2800;
const DAMPING = 0.85;
const TICKS = 300;
const PAD = 26;

function runSim(graph, w, h) {
  const { nodes, edges } = graph;
  const rand = mulberry32(0x4b4247); /* "KBG" */
  const cx = w / 2;
  const cy = h / 2;
  const pos = nodes.map(() => ({ x: cx, y: cy, vx: 0, vy: 0 }));

  /* Seed: hubs on a ring around the pinned centre… */
  const hubs = [];
  nodes.forEach((n, i) => {
    if (n.type === "hub") hubs.push(i);
  });
  const ringR = Math.min(w, h) * 0.3;
  hubs.forEach((i, k) => {
    const ang = (k / Math.max(1, hubs.length)) * Math.PI * 2 - Math.PI / 2;
    pos[i].x = cx + Math.cos(ang) * ringR;
    pos[i].y = cy + Math.sin(ang) * ringR;
  });

  /* …then members/projects jittered near their first linked partner. Node
     order guarantees the partner (kbg/hub/project) is already placed. */
  nodes.forEach((n, i) => {
    if (n.type === "kbg" || n.type === "hub") return;
    const e = edges.find((ed) => ed.a === i || ed.b === i);
    const partner = e ? pos[e.a === i ? e.b : e.a] : { x: cx, y: cy };
    const ang = rand() * Math.PI * 2;
    const rad = 40 + rand() * 60;
    pos[i].x = partner.x + Math.cos(ang) * rad;
    pos[i].y = partner.y + Math.sin(ang) * rad;
  });

  for (let t = 0; t < TICKS; t++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const f = Math.min(K_REPULSE / d2, 8);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        pos[i].vx += fx;
        pos[i].vy += fy;
        pos[j].vx -= fx;
        pos[j].vy -= fy;
      }
    }

    edges.forEach(({ a, b }) => {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - REST) * K_SPRING;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      pos[a].vx += fx;
      pos[a].vy += fy;
      pos[b].vx -= fx;
      pos[b].vy -= fy;
    });

    nodes.forEach((n, i) => {
      const p = pos[i];
      if (n.type === "kbg") {
        p.x = cx;
        p.y = cy;
        p.vx = 0;
        p.vy = 0;
        return;
      }
      /* gentle centring so a sparse graph never piles into a corner */
      p.vx += (cx - p.x) * 0.0012;
      p.vy += (cy - p.y) * 0.0012;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x = Math.min(w - PAD, Math.max(PAD, p.x + p.vx));
      p.y = Math.min(h - PAD, Math.max(PAD, p.y + p.vy));
    });
  }

  return pos;
}

/* ── DRAW ────────────────────────────────────────────────────────────────────
   Accent discipline holds in the canvas too: members are --bio (alive),
   projects are --data (computational); hubs and the centre carry only the
   neutral lab greys. On hover the connected set stays full strength and the
   rest of the constellation dims to ~15%. */

const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const DIM = 0.15;

function drawGraph(ctx, w, h, graph, pos, adj, hover, pointer, c) {
  const { nodes, edges } = graph;
  ctx.clearRect(0, 0, w, h);
  const lit = hover >= 0 ? adj[hover] : null;

  edges.forEach((e, ei) => {
    const isLit = lit ? lit.edges.has(ei) : false;
    let stroke = c.hairline;
    let alpha = 1;
    if (lit) {
      if (isLit) {
        const ta = nodes[e.a].type;
        const tb = nodes[e.b].type;
        stroke =
          ta === "member" || tb === "member"
            ? c.bio
            : ta === "project" || tb === "project"
              ? c.data
              : c.specimen2;
        alpha = 0.9;
      } else {
        alpha = DIM;
      }
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isLit ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(pos[e.a].x, pos[e.a].y);
    ctx.lineTo(pos[e.b].x, pos[e.b].y);
    ctx.stroke();
  });

  nodes.forEach((n, i) => {
    const isLit = lit ? i === hover || lit.nodes.has(i) : true;
    ctx.globalAlpha = isLit ? 1 : DIM;
    const { x, y } = pos[i];
    const r = i === hover ? n.r + 1.5 : n.r;

    if (n.type === "member" || n.type === "project") {
      ctx.fillStyle = n.type === "member" ? c.bio : c.data;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (i === hover) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (n.type === "hub") {
      ctx.strokeStyle = c.specimen2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      /* kbg — a filled core inside an open ring */
      ctx.fillStyle = c.specimen;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.specimen2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  /* Structural captions: the centre and the discipline hubs are always named.
     Member/project names appear only at the cursor — the DOM roster below is
     where every name lives permanently. */
  ctx.font = `500 9px ${MONO}`;
  ctx.textAlign = "center";
  nodes.forEach((n, i) => {
    if (n.type !== "hub" && n.type !== "kbg") return;
    const isLit = lit ? i === hover || lit.nodes.has(i) : true;
    ctx.globalAlpha = isLit ? 1 : DIM;
    ctx.fillStyle = c.specimen2;
    ctx.fillText(n.label, pos[i].x, pos[i].y + n.r + 14);
  });

  if (hover >= 0 && pointer) {
    const n = nodes[hover];
    ctx.font = `500 11px ${MONO}`;
    ctx.textAlign = "left";
    const text = n.label;
    const tw = ctx.measureText(text).width;
    let lx = pointer.x + 14;
    let ly = pointer.y - 12;
    if (lx + tw + 12 > w) lx = pointer.x - tw - 18;
    if (ly < 16) ly = pointer.y + 24;
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = c.ground;
    ctx.fillRect(lx - 6, ly - 12, tw + 12, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = n.type === "member" ? c.bio : n.type === "project" ? c.data : c.specimen;
    ctx.fillText(text, lx, ly + 1);
  }

  ctx.globalAlpha = 1;
}

/* ── CANVAS STAGE ──────────────────────────────────────────────────────── */

function GraphCanvas({ graph, onSelectMember, onFail, children }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({ pos: null, w: 0, h: 0, hover: -1, px: 0, py: 0 });

  const adj = useMemo(() => buildAdjacency(graph), [graph]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s.pos) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    /* Colours come from computed style at paint time, so the Konami mutation
       recolours the constellation on the very next interaction. */
    const cs = getComputedStyle(canvas);
    const read = (name, fb) => cs.getPropertyValue(name).trim() || fb;
    drawGraph(ctx, s.w, s.h, graph, s.pos, adj, s.hover, { x: s.px, y: s.py }, {
      bio: read("--bio", "#B6FF2E"),
      data: read("--data", "#4FA8FF"),
      specimen: read("--specimen", "#E8F4FF"),
      specimen2: read("--specimen-2", "#8CA3C3"),
      hairline: read("--hairline", "#16233A"),
      ground: read("--void", "#030507"),
    });
  }, [graph, adj]);

  const layout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onFail();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(280, rect.width);
    const h = Math.max(320, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = stateRef.current;
    s.w = w;
    s.h = h;
    s.hover = -1;
    s.pos = runSim(graph, w, h);
    paint();
  }, [graph, paint, onFail]);

  useEffect(() => {
    layout();
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(layout, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [layout]);

  const hitTest = (e) => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s.pos) return { x: 0, y: 0, hit: -1 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hit = -1;
    let best = 24; /* px capture radius around a node */
    for (let i = 0; i < graph.nodes.length; i++) {
      const d = Math.hypot(s.pos[i].x - x, s.pos[i].y - y);
      if (d < best) {
        best = d;
        hit = i;
      }
    }
    return { x, y, hit };
  };

  /* Repaints happen on hover CHANGE, plus while a node is lit so the name
     label tracks the cursor. An idle pointer over empty void costs nothing. */
  const handleMove = (e) => {
    const s = stateRef.current;
    const { x, y, hit } = hitTest(e);
    const changed = hit !== s.hover;
    s.px = x;
    s.py = y;
    if (changed) {
      s.hover = hit;
      wrapRef.current?.setAttribute(
        "data-cursor",
        hit >= 0 && graph.nodes[hit].type === "member" ? "open" : "observe"
      );
    }
    if (changed || hit >= 0) paint();
  };

  const handleLeave = () => {
    const s = stateRef.current;
    if (s.hover === -1) return;
    s.hover = -1;
    wrapRef.current?.setAttribute("data-cursor", "observe");
    paint();
  };

  const handleClick = (e) => {
    const { hit } = hitTest(e);
    const n = hit >= 0 ? graph.nodes[hit] : null;
    if (n && n.type === "member" && n.member) onSelectMember(n.member);
  };

  return (
    <div ref={wrapRef} className="constellation__stage" data-cursor="observe">
      <canvas
        ref={canvasRef}
        className="constellation__canvas"
        aria-hidden="true"
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onClick={handleClick}
      />
      {children}
    </div>
  );
}

/* ── MEMBER PANEL — opened by clicking a member node ───────────────────── */

function MemberPanel({ member, onClose }) {
  const closeRef = useRef(null);
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const socials = Object.entries(member.socials || {}).filter(
    ([, href]) => typeof href === "string" && href.trim() !== ""
  );

  return (
    <aside className="constellation__panel" aria-label={`Member: ${member.name || "researcher"}`}>
      <button
        ref={closeRef}
        type="button"
        className="label constellation__close"
        onClick={onClose}
        data-cursor="explore"
      >
        Close ×
      </button>

      {member.image && !imgBroken && (
        <div className="membrane constellation__photo constellation__photo--panel">
          <img
            src={member.image}
            alt={member.name || ""}
            width="320"
            height="320"
            loading="lazy"
            decoding="async"
            onError={() => setImgBroken(true)}
          />
        </div>
      )}

      {member.role && <p className="label label--live">{member.role}</p>}
      {member.name && <h3>{member.name}</h3>}
      {member.bio && <p className="caption">{member.bio}</p>}

      {!!socials.length && (
        <div className="constellation__links">
          {socials.map(([key, href]) => (
            <a
              key={key}
              className="label constellation__link"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor="explore"
            >
              {key}
              <span className="sr-only"> — {member.name}</span>
            </a>
          ))}
        </div>
      )}
    </aside>
  );
}

/* ── ROSTER GRID — the DOM record; the whole interface on touch ────────── */

const MEMBRANE_VARIANTS = ["", " membrane--2", " membrane--3", " membrane--4"];

function MemberGrid({ members }) {
  /* A dead remote photo hides one img; the membrane keeps its box, so a 404
     recolours a cell without ever reflowing the grid. */
  const [broken, setBroken] = useState(() => new Set());
  const markBroken = (i) =>
    setBroken((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });

  if (!members.length) return null;

  return (
    <div className="entry-grid constellation__grid">
      {members.map((m, i) => {
        const socials = Object.entries(m.socials || {}).filter(
          ([, href]) => typeof href === "string" && href.trim() !== ""
        );

        return (
          // No .row here: the Team page's GSAP cascade owns roster entrances
          // (teamMotion.js); --i stays for the breathe phase offset.
          <article className="entry constellation__member" style={{ "--i": i }} key={m.name || i}>
            <div className={`membrane${MEMBRANE_VARIANTS[i % 4]} constellation__photo`}>
              {m.image && !broken.has(i) && (
                <img
                  src={m.image}
                  alt={m.name || ""}
                  width="320"
                  height="320"
                  loading="lazy"
                  decoding="async"
                  onError={() => markBroken(i)}
                />
              )}
            </div>

            {m.role && (
              <p
                className={`tag constellation__role${
                  /coordinator|mentor/i.test(m.role) ? " tag--live" : ""
                }`}
              >
                {m.role}
              </p>
            )}
            {m.name && <h3>{m.name}</h3>}
            {m.bio && <p className="caption">{m.bio}</p>}

            {!!socials.length && (
              <div className="entry-foot constellation__links">
                {socials.map(([key, href]) => (
                  <a
                    key={key}
                    className="label constellation__link"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cursor="explore"
                  >
                    {key}
                    <span className="sr-only"> — {m.name}</span>
                  </a>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* ── THE CONSTELLATION ─────────────────────────────────────────────────── */

export default function Constellation({ members = [], projects = [] }) {
  /* Decided once at mount: coarse pointers, reduced motion and canvas-less
     clients skip the graph entirely and get the visible roster only. */
  const [graphCapable] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    if (window.matchMedia("(pointer: coarse)").matches) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  });
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [selected, setSelected] = useState(null);

  const memberList = useMemo(
    () => (Array.isArray(members) ? members : []),
    [members]
  );
  const graph = useMemo(() => buildGraph(memberList, projects), [memberList, projects]);

  const showGraph = graphCapable && !canvasFailed && graph.nodes.length > 1;

  const handleFail = useCallback(() => setCanvasFailed(true), []);
  const handleClose = useCallback(() => setSelected(null), []);

  const types = useMemo(() => new Set(graph.nodes.map((n) => n.type)), [graph]);

  return (
    <div className="constellation">
      {showGraph && (
        <div className="band">
          <ul className="constellation__legend" aria-hidden="true">
            <li>
              <span className="constellation__key constellation__key--kbg" /> KBG
            </li>
            {types.has("hub") && (
              <li>
                <span className="constellation__key constellation__key--hub" /> Discipline
              </li>
            )}
            {types.has("member") && (
              <li>
                <span className="constellation__key constellation__key--member" /> Member
              </li>
            )}
            {types.has("project") && (
              <li>
                <span className="constellation__key constellation__key--project" /> Project
              </li>
            )}
          </ul>

          <GraphCanvas graph={graph} onSelectMember={setSelected} onFail={handleFail}>
            {selected && (
              <MemberPanel
                key={selected.name || "member"}
                member={selected}
                onClose={handleClose}
              />
            )}
          </GraphCanvas>
        </div>
      )}

      {showGraph && !!memberList.length && (
        <p className="label constellation__roster band">
          Full roster — {memberList.length}{" "}
          {memberList.length === 1 ? "researcher" : "researchers"}
        </p>
      )}

      <MemberGrid members={memberList} />
    </div>
  );
}
