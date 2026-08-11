import * as THREE from "three";

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
 *                     stages: organism → tissue → cell → gamete →
 *                     mitochondrion → protein → code.
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

/* ── THE FLUOROPHORE PANEL — nine real emission colours ─────────────────────
   The particles are stained like an actual multi-channel confocal image:
   each maps to a fluorophore biologists genuinely image with, ordered by
   emission wavelength. Cool channels (DAPI→GFP) dominate, warm reporters
   (mOrange→mCherry) appear sparsely — the balance of real micrographs.
     DAPI 461nm · CFP 476nm · AmCyan 490nm · EGFP 507nm · YFP 527nm ·
     mVenus 528nm · mOrange 562nm · tdTomato 581nm · mCherry 610nm */
const FLUOROPHORES = [
  0x4e5fff, // DAPI — nuclear blue
  0x38c8ff, // CFP — cyan
  0x2ee8d8, // AmCyan — teal
  0x3cff6e, // EGFP — the green
  0xa8ff2e, // YFP — yellow-green (the site's own lime)
  0xd6ff2e, // mVenus — bright chartreuse
  0xffc12e, // mOrange — amber
  0xff7a3c, // tdTomato — orange
  0xff4557, // mCherry — red
];

/* Chained per-particle channel pick, weighted cool-heavy. */
const PAL_PICK_GLSL = /* glsl */ `
  vec3 palPick(float seed) {
    float t = fract(seed * 9.73);
    vec3 c = uPal[0];
    c = mix(c, uPal[1], step(0.16, t));
    c = mix(c, uPal[2], step(0.30, t));
    c = mix(c, uPal[3], step(0.44, t));
    c = mix(c, uPal[4], step(0.62, t));
    c = mix(c, uPal[5], step(0.78, t));
    c = mix(c, uPal[6], step(0.87, t));
    c = mix(c, uPal[7], step(0.93, t));
    c = mix(c, uPal[8], step(0.975, t));
    return c;
  }
`;

const makePalUniform = () => ({
  value: FLUOROPHORES.map((h) => new THREE.Color(h)),
});

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
  uniform float uSwim;

  varying float vSeed;
  varying float vTwinkle;
  varying float vWave;

  void main() {
    vSeed = aSeed;

    vec3 pos = mix(aPosA, aPosB, uStageMix);

    /* THE SWIM — during the gamete band a travelling wave runs down the
       flagellum (amplitude grows tailward from the neck at x = -0.55),
       and the head recoils slightly in counterphase: real flagellar
       propulsion, not a wiggle. */
    float tailness = smoothstep(-0.7, 2.4, pos.x);
    pos.y += uSwim * sin(pos.x * 3.1 - uTime * 5.5) * tailness * 0.16;
    pos.z += uSwim * sin(pos.x * 2.3 - uTime * 5.5 + 1.3) * tailness * 0.05;
    pos.y -= uSwim * (1.0 - tailness) * sin(uTime * 5.5) * 0.02;

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
  uniform vec3 uPal[9];
  uniform float uDataMix;
  uniform float uOpacity;

  varying float vSeed;
  varying float vTwinkle;
  varying float vWave;

  ${PAL_PICK_GLSL}

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float soft = smoothstep(0.25, 0.02, r2);

    /* each particle carries its own fluorophore channel; the finale still
       pulls the whole culture toward computational blue */
    vec3 col = palPick(vSeed);
    col = mix(col, uData, uDataMix * 0.7);

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

  /* S3 GAMETE — the spermatozoon, anatomically proportioned: flattened
     ellipsoid head, mitochondria-packed midpiece, and a long tapering
     flagellum baked with a gentle S-curve (the swim wave itself is added
     in the vertex shader during the gamete band, so the cell SWIMS). */
  {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const kind = rand();
      let x, y, z;
      if (kind < 0.2) {
        /* head — flattened oval */
        x = -1.5 + gauss(rand) * 0.3;
        y = gauss(rand) * 0.22;
        z = gauss(rand) * 0.13;
      } else if (kind < 0.34) {
        /* midpiece — the mitochondrial sheath, denser ring packing */
        const t = rand();
        const ang = rand() * Math.PI * 2;
        const r = 0.085 + (rand() - 0.5) * 0.02;
        x = -1.16 + t * 0.61;
        y = Math.cos(ang) * r;
        z = Math.sin(ang) * r;
      } else if (kind < 0.92) {
        /* flagellum — tapering, with a frozen S-wave the shader animates */
        const t = rand();
        x = -0.55 + t * 3.15;
        const taper = 0.05 * (1 - t) + 0.008;
        y = 0.18 * Math.sin((x + 0.55) * 2.2) + gauss(rand) * taper;
        z = gauss(rand) * taper;
      } else {
        /* seminal plasma scatter */
        x = (rand() - 0.5) * 4.5;
        y = gauss(rand) * 0.8;
        z = gauss(rand) * 0.8;
      }
      a[i * 3] = x - 0.4; /* recenter: head/tail mass balances the frame */
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = z;
    }
    stages.push(a);
  }

  /* S4 ORGANELLE — the mitochondrion: bent outer membrane (the bean),
     inner membrane, and ~9 wavy cristae shelves packed across the matrix —
     the fold pattern every textbook section shows. */
  {
    const a = new Float32Array(count * 3);
    const bend = (x) => 0.16 * Math.sin(x * 1.1);
    for (let i = 0; i < count; i++) {
      const kind = rand();
      let x, y, z;
      if (kind < 0.3) {
        /* outer membrane shell */
        let dx = gauss(rand), dy = gauss(rand), dz = gauss(rand);
        const l = Math.hypot(dx, dy, dz) || 1;
        const shell = 0.96 + rand() * 0.07;
        x = (dx / l) * 1.42 * shell;
        y = (dy / l) * 0.6 * shell + bend(x);
        z = (dz / l) * 0.6 * shell;
      } else if (kind < 0.45) {
        /* inner membrane, just beneath */
        let dx = gauss(rand), dy = gauss(rand), dz = gauss(rand);
        const l = Math.hypot(dx, dy, dz) || 1;
        x = (dx / l) * 1.22;
        y = (dy / l) * 0.5 + bend(x);
        z = (dz / l) * 0.5;
      } else if (kind < 0.9) {
        /* cristae — nine folded shelves across the long axis */
        const shelf = (rand() * 9) | 0;
        const sx = -1.12 + shelf * 0.28;
        const ang = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand());
        const ry = Math.cos(ang) * rr * 0.42;
        const rz = Math.sin(ang) * rr * 0.42;
        x = sx + 0.09 * Math.sin(ry * 9.0) + gauss(rand) * 0.015;
        y = ry + bend(sx);
        z = rz;
      } else {
        /* matrix scatter */
        x = (rand() - 0.5) * 2.4;
        y = gauss(rand) * 0.4 + bend(x);
        z = gauss(rand) * 0.4;
      }
      /* bake with the long axis on Z: the camera's plateau azimuth looks
         mostly down +X, so the bean presents its profile */
      a[i * 3] = z;
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = x;
    }
    stages.push(a);
  }

  /* S5 PROTEIN — the double helix, built like actual B-DNA:
       · the two backbones sit ~120° apart (GROOVE), which is what carves
         the real molecule's MAJOR and MINOR grooves — not the cartoon 180°
       · ~10 base pairs per turn (30 rungs over 3 turns), the true B-form rise
       · each rung is a DENSE straight bar: particles quantized evenly along
         the strand-to-strand chord with near-zero jitter, so every base
         pair reads as a solid line, not a scatter of dots */
  {
    const a = new Float32Array(count * 3);
    const turns = 3.0;
    const height = 3.9;
    const R = 0.62;
    const RUNGS = 30;
    const GROOVE = 2.1; /* rad ≈ 120° between backbones */
    for (let i = 0; i < count; i++) {
      const kind = rand();
      const t = rand();
      const y = (t - 0.5) * height;
      const ang = t * turns * Math.PI * 2;
      if (kind < 0.33) {
        a[i * 3] = Math.cos(ang) * R + gauss(rand) * 0.016;
        a[i * 3 + 1] = y;
        a[i * 3 + 2] = Math.sin(ang) * R + gauss(rand) * 0.016;
      } else if (kind < 0.66) {
        a[i * 3] = Math.cos(ang + GROOVE) * R + gauss(rand) * 0.016;
        a[i * 3 + 1] = y;
        a[i * 3 + 2] = Math.sin(ang + GROOVE) * R + gauss(rand) * 0.016;
      } else {
        /* base pairs: straight chords bridging the two backbones */
        const yq = ((rand() * RUNGS | 0) / (RUNGS - 1) - 0.5) * height;
        const aq = (yq / height + 0.5) * turns * Math.PI * 2;
        const s = Math.floor(rand() * 44) / 43; /* 44 even slots per rung */
        const ax = Math.cos(aq) * R, az = Math.sin(aq) * R;
        const bx = Math.cos(aq + GROOVE) * R, bz = Math.sin(aq + GROOVE) * R;
        a[i * 3] = ax + (bx - ax) * s + gauss(rand) * 0.006;
        a[i * 3 + 1] = yq + gauss(rand) * 0.006;
        a[i * 3 + 2] = az + (bz - az) * s + gauss(rand) * 0.006;
      }
    }
    stages.push(a);
  }

  /* S6 NEURAL — the brain. AI × Biology ends the descent as a mind made of
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

const COUNTS = { high: 4200, low: 2000 };

export function createCellScene(canvas, { quality = "high" } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: quality === "high",
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 0, 4.4);


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
      uPal: makePalUniform(),
      uDataMix: { value: 0 },
      uWave: { value: 0 },
      uSwim: { value: 0 },
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
      vec3 tint = mix(mix(uBio, uData, 0.4), uData, smoothstep(0.75, 0.97, uProg));
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

  /* ── THE FIELD — the deep-space particle sea, morphing with the journey ────
     Thousands of ambient motes surrounding the whole descent. All motion is
     computed in the vertex shader from a static shell — zero CPU per frame.
     Three formations, blended by scroll progress:
       hero      a galactic swirl, faster near the core (differential rotation)
       mid       flowing horizontal currents — the interior sea of the body
       finale    a spinning vortex storm around the mind
  */

  const FIELD_VERT = /* glsl */ `
    attribute float aSeed;
    uniform float uTime;
    uniform float uProg;
    uniform float uSize;
    varying float vSeed;
    varying float vGlow;

    void main() {
      vSeed = aSeed;
      vec3 p = position;

      /* F0 — plankton rise: layered motes drifting slowly upward, wrapping */
      vec3 f0 = p;
      f0.y = mod(p.y + uTime * 0.45 + aSeed * 20.0, 20.0) - 10.0;
      f0.x += sin(uTime * 0.2 + p.y * 0.3 + aSeed * 6.28) * 0.8;
      f0.z += cos(uTime * 0.18 + p.x * 0.2) * 0.8;

      /* F1 — the current: motes stream sideways in layered ribbons */
      float flow = uTime * 0.6;
      vec3 f1 = vec3(
        mod(p.x + flow * 2.4 + aSeed * 48.0, 48.0) - 24.0,
        p.y * 0.3 + sin(p.z * 0.5 + flow + aSeed * 6.28) * 1.6,
        p.z * 0.85
      );

      /* F2 — orbitals: four tilted electron shells around the cell */
      float shell = floor(fract(aSeed * 7.31) * 4.0);
      float orad = 4.2 + shell * 2.6 + (fract(aSeed * 91.7) - 0.5) * 1.4;
      float oang = uTime * (0.5 - shell * 0.09) + aSeed * 6.28318;
      float tilt = shell * 0.55 - 0.8;
      vec3 f2 = vec3(
        cos(oang) * orad,
        sin(oang) * orad * sin(tilt),
        sin(oang) * orad * cos(tilt) * 0.5
      );

      /* F3 — the macro helix: the whole sky becomes the club's logo motif,
         a giant double helix wrapping the small one — with base-pair rungs */
      float side = step(0.5, fract(aSeed * 3.77));
      float hy = (fract(aSeed * 17.9) - 0.5) * 24.0;
      /* 2.1 rad backbone offset — the same B-DNA grooves as the small helix */
      float hang = hy * 0.5 + uTime * 0.3 + side * 2.1;
      float hr = 6.5 + (fract(aSeed * 29.3) - 0.5) * 1.2;
      vec3 f3 = vec3(cos(hang) * hr, hy, sin(hang) * hr);
      /* one mote in four becomes rung material: dense straight chords at
         quantized heights, so the macro ladder reads from any angle */
      float isRung = step(0.75, fract(aSeed * 53.1));
      float hyq = (floor(fract(aSeed * 17.9) * 18.0) / 17.0 - 0.5) * 24.0;
      float hangq = hyq * 0.5 + uTime * 0.3;
      float lerpT = floor(fract(aSeed * 7.7) * 30.0) / 29.0;
      vec3 rungP = vec3(
        mix(cos(hangq), cos(hangq + 2.1), lerpT) * hr,
        hyq,
        mix(sin(hangq), sin(hangq + 2.1), lerpT) * hr
      );
      f3 = mix(f3, rungP, isRung);

      /* F4 — the storm: a breathing vortex around the mind */
      float ang = uTime * 0.45 + aSeed * 6.28318 + length(p) * 0.3;
      float rr = 5.0 + fract(aSeed * 13.7 + uTime * 0.05) * 15.0;
      vec3 f4 = vec3(
        cos(ang) * rr,
        (aSeed - 0.5) * 12.0 + sin(uTime * 0.7 + aSeed * 9.0),
        sin(ang) * rr
      );

      /* five formations, four scroll-driven morphs */
      float w1 = smoothstep(0.12, 0.26, uProg);
      float w2 = smoothstep(0.34, 0.48, uProg);
      float w3 = smoothstep(0.68, 0.8, uProg);
      float w4 = smoothstep(0.86, 0.94, uProg);
      vec3 pos = mix(f0, f1, w1);
      pos = mix(pos, f2, w2);
      pos = mix(pos, f3, w3);
      pos = mix(pos, f4, w4);

      /* morph energy: every transition detonates a turbulence burst */
      float energy = w1 * (1.0 - w1) + w2 * (1.0 - w2) + w3 * (1.0 - w3) + w4 * (1.0 - w4);
      pos += vec3(
        sin(uTime * 2.1 + aSeed * 91.0),
        cos(uTime * 2.3 + aSeed * 57.0),
        sin(uTime * 1.9 + aSeed * 23.0)
      ) * energy * 2.4;

      /* universal turbulence so no formation ever freezes */
      pos.x += sin(uTime * 0.7 + aSeed * 91.0) * 0.4;
      pos.y += cos(uTime * 0.6 + aSeed * 47.0) * 0.4;
      pos.z += sin(uTime * 0.8 + aSeed * 23.0) * 0.4;

      vGlow = 0.5 + 0.5 * sin(uTime * (0.7 + aSeed * 1.8) + aSeed * 40.0) + energy * 1.3;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = uSize * (0.3 + aSeed * 1.2) / max(1.0, -mv.z * 0.22);
      gl_Position = projectionMatrix * mv;
    }
  `;

  const FIELD_FRAG = /* glsl */ `
    uniform vec3 uBio;
    uniform vec3 uData;
    uniform vec3 uPal[9];
    uniform float uOpacity;
    varying float vSeed;
    varying float vGlow;

    ${PAL_PICK_GLSL}

    void main() {
      vec2 d = gl_PointCoord - vec2(0.5);
      float r2 = dot(d, d);
      if (r2 > 0.25) discard;
      float soft = smoothstep(0.25, 0.03, r2);

      /* the ambient sea carries the same nine-channel stain, leaned cool:
         distant tissue reads blue-teal, warm reporters glint through rarely */
      vec3 col = mix(palPick(vSeed), uData, 0.35);

      gl_FragColor = vec4(col, soft * (0.1 + vGlow * 0.24) * uOpacity);
    }
  `;

  const FIELD_COUNT = quality === "high" ? 7000 : 3000;
  const fieldGeo = new THREE.BufferGeometry();
  {
    const fpos = new Float32Array(FIELD_COUNT * 3);
    const fseed = new Float32Array(FIELD_COUNT);
    const rand = mulberry32(0xf1e1d);
    for (let i = 0; i < FIELD_COUNT; i++) {
      let x = gauss(rand), y = gauss(rand), z = gauss(rand);
      const l = Math.hypot(x, y, z) || 1;
      const r = 7 + 17 * Math.pow(rand(), 0.65); // shell 7–24, biased outward
      fpos[i * 3] = (x / l) * r;
      fpos[i * 3 + 1] = (y / l) * r * 0.8;
      fpos[i * 3 + 2] = (z / l) * r;
      fseed[i] = rand();
    }
    fieldGeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
    fieldGeo.setAttribute("aSeed", new THREE.BufferAttribute(fseed, 1));
    fieldGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);
  }
  const fieldMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProg: { value: 0 },
      uSize: { value: quality === "high" ? 26 : 22 },
      uOpacity: { value: 1 },
      uBio: { value: palette.bio.clone() },
      uData: { value: palette.data.clone() },
      uPal: makePalUniform(),
    },
    vertexShader: FIELD_VERT,
    fragmentShader: FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const field = new THREE.Points(fieldGeo, fieldMat);
  field.renderOrder = 0;
  scene.add(field);

  /* ── palette mutation (Konami) ─────────────────────────────────────────── */

  const applyPalette = () => {
    const p = readPalette();
    for (const mat of [membraneMat, cloudMat, organelleMat, nebulaMat, fieldMat]) {
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

    /* six transitions across seven stages:
       organism · tissue · cell · gamete · mitochondrion · helix · brain */
    const SEGS = 6;
    const f = Math.min(SEGS - 0.001, p * SEGS);
    const seg = Math.min(SEGS - 1, Math.floor(f));
    uploadStagePair(seg, seg + 1);
    const local = f - seg;
    cloudMat.uniforms.uStageMix.value = THREE.MathUtils.smoothstep(local, 0.12, 0.88);

    /* the swim runs only while the gamete owns the frame (stage 3 of 0-6:
       pure at p = 0.5, faded across its neighbours) */
    cloudMat.uniforms.uSwim.value =
      THREE.MathUtils.smoothstep(p, 0.4, 0.47) *
      (1 - THREE.MathUtils.smoothstep(p, 0.55, 0.62));

    /* THE CAMERA RIG — the journey is a flight, not a push.
       The camera rides an orbit whose angle accumulates with depth:
         dive      straight through the membrane
         tissue    swing wide to the side — the world streams past
         cell      keep swinging, rise above the orbitals, look down
         protein   CORKSCREW: a fast 130° sweep around the spinning helix
         finale    settle behind the storm, brain framed clear of the text */
    const dive = THREE.MathUtils.smoothstep(p, 0.02, 0.24);
    /* the protein stage pulls back: the ladder is 3.9 tall and deserves to
       be SEEN — the corkscrew sweeps wide around it, then closes back in */
    const helixPull =
      THREE.MathUtils.smoothstep(p, 0.72, 0.8) *
      (1 - THREE.MathUtils.smoothstep(p, 0.88, 0.96));
    const gametePull =
      THREE.MathUtils.smoothstep(p, 0.4, 0.47) *
      (1 - THREE.MathUtils.smoothstep(p, 0.55, 0.62));
    /* the bean is 2.9 long and its outer shell reaches 1.4 on X — without
       this the camera plateau sits almost inside the membrane */
    const organellePull =
      THREE.MathUtils.smoothstep(p, 0.55, 0.62) *
      (1 - THREE.MathUtils.smoothstep(p, 0.68, 0.75));
    const radius =
      4.4 -
      3.1 * dive +
      1.2 * THREE.MathUtils.smoothstep(p, 0.3, 0.9) +
      1.7 * helixPull +
      1.4 * gametePull +
      1.9 * organellePull;
    const theta =
      0.55 * THREE.MathUtils.smoothstep(p, 0.18, 0.34) +
      0.55 * THREE.MathUtils.smoothstep(p, 0.34, 0.55) +
      0.5 * THREE.MathUtils.smoothstep(p, 0.55, 0.7) +
      2.2 * THREE.MathUtils.smoothstep(p, 0.72, 0.88);
    /* look-target pan flips with the camera's side so the brain always lands
       screen-right, clear of the stage text */
    const lookX =
      -0.52 * THREE.MathUtils.smoothstep(p, 0.9, 0.98) * Math.cos(theta);
    camera.position.x = Math.sin(theta) * radius + lookX;
    camera.position.z = Math.cos(theta) * radius;
    camera.position.y =
      -0.15 * Math.sin(p * Math.PI) +
      0.6 * THREE.MathUtils.smoothstep(p, 0.36, 0.5) *
        (1 - THREE.MathUtils.smoothstep(p, 0.62, 0.76));
    camera.lookAt(lookX, 0, 0);

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
    cloudMat.uniforms.uDataMix.value = THREE.MathUtils.smoothstep(p, 0.88, 0.98);
    cloudMat.uniforms.uDrift.value =
      1 - 0.6 * THREE.MathUtils.smoothstep(p, 0.9, 0.98);
    cloudMat.uniforms.uWave.value = THREE.MathUtils.smoothstep(p, 0.9, 0.98);
    /* the helix stage gets a showcase spin and a size boost — the logo
       motif deserves to burn brightest */
    const helix =
      THREE.MathUtils.smoothstep(p, 0.72, 0.8) *
      (1 - THREE.MathUtils.smoothstep(p, 0.86, 0.94));
    cloudSpin = 0.03 + 0.09 * helix;

    cloudMat.uniforms.uSize.value =
      baseSize *
      (1 +
        0.6 * THREE.MathUtils.smoothstep(p, 0.1, 0.5) +
        0.35 * helix +
        0.45 * THREE.MathUtils.smoothstep(p, 0.9, 1.0));

    /* probe only means something while the membrane exists */
    const probeScale = 1 - THREE.MathUtils.smoothstep(p, 0.05, 0.2);
    membraneMat.uniforms.uProbeStrength.value = probeState.strength * probeScale;

    nebulaMat.uniforms.uProg.value = p;
    nebulaMat.uniforms.uOpacity.value =
      0.5 + 0.5 * THREE.MathUtils.smoothstep(p, 0.15, 0.4);

    fieldMat.uniforms.uProg.value = p;
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
    fieldMat.uniforms.uTime.value = elapsed;

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
        fieldGeo.setDrawRange(0, Math.floor(FIELD_COUNT / 2));
        if (membrane.geometry === membraneGeo) {
          const coarseGeo = new THREE.SphereGeometry(1.15, 88, 60);
          membrane.geometry = coarseGeo;
          membraneGeo.dispose();
        }
      } else {
        baseSize = quality === "high" ? 11 : 9;
        cloudGeo.setDrawRange(0, count);
        fieldGeo.setDrawRange(0, FIELD_COUNT);
      }
    },

    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      mutationObserver.disconnect();
      nebulaGeo.dispose();
      nebulaMat.dispose();
      fieldGeo.dispose();
      fieldMat.dispose();
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
