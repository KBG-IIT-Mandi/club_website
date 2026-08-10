import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
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
  const ref = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    ref.current?.focus({ preventScroll: true });
  }, [location.pathname]);

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
