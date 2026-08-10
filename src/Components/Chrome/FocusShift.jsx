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
 * Reduced motion: the global reduced-motion block kills the animation, so
 * the page simply appears sharp.
 */
export default function FocusShift({ children }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="focus-shift">
      {children}
    </div>
  );
}
