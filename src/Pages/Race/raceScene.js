import * as THREE from 'three';
import { RNG } from '../../race/engine/rng.js';
import { STAGES, STAGE_INDEX } from '../../race/engine/stages.js';
import { UM_PER_MM } from '../../race/engine/units.js';

/**
 * raceScene — the race as cinema, inside real anatomy, in three.js.
 *
 * Framework-free (the cellScene convention): React owns lifecycle and DPR;
 * this module owns the GL. PRESENTATION ONLY — outcomes are decided
 * headlessly in src/race/engine; this scene has its own RNG stream and no
 * path back into the engine, so particle count and camera cannot move a
 * statistic, by construction.
 *
 * THE ANATOMY — a holographic scan of the female reproductive tract in the
 * classic anterior view: the birth canal rising to the cervix, the
 * pear-shaped uterus, BOTH fallopian tubes arcing from the cornua, fimbriae
 * reaching for the ovaries. The race runs up the canal and out the right
 * tube; at ovulation the egg visibly leaves the ovary, is caught by the
 * fimbriae, and travels down the ampulla to where fertilization happens.
 * Proportions are stylized and log-scaled (the HUD says so); the SHAPES are
 * the real ones.
 *
 * THE DIRECTOR — an automated documentary crew:
 *   intro       fly the whole tract from the tube back down the canal
 *   deposition  medium orbit on the pooled ejaculate at the canal's end
 *   advance     tracking shot alongside the leading edge of living mass
 *   reservoir   slow orbit of the isthmus while arrivals bind and wait
 *   ovulation   the egg leaves the ovary — the fimbriae catch it
 *   hunt        chase-cam behind the hero cell once hyperactivation frees it
 *   approach    close orbit of the cumulus cloud under siege
 *   fusion      push-in on the zinc spark, then a slow settle
 *   nofert      an elegiac pull-back to the whole silent anatomy
 *
 * Contract (consumed by Race.jsx):
 *   createRaceScene(canvas, { seed, reducedMotion, particleTarget }) → {
 *     resize(w, h, dpr), refreshPalette(),
 *     setSelected(id), setCameraMode('auto'|'overview'),
 *     draw(snapshot, finalists, dtMs), dispose(),
 *   }
 */

const AMP = STAGE_INDEX.ampulla;
const IST = STAGE_INDEX.isthmus;

/* ── GLSL: 3D simplex noise (Ashima / Stefan Gustavson, public domain) ──── */

const SNOISE = /* glsl */ `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

/* The comet mask: an oriented swimming cell — bright head, tapering tail
   that whips with a travelling wave. Shared by swarm and finalists. */
const COMET_GLSL = /* glsl */ `
  float comet(vec2 d, float angle, float t, float seed, float tailLen) {
    float ca = cos(angle), sa = sin(angle);
    vec2 rd = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    vec2 hd = (rd - vec2(0.13, 0.0)) * vec2(1.0, 1.45);
    float head = smoothstep(0.16, 0.02, length(hd));
    float along = clamp(-rd.x / tailLen, 0.0, 1.0);
    float whip = sin(along * 9.0 - t * (7.0 + seed * 5.0) + seed * 40.0)
               * 0.10 * along;
    float tail = smoothstep(0.075 * (1.0 - along * 0.85), 0.0, abs(rd.y - whip))
               * step(rd.x, 0.13) * (1.0 - along) * 0.85;
    return head + tail;
  }
`;

/* ── palette from CSS — the Konami mutation reaches the GL through here ── */

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const parse = (name, fallback) => {
    const v = cs.getPropertyValue(name).trim();
    return new THREE.Color(v || fallback);
  };
  const raw = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  return {
    bio: parse('--bio', '#B6FF2E'),
    bioDim: parse('--bio-dim', '#5E8A1E'),
    data: parse('--data', '#4FA8FF'),
    dataDeep: parse('--data-deep', '#1177E1'),
    specimen: parse('--specimen', '#E8F4FF'),
    specimen2: parse('--specimen-2', '#8CA3C3'),
    hairline: parse('--hairline', '#16233A'),
    depth2: parse('--depth-2', '#0B1422'),
    css: {
      specimen2: raw('--specimen-2', '#8CA3C3'),
      data: raw('--data', '#4FA8FF'),
    },
  };
}

/* The living channels — the cool half of the homepage's fluorophore panel. */
const makeSwarmPal = (bio) => [
  new THREE.Color(0x38c8ff).lerp(bio, 0.35),
  new THREE.Color(0x2ee8d8).lerp(bio, 0.3),
  new THREE.Color(0x3cff6e).lerp(bio, 0.4),
  bio.clone(),
];

/* ── THE ANATOMY — anterior view, y up, race side +x ────────────────────
   Birth canal rises to the cervix; the uterine cavity climbs the pear to
   the right cornu; the right tube arcs out over the ovary and curls its
   fimbriae down toward it. Indices below mark stage boundaries. */

const CURVE_POINTS = [
  [0.0, -7.6, 0.0],    //  0  introitus — the race starts here
  [0.05, -6.2, 0.15],  //  1
  [0.0, -4.8, 0.0],    //  2  external os — cervix begins
  [0.0, -3.35, 0.1],   //  3  internal os — the cavity begins
  [0.1, -2.0, -0.1],   //  4
  [0.5, -0.9, 0.1],    //  5
  [1.15, -0.15, 0.0],  //  6  right cornu — the uterotubal junction
  [1.55, 0.12, 0.1],   //  7  isthmus begins
  [2.3, 0.6, -0.2],    //  8
  [3.3, 1.25, 0.2],    //  9  ampulla begins
  [4.4, 1.75, -0.15],  // 10
  [5.5, 1.55, 0.2],    // 11
  [6.3, 0.9, -0.1],    // 12
  [6.7, 0.15, 0.15],   // 13  fimbrial mouth, reaching for the ovary
];

/* control-point index at which each anatomical stage begins */
const STAGE_START_CP = { vagina: 0, cervix: 2, uterus: 3, utj: 6, isthmus: 7, ampulla: 9 };

const OVARY_POS = new THREE.Vector3(6.15, -0.85, 0.1);
const ANATOMY_CENTER = new THREE.Vector3(0, -2.7, 0);

const LUT_N = 480;

export function createRaceScene(canvas, { seed = 1, reducedMotion = false, particleTarget = 2600 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 300);
  camera.position.set(0, 0, 20);

  let palette = readPalette();
  let disposed = false;
  let time = 0;
  let W = 300, H = 150;

  /* ── USER ZOOM + ORBIT — the film is explorable. Zoom: trackpad pinch /
     ctrl+wheel / two-finger pinch. Orbit: mouse drag (both axes); on touch,
     one-finger horizontal drag yaws (vertical stays page scroll) and the
     two-finger gesture's midpoint pitches. Double-tap resets everything.
     All of it composes with the director — you're steering the crew's
     shoulder rig, not fighting the cuts. */
  let userZoom = 1;
  let userZoomTarget = 1;
  let userYaw = 0;
  let userPitch = 0;
  const ZOOM_MIN = 0.4, ZOOM_MAX = 3.2;
  const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const clampPitch = (p) => Math.min(0.9, Math.max(-0.5, p));
  const onWheel = (e) => {
    /* plain wheel keeps scrolling the page; pinch-trackpads send ctrlKey */
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    userZoomTarget = clampZoom(userZoomTarget * Math.exp(-e.deltaY * 0.0022));
  };
  let dragging = false, lastX = 0, lastY = 0;
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointers can't be captured */ }
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    userYaw += (e.clientX - lastX) * 0.006;
    userPitch = clampPitch(userPitch + (lastY - e.clientY) * 0.005);
    lastX = e.clientX; lastY = e.clientY;
  };
  const onPointerUp = () => { dragging = false; };
  let pinch0 = 0, pinchZoom0 = 1, pinchMidY0 = 0, pinchPitch0 = 0, touch1X = 0;
  const touchDist = (e) => Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
  );
  const touchMidY = (e) => (e.touches[0].clientY + e.touches[1].clientY) / 2;
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinch0 = touchDist(e);
      pinchZoom0 = userZoomTarget;
      pinchMidY0 = touchMidY(e);
      pinchPitch0 = userPitch;
    } else if (e.touches.length === 1) {
      touch1X = e.touches[0].clientX;
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch0 > 0) {
      e.preventDefault(); // two fingers own the film; one finger still scrolls
      userZoomTarget = clampZoom(pinchZoom0 * (touchDist(e) / pinch0));
      userPitch = clampPitch(pinchPitch0 + (pinchMidY0 - touchMidY(e)) * 0.006);
    } else if (e.touches.length === 1) {
      /* touch-action: pan-y hands us the horizontal axis — yaw orbit */
      userYaw += (e.touches[0].clientX - touch1X) * 0.007;
      touch1X = e.touches[0].clientX;
    }
  };
  const onTouchEnd = (e) => { if (e.touches.length < 2) pinch0 = 0; };
  const onDblClick = () => { userZoomTarget = 1; userYaw = 0; userPitch = 0; };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  canvas.addEventListener('dblclick', onDblClick);

  const disposables = [];
  const track = (r) => { disposables.push(r); return r; };

  /* ── curve lookup + geometric stage mapping ─────────────────────────── */

  const cpVecs = CURVE_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(cpVecs, false, 'catmullrom', 0.5);
  const lutPos = [];
  for (let i = 0; i <= LUT_N; i += 1) lutPos.push(curve.getPointAt(i / LUT_N));
  const frames = curve.computeFrenetFrames(LUT_N, false);

  /* Stage boundaries live at real anatomical landmarks: find the arc
     position of each boundary control point. */
  const tOfControlPoint = (cpIdx) => {
    const target = cpVecs[cpIdx];
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= LUT_N; i += 1) {
      const d = lutPos[i].distanceToSquared(target);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best / LUT_N;
  };

  const anatomical = STAGES.map((st) => st.kind === 'anatomical');
  const stageT = STAGES.map(() => ({ t0: 0, t1: 0 }));
  {
    const b = {
      vagina: tOfControlPoint(STAGE_START_CP.vagina),
      cervix: tOfControlPoint(STAGE_START_CP.cervix),
      uterus: tOfControlPoint(STAGE_START_CP.uterus),
      utj: tOfControlPoint(STAGE_START_CP.utj),
      isthmus: tOfControlPoint(STAGE_START_CP.isthmus),
      ampulla: tOfControlPoint(STAGE_START_CP.ampulla),
    };
    const order = ['vagina', 'cervix', 'uterus', 'utj', 'isthmus', 'ampulla'];
    for (let k = 0; k < order.length; k += 1) {
      const idx = STAGE_INDEX[order[k]];
      stageT[idx] = { t0: b[order[k]], t1: k + 1 < order.length ? b[order[k + 1]] : 1 };
    }
    /* process stages are zero-span markers */
    stageT[STAGE_INDEX.capacitation] = { t0: b.ampulla, t1: b.ampulla };
    for (const id of ['cumulus', 'zona', 'fusion']) {
      const t = b.ampulla + 0.15 * (1 - b.ampulla);
      stageT[STAGE_INDEX[id]] = { t0: t, t1: t };
    }
  }
  const tFor = (stIdx, sFrac) => {
    const r = stageT[stIdx];
    return r.t0 + Math.min(1, Math.max(0, sFrac)) * (r.t1 - r.t0);
  };
  const OOCYTE_T = tFor(AMP, 0.15);

  const radiusAt = (t) => {
    let stIdx = STAGES.length - 1;
    for (let i = 0; i < stageT.length; i += 1) {
      if (t <= stageT[i].t1 && anatomical[i]) { stIdx = i; break; }
    }
    const st = STAGES[stIdx];
    const sF = stageT[stIdx].t1 > stageT[stIdx].t0
      ? (t - stageT[stIdx].t0) / (stageT[stIdx].t1 - stageT[stIdx].t0) : 0.5;
    const base = 0.2 + 0.5 * Math.log10(1 + st.halfWidthMm);
    return Math.max(0.16, base * (0.35 + 0.65 * st.widthProfile(Math.min(1, Math.max(0, sF)))));
  };

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _pp = new THREE.Vector3();
  const _look = new THREE.Vector3();

  const frameAt = (t) => {
    const f = Math.min(LUT_N - 1, Math.max(0, t * LUT_N));
    const i = Math.floor(f);
    return { i, fr: f - i };
  };

  const posAt = (t, ang, rFrac, out) => {
    const { i, fr } = frameAt(t);
    out.copy(lutPos[i]).lerp(lutPos[i + 1], fr);
    const r = radiusAt(t) * rFrac;
    _v1.copy(frames.normals[i]).multiplyScalar(Math.cos(ang) * r);
    _v2.copy(frames.binormals[i]).multiplyScalar(Math.sin(ang) * r);
    return out.add(_v1).add(_v2);
  };

  const tangentAt = (t, out) => {
    const { i } = frameAt(t);
    return out.copy(frames.tangents[i]);
  };

  /* Outside camera positions on a STABLE side-of-travel basis (Frenet
     normals twist). `precess` swings gently around broadside. */
  const _side = new THREE.Vector3();
  const railPos = (t, precess, distAbs, up, out) => {
    const { i, fr } = frameAt(t);
    out.copy(lutPos[i]).lerp(lutPos[i + 1], fr);
    _v1.copy(frames.tangents[i]);
    _side.set(_v1.z, 0, -_v1.x);
    if (_side.lengthSq() < 0.01) _side.set(0, 0, 1);
    _side.normalize();
    /* bias the swing toward the +z (viewer) side so anatomy reads front-on */
    if (_side.z < 0) _side.negate();
    const phi = 0.55 * Math.sin(precess);
    /* the shot's own offset… */
    const lat = distAbs * Math.cos(phi);
    let ox = _side.x * lat;
    let oz = _side.z * lat;
    const oy = up + distAbs * 0.45 * Math.sin(phi) + distAbs * userPitch;
    /* …swung around the subject by the user's orbit */
    const cy = Math.cos(userYaw), sy = Math.sin(userYaw);
    const rx = ox * cy + oz * sy;
    const rz = -ox * sy + oz * cy;
    out.x += rx;
    out.y += oy;
    out.z += rz;
    return out;
  };

  /* ── THE NEBULA — atmosphere ────────────────────────────────────────── */

  const nebulaMat = track(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBio: { value: palette.bio.clone() },
      uData: { value: palette.data.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uBio;
      uniform vec3 uData;
      varying vec3 vDir;
      ${SNOISE}
      void main() {
        float n = snoise(vDir * 2.1 + vec3(0.0, uTime * 0.014, uTime * 0.01)) * 0.6
                + snoise(vDir * 4.7 - vec3(uTime * 0.007, 0.0, 0.0)) * 0.4;
        n = n * 0.5 + 0.5;
        vec3 tint = mix(uData, uBio, 0.22);
        float glow = smoothstep(0.45, 0.95, n);
        gl_FragColor = vec4(tint * glow * 0.16, glow * 0.4);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  }));
  const nebula = new THREE.Mesh(track(new THREE.SphereGeometry(90, 32, 24)), nebulaMat);
  nebula.renderOrder = -2;
  scene.add(nebula);

  /* ── TISSUE SHADER — key-lit, fresnel-rimmed, striated: reads as flesh
     scanned by an instrument, and above all reads as ROUND. Shared by the
     lumen and every anatomical shell. ──────────────────────────────────── */

  const makeTissueMat = ({ opacity = 0.5, rimGain = 1.0, flow = 0 }) => track(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRim: { value: palette.dataDeep.clone() },
      uBody: { value: palette.depth2.clone() },
      uLit: { value: palette.data.clone() },
      uFlowC: { value: palette.data.clone() },
      uOpacity: { value: opacity },
      uRimGain: { value: rimGain },
      uFlow: { value: flow },
      uAmp: { value: reducedMotion ? 0 : 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uAmp;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vWorld;
      ${SNOISE}
      void main() {
        float n = snoise(position * 1.4 + vec3(0.0, uTime * 0.1, uTime * 0.07));
        vec3 pos = position + normal * n * 0.05 * uAmp;
        vN = normalize(normalMatrix * normal);
        vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
        vec4 w = modelViewMatrix * vec4(pos, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uRim;
      uniform vec3 uBody;
      uniform vec3 uLit;
      uniform vec3 uFlowC;
      uniform float uOpacity;
      uniform float uRimGain;
      uniform float uFlow;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vWorld;
      ${SNOISE}
      void main() {
        vec3 v = normalize(-vW);
        vec3 n = normalize(vN);
        /* the key light — a fixed instrument lamp; this is what makes it round */
        vec3 L = normalize(vec3(0.45, 0.65, 0.62));
        float lam = clamp(dot(n, L), 0.0, 1.0) * 0.6 + 0.4;
        float fr = pow(1.0 - abs(dot(n, v)), 2.6);
        /* tissue striations — fine vascular grain */
        float grain = snoise(vWorld * 5.0) * 0.5 + snoise(vWorld * 13.0) * 0.25;
        /* peristaltic flow pulses sliding along the tract (lumen only) */
        float pulse = uFlow * smoothstep(0.75, 1.0, sin(vWorld.x * 3.5 + vWorld.y * 5.0 - uTime * 1.7) * 0.5 + 0.5);
        vec3 col = uBody * lam * (1.0 + grain * 0.25)
                 + uLit * lam * 0.2
                 + uRim * fr * uRimGain
                 + uFlowC * pulse * fr * 0.5;
        float alpha = uOpacity * (0.35 + lam * 0.25) + fr * 0.42 * uRimGain + pulse * 0.1;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));

  const tissueMats = [];
  const tissueMat = (opts) => { const m = makeTissueMat(opts); tissueMats.push(m); return m; };

  /* generic variable-radius tube along a curve */
  function buildVarTube(curveObj, rings, radial, radiusFn) {
    const geo = track(new THREE.BufferGeometry());
    const fr = curveObj.computeFrenetFrames(rings, false);
    const verts = new Float32Array((rings + 1) * (radial + 1) * 3);
    const norms = new Float32Array(verts.length);
    const idx = [];
    let vi = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i <= rings; i += 1) {
      const t = i / rings;
      const c = curveObj.getPointAt(t);
      const r = radiusFn(t);
      for (let j = 0; j <= radial; j += 1) {
        const ang = (j / radial) * Math.PI * 2;
        p.copy(fr.normals[Math.min(i, rings - 1)]).multiplyScalar(Math.cos(ang))
          .addScaledVector(fr.binormals[Math.min(i, rings - 1)], Math.sin(ang));
        verts[vi * 3] = c.x + p.x * r;
        verts[vi * 3 + 1] = c.y + p.y * r;
        verts[vi * 3 + 2] = c.z + p.z * r;
        norms[vi * 3] = p.x; norms[vi * 3 + 1] = p.y; norms[vi * 3 + 2] = p.z;
        vi += 1;
      }
    }
    for (let i = 0; i < rings; i += 1) {
      for (let j = 0; j < radial; j += 1) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
    geo.setIndex(idx);
    return geo;
  }

  /* THE LUMEN — the race track itself, flow-lit */
  const lumenGeo = buildVarTube(curve, 340, 26, radiusAt);
  const lumenMat = tissueMat({ opacity: 0.22, rimGain: 0.9, flow: 1 });
  scene.add(new THREE.Mesh(lumenGeo, lumenMat));

  /* THE ANATOMY SHELLS */
  const anatomyGroup = new THREE.Group();
  scene.add(anatomyGroup);
  const shellMat = tissueMat({ opacity: 0.65, rimGain: 0.9 });
  const dimShellMat = tissueMat({ opacity: 0.4, rimGain: 0.5 });

  /* the uterus — the pear, narrow at the cervix, broad at the fundus */
  {
    const g = track(new THREE.SphereGeometry(1, 56, 44));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ny = (y + 1) / 2;
      const widen = 0.34 + 0.66 * Math.pow(Math.min(1, ny / 0.85), 0.8);
      pos.setXYZ(i, x * 1.5 * widen, y * 1.9, z * 0.85 * widen);
    }
    g.computeVertexNormals();
    const pear = new THREE.Mesh(g, shellMat);
    pear.position.set(0.22, -1.65, 0);
    anatomyGroup.add(pear);
  }

  /* the cervix — a firm collar where canal meets cavity */
  {
    const collar = new THREE.Mesh(track(new THREE.SphereGeometry(1, 28, 20)), shellMat);
    collar.scale.set(0.72, 0.85, 0.66);
    collar.position.set(0, -4.05, 0);
    anatomyGroup.add(collar);
  }

  /* the birth canal — an outer sleeve around the lumen */
  {
    const canal = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -7.75, 0),
      new THREE.Vector3(0.06, -6.2, 0.14),
      new THREE.Vector3(0, -4.55, 0),
    ]);
    anatomyGroup.add(new THREE.Mesh(
      buildVarTube(canal, 40, 20, (t) => 1.0 - t * 0.3), dimShellMat
    ));
  }

  /* the LEFT tube + fimbriae + both ovaries — the mirror side carries no
     race traffic, but without it the anatomy would not read */
  const fimbriae = (mouth, toward, group, mat) => {
    const dir = _v1.copy(toward).sub(mouth).normalize();
    const rand = new RNG(seed >>> 0, 'race/fimbriae');
    for (let i = 0; i < 9; i += 1) {
      const cone = new THREE.Mesh(track(new THREE.ConeGeometry(0.055, 0.55, 6)), mat);
      const spread = 0.55;
      _v2.set(
        dir.x + (rand.nextFloat() - 0.5) * spread,
        dir.y + (rand.nextFloat() - 0.5) * spread,
        dir.z + (rand.nextFloat() - 0.5) * spread
      ).normalize();
      cone.position.copy(mouth).addScaledVector(_v2, 0.3);
      /* cones point +y by default: rotate to the finger direction */
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v2);
      group.add(cone);
    }
  };

  {
    const mirror = CURVE_POINTS.slice(STAGE_START_CP.utj).map(([x, y, z]) => new THREE.Vector3(-x, y, z));
    const mCurve = new THREE.CatmullRomCurve3(mirror, false, 'catmullrom', 0.5);
    const mR = (t) => 0.28 + 0.28 * Math.pow(t, 1.6); // isthmus → ampullary flare
    anatomyGroup.add(new THREE.Mesh(buildVarTube(mCurve, 80, 18, mR), dimShellMat));
    const mMouth = new THREE.Vector3(-6.7, 0.15, 0.15);
    const mOvary = new THREE.Vector3(-OVARY_POS.x, OVARY_POS.y, OVARY_POS.z);
    fimbriae(mMouth, mOvary, anatomyGroup, dimShellMat);
    const ovaryL = new THREE.Mesh(track(new THREE.SphereGeometry(1, 24, 18)), dimShellMat);
    ovaryL.scale.set(0.5, 0.68, 0.45);
    ovaryL.position.copy(mOvary);
    anatomyGroup.add(ovaryL);
  }

  /* race-side fimbriae + ovary */
  const fimbrialMouth = cpVecs[13].clone();
  fimbriae(fimbrialMouth, OVARY_POS, anatomyGroup, shellMat);
  const ovaryR = new THREE.Mesh(track(new THREE.SphereGeometry(1, 24, 18)), shellMat);
  ovaryR.scale.set(0.5, 0.68, 0.45);
  ovaryR.position.copy(OVARY_POS);
  anatomyGroup.add(ovaryR);

  /* Stage boundary rings — instrument marks on the lumen */
  const ringMat = track(new THREE.LineBasicMaterial({
    color: palette.dataDeep, transparent: true, opacity: 0.5,
  }));
  const ringGroup = new THREE.Group();
  for (let i = 0; i < STAGES.length; i += 1) {
    if (!anatomical[i]) continue;
    const pts = [];
    const p = new THREE.Vector3();
    for (let j = 0; j <= 48; j += 1) {
      pts.push(posAt(stageT[i].t0, (j / 48) * Math.PI * 2, 1.06, p).clone());
    }
    ringGroup.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(pts)), ringMat));
  }
  scene.add(ringGroup);

  /* ── labels ─────────────────────────────────────────────────────────── */

  let labelSprites = [];
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);

  function makeLabel(text, sub, color, subColor) {
    const cnv = document.createElement('canvas');
    const g = cnv.getContext('2d');
    const scale = 2;
    g.font = `500 ${13 * scale}px "IBM Plex Mono", monospace`;
    const w = Math.max(g.measureText(text).width, 60) + 16 * scale;
    cnv.width = w;
    cnv.height = 44 * scale;
    g.translate(0, cnv.height);
    g.scale(1, -1);
    g.font = `500 ${13 * scale}px "IBM Plex Mono", monospace`;
    g.fillStyle = color;
    g.textBaseline = 'top';
    g.fillText(text, 8 * scale, 2 * scale);
    if (sub) {
      g.font = `500 ${11 * scale}px "IBM Plex Mono", monospace`;
      g.fillStyle = subColor;
      g.fillText(sub, 8 * scale, 22 * scale);
    }
    const tex = new THREE.CanvasTexture(cnv);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    const worldH = 0.72;
    sprite.scale.set(worldH * (cnv.width / cnv.height), worldH, 1);
    return sprite;
  }

  function buildLabels() {
    for (const s of labelSprites) {
      labelGroup.remove(s);
      s.material.map.dispose();
      s.material.dispose();
    }
    labelSprites = [];
    const p = new THREE.Vector3();
    const add = (sprite, x, y, z) => {
      sprite.position.set(x, y, z);
      labelGroup.add(sprite);
      labelSprites.push(sprite);
    };
    let n = 0;
    for (let i = 0; i < STAGES.length; i += 1) {
      const st = STAGES[i];
      if (!anatomical[i] && st.id !== 'capacitation') continue;
      const mid = anatomical[i] ? (stageT[i].t0 + stageT[i].t1) / 2 : stageT[i].t0;
      const sub = st.lengthMm > 0 ? `${st.lengthMm} mm` : 'state · not a place';
      const sprite = makeLabel(st.name, sub, palette.css.specimen2, palette.css.data);
      posAt(mid, 0, 0, p);
      /* stages left of the tube mouth push left; tube stages push up */
      const side = n % 2 === 0 ? 1 : -1;
      add(sprite, p.x + (p.y < -3 ? -2.4 : side * 0.4), p.y + (p.y < -3 ? 0 : radiusAt(mid) + 1.0), p.z);
      n += 1;
    }
    add(makeLabel('OVARY', 'the egg starts here', palette.css.specimen2, palette.css.data),
      OVARY_POS.x + 0.2, OVARY_POS.y - 1.15, OVARY_POS.z);
    add(makeLabel('FIMBRIAE', 'catch the egg', palette.css.specimen2, palette.css.data),
      fimbrialMouth.x + 1.3, fimbrialMouth.y + 0.15, fimbrialMouth.z);
  }
  buildLabels();

  /* ── THE SWARM — oriented comet swimmers ────────────────────────────── */

  const rng = new RNG(seed >>> 0, 'race/visual');
  const POOL = Math.max(300, Math.min(3200, particleTarget));
  const parts = [];
  for (let i = 0; i < POOL; i += 1) {
    parts.push({
      st: 0,
      s: rng.nextFloat() * 0.6,
      ang: rng.nextFloat() * Math.PI * 2,
      rr: 0.12 + rng.nextFloat() * 0.72,
      ph: rng.nextFloat() * Math.PI * 2,
      vj: 0.5 + rng.nextFloat(),
      alive: true,
    });
  }

  const swarmGeo = track(new THREE.BufferGeometry());
  const swarmPos = new Float32Array(POOL * 3);
  const swarmTan = new Float32Array(POOL * 3);
  const swarmSeed = new Float32Array(POOL);
  for (let i = 0; i < POOL; i += 1) swarmSeed[i] = rng.nextFloat();
  swarmGeo.setAttribute('position', new THREE.BufferAttribute(swarmPos, 3));
  swarmGeo.setAttribute('aTan', new THREE.BufferAttribute(swarmTan, 3));
  swarmGeo.setAttribute('aSeed', new THREE.BufferAttribute(swarmSeed, 1));

  const swarmMat = track(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPal: { value: makeSwarmPal(palette.bio) },
      uSize: { value: 56 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTan;
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying float vSeed;
      varying float vAngle;
      varying float vTw;
      void main() {
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 vt = normalize(normalMatrix * aTan);
        vAngle = atan(vt.y, vt.x);
        vTw = 0.66 + 0.34 * sin(uTime * (1.4 + aSeed * 2.0) + aSeed * 40.0);
        gl_PointSize = uSize * (0.55 + aSeed * 0.9) / max(0.8, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uPal[4];
      varying float vSeed;
      varying float vAngle;
      varying float vTw;
      ${COMET_GLSL}
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float m = comet(d, vAngle, uTime, vSeed, 0.42);
        if (m < 0.01) discard;
        float ch = fract(vSeed * 7.31);
        vec3 col = uPal[0];
        col = mix(col, uPal[1], step(0.22, ch));
        col = mix(col, uPal[2], step(0.45, ch));
        col = mix(col, uPal[3], step(0.62, ch));
        col = mix(col, vec3(0.93, 0.97, 1.0), smoothstep(0.85, 1.0, ch) * 0.55);
        gl_FragColor = vec4(col * (0.85 + vTw * 0.5), m * vTw);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const swarm = new THREE.Points(swarmGeo, swarmMat);
  swarm.frustumCulled = false;
  swarm.renderOrder = 2;
  scene.add(swarm);

  function retarget(stageCounts, full = false) {
    const logs = stageCounts.map((c) => (c > 0 ? Math.log10(1 + c) : 0));
    const sum = logs.reduce((s, x) => s + x, 0);
    if (sum <= 0) { for (const p of parts) p.alive = false; return; }
    const targets = logs.map((l) => Math.round((l / sum) * POOL));
    const have = STAGES.map(() => 0);
    for (const p of parts) if (p.alive) have[p.st] += 1;
    let moves = full ? POOL : Math.ceil(POOL * 0.03);
    for (const p of parts) {
      if (moves <= 0) break;
      const deficit = targets.findIndex((tg, i) => have[i] < tg);
      if (deficit === -1) break;
      if (!p.alive || have[p.st] > targets[p.st]) {
        if (p.alive) have[p.st] -= 1;
        p.st = deficit;
        p.s = deficit === 0 ? 0.2 + rng.nextFloat() * 0.6 : rng.nextFloat() * 0.3;
        p.ang = rng.nextFloat() * Math.PI * 2;
        p.alive = true;
        have[deficit] += 1;
        moves -= 1;
      }
    }
  }

  /* Each stage moves differently — the physics of the place, not one
     generic drift: the vaginal pool churns in place; mucus channels file
     cells forward in near-single-file; the uterus is crossed on
     PERISTALTIC SURGES (a wave sweeps the whole tract and kicks whatever
     it passes); the isthmus is a slow crawl against the countercurrent;
     the ampulla is a wide, erratic search. */
  const FEEL = STAGES.map((st, i) => {
    if (i === STAGE_INDEX.vagina) return { drift: 0.0007, churn: 2.0, surge: 0 };
    if (i === STAGE_INDEX.cervix) return { drift: 0.010, churn: 0.4, surge: 0.6 };
    if (i === STAGE_INDEX.uterus) return { drift: 0.005, churn: 1.1, surge: 1 };
    if (i === STAGE_INDEX.utj) return { drift: 0.012, churn: 0.3, surge: 0 };
    if (i === IST) return { drift: 0.0035, churn: 0.6, surge: 0 };
    if (i === AMP) return { drift: 0.008, churn: 1.7, surge: 0 };
    return { drift: 0.004, churn: 1, surge: 0 };
  });

  function updateSwarm(dt) {
    /* the surge: a wave front sweeping t 0→1, with a beat of rest between */
    const surgeT = (time * 0.09) % 1.3;
    for (let i = 0; i < POOL; i += 1) {
      const p = parts[i];
      if (!p.alive) {
        swarmPos[i * 3 + 1] = -999;
        continue;
      }
      const F = FEEL[p.st] ?? FEEL[0];
      const seed = swarmSeed[i];
      let t;
      if (p.st >= STAGE_INDEX.cumulus) t = OOCYTE_T + (p.s - 0.5) * 0.004;
      else if (p.st === STAGE_INDEX.capacitation) t = tFor(IST, 0.85 + p.s * 0.1);
      else t = tFor(p.st, p.s);
      if (!reducedMotion) {
        p.ph += dt * (2 + p.vj * 2);
        /* heading: smooth rotational wander scaled by the stage's churn */
        p.ang += dt * F.churn * (0.5 * Math.sin(p.ph * 0.6 + seed * 9)
          + 0.25 * Math.sin(time * 0.5 + seed * 31));
        /* radial: mean-revert to a preferred lane, churn pushes off it */
        const prefer = 0.22 + 0.58 * ((seed * 3.7) % 1);
        p.rr += ((prefer - p.rr) * 0.6 + Math.sin(p.ph) * 0.22 * F.churn) * dt;
        p.rr = Math.min(0.92, Math.max(0.06, p.rr));
        /* axial: base drift plus the passing peristaltic wave */
        let v = F.drift * p.vj;
        if (F.surge > 0) {
          const dw = Math.abs(t - surgeT);
          if (dw < 0.05) v *= 1 + F.surge * 7 * (1 - dw / 0.05);
        }
        p.s = Math.min(1, p.s + dt * v);
      }
      posAt(t, p.ang, p.rr, _pp);
      swarmPos[i * 3] = _pp.x;
      swarmPos[i * 3 + 1] = _pp.y;
      swarmPos[i * 3 + 2] = _pp.z;
      tangentAt(t, _v1);
      swarmTan[i * 3] = _v1.x;
      swarmTan[i * 3 + 1] = _v1.y;
      swarmTan[i * 3 + 2] = _v1.z;
    }
    swarmGeo.attributes.position.needsUpdate = true;
    swarmGeo.attributes.aTan.needsUpdate = true;
  }

  /* ── FINALISTS ──────────────────────────────────────────────────────── */

  const FIN_MAX = 260;
  const finGeo = track(new THREE.BufferGeometry());
  const finPos = new Float32Array(FIN_MAX * 3);
  const finTan = new Float32Array(FIN_MAX * 3);
  const finState = new Float32Array(FIN_MAX);
  const finSeed = new Float32Array(FIN_MAX);
  for (let i = 0; i < FIN_MAX; i += 1) finSeed[i] = (i * 0.61803) % 1;
  finGeo.setAttribute('position', new THREE.BufferAttribute(finPos, 3));
  finGeo.setAttribute('aTan', new THREE.BufferAttribute(finTan, 3));
  finGeo.setAttribute('aState', new THREE.BufferAttribute(finState, 1));
  finGeo.setAttribute('aSeed', new THREE.BufferAttribute(finSeed, 1));
  finGeo.setDrawRange(0, 0);

  const finMat = track(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBio: { value: palette.bio.clone() },
      uIdle: { value: palette.specimen2.clone() },
      uEnded: { value: palette.hairline.clone() },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTan;
      attribute float aState;
      attribute float aSeed;
      uniform float uTime;
      varying float vState;
      varying float vAngle;
      varying float vSeed;
      void main() {
        vState = aState;
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 vt = normalize(normalMatrix * aTan);
        vAngle = atan(vt.y, vt.x);
        float pulse = (aState >= 0.5 && aState < 1.5) ? 1.0 + 0.25 * sin(uTime * 6.0 + aSeed * 20.0) : 1.0;
        float base = aState >= 2.5 ? 460.0 : (aState >= 0.5 && aState < 1.5 ? 200.0 : 130.0);
        gl_PointSize = (base * pulse) / max(0.8, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uBio;
      uniform vec3 uIdle;
      uniform vec3 uEnded;
      varying float vState;
      varying float vAngle;
      varying float vSeed;
      ${COMET_GLSL}
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        if (vState >= 2.5) {
          float r = length(d);
          float core = smoothstep(0.2, 0.0, r);
          float halo = smoothstep(0.5, 0.1, r) * (0.5 + 0.3 * sin(uTime * 3.0));
          gl_FragColor = vec4(uBio + vec3(0.4) * core, core + halo * 0.6);
          return;
        }
        float m = comet(d, vAngle, uTime, vSeed, 0.5);
        float halo = (vState >= 0.5 && vState < 1.5)
          ? smoothstep(0.5, 0.15, length(d)) * 0.35 : 0.0;
        if (m + halo < 0.01) discard;
        vec3 col = vState >= 1.5 ? uEnded : (vState >= 0.5 ? uBio : uIdle);
        float alpha = (vState >= 1.5 && vState < 2.5) ? m * 0.3 : m + halo;
        gl_FragColor = vec4(col * (1.0 + halo), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const finPoints = new THREE.Points(finGeo, finMat);
  finPoints.frustumCulled = false;
  finPoints.renderOrder = 3;
  scene.add(finPoints);

  const selSprite = (() => {
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = 96;
    const g = cnv.getContext('2d');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.strokeRect(10, 10, 76, 76);
    const tex = track(new THREE.CanvasTexture(cnv));
    tex.flipY = false;
    const mat = track(new THREE.SpriteMaterial({
      map: tex, color: palette.data, transparent: true, depthTest: false, opacity: 0.9,
    }));
    const s = new THREE.Sprite(mat);
    s.scale.set(0.6, 0.6, 1);
    s.visible = false;
    scene.add(s);
    return s;
  })();

  const finalistWorld = (a, out) => {
    const stIdx = typeof a.stage === 'number' ? a.stage : STAGE_INDEX[a.stage];
    const st = STAGES[stIdx];
    const sF = st.lengthMm > 0 ? a.sMm / st.lengthMm : 0.5;
    const halfUm = st.halfWidthMm * UM_PER_MM;
    const uFrac = Math.max(-1, Math.min(1, (a.uUm ?? 0) / Math.max(1, halfUm)));
    const ang = ((a.id * 2.399963) % (Math.PI * 2)) + uFrac * 0.9;
    return posAt(tFor(stIdx, sF), ang, 0.12 + 0.6 * Math.abs(uFrac), out);
  };
  const finalistT = (a) => {
    const stIdx = typeof a.stage === 'number' ? a.stage : STAGE_INDEX[a.stage];
    const st = STAGES[stIdx];
    return tFor(stIdx, st.lengthMm > 0 ? a.sMm / st.lengthMm : 0.5);
  };

  let selectedId = null;

  function updateFinalists(finalists) {
    const n = Math.min(FIN_MAX, finalists?.length ?? 0);
    selSprite.visible = false;
    for (let i = 0; i < n; i += 1) {
      const a = finalists[i];
      finalistWorld(a, _pp);
      if (a.state === 'fused') _pp.copy(oocyteGroup.position);
      finPos[i * 3] = _pp.x; finPos[i * 3 + 1] = _pp.y; finPos[i * 3 + 2] = _pp.z;
      tangentAt(finalistT(a), _v1);
      finTan[i * 3] = _v1.x; finTan[i * 3 + 1] = _v1.y; finTan[i * 3 + 2] = _v1.z;
      const ended = a.whyEnded != null;
      const armed = a.state === 'capacitated' || a.state === 'hyperactivated' || a.state === 'acrosome-reacted';
      finState[i] = a.state === 'fused' ? 3 : ended ? 2 : armed ? 1 : 0;
      if (a.id === selectedId && !ended) {
        selSprite.position.copy(_pp);
        selSprite.visible = true;
      }
    }
    finGeo.setDrawRange(0, n);
    finGeo.attributes.position.needsUpdate = true;
    finGeo.attributes.aTan.needsUpdate = true;
    finGeo.attributes.aState.needsUpdate = true;
  }

  /* ── THE EGG + THE ZINC SPARK ───────────────────────────────────────── */

  const oocyteGroup = new THREE.Group();
  {
    const zonaGeo = track(new THREE.SphereGeometry(0.5, 48, 32));
    const zonaMat = track(new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: palette.specimen.clone() },
        uBio: { value: palette.bio.clone() },
        uFused: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vN;
        varying vec3 vW;
        ${SNOISE}
        void main() {
          vec3 dir = normalize(position);
          float n = snoise(dir * 3.0 + vec3(0.0, uTime * 0.3, 0.0));
          vec3 pos = position + dir * n * 0.02;
          vN = normalize(normalMatrix * normal);
          vec4 w = modelViewMatrix * vec4(pos, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uBio;
        uniform float uFused;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          vec3 v = normalize(-vW);
          float fr = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
          vec3 rim = mix(uColor, uBio, uFused);
          float breathe = 0.85 + 0.15 * sin(uTime * 1.6);
          gl_FragColor = vec4(rim * fr * (1.2 + uFused), (fr * (0.55 + 0.45 * uFused)) * breathe + 0.05);
        }
      `,
      transparent: true,
      depthWrite: false,
    }));
    oocyteGroup.add(new THREE.Mesh(zonaGeo, zonaMat));
    oocyteGroup.userData.zonaMat = zonaMat;

    const coreMat = track(new THREE.MeshBasicMaterial({
      color: palette.bioDim, transparent: true, opacity: 0.5,
    }));
    oocyteGroup.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.3, 28, 20)), coreMat));
    oocyteGroup.userData.coreMat = coreMat;

    const glowTex = (() => {
      const cnv = document.createElement('canvas');
      cnv.width = cnv.height = 128;
      const g = cnv.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      const t = track(new THREE.CanvasTexture(cnv));
      t.flipY = false;
      return t;
    })();
    const glowMat = track(new THREE.SpriteMaterial({
      map: glowTex, color: palette.bio, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55,
    }));
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(2.6, 2.6, 1);
    oocyteGroup.add(glow);
    oocyteGroup.userData.glowMat = glowMat;

    const cn = 420;
    const cg = track(new THREE.BufferGeometry());
    const cp = new Float32Array(cn * 3);
    const crng = new RNG(seed >>> 0, 'race/cumulus');
    for (let i = 0; i < cn; i += 1) {
      const th = crng.nextFloat() * Math.PI * 2;
      const ph = Math.acos(2 * crng.nextFloat() - 1);
      const rr = 0.62 + Math.pow(crng.nextFloat(), 0.7) * 0.75;
      cp[i * 3] = Math.sin(ph) * Math.cos(th) * rr * 1.25;
      cp[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * rr;
      cp[i * 3 + 2] = Math.cos(ph) * rr;
    }
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    const cm = track(new THREE.PointsMaterial({
      color: palette.bioDim, size: 0.09, transparent: true, opacity: 0.6,
      map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const cloud = new THREE.Points(cg, cm);
    cloud.frustumCulled = false;
    oocyteGroup.add(cloud);
    oocyteGroup.userData.cumulus = cloud;
    oocyteGroup.userData.cumulusMat = cm;

    posAt(OOCYTE_T, 0, 0, _pp);
    oocyteGroup.position.copy(_pp);
    oocyteGroup.visible = false;
    scene.add(oocyteGroup);
  }
  /* The egg is sized FROM the anatomy: the cumulus-oocyte complex rides
     inside the ampulla, gently distending it — not ballooning around it. */
  const EGG_SCALE = radiusAt(OOCYTE_T) * 1.25;
  oocyteGroup.scale.setScalar(EGG_SCALE);
  const OOCYTE_HOME = new THREE.Vector3();
  posAt(OOCYTE_T, 0, 0, OOCYTE_HOME);
  const OVARY_LAUNCH = OVARY_POS.clone().add(new THREE.Vector3(0.1, 0.55, 0.15));
  /* the pickup arc bows outward — the fimbriae reach, the egg falls in */
  const PICKUP_MID = OVARY_LAUNCH.clone().lerp(fimbrialMouth, 0.5)
    .add(new THREE.Vector3(0.45, 0.85, 0.3));

  const sparkMat = track(new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: -1 },
      uBio: { value: palette.bio.clone() },
      uScale: { value: 7.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uScale;
      varying vec2 vUv;
      void main() {
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * uScale;
        vUv = position.xy;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uT;
      uniform vec3 uBio;
      varying vec2 vUv;
      void main() {
        if (uT < 0.0) discard;
        float r = length(vUv);
        float life = clamp(1.0 - uT / 4.5, 0.0, 1.0);
        float flash = exp(-r * 7.0) * exp(-uT * 2.2) * 3.0;
        float w1 = exp(-pow((r - uT * 0.28) * 16.0, 2.0)) * life;
        float w2 = exp(-pow((r - uT * 0.15) * 22.0, 2.0)) * life * 0.7;
        float a = (flash + (w1 + w2) * 0.8) * life;
        if (a < 0.01) discard;
        vec3 col = uBio + vec3(0.5) * flash * 0.4;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }));
  const spark = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), sparkMat);
  spark.renderOrder = 9;
  sparkMat.uniforms.uScale.value = 16.0 * EGG_SCALE;
  spark.position.copy(OOCYTE_HOME);
  scene.add(spark);
  let fusionAtWall = -1;

  /* The egg's own journey: ovary → fimbriae → down the ampulla home.
     Driven by BIOLOGICAL time (ovulationAt → arrivesAt), so it plays at
     whatever speed the user runs the race. */
  function updateEggPosition(snapshot) {
    const o = snapshot?.oocyte;
    if (!o) { oocyteGroup.visible = false; return; }
    const tBio = snapshot.tBio ?? 0;
    if (tBio < o.ovulationAt) { oocyteGroup.visible = false; return; }
    oocyteGroup.visible = true;
    const span = Math.max(1, o.arrivesAt - o.ovulationAt);
    const j = Math.min(1, Math.max(0, (tBio - o.ovulationAt) / span));
    const e = j * j * (3 - 2 * j); // smoothstep
    if (e < 0.4) {
      /* free of the ovary: a bowed arc to the fimbrial mouth, tumbling */
      const u = e / 0.4;
      const iu = 1 - u;
      _pp.set(0, 0, 0)
        .addScaledVector(OVARY_LAUNCH, iu * iu)
        .addScaledVector(PICKUP_MID, 2 * iu * u)
        .addScaledVector(fimbrialMouth, u * u);
      if (!reducedMotion) oocyteGroup.rotation.z = time * 0.6;
    } else if (e < 1) {
      /* swept down the tube by the cilia */
      const tt = 1.0 - ((e - 0.4) / 0.6) * (1.0 - OOCYTE_T);
      posAt(tt, 0, 0, _pp);
      if (!reducedMotion) oocyteGroup.rotation.z = time * 0.25;
    } else {
      /* home at the junction: suspended in fluid, never nailed down —
         a slow bob along the tube and a breath across it */
      _pp.copy(OOCYTE_HOME);
      if (!reducedMotion) {
        tangentAt(OOCYTE_T, _v1);
        _pp.addScaledVector(_v1, Math.sin(time * 0.32) * 0.12);
        _pp.y += Math.sin(time * 0.47 + 1.3) * 0.045;
        oocyteGroup.rotation.z = Math.sin(time * 0.2) * 0.3;
      }
    }
    oocyteGroup.position.copy(_pp);
  }

  /* ── THE DIRECTOR ───────────────────────────────────────────────────── */

  let cameraMode = 'auto';
  let overviewDist = 20;

  const rig = { t: 0.5, ang: 0.9, dist: 20, up: 2, look: 0.05, focusMix: 0, fov: 46 };
  const focusPoint = new THREE.Vector3();
  let shot = reducedMotion ? 'overview' : 'intro';
  let introT = 0;
  let heroId = null;

  function pickHero(finalists) {
    const sel = finalists?.find?.((a) => a.id === selectedId && !a.whyEnded);
    if (sel && (sel.phase !== 'reservoir')) return sel;
    let best = null, bestScore = -1;
    for (const a of finalists ?? []) {
      if (a.whyEnded) continue;
      const score = ({ penetrating: 5, zona: 4, cumulus: 3, search: 2 }[a.phase] ?? 0) * 10 + (a.state === 'hyperactivated' ? 5 : 0);
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best && bestScore >= 20 ? best : null;
  }

  function chooseShot(snapshot, finalists) {
    if (cameraMode === 'overview') return 'overview';
    if (reducedMotion) return 'overview';
    if (shot === 'intro' && introT < 8 && (snapshot?.tBio ?? 0) <= 0) return 'intro';
    if (snapshot?.outcome) return snapshot.outcome.type === 'fertilization' ? 'fusion' : 'nofert';
    if ((snapshot?.totals?.nearOocyte ?? 0) > 0) return 'approach';
    /* the egg's own moment: from ovulation until the fimbriae hand it over */
    const o = snapshot?.oocyte;
    if (o && (snapshot.tBio ?? 0) >= o.ovulationAt && (snapshot.tBio ?? 0) < o.arrivesAt + 600) {
      return 'ovulation';
    }
    const hero = pickHero(finalists);
    if (hero) { heroId = hero.id; return 'hunt'; }
    const transit = (snapshot?.stages?.[1]?.count ?? 0) +
      (snapshot?.stages?.[2]?.count ?? 0) + (snapshot?.stages?.[3]?.count ?? 0);
    if ((snapshot?.totals?.tubal ?? 0) > 0 && transit < 5000) return 'reservoir';
    if ((snapshot?.tBio ?? 0) <= 0) return 'deposition';
    return 'advance';
  }

  function frontT(snapshot) {
    let front = 0;
    const n = Math.min(snapshot?.stages?.length ?? 0, IST + 1);
    for (let i = 0; i < n; i += 1) {
      if (snapshot.stages[i].count > 0) front = i;
    }
    return (stageT[front].t0 + stageT[front].t1) / 2;
  }

  function updateDirector(snapshot, finalists, dt) {
    const next = chooseShot(snapshot, finalists);
    if (next !== shot) shot = next;

    /* Portrait phones: the frame is tall and narrow — every shot pulls back
       and widens a touch so the subject breathes instead of cropping. */
    const portrait = camera.aspect < 0.9;
    const distMul = portrait ? 1.4 : 1;
    const fovAdd = portrait ? 4 : 0;

    let T = { t: 0.45, ang: rig.ang, dist: overviewDist, up: 1.5, look: 0, focusMix: 1, fov: 46, ease: 1.4 };
    posAt(rig.t + 0.02, 0, 0, focusPoint);

    switch (shot) {
      case 'intro': {
        /* the anatomy tour: enter at the fimbriae, fly the whole tract
           down to the start line, inside the lumen */
        introT += dt;
        const k = Math.min(1, introT / 8);
        const e = 1 - Math.pow(1 - k, 3);
        const t = 0.92 - e * 0.89;
        rig.t = t;
        rig.ang += dt * 0.9;
        rig.dist = radiusAt(t) * 0.42;
        rig.up = 0;
        rig.look = -0.045;
        rig.focusMix = 0;
        rig.fov = 58;
        posAt(Math.max(0, t + rig.look), 0, 0, focusPoint);
        applyRigInside();
        return;
      }
      case 'deposition':
        T = { t: 0.045, ang: rig.ang + dt * 0.06, dist: 4.6, up: 0.8, look: 0.03, focusMix: 1, fov: 48, ease: 1.2 };
        posAt(0.05, 0, 0, focusPoint);
        break;
      case 'advance': {
        const ft = frontT(snapshot);
        T = { t: ft - 0.045, ang: rig.ang + dt * 0.05, dist: 6.2, up: 1.4, look: 0.05, focusMix: 0.65, fov: 50, ease: 1.1 };
        posAt(Math.min(1, ft + 0.02), 0, 0, focusPoint);
        break;
      }
      case 'reservoir':
        T = { t: tFor(IST, 0.6), ang: rig.ang + dt * 0.09, dist: 3.8, up: 0.9, look: 0.02, focusMix: 1, fov: 48, ease: 1.0 };
        posAt(tFor(IST, 0.7), 0, 0, focusPoint);
        break;
      case 'ovulation':
        /* watch the egg leave the ovary and the fimbriae take it */
        T = { t: 0.96, ang: rig.ang + dt * 0.12, dist: 2.8, up: 0.35, look: 0, focusMix: 1, fov: 48, ease: 1.6 };
        focusPoint.copy(oocyteGroup.position);
        break;
      case 'hunt': {
        const hero = finalists?.find?.((a) => a.id === heroId && !a.whyEnded) ?? pickHero(finalists);
        if (hero) {
          const ht = finalistT(hero);
          T = { t: ht - 0.03, ang: rig.ang + dt * 0.04, dist: radiusAt(ht) * 2.6, up: 0.5, look: 0.035, focusMix: 1, fov: 54, ease: 2.2 };
          finalistWorld(hero, focusPoint);
        }
        break;
      }
      case 'approach':
        T = { t: OOCYTE_T - 0.02, ang: rig.ang + dt * 0.12, dist: 2.1, up: 0.5, look: 0.02, focusMix: 1, fov: 50, ease: 1.4 };
        focusPoint.copy(oocyteGroup.position);
        break;
      case 'fusion': {
        const since = fusionAtWall >= 0 ? time - fusionAtWall : 10;
        const settled = Math.min(1, since / 5);
        T = {
          t: OOCYTE_T - 0.012, ang: rig.ang + dt * (0.35 - settled * 0.25),
          dist: 1.05 + settled * 0.9, up: 0.28 + settled * 0.3,
          look: 0, focusMix: 1, fov: 50 - settled * 4, ease: 2.0,
        };
        focusPoint.copy(oocyteGroup.position);
        break;
      }
      case 'nofert':
      case 'overview':
      default: {
        /* the whole anatomy, front-on, drifting gently */
        const drift = reducedMotion ? 0 : Math.sin(time * 0.05);
        focusPoint.copy(ANATOMY_CENTER);
        const k0 = reducedMotion ? 1 : Math.min(1, dt * (shot === 'nofert' ? 0.5 : 1.4));
        rig.dist += (overviewDist - rig.dist) * k0;
        rig.fov += (45 - rig.fov) * k0;
        /* full free orbit around the whole anatomy */
        {
          const az = drift * 0.12 + userYaw;
          const el = Math.min(1.1, Math.max(-0.5, 0.08 + userPitch));
          const d = rig.dist / userZoom;
          _pp.set(
            ANATOMY_CENTER.x + Math.sin(az) * Math.cos(el) * d,
            ANATOMY_CENTER.y + Math.sin(el) * d * 0.7 + 1.0,
            ANATOMY_CENTER.z + Math.cos(az) * Math.cos(el) * d
          );
        }
        camera.position.lerp(_pp, k0);
        camera.lookAt(focusPoint);
        if (Math.abs(camera.fov - rig.fov) > 0.05) {
          camera.fov = rig.fov;
          camera.updateProjectionMatrix();
        }
        labelGroup.visible = true;
        ringGroup.visible = true;
        return;
      }
    }

    T.dist *= distMul;
    T.fov += fovAdd;

    const k = reducedMotion ? 1 : Math.min(1, dt * T.ease);
    rig.t += (T.t - rig.t) * k;
    rig.ang += (T.ang - rig.ang) * Math.min(1, dt * 2.5);
    rig.dist += (T.dist - rig.dist) * k;
    rig.up += (T.up - rig.up) * k;
    rig.look += (T.look - rig.look) * k;
    rig.focusMix += (T.focusMix - rig.focusMix) * k;
    rig.fov += (T.fov - rig.fov) * k;
    applyRigOutside();
  }

  function applyRigOutside() {
    const d = Math.max(0.45, rig.dist / userZoom);
    railPos(clampT(rig.t), rig.ang, d, rig.up / userZoom, _pp);
    camera.position.copy(_pp);
    posAt(clampT(rig.t + rig.look), 0, 0, _look);
    _look.lerp(focusPoint, rig.focusMix);
    camera.lookAt(_look);
    syncFov();
    labelGroup.visible = d > 5.5;
    ringGroup.visible = d > 4.5;
  }

  function applyRigInside() {
    posAt(clampT(rig.t), rig.ang, rig.dist / Math.max(0.001, radiusAt(clampT(rig.t))), _pp);
    camera.position.copy(_pp);
    camera.lookAt(focusPoint);
    syncFov();
    labelGroup.visible = false;
    ringGroup.visible = false;
  }

  const clampT = (t) => Math.min(0.995, Math.max(0.002, t));
  function syncFov() {
    if (Math.abs(camera.fov - rig.fov) > 0.05) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
  }

  /* ── public surface ─────────────────────────────────────────────────── */

  return {
    resize(w, h, dpr) {
      W = Math.max(200, w); H = Math.max(140, h);
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      /* the establishing shot must hold the full anatomy: ±7.6 wide, ~10.5 tall */
      const halfTan = Math.tan((45 * Math.PI) / 360);
      overviewDist = Math.min(52, Math.max(
        14,
        8.2 / (halfTan * camera.aspect),  // width constraint
        6.5 / halfTan                     // height constraint
      ));
    },

    refreshPalette() {
      palette = readPalette();
      for (const m of tissueMats) {
        m.uniforms.uRim.value.copy(palette.dataDeep);
        m.uniforms.uBody.value.copy(palette.depth2);
        m.uniforms.uLit.value.copy(palette.data);
        m.uniforms.uFlowC.value.copy(palette.data);
      }
      swarmMat.uniforms.uPal.value = makeSwarmPal(palette.bio);
      finMat.uniforms.uBio.value.copy(palette.bio);
      finMat.uniforms.uIdle.value.copy(palette.specimen2);
      finMat.uniforms.uEnded.value.copy(palette.hairline);
      ringMat.color.copy(palette.dataDeep);
      selSprite.material.color.copy(palette.data);
      nebulaMat.uniforms.uBio.value.copy(palette.bio);
      nebulaMat.uniforms.uData.value.copy(palette.data);
      sparkMat.uniforms.uBio.value.copy(palette.bio);
      oocyteGroup.userData.zonaMat.uniforms.uColor.value.copy(palette.specimen);
      oocyteGroup.userData.zonaMat.uniforms.uBio.value.copy(palette.bio);
      oocyteGroup.userData.coreMat.color.copy(palette.bioDim);
      oocyteGroup.userData.cumulusMat.color.copy(palette.bioDim);
      oocyteGroup.userData.glowMat.color.copy(palette.bio);
      buildLabels();
    },

    setSelected(id) { selectedId = id; },
    setCameraMode(mode) { cameraMode = mode; },

    draw(snapshot, finalists, dtMs = 16) {
      if (disposed) return;
      const dt = Math.min(0.1, dtMs / 1000);
      time += reducedMotion ? 0 : dt;
      userZoom += (userZoomTarget - userZoom) * (reducedMotion ? 1 : Math.min(1, dt * 6));

      retarget(snapshot?.stages?.map((s) => s.count) ?? [], reducedMotion);
      updateSwarm(dt);
      updateEggPosition(snapshot);
      updateFinalists(finalists ?? []);

      const fused = snapshot?.outcome?.type === 'fertilization';
      if (fused && fusionAtWall < 0) fusionAtWall = time;
      sparkMat.uniforms.uT.value = reducedMotion
        ? (fused ? 2.0 : -1)
        : (fusionAtWall >= 0 ? time - fusionAtWall : -1);
      spark.position.copy(oocyteGroup.position);

      if (oocyteGroup.visible) {
        const o = snapshot?.oocyte;
        const zm = oocyteGroup.userData.zonaMat;
        zm.uniforms.uFused.value = fused ? 1 : 0;
        zm.uniforms.uTime.value = time;
        const v = Math.max(0.15, o?.viability ?? 0);
        oocyteGroup.userData.cumulusMat.opacity = 0.25 + 0.4 * v;
        oocyteGroup.userData.glowMat.opacity = 0.3 + 0.4 * v + (fused ? 0.3 : 0);
        if (!reducedMotion) oocyteGroup.userData.cumulus.rotation.y += dt * 0.15;
      }

      for (const m of tissueMats) m.uniforms.uTime.value = time;
      swarmMat.uniforms.uTime.value = time;
      finMat.uniforms.uTime.value = time;
      nebulaMat.uniforms.uTime.value = time;

      updateDirector(snapshot, finalists, dt);
      renderer.render(scene, camera);
    },

    dispose() {
      disposed = true;
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('dblclick', onDblClick);
      for (const s of labelSprites) { s.material.map.dispose(); s.material.dispose(); }
      for (const r of disposables) r.dispose?.();
      renderer.dispose();
    },
  };
}
