import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import "./FocusShift.css";

/**
 * <FocusShift /> — microscope focus-pull between routes.
 *
 * The incoming page starts defocused (blur + slight dim) and racks into
 * sharpness, like adjusting the fine-focus knob. Entry-only: keying the
 * wrapper on pathname remounts it, restarting the CSS animation. No exit
 * phase — holding the outgoing page hostage for a transition is how sites
 * start feeling slower than they are.
 *
 * Focus management rides the same remount: on in-app navigation the wrapper
 * (tabindex -1) takes focus, so screen readers announce the new page and
 * keyboard users start at the top of the content instead of wherever the
 * old page left them. The initial load is left alone — stealing focus
 * before a visitor touches anything is hostile.
 *
 * Reduced motion: the global reduced-motion block kills the animation, so
 * the page simply appears sharp. The focus move has no motion to reduce.
 */
export default function FocusShift({ children }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const ref = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const isFirstRender = firstRender.current;
    firstRender.current = false;

    if (isFirstRender && !location.hash) {
      return;
    }

    if (!isFirstRender) ref.current?.focus({ preventScroll: true });

    /* React Router preserves the document scroll position. That is useful for
       back/forward restoration, but surprising for an explicit nav click: a
       visitor leaving the bottom of one route otherwise arrives halfway down
       the next. Hash destinations are observed because page copy is fetched
       asynchronously and the target may not exist on the first frame. */
    if (!location.hash) {
      /* Let the browser restore a saved position for back/forward travel. */
      if (navigationType !== "POP") {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
      return undefined;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const id = decodeURIComponent(location.hash.slice(1));
    const main = document.getElementById("main");

    const moveToTarget = () => {
      const target = document.getElementById(id);
      if (!target) return false;
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
      return true;
    };

    if (moveToTarget()) return undefined;

    const observer = new MutationObserver(() => {
      if (moveToTarget()) observer.disconnect();
    });
    if (main) observer.observe(main, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 8000);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [location.pathname, location.hash, navigationType]);

  return (
    <div
      key={location.pathname}
      ref={ref}
      className="focus-shift"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
