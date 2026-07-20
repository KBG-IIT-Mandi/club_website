import { useEffect, useRef } from "react";
import "./HelixField.css";

/**
 * <HelixField /> — the 3D shader ground.
 *
 * A raymarched DNA double helix in a single fullscreen WebGL fragment shader.
 * No three.js: raw WebGL is ~1KB of runtime and keeps the bundle at 75KB gz
 * instead of dragging 363KB of engine back in for a background.
 *
 * The helix IS the brand (the logo is a shield + helix + gear), rendered in the
 * logo's three colours — cyan #36E4DF, blue #1177E1, deep #114BF2 — on the
 * sheet ground. This replaces the flat CSS helix strands: same motif, now 3D.
 *
 * PHONE BUDGET — the whole reason this is careful:
 *   · DPR capped (1.3 mobile / 1.75 desktop): a 3x phone shading 9x the pixels
 *     of a 1x panel buys nothing on a soft raymarch.
 *   · fewer march + shading steps on coarse pointers.
 *   · IntersectionObserver + visibilitychange cancel the rAF when unseen.
 *   · sustained <34fps sheds steps, then DPR, then gives up to a CSS fallback.
 *   · prefers-reduced-motion: one static frame, no loop.
 *   · full teardown on unmount (SPA): GL context, rAF, listeners, observers.
 */
export default function HelixField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;

    const fail = () => host && host.classList.add("is-fallback");

    let gl;
    try {
      const opts = {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      };
      gl =
        canvas.getContext("webgl", opts) ||
        canvas.getContext("experimental-webgl", opts);
    } catch {
      /* falls through to fallback */
    }
    if (!gl) {
      fail();
      return;
    }

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.innerWidth < 768;
    const mobile = coarse || narrow;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let precision = "highp";
    const hp = gl.getShaderPrecisionFormat(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT
    );
    if (mobile || !hp || hp.precision === 0) precision = "mediump";

    const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

    // Quality is a compile-time int so the marcher's loop bound is constant.
    const STEPS = mobile ? 44 : 72;

    const FRAG = `precision ${precision} float;
      uniform vec2 uRes; uniform float uTime; uniform float uFade;
      #define PI 3.14159265
      #define STEPS ${STEPS}

      mat2 r2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

      // Double helix on the y-axis. Twisting the domain turns the two helical
      // strands into two straight rods, so each strand costs one length().
      // .x = signed distance, .y = material id (0 strand, 1 rung).
      vec2 mapHelix(vec3 p){
        float twist = 0.85;
        float R = 1.0, tube = 0.135;
        float a = p.y * twist + uTime * 0.42;
        vec2 q = r2(a) * p.xz;
        float sA = length(q - vec2(R, 0.0)) - tube;
        float sB = length(q + vec2(R, 0.0)) - tube;
        float strands = min(sA, sB);

        // One rung per half-turn — the base pairs. Snap to the nearest so it
        // stays O(1): a capsule between the strands in that rung's own frame.
        float ry = (PI / twist);
        float yi = floor(p.y / ry + 0.5) * ry;
        float ar = yi * twist + uTime * 0.42;
        vec2 qr = r2(ar) * p.xz;
        vec3 tp = vec3(qr.x, p.y - yi, qr.y);
        vec3 ba = vec3(2.0 * R, 0.0, 0.0);
        float h = clamp(dot(tp + vec3(R,0.0,0.0), ba) / dot(ba, ba), 0.0, 1.0);
        float rung = length(tp + vec3(R,0.0,0.0) - ba * h) - tube * 0.55;

        return strands < rung ? vec2(strands, 0.0) : vec2(rung, 1.0);
      }

      vec3 normal(vec3 p){
        vec2 e = vec2(0.0016, 0.0);
        return normalize(vec3(
          mapHelix(p + e.xyy).x - mapHelix(p - e.xyy).x,
          mapHelix(p + e.yxy).x - mapHelix(p - e.yxy).x,
          mapHelix(p + e.yyx).x - mapHelix(p - e.yyx).x));
      }

      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

        // Composition: the helix lives OUT of the reading column. On a wide
        // screen the copy is a left column, so push the helix right; on a phone
        // the copy is full-width, so keep it near an edge and smaller. Panning
        // the sampled uv moves where the helix lands on screen.
        float aspect = uRes.x / uRes.y;
        float ox = aspect > 1.0 ? 0.62 : 0.30;
        float zoom = aspect > 1.0 ? 1.5 : 1.9;   // >1 pulls the helix smaller
        vec2 uvp = vec2(uv.x - ox, uv.y) * zoom;

        // Camera: slightly back, looking at the helix drifting downward.
        float scroll = uTime * 0.14;
        vec3 ro = vec3(0.0, 0.0, 4.6);
        vec3 rd = normalize(vec3(uvp, -1.35));
        // gentle sway so it reads as 3D even before you scroll
        float sway = sin(uTime * 0.16) * 0.10;
        ro.xz = r2(sway) * ro.xz;
        rd.xz = r2(sway) * rd.xz;

        vec3 col = vec3(0.0);
        float alpha = 0.0;

        float t = 0.0;
        float glow = 0.0;
        bool hit = false;
        vec3 hp;
        float id = 0.0;
        for (int i = 0; i < STEPS; i++){
          vec3 p = ro + rd * t;
          p.y += scroll;                 // helix travels down through the frame
          vec2 d = mapHelix(p);
          // cheap volumetric halo: accumulate proximity to the surface
          glow += 0.012 / (0.06 + d.x * d.x);
          if (d.x < 0.002){ hit = true; hp = p; id = d.y; break; }
          t += d.x * 0.85;
          if (t > 9.0) break;
        }

        vec3 cyan = vec3(0.212, 0.894, 0.875);
        vec3 blue = vec3(0.067, 0.467, 0.882);
        vec3 deep = vec3(0.067, 0.294, 0.949);

        // Deliberately dim. This is a background behind body copy, not the
        // subject: a bright glowing helix looks great in a screenshot and makes
        // the paragraph over it unreadable on a phone in daylight. Kept low so
        // the type carries the contrast.
        if (hit){
          vec3 n = normal(hp);
          vec3 lig = normalize(vec3(0.6, 0.8, 0.5));
          float dif = clamp(dot(n, lig), 0.0, 1.0);
          float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
          float depth = clamp(hp.z * 0.18 + 0.5, 0.0, 1.0);
          vec3 base = mix(deep, cyan, depth);        // near strands read cyan
          if (id > 0.5) base = blue;                 // rungs stay mid-blue
          col = base * (0.14 + 0.40 * dif) + cyan * fres * 0.22;
          alpha = 0.72;
        }

        // halo tints the surrounding sheet without a hard edge
        vec3 haloCol = mix(blue, cyan, 0.5);
        float halo = clamp(glow * 0.4, 0.0, 1.0);
        col += haloCol * halo * 0.28;
        alpha = max(alpha, halo * 0.3);

        // dither kills banding in the dark halo falloff on 8-bit panels
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        col += dither * 0.02;

        gl_FragColor = vec4(col * uFade, alpha * uFade);
      }`;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[helix] compile:", gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      fail();
      return;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[helix] link:", gl.getProgramInfoLog(prog));
      fail();
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uFade = gl.getUniformLocation(prog, "uFade");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied

    let dprCap = mobile ? 1.3 : 1.75;
    let raf = 0;
    let visible = true;
    let disposed = false;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = (now) => {
      const t = (now - start) / 1000;
      resize();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      // fade in over the first ~0.9s so it doesn't pop
      gl.uniform1f(uFade, Math.min(1, t / 0.9));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // Reduced motion: one frame, then stop for good.
    if (reduced) {
      requestAnimationFrame((n) => {
        gl.uniform1f && draw(n);
        gl.uniform1f(uFade, 1);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
      const onResizeStatic = () =>
        requestAnimationFrame((n) => {
          draw(n);
        });
      window.addEventListener("resize", onResizeStatic, { passive: true });
      resize();
      return () => {
        window.removeEventListener("resize", onResizeStatic);
        const ext = gl.getExtension("WEBGL_lose_context");
        ext && ext.loseContext();
      };
    }

    let frames = 0;
    let windowStart = 0;
    let degradations = 0;

    const loop = (now) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      draw(now);

      frames++;
      if (!windowStart) windowStart = now;
      const elapsed = now - windowStart;
      if (elapsed >= 2000) {
        const fps = (frames * 1000) / elapsed;
        frames = 0;
        windowStart = now;
        if (fps < 34) {
          degradations++;
          if (degradations === 1) {
            dprCap = Math.min(dprCap, 1.0);
            canvas.width = 0; // force resize() to rebuild smaller
          } else if (degradations >= 2) {
            dispose();
            fail();
          }
        }
      }
    };

    const play = () => {
      if (!raf && visible && !disposed) {
        windowStart = 0;
        frames = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const pause = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    function dispose() {
      disposed = true;
      pause();
    }

    const onVisibility = () => {
      if (document.hidden) pause();
      else play();
    };
    const onResize = () => resize();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize, { passive: true });

    let io;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          visible = entries[0].isIntersecting;
          if (visible) play();
          else pause();
        },
        { threshold: 0 }
      );
      io.observe(canvas);
    }

    resize();
    play();

    return () => {
      dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      io && io.disconnect();
      const ext = gl.getExtension("WEBGL_lose_context");
      ext && ext.loseContext();
    };
  }, []);

  return (
    <div className="helix-field" aria-hidden="true">
      <canvas ref={canvasRef} className="helix-field__canvas" />
    </div>
  );
}
