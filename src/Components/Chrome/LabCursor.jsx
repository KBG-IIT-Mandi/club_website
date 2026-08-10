import { useEffect, useRef, useState } from "react";
import "./LabCursor.css";

/**
 * <LabCursor /> — the microscope probe.
 *
 * A dot rides the pointer; a ring trails it with lag; a mono label names the
 * current mode: OBSERVE (over the organism), EXPLORE (over anything
 * interactive), OPEN (over a specimen dossier). Modes come from the nearest
 * [data-cursor] ancestor; bare links/buttons default to EXPLORE.
 *
 * This is an accessory, never a replacement: the system cursor stays visible,
 * so a JS failure or a missed frame never leaves anyone cursorless. Renders
 * nothing on coarse pointers and under prefers-reduced-motion.
 */
const LABELS = { observe: "OBSERVE", explore: "EXPLORE", open: "OPEN" };

export default function LabCursor() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState(null);
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(fine.matches && !reduced.matches);
    update();
    fine.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return undefined;

    let px = -100;
    let py = -100;
    let rx = -100;
    let ry = -100;
    let raf = 0;
    let seen = false;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      rx += (px - rx) * 0.16;
      ry += (py - ry) * 0.16;
      dot.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    };

    const onMove = (e) => {
      px = e.clientX;
      py = e.clientY;
      if (!seen) {
        seen = true;
        rx = px;
        ry = py;
        dot.classList.add("is-seen");
        ring.classList.add("is-seen");
      }
    };

    const onOver = (e) => {
      const el =
        e.target instanceof Element
          ? e.target.closest("[data-cursor], a, button, [role='button']")
          : null;
      if (!el) {
        setMode(null);
        return;
      }
      const named = el.closest("[data-cursor]");
      setMode(named ? named.dataset.cursor : "explore");
    };

    const onLeave = () => {
      seen = false;
      dot.classList.remove("is-seen");
      ring.classList.remove("is-seen");
      setMode(null);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  const label = mode && LABELS[mode] ? LABELS[mode] : null;

  return (
    <div className="lab-cursor" aria-hidden="true">
      <div ref={dotRef} className="lab-cursor__dot" />
      <div
        ref={ringRef}
        className={`lab-cursor__ring${label ? " has-mode" : ""}`}
        data-mode={mode || undefined}
      >
        {label && <span className="lab-cursor__label">{label}</span>}
      </div>
    </div>
  );
}
