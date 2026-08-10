import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import "./OrganismCanvas.css";

/**
 * <OrganismCanvas /> — lifecycle-safe mount for the cell scene.
 *
 * Owns everything cellScene must not know about:
 *   · lazy import — the three chunk loads AFTER the hero HTML has painted
 *   · DPR caps (1.75 fine-pointer / 1.3 coarse) and resize plumbing
 *   · the FPS ladder: <34fps sheds quality; a second strike stops the loop
 *     and swaps in the CSS membrane poster (.is-fallback)
 *   · IntersectionObserver + visibilitychange pause when unseen
 *   · prefers-reduced-motion: one static frame, no loop, no probe
 *   · pointer → probe NDC conversion (fine pointers only)
 *   · full dispose on unmount
 *
 * ref exposes { setProgress } for the Descent's scroll scrub.
 */
const OrganismCanvas = forwardRef(function OrganismCanvas(
  { interactive = true, className = "" },
  ref
) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const progressRef = useRef(0);

  useImperativeHandle(ref, () => ({
    setProgress(p) {
      progressRef.current = p;
      const scene = sceneRef.current;
      if (scene) {
        scene.setProgress(p);
        // A paused scene (reduced motion) still reflects scroll position.
        if (reducedRef.current) scene.renderOnce();
      }
    },
  }));

  const reducedRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    let disposed = false;
    let scene = null;
    let io = null;
    let visible = true;
    let degradations = 0;
    let fellBack = false; // the poster is TERMINAL — nothing may restart the loop

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reduced;
    let dprCap = coarse ? 1.3 : 1.75;

    const fallback = () => host.classList.add("is-fallback");

    const resize = () => {
      if (!scene) return;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      scene.resize(w, h, dpr);
      // With no loop running (reduced motion), setSize wiped the drawing
      // buffer — repaint the static frame or the cell vanishes on resize.
      if (reduced) scene.renderOnce();
    };

    const onMove = (e) => {
      if (!scene) return;
      const rect = host.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      scene.setProbe(x, y, 1);
    };

    const onLeave = () => {
      if (scene) scene.setProbe(0, 0, 0);
    };

    const onVisibility = () => {
      if (!scene || reduced || fellBack) return;
      if (document.hidden || !visible) scene.stop();
      else scene.start();
    };

    const onResize = () => resize();

    (async () => {
      let mod;
      try {
        mod = await import("./cellScene.js");
      } catch {
        if (!disposed) fallback();
        return;
      }
      if (disposed) return;

      try {
        scene = mod.createCellScene(canvas, {
          quality: coarse ? "low" : "high",
        });
      } catch {
        fallback();
        return;
      }
      sceneRef.current = scene;

      resize();
      scene.setProgress(progressRef.current);
      host.classList.add("is-live");

      if (reduced) {
        scene.renderOnce();
      } else {
        /* Threshold 27, not 34: a healthy 30Hz environment (iOS Low Power
           Mode, 30Hz external panels) delivers a steady ~29-30 and must not
           trip the ladder; genuinely struggling GPUs land well under 27. */
        scene.onFps((fps) => {
          if (fps < 27) {
            degradations += 1;
            if (degradations === 1) {
              // Strike 1 sheds the real load: fewer particles + coarser
              // membrane (setQuality) AND fewer pixels (DPR floor).
              scene.setQuality("low");
              dprCap = 1.0;
              resize();
            } else {
              fellBack = true;
              scene.stop();
              scene.onFps(null);
              io?.disconnect();
              document.removeEventListener("visibilitychange", onVisibility);
              fallback();
            }
          }
        });
        scene.start();

        if ("IntersectionObserver" in window) {
          io = new IntersectionObserver(
            (entries) => {
              visible = entries[0].isIntersecting;
              onVisibility();
            },
            { threshold: 0 }
          );
          io.observe(host);
        }
        document.addEventListener("visibilitychange", onVisibility);

        if (interactive && !coarse) {
          host.addEventListener("pointermove", onMove, { passive: true });
          host.addEventListener("pointerleave", onLeave, { passive: true });
        }
      }

      window.addEventListener("resize", onResize, { passive: true });
    })();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      if (io) io.disconnect();
      if (scene) {
        scene.dispose();
        sceneRef.current = null;
      }
    };
  }, [interactive]);

  return (
    <div
      ref={hostRef}
      className={`organism ${className}`}
      data-cursor="observe"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="organism__canvas" />
      <div className="organism__poster" />
    </div>
  );
});

export default OrganismCanvas;
