import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

/**
 * cellScene — SPECIMEN 001 and the descent, in one scene graph.
 *
 * Framework-free: no React in here. The React wrapper (OrganismCanvas) owns
 * lifecycle, quality decisions and pointer plumbing; this module owns the GL.
 *
 * The one scene serves two jobs:
 *   progress 0        the hero organism — a breathing translucent cell whose
 *                     membrane swells toward the cursor probe
 *   progress 0 → 1    the descent — the camera pushes THROUGH the membrane
 *                     and the interior particle cloud morphs through five
 *                     stages: organism → tissue → cell → protein → code.
 *                     The protein stage is a double helix: the club's logo
 *                     motif, returned as a life-form instead of a background.
 *
 * Colours are read from the CSS custom properties (--bio / --data /
 * --specimen), so the Konami palette mutation reaches the shader. A
 * MutationObserver on <html class> re-reads them on toggle.
 *
 * Contract (consumed by OrganismCanvas and Descent):
 *   createCellScene(canvas, { quality }) → {
 *     setProbe(ndcX, ndcY, strength), setProgress(p),
 *     resize(w, h, dpr), start(), stop(), renderOnce(),
 *     onFps(cb), setQuality('high'|'low'), dispose(),
 *   }
 */

/* ── deterministic PRNG — stage layouts must not shimmer between visits ──── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Gaussian-ish via sum of uniforms — good enough for a nucleus. */
function gauss(rand) {
  return (rand() + rand() + rand()) / 1.5 - 1;
}

/* ── GLSL: 3D simplex noise (Ashima / Stefan Gustavson, public domain) ───── */

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

/* ── membrane shaders ────────────────────────────────────────────────────── */

const MEMBRANE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform vec3  uProbeDir;
  uniform float uProbeStrength;

  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vDisp;

  ${SNOISE}

  float membraneField(vec3 p, float t) {
    float n = snoise(p * 1.7 + vec3(0.0, t * 0.22, 0.0)) * 0.62
            + snoise(p * 4.1 - vec3(t * 0.15, 0.0, t * 0.1)) * 0.24;
    return n;
  }

  void main() {
    vec3 dir = normalize(position);
    float t = uTime;

    float n = membraneField(dir, t);

    /* the probe: the membrane swells toward the microscope tip */
    float facing = clamp(dot(dir, uProbeDir), -1.0, 1.0);
    float ang = acos(facing);
    float bulge = exp(-ang * ang * 9.0) * uProbeStrength * 0.34;

    float disp = uAmp * n + bulge;
    vec3 pos = position + dir * disp;

    /* forward-difference normal from the noise field (probe omitted — its
       lighting error is invisible at these amplitudes and saves 4 taps) */
    float e = 0.08;
    vec3 tang = normalize(cross(dir, abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 bitang = normalize(cross(dir, tang));
    vec3 dirT = normalize(dir + tang * e);
    vec3 dirB = normalize(dir + bitang * e);
    vec3 pT = dirT * (1.15 + uAmp * membraneField(dirT, t));
    vec3 pB = dirB * (1.15 + uAmp * membraneField(dirB, t));
    vec3 pC = dir * (1.15 + uAmp * n);
    vec3 nrm = normalize(cross(pT - pC, pB - pC));
    nrm *= sign(dot(nrm, dir));

    vDisp = n;
    vNormalW = normalize(mat3(modelMatrix) * nrm);
    vPosW = (modelMatrix * vec4(pos, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const MEMBRANE_FRAG = /* glsl */ `
  uniform vec3  uBio;
  uniform vec3  uData;
  uniform float uOpacity;

  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vDisp;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosW);
    vec3 n = normalize(vNormalW);

    float fres = pow(1.0 - abs(dot(viewDir, n)), 2.4);

    /* interior reads computational blue, the living rim reads GFP lime */
    vec3 col = mix(uData * 0.28, uBio, fres);
    col += uBio * smoothstep(0.45, 0.9, vDisp) * 0.12;

    float alpha = (0.16 + fres * 0.62) * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── particle (morph cloud) shaders ──────────────────────────────────────── */

const CLOUD_VERT = /* glsl */ `
  attribute vec3 aPosA;
  attribute vec3 aPosB;
  attribute float aSeed;

  uniform float uTime;
  uniform float uStageMix;
  uniform float uSize;
  uniform float uDrift;
  uniform float uWave;

  varying float vSeed;
  varying float vTwinkle;
  varying float vWave;

  void main() {
    vSeed = aSeed;

    vec3 pos = mix(aPosA, aPosB, uStageMix);

    /* morph energy: turbulence peaks mid-transition, so a stage change
       reads as a burst of activity, not a linear slide between layouts */
    float energy = uStageMix * (1.0 - uStageMix) * 4.0;
    pos.x += sin(uTime * 1.7 + aSeed * 91.0) * 0.11 * energy;
    pos.y += cos(uTime * 1.9 + aSeed * 57.0) * 0.11 * energy;
    pos.z += sin(uTime * 1.5 + aSeed * 23.0) * 0.11 * energy;

    /* small autonomous drift — alive, not frozen */
    pos.x += sin(uTime * 0.6 + aSeed * 43.0) * 0.022 * uDrift;
    pos.y += cos(uTime * 0.5 + aSeed * 91.0) * 0.022 * uDrift;
    pos.z += sin(uTime * 0.7 + aSeed * 17.0) * 0.022 * uDrift;

    /* THE SIGNAL — diagonal brightness waves sweeping the code lattice */
    vWave = uWave * (0.5 + 0.5 * sin(uTime * 2.6 - (pos.x + pos.y * 0.8 + pos.z * 0.6) * 2.4));

    vTwinkle = 0.72 + 0.28 * sin(uTime * (1.2 + aSeed) + aSeed * 6.28);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed * 0.8) * (1.0 + vWave * 0.4) / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform vec3 uBio;
  uniform vec3 uData;
  uniform float uDataMix;
  uniform float uOpacity;

  varying float vSeed;
  varying float vTwinkle;
  varying float vWave;

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float soft = smoothstep(0.25, 0.02, r2);

    /* each particle leans bio or data by seed; the stage pulls the whole
       cloud toward data as we approach CODE */
    float lean = smoothstep(0.35, 0.65, fract(vSeed * 7.13));
    vec3 col = mix(uBio, uData, clamp(lean * 0.5 + uDataMix, 0.0, 1.0));

    /* the wavefront brightens the lattice and flashes LIME at its crest:
       the biological signal running through the code — the thesis, lit */
    col *= 1.0 + vWave * 1.5;
    col = mix(col, uBio, smoothstep(0.72, 0.98, vWave));

    gl_FragColor = vec4(col, soft * vTwinkle * uOpacity * (0.85 + vWave * 0.5));
  }
`;

/* ── organelle shaders (instanced blobs inside the hero cell) ────────────── */

const ORGANELLE_VERT = /* glsl */ `
  uniform float uTime;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec4 world = instanceMatrix * vec4(position, 1.0);

    /* slow orbital sway around the nucleus */
    float a = uTime * 0.14;
    mat3 spin = mat3(
      cos(a), 0.0, sin(a),
      0.0,    1.0, 0.0,
     -sin(a), 0.0, cos(a)
    );
    world.xyz = spin * world.xyz;

    vNormalW = normalize(mat3(modelMatrix) * spin * mat3(instanceMatrix) * normal);
    vPosW = (modelMatrix * world).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * world;
  }
`;

const ORGANELLE_FRAG = /* glsl */ `
  uniform vec3 uBio;
  uniform vec3 uData;
  uniform float uOpacity;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - abs(dot(viewDir, normalize(vNormalW))), 2.0);
    vec3 col = mix(uData * 0.5, uBio * 0.85, fres);
    gl_FragColor = vec4(col, (0.12 + fres * 0.5) * uOpacity);
  }
`;

/* ── stage layouts — five Float32Array position sets, one particle count ─── */

function buildStages(count) {
  const rand = mulberry32(20260810);
  const stages = [];

  /* S0 ORGANISM — the nucleus: a dense gaussian ball inside the membrane */
  {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = gauss(rand) * 0.42;
      a[i * 3 + 1] = gauss(rand) * 0.42;
      a[i * 3 + 2] = gauss(rand) * 0.42;
    }
    stages.push(a);
  }

  /* S1 TISSUE — cells packed side by side: clusters around seeded centres */
  {
    const a = new Float32Array(count * 3);
    const centres = [];
    for (let c = 0; c < 26; c++) {
      centres.push([
        (rand() * 2 - 1) * 2.4,
        (rand() * 2 - 1) * 1.5,
        (rand() * 2 - 1) * 0.9,
      ]);
    }
    for (let i = 0; i < count; i++) {
      const c = centres[(rand() * centres.length) | 0];
      a[i * 3] = c[0] + gauss(rand) * 0.16;
      a[i * 3 + 1] = c[1] + gauss(rand) * 0.16;
      a[i * 3 + 2] = c[2] + gauss(rand) * 0.16;
    }
    stages.push(a);
  }

  /* S2 CELL — one cell alone: a hollow shell plus a tight nucleus */
  {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const inner = rand() < 0.3;
      if (inner) {
        a[i * 3] = gauss(rand) * 0.22;
        a[i * 3 + 1] = gauss(rand) * 0.22;
        a[i * 3 + 2] = gauss(rand) * 0.22;
      } else {
        /* uniform direction via normalized gaussian triple */
        let x = gauss(rand), y = gauss(rand), z = gauss(rand);
        const l = Math.hypot(x, y, z) || 1;
        const r = 1.05 + (rand() - 0.5) * 0.08;
        a[i * 3] = (x / l) * r;
        a[i * 3 + 1] = (y / l) * r;
        a[i * 3 + 2] = (z / l) * r;
      }
    }
    stages.push(a);
  }

  /* S3 PROTEIN — the double helix. The logo motif, alive. */
  {
    const a = new Float32Array(count * 3);
    const turns = 2.6;
    const height = 3.4;
    const R = 0.55;
    for (let i = 0; i < count; i++) {
      const kind = rand();
      const t = rand();
      const y = (t - 0.5) * height;
      const ang = t * turns * Math.PI * 2;
      if (kind < 0.42) {
        a[i * 3] = Math.cos(ang) * R + gauss(rand) * 0.03;
        a[i * 3 + 1] = y;
        a[i * 3 + 2] = Math.sin(ang) * R + gauss(rand) * 0.03;
      } else if (kind < 0.84) {
        a[i * 3] = -Math.cos(ang) * R + gauss(rand) * 0.03;
        a[i * 3 + 1] = y;
        a[i * 3 + 2] = -Math.sin(ang) * R + gauss(rand) * 0.03;
      } else {
        /* rungs — base pairs bridging the strands */
        const s = rand() * 2 - 1;
        const yq = (Math.round(t * 14) / 14 - 0.5) * height;
        const aq = (yq / height + 0.5) * turns * Math.PI * 2;
        a[i * 3] = Math.cos(aq) * R * s;
        a[i * 3 + 1] = yq;
        a[i * 3 + 2] = Math.sin(aq) * R * s;
      }
    }
    stages.push(a);
  }

  /* S4 NEURAL — the brain. AI × Biology ends the descent as a mind made of
     signal: two wrinkled hemispheres split by the longitudinal fissure, a
     finely striated cerebellum at the lower rear, a tapering brainstem.
     Baked into a 3/4 view; the cloud's idle spin slowly rotates it. */
  {
    const a = new Float32Array(count * 3);
    const yaw = 0.55;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    for (let i = 0; i < count; i++) {
      const kind = rand();
      let x, y, z;
      if (kind < 0.82) {
        /* cortex shell with banded gyri wrinkles */
        let dx = gauss(rand), dy = gauss(rand), dz = gauss(rand);
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        const wrinkle =
          1 +
          0.075 * Math.sin(6.0 * dy + 4.0 * dx) * Math.cos(5.0 * dz + 2.0 * dy) +
          0.05 * Math.sin(11.0 * dx + 7.0 * dz);
        const shell = 0.93 + rand() * 0.09;
        x = dx * 0.95 * wrinkle * shell;
        y = dy * 0.60 * wrinkle * shell;
        z = dz * 0.80 * wrinkle * shell;
        /* flatter underside */
        if (y < -0.32) y = -0.32 - (Math.abs(y) - 0.32) * 0.35;
        /* the fissure: clear the median plane along the crown */
        if (y > 0.05 && Math.abs(x) < 0.1) {
          x += (x >= 0 ? 1 : -1) * 0.09;
        }
        x += (x >= 0 ? 1 : -1) * 0.03;
      } else if (kind < 0.95) {
        /* cerebellum — tight horizontal folds */
        let dx = gauss(rand), dy = gauss(rand), dz = gauss(rand);
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        const folds = 1 + 0.05 * Math.sin(26.0 * dy);
        const shell = 0.9 + rand() * 0.12;
        x = dx * 0.42 * folds * shell;
        y = -0.48 + dy * 0.24 * folds * shell;
        z = -0.5 + dz * 0.34 * folds * shell;
      } else {
        /* brainstem — tapered column angling down and forward */
        const t = rand();
        const rr = (1 - t * 0.55) * 0.11;
        const ang = rand() * Math.PI * 2;
        x = Math.cos(ang) * rr;
        y = -0.4 - t * 0.45;
        z = -0.16 + t * 0.26 + Math.sin(ang) * rr;
      }
      a[i * 3] = x * cy + z * sy;
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = -x * sy + z * cy;
    }
    stages.push(a);
  }

  return stages;
}

/* ── palette from CSS — the Konami mutation reaches the GL through here ──── */

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const parse = (name, fallback) => {
    const v = cs.getPropertyValue(name).trim();
    return new THREE.Color(v || fallback);
  };
  return {
    bio: parse("--bio", "#B6FF2E"),
    data: parse("--data", "#4FA8FF"),
  };
}

/* ── the scene ───────────────────────────────────────────────────────────── */

const COUNTS = { high: 2600, low: 1300 };

export function createCellScene(canvas, { quality = "high" } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: quality === "high",
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  /* ACES for the HDR sky only — custom ShaderMaterials bypass tone mapping,
     so the organism's colours are untouched. */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 0, 4.4);

  /* THE SKY — a real place instead of flat void: the Milky Way over Satara
     (Poly Haven, CC0), self-hosted per the no-CDN rule. Loads async and
     fades in; a failed fetch just leaves the void — never an error.
     Heavy blur melts the ground lights into bokeh pools — atmosphere, not
     photography; the tilt drops the bright horizon band below the stage
     text line and lifts the Milky Way into frame. */
  let envTexture = null;
  let envFade = 0; // eased toward envTarget each frame
  let envTarget = 0;
  let envLoaded = false;
  new RGBELoader().load(
    "/env/night.hdr",
    (tex) => {
      if (disposed) {
        tex.dispose();
        return;
      }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      envTexture = tex;
      scene.background = tex;
      scene.backgroundIntensity = 0;
      scene.backgroundBlurriness = 0.12;
      scene.backgroundRotation.x = -0.3;
      envLoaded = true;
      if (!running) {
        /* static build (reduced motion): paint the sky into the held frame */
        envFade = 1;
        render();
      }
    },
    undefined,
    () => {}
  );

  const palette = readPalette();

  /* membrane */
  const membraneGeo = new THREE.SphereGeometry(
    1.15,
    quality === "high" ? 152 : 88,
    quality === "high" ? 104 : 60
  );
  const membraneMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: 0.1 },
      uProbeDir: { value: new THREE.Vector3(0, 0, 1) },
      uProbeStrength: { value: 0 },
      uBio: { value: palette.bio.clone() },
      uData: { value: palette.data.clone() },
      uOpacity: { value: 1 },
    },
    vertexShader: MEMBRANE_VERT,
    fragmentShader: MEMBRANE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const membrane = new THREE.Mesh(membraneGeo, membraneMat);
  membrane.renderOrder = 3;
  scene.add(membrane);

  /* morph cloud */
  const count = COUNTS[quality] || COUNTS.high;
  const stages = buildStages(count);
  const cloudGeo = new THREE.BufferGeometry();
  const posA = new Float32Array(stages[0]);
  const posB = new Float32Array(stages[1]);
  const seeds = new Float32Array(count);
  {
    const rand = mulberry32(11);
    for (let i = 0; i < count; i++) seeds[i] = rand();
  }
  /* .position exists only to give three a draw count + bounding sphere */
  cloudGeo.setAttribute("position", new THREE.BufferAttribute(stages[0].slice(), 3));
  cloudGeo.setAttribute("aPosA", new THREE.BufferAttribute(posA, 3));
  cloudGeo.setAttribute("aPosB", new THREE.BufferAttribute(posB, 3));
  cloudGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  cloudGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 6);

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStageMix: { value: 0 },
      uSize: { value: quality === "high" ? 11 : 9 },
      uDrift: { value: 1 },
      uBio: { value: palette.bio.clone() },
      uData: { value: palette.data.clone() },
      uDataMix: { value: 0 },
      uWave: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  cloud.renderOrder = 2;
  scene.add(cloud);

  /* organelles — hero only; they dissolve as the camera dives */
  const organelleGeo = new THREE.SphereGeometry(1, 10, 8);
  const organelleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBio: { value: palette.bio.clone() },
      uData: { value: palette.data.clone() },
      uOpacity: { value: 1 },
    },
    vertexShader: ORGANELLE_VERT,
    fragmentShader: ORGANELLE_FRAG,
    transparent: true,
    depthWrite: false,
  });
  /* Low quality (coarse pointers, demoted GPUs): the nucleus cloud carries
     the interior alone — organelles are a desktop garnish, not structure. */
  const ORGANELLES = quality === "high" ? 18 : 0;
  const organelles = new THREE.InstancedMesh(organelleGeo, organelleMat, Math.max(1, ORGANELLES));
  organelles.count = ORGANELLES;
  {
    const rand = mulberry32(7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < ORGANELLES; i++) {
      let x = gauss(rand), y = gauss(rand), z = gauss(rand);
      const l = Math.hypot(x, y, z) || 1;
      const r = 0.55 + rand() * 0.38;
      p.set((x / l) * r, (y / l) * r, (z / l) * r);
      const sc = 0.05 + rand() * 0.09;
      s.set(sc, sc * (0.7 + rand() * 0.6), sc);
      m.compose(p, q, s);
      organelles.setMatrixAt(i, m);
    }
  }
  organelles.renderOrder = 1;
  scene.add(organelles);

  /* ── THE NEBULA — the living atmosphere of the deep stages ─────────────── */

  const NEBULA_FRAG = /* glsl */ `
    uniform float uTime;
    uniform float uProg;
    uniform float uOpacity;
    uniform vec3 uBio;
    uniform vec3 uData;
    varying vec3 vDir;

    ${SNOISE}

    void main() {
      float n = snoise(vDir * 2.3 + vec3(0.0, uTime * 0.015, uTime * 0.01)) * 0.6
              + snoise(vDir * 5.1 - vec3(uTime * 0.008, 0.0, 0.0)) * 0.4;
      n = n * 0.5 + 0.5;

      /* tissue-green atmosphere early; deep neural blue by the finale */
      vec3 tint = mix(mix(uBio, uData, 0.4), uData, smoothstep(0.55, 0.95, uProg));
      float glow = smoothstep(0.42, 0.95, n);
      vec3 col = tint * glow * 0.17 * (0.7 + 0.3 * vDir.y);
      gl_FragColor = vec4(col, uOpacity * glow * 0.5);
    }
  `;

  const nebulaGeo = new THREE.SphereGeometry(30, 32, 24);
  const nebulaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProg: { value: 0 },
      uOpacity: { value: 0.5 },
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
    fragmentShader: NEBULA_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);
  nebula.renderOrder = -2;
  scene.add(nebula);

  /* ── palette mutation (Konami) ─────────────────────────────────────────── */

  const applyPalette = () => {
    const p = readPalette();
    for (const mat of [membraneMat, cloudMat, organelleMat, nebulaMat]) {
      mat.uniforms.uBio.value.copy(p.bio);
      mat.uniforms.uData.value.copy(p.data);
    }
  };
  const mutationObserver = new MutationObserver(applyPalette);
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  /* ── state ─────────────────────────────────────────────────────────────── */

  let progress = 0;
  let baseSize = quality === "high" ? 11 : 9;
  let cloudSpin = 0.03; // rad/s — applyProgress raises it for the helix showcase
  let stagePair = [0, 1]; // which stage arrays live in aPosA / aPosB
  const probeTarget = { x: 0, y: 0, strength: 0 };
  const probeState = { x: 0, y: 0, strength: 0 };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const probeDir = new THREE.Vector3(0, 0, 1);

  let raf = 0;
  let running = false;
  let disposed = false;
  let lastT = 0; // manual delta — THREE.Clock is deprecated in r185
  let elapsed = 0;

  let fpsCb = null;
  let frames = 0;
  let windowStart = 0;

  const uploadStagePair = (a, b) => {
    if (stagePair[0] === a && stagePair[1] === b) return;
    stagePair = [a, b];
    cloudGeo.getAttribute("aPosA").array.set(stages[a]);
    cloudGeo.getAttribute("aPosB").array.set(stages[b]);
    cloudGeo.getAttribute("aPosA").needsUpdate = true;
    cloudGeo.getAttribute("aPosB").needsUpdate = true;
  };

  /* everything progress-driven lives here so a static render is one call */
  const applyProgress = () => {
    const p = progress;

    /* four transitions across five stages */
    const f = Math.min(3.999, p * 4);
    const seg = Math.min(3, Math.floor(f));
    uploadStagePair(seg, seg + 1);
    const local = f - seg;
    cloudMat.uniforms.uStageMix.value = THREE.MathUtils.smoothstep(local, 0.12, 0.88);

    /* the dive: through the membrane by p≈0.22, then drift among the stages.
       The lateral arc gives every stage its own viewing angle; the finale
       sits closer so the lattice fills the frame instead of thinning out. */
    const dive = THREE.MathUtils.smoothstep(p, 0.02, 0.24);
    camera.position.z = 4.4 - 3.1 * dive + 1.2 * THREE.MathUtils.smoothstep(p, 0.3, 1.0);
    /* finale pan: camera and look-target shift together, so the brain sits
       right-of-centre (clear of the stage text) while spinning in place */
    const pan = -0.52 * THREE.MathUtils.smoothstep(p, 0.84, 0.96);
    camera.position.x = 0.32 * Math.sin(p * Math.PI * 2.0) + pan;
    camera.position.y = -0.15 * Math.sin(p * Math.PI);
    camera.lookAt(pan, 0, 0);

    /* membrane: opaque cell wall in the hero, gone once we are inside */
    membraneMat.uniforms.uOpacity.value = 1 - THREE.MathUtils.smoothstep(p, 0.08, 0.26);
    membrane.visible = membraneMat.uniforms.uOpacity.value > 0.01;
    const grow = 1 + dive * 2.2;
    membrane.scale.setScalar(grow);

    /* organelles ride the membrane out */
    organelleMat.uniforms.uOpacity.value = membraneMat.uniforms.uOpacity.value;
    organelles.visible = membrane.visible;

    /* cloud: nucleus in the hero; the subject afterwards. Drift never dies
       fully (a frozen finale reads as a bug) and the points GROW into the
       ending instead of thinning out of it. */
    cloudMat.uniforms.uDataMix.value = THREE.MathUtils.smoothstep(p, 0.72, 0.95);
    cloudMat.uniforms.uDrift.value =
      1 - 0.6 * THREE.MathUtils.smoothstep(p, 0.78, 0.96);
    cloudMat.uniforms.uWave.value = THREE.MathUtils.smoothstep(p, 0.84, 0.96);
    cloudMat.uniforms.uSize.value =
      baseSize *
      (1 +
        0.6 * THREE.MathUtils.smoothstep(p, 0.1, 0.5) +
        0.45 * THREE.MathUtils.smoothstep(p, 0.82, 1.0));

    /* the helix stage gets a showcase spin — the logo motif deserves it */
    const helix =
      THREE.MathUtils.smoothstep(p, 0.55, 0.7) *
      (1 - THREE.MathUtils.smoothstep(p, 0.82, 0.92));
    cloudSpin = 0.03 + 0.09 * helix;

    /* probe only means something while the membrane exists */
    const probeScale = 1 - THREE.MathUtils.smoothstep(p, 0.05, 0.2);
    membraneMat.uniforms.uProbeStrength.value = probeState.strength * probeScale;

    nebulaMat.uniforms.uProg.value = p;
    nebulaMat.uniforms.uOpacity.value =
      0.5 + 0.5 * THREE.MathUtils.smoothstep(p, 0.15, 0.4);

    /* the sky breathes with the journey: fullest in the hero, receding once
       we are inside the cell (text needs the dark), returning for the brain */
    envTarget =
      0.34 -
      0.24 * THREE.MathUtils.smoothstep(p, 0.1, 0.3) +
      0.1 * THREE.MathUtils.smoothstep(p, 0.82, 0.96);
  };

  const applyProbe = () => {
    ndc.set(probeTarget.x, probeTarget.y);
    raycaster.setFromCamera(ndc, camera);
    /* closest point on the probe ray to the cell centre → direction on the
       membrane. Smooth everywhere, defined even when the ray misses. */
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    const t = Math.max(0, -o.dot(d));
    probeDir.copy(o).addScaledVector(d, t);
    if (probeDir.lengthSq() < 1e-6) probeDir.set(0, 0, 1);
    probeDir.normalize();
    membraneMat.uniforms.uProbeDir.value.copy(probeDir);
  };

  const render = () => {
    const now = performance.now() / 1000;
    const dt = Math.min(lastT ? now - lastT : 0, 0.1);
    lastT = now;
    elapsed += dt;

    /* ease the probe toward its target — the membrane answers with a lag */
    probeState.x += (probeTarget.x - probeState.x) * 0.12;
    probeState.y += (probeTarget.y - probeState.y) * 0.12;
    probeState.strength += (probeTarget.strength - probeState.strength) * 0.08;

    /* breathing: slow, ~0.1 Hz, deeper when idle */
    membraneMat.uniforms.uAmp.value = 0.085 + 0.028 * Math.sin(elapsed * 0.62);
    membraneMat.uniforms.uTime.value = elapsed;
    cloudMat.uniforms.uTime.value = elapsed;
    organelleMat.uniforms.uTime.value = elapsed;

    membrane.rotation.y = elapsed * 0.05;
    cloud.rotation.y += dt * cloudSpin;

    nebulaMat.uniforms.uTime.value = elapsed;

    if (envLoaded) {
      envFade += (1 - envFade) * Math.min(1, dt * 0.8); // ~2s fade-in
      scene.backgroundIntensity = envTarget * envFade;
      scene.backgroundRotation.y = elapsed * 0.004; // the sky drifts, barely
    }

    applyProbe();
    applyProgress();
    renderer.render(scene, camera);
  };

  const loop = () => {
    if (!running || disposed) return;
    raf = requestAnimationFrame(loop);
    render();

    if (fpsCb) {
      frames++;
      const now = performance.now();
      if (!windowStart) windowStart = now;
      const winElapsed = now - windowStart;
      if (winElapsed >= 2000) {
        fpsCb((frames * 1000) / winElapsed);
        frames = 0;
        windowStart = now;
      }
    }
  };

  return {
    setProbe(x, y, strength) {
      probeTarget.x = x;
      probeTarget.y = y;
      probeTarget.strength = strength;
    },

    setProgress(p) {
      progress = THREE.MathUtils.clamp(p, 0, 1);
    },

    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    start() {
      if (running || disposed) return;
      running = true;
      lastT = 0; // first frame after a pause carries no phantom delta
      frames = 0;
      windowStart = 0;
      raf = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },

    renderOnce() {
      if (disposed) return;
      render();
    },

    onFps(cb) {
      fpsCb = cb;
    },

    setQuality(q) {
      /* Strike-one shedding targets the two dominant per-frame costs:
         half the particles, and a membrane rebuilt at half the segments
         (the 152×104 sphere runs ~6 snoise calls per vertex per frame). */
      if (q === "low") {
        baseSize = 9;
        cloudGeo.setDrawRange(0, Math.floor(count / 2));
        if (membrane.geometry === membraneGeo) {
          const coarseGeo = new THREE.SphereGeometry(1.15, 88, 60);
          membrane.geometry = coarseGeo;
          membraneGeo.dispose();
        }
      } else {
        baseSize = quality === "high" ? 11 : 9;
        cloudGeo.setDrawRange(0, count);
      }
    },

    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      mutationObserver.disconnect();
      nebulaGeo.dispose();
      nebulaMat.dispose();
      if (envTexture) envTexture.dispose();
      membrane.geometry.dispose(); // may be the coarse swap, not membraneGeo
      membraneMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      organelleGeo.dispose();
      organelleMat.dispose();
      organelles.dispose();
      renderer.dispose();
      const gl = renderer.getContext();
      const ext = gl && gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
}
