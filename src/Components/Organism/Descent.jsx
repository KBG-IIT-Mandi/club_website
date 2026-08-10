import { useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import OrganismCanvas from "./OrganismCanvas";
import { STAGES } from "./stages";
import "./Descent.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * <SpecimenField /> — the hero and the descent, one continuous journey.
 *
 * A 600vh field with a sticky 100vh viewport. The organism canvas lives in
 * the sticky layer; ScrollTrigger scrubs field progress into
 * organism.setProgress(p), which drives the camera through the membrane and
 * morphs the interior cloud organism → tissue → cell → protein → code.
 * Stage overlays fade through their progress bands on the same scrub.
 *
 * The scroll is NATIVE — nothing is hijacked. Keyboard paging, scrollbars
 * and momentum all behave; the field is just tall.
 *
 * Reduced motion: no ScrollTrigger, no tall field — the organism renders one
 * static frame in a 100vh hero and the five stages stack as plain sections.
 * The DOM content is identical either way.
 *
 * `hero` is the overlay content for the first viewport (headline, HUD, CTAs)
 * — supplied by Home, faded out over the first ~8% of the journey.
 */
export default function SpecimenField({ hero }) {
  const fieldRef = useRef(null);
  const organismRef = useRef(null);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useGSAP(
    () => {
      if (reduced) return;
      const field = fieldRef.current;
      if (!field) return;

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: field,
          start: "top top",
          end: "bottom bottom",
          /* 0.45: the stage text tracks the hand tightly; the organism keeps
             its own softness from the probe/breathing easing in cellScene. */
          scrub: 0.45,
          onUpdate: (self) => {
            organismRef.current?.setProgress(self.progress);
          },
        },
      });

      /* the hero overlay hands the stage to the journey */
      tl.fromTo(
        ".specimen-field__hero",
        { autoAlpha: 1, y: 0 },
        { autoAlpha: 0, y: -46, duration: 0.07 },
        0.015
      );

      /* each stage surfaces inside its band, then yields */
      STAGES.forEach((stage) => {
        const el = `.descent-stage[data-stage="${stage.id}"]`;
        const [a, b] = stage.band;
        const fade = Math.min(0.045, (b - a) / 3);
        tl.fromTo(
          el,
          { autoAlpha: 0, y: 34 },
          { autoAlpha: 1, y: 0, duration: fade },
          a
        );
        tl.to(el, { autoAlpha: 0, y: -34, duration: fade }, b - fade);
      });
    },
    { scope: fieldRef, dependencies: [reduced] }
  );

  const stageBlock = (stage) => (
    <div key={stage.id} className="descent-stage" data-stage={stage.id}>
      <p className="descent-stage__level">{stage.level}</p>
      <h2 className="descent-stage__title display-2">{stage.title}</h2>
      <p className="descent-stage__copy">{stage.copy}</p>
      <Link className="descent-stage__link" to={stage.to} data-cursor="explore">
        SEE THE WORK
      </Link>
    </div>
  );

  if (reduced) {
    /* Static build: hero + organism frame, then five ordinary sections. */
    return (
      <div className="specimen-field specimen-field--static" ref={fieldRef}>
        <div className="specimen-field__sticky">
          <OrganismCanvas ref={organismRef} interactive={false} />
          <div className="specimen-field__hero">{hero}</div>
        </div>
        <div className="specimen-field__static-stages">
          {STAGES.map((s) => stageBlock(s))}
        </div>
      </div>
    );
  }

  return (
    <div className="specimen-field" ref={fieldRef}>
      <div className="specimen-field__sticky">
        <OrganismCanvas ref={organismRef} />
        <div className="specimen-field__hero">{hero}</div>
        {STAGES.map((s) => stageBlock(s))}
      </div>
    </div>
  );
}
