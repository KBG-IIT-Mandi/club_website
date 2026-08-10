import { useEffect, useRef } from "react";
import "./Grain.css";

/**
 * <Grain /> — one fixed film-grain overlay over everything.
 *
 * The noise is rasterised ONCE into a 128px canvas tile and repeated as a
 * background-image. A live SVG feTurbulence filter over the whole viewport
 * (the obvious implementation) forces the compositor to re-blend the full
 * page — it measurably stalled full-page rasterisation. A repeating bitmap
 * costs nothing. Subtlety is the point: opacity 0.05.
 */
export default function Grain() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(size, size);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 26; // ~10% alpha inside the tile; the layer adds its own
    }
    ctx.putImageData(image, 0, 0);
    el.style.backgroundImage = `url(${canvas.toDataURL("image/png")})`;
  }, []);

  return <div ref={ref} className="grain" aria-hidden="true" />;
}
