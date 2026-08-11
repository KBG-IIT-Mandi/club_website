/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — UNITS
   The engine's internal units are fixed and never mixed:
     · length    µm   (micrometres — sperm-scale)
     · anatomy   mm   (stage lengths from the registry, converted on read)
     · velocity  µm/s (VCL/VSL/VAP scale)
     · time      s    (biological seconds since deposition, t = 0)
   Rendering owns its own display transform (px per mm, per stage) and never
   leaks pixels back into here. Every cross-unit read goes through these
   helpers so a stray raw factor is greppable.
   ═══════════════════════════════════════════════════════════════════════════ */

export const UM_PER_MM = 1000;
export const MM_PER_CM = 10;
export const UM_PER_CM = UM_PER_MM * MM_PER_CM;

export const S_PER_MIN = 60;
export const S_PER_HOUR = 3600;
export const S_PER_DAY = 86400;

export const MILLION = 1e6;

export const mmToUm = (mm) => mm * UM_PER_MM;
export const umToMm = (um) => um / UM_PER_MM;
export const cmToUm = (cm) => cm * UM_PER_CM;

export const minToS = (min) => min * S_PER_MIN;
export const hToS = (h) => h * S_PER_HOUR;
export const sToMin = (s) => s / S_PER_MIN;
export const sToH = (s) => s / S_PER_HOUR;

/* "T+06:12:44" — the biological clock string the HUD shows. Negative times
   (before deposition — used for pre-race ovulation offsets) read "T−…". */
export const formatBioClock = (seconds) => {
  const sign = seconds < 0 ? 'T−' : 'T+';
  let s = Math.floor(Math.abs(seconds));
  const h = Math.floor(s / S_PER_HOUR);
  s -= h * S_PER_HOUR;
  const m = Math.floor(s / S_PER_MIN);
  s -= m * S_PER_MIN;
  const pad = (n) => String(n).padStart(2, '0');
  return `${sign}${pad(h)}:${pad(m)}:${pad(s)}`;
};

/* Compact human duration for event copy: "38s", "12m", "6.5h", "2.1d". */
export const formatDuration = (seconds) => {
  const s = Math.abs(seconds);
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 90 * S_PER_MIN) return `${Math.round(s / S_PER_MIN)}m`;
  if (s < 48 * S_PER_HOUR) return `${(s / S_PER_HOUR).toFixed(1)}h`;
  return `${(s / S_PER_DAY).toFixed(1)}d`;
};

/* Population counts render as "182M", "4.2M", "961K", "1 204". */
export const formatCount = (n) => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100 * MILLION) return `${Math.round(n / MILLION)}M`;
  if (n >= MILLION) return `${(n / MILLION).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};
