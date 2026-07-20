import { useLayoutEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   THE ONLY REVEAL SYSTEM.

   One IntersectionObserver adds .is-drawn; the CSS transitions in App.css do
   the rest. No rAF, no scroll hijack, no animation library.

   ── WHY THIS IS A HOOK AND NOT FIVE COPIES ──────────────────────────────────
   It used to be five hand-rolled observers, one per page, with five different
   option objects. Most of them passed a `threshold` and were deadlocked; the
   two that worked worked only because they happened to omit it. That is not a
   difference any reviewer can see by reading one page at a time, so the option
   object now lives in exactly one place and no page can get it wrong.

   ── DO NOT ADD A `threshold` ────────────────────────────────────────────────
   A `.band`'s resting state is `clip-path: inset(0 100% 0 0)`, and an element's
   OWN clip-path shrinks the rect IntersectionObserver measures. A clipped band
   therefore reports intersectionRatio 0 no matter how much of it is on screen.
   Any `threshold > 0` can never be met, `.is-drawn` is never added, and the clip
   never lifts: the reveal's resting state prevents the observer that would undo
   it. The band is hidden by the exact property that stops it being unhidden.

   Verified in Chromium (element fully in viewport):
     clip-path: inset(0 100% 0 0)  ->  th 0: {isIntersecting: true,  ratio: 0}
                                       th 0.01/0.08/0.12: NEVER FIRES
     transform: scaleX(0)          ->  ratio 1 at every threshold

   At threshold 0 `isIntersecting` is true on contact regardless of ratio, which
   is why omitting it works. `.row` uses a transform and is unaffected either
   way — which is why rows drew while bands never did.

   ── THE SAFETY NET IS `data-draw-ready`, NOT THE MEDIA QUERY ────────────────
   `.band` / `.row` carry NO clip and NO transform until this hook stamps
   `data-draw-ready` on the page root (see App.css). So if this hook never runs
   — JS error, unmounted ref, an exception in the observer — every page renders
   fully drawn. Content is never gated on the reveal succeeding.

   It is stamped in a layout effect, before paint, so the armed state is never
   painted unarmed first: no flash of undrawn content.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function useDrawOnScroll(ready) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!ready) return undefined;

    const root = ref.current;
    if (!root) return undefined;

    // Arm the reveal. Until this lands, .band/.row are at their final state.
    root.setAttribute("data-draw-ready", "");

    // Classes, not a [data-draw] attribute. The attribute was hand-applied and
    // had already been missed on About's `whatWeDo` rows, which meant six list
    // items sat at scaleX(0) forever. The class that styles it is the class
    // that observes it — they cannot drift apart.
    const targets = Array.from(root.querySelectorAll(".band, .row"));
    if (!targets.length) return undefined;

    const draw = (el) => el.classList.add("is-drawn");

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach(draw);
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          draw(entry.target);
          io.unobserve(entry.target); // draw once. Nothing draws back out.
        });
      },
      // NO threshold. Read the block above before touching this line.
      { rootMargin: "0px 0px -10% 0px" }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ready]);

  return ref;
}
