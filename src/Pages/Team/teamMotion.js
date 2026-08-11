import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

/**
 * teamMotion — the GSAP choreography for the Team page. Its own chunk:
 * Team.jsx dynamic-imports it only when motion is wanted (never under
 * prefers-reduced-motion), and Vite shares the gsap core with the Descent
 * chunk, so the main bundle never pays for any of this.
 *
 * The sequence tells one story — an instrument locking onto the colony:
 *   1. the eyebrow SCRAMBLES in (telemetry acquiring signal)
 *   2. the title characters rise (the readout resolves)
 *   3. the census counts up from zero (the tally running)
 *   4. the constellation stage racks into focus (the lens settles)
 *   5. roster cards cascade in on scroll (specimens filed one by one)
 *   6. fine pointers get a subtle magnetic tilt on cards (alive to touch)
 *
 * Contract: initTeamMotion(root) → dispose(). The page arms
 * [data-team-motion] (CSS hides the choreographed elements) BEFORE first
 * paint; our first act is taking ownership via gsap.set, then dropping the
 * attribute — no flash of finished state, and a failed import leaves the
 * attribute to the caller's safety timeout.
 */
export function initTeamMotion(root) {
  const unsubs = [];
  let split = null;

  const ctx = gsap.context(() => {
    const eyebrow = root.querySelector(".team-eyebrow");
    const title = root.querySelector("h1");
    const lead = root.querySelector(".team-lead");
    const stats = gsap.utils.toArray(root.querySelectorAll(".team-stats .label"));
    const nums = gsap.utils.toArray(root.querySelectorAll(".team-stats__num"));
    const stage = root.querySelector(".constellation__stage");
    const legend = root.querySelector(".constellation__legend");
    const cards = gsap.utils.toArray(root.querySelectorAll(".constellation__member"));

    /* take ownership of visibility, then drop the CSS gate */
    const headline = [eyebrow, title, lead, stage, legend, ...stats].filter(Boolean);
    gsap.set(headline, { autoAlpha: 0 });
    if (cards.length) gsap.set(cards, { autoAlpha: 0, y: 36 });
    root.removeAttribute("data-team-motion");

    /* ── 1-4: the header timeline ──────────────────────────────────────── */
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    if (eyebrow) {
      const label = eyebrow.textContent;
      tl.set(eyebrow, { autoAlpha: 1 }, 0).to(
        eyebrow,
        {
          duration: 1.0,
          scrambleText: { text: label, chars: "01·—/\\<>", speed: 0.6 },
        },
        0
      );
    }

    if (title) {
      split = new SplitText(title, { type: "chars" });
      tl.set(title, { autoAlpha: 1 }, 0.12).from(
        split.chars,
        {
          y: "0.85em",
          autoAlpha: 0,
          duration: 0.7,
          stagger: 0.03,
        },
        0.12
      );
    }

    if (lead) {
      tl.fromTo(lead, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.45);
    }

    if (stats.length) {
      tl.fromTo(
        stats,
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1 },
        0.55
      );
      nums.forEach((n) => {
        const v = parseInt(n.dataset.value, 10) || 0;
        tl.fromTo(
          n,
          { textContent: 0 },
          { textContent: v, snap: { textContent: 1 }, duration: 0.9, ease: "power2.out" },
          0.6
        );
      });
    }

    if (stage) {
      tl.fromTo(
        stage,
        { autoAlpha: 0, scale: 1.035, transformOrigin: "50% 40%" },
        { autoAlpha: 1, scale: 1, duration: 1.0, ease: "power2.out" },
        0.55
      );
    }
    if (legend) {
      tl.fromTo(legend, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 0.8);
    }

    /* ── 5: roster cascade — specimens filed as they enter ─────────────── */
    if (cards.length) {
      ScrollTrigger.batch(cards, {
        start: "top 90%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            autoAlpha: 1,
            y: 0,
            duration: 0.75,
            stagger: 0.09,
            ease: "power3.out",
            overwrite: true,
          }),
      });
    }

    /* ── 6: magnetic tilt — the card leans toward the probe ────────────── */
    if (window.matchMedia("(pointer: fine)").matches) {
      cards.forEach((card) => {
        gsap.set(card, { transformPerspective: 700 });
        const rx = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3" });
        const ry = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3" });
        const move = (e) => {
          const r = card.getBoundingClientRect();
          ry(gsap.utils.mapRange(0, r.width, -4, 4, e.clientX - r.left));
          rx(gsap.utils.mapRange(0, r.height, 4, -4, e.clientY - r.top));
        };
        const leave = () => {
          rx(0);
          ry(0);
        };
        card.addEventListener("pointermove", move, { passive: true });
        card.addEventListener("pointerleave", leave, { passive: true });
        unsubs.push(() => {
          card.removeEventListener("pointermove", move);
          card.removeEventListener("pointerleave", leave);
        });
      });
    }
  }, root);

  return () => {
    unsubs.forEach((u) => u());
    if (split) split.revert();
    ctx.revert();
    root.removeAttribute("data-team-motion");
  };
}
