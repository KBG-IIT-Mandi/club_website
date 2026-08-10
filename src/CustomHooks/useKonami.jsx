import { useEffect } from "react";

/**
 * useKonami — ↑ ↑ ↓ ↓ ← → ← → B A toggles the mutation.
 *
 * The easter egg from the spec: entering the Konami code mutates the site's
 * biological accent (lime → magenta) by toggling `.mutated` on <html>. The
 * palette lives in CSS custom properties and the organism reads its colours
 * from getComputedStyle, so one class flip mutates everything, shader
 * included. Toggling again reverts — mutations are reversible in this lab.
 */
const CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
];

export default function useKonami() {
  useEffect(() => {
    let at = 0;
    const onKeyDown = (e) => {
      if (e.code === CODE[at]) {
        at += 1;
        if (at === CODE.length) {
          at = 0;
          document.documentElement.classList.toggle("mutated");
        }
      } else {
        at = e.code === CODE[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
