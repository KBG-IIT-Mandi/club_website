/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — SEEDED RNG
   xoshiro128** (Blackman & Vigna) over four 32-bit words, seeded through
   splitmix32. Pure integer math — no BigInt on the hot path.

   THE STREAM RULE — the reproducibility contract of the whole simulation:
   a stream is derived from (rootSeed, label) ONLY, never from another
   stream's current position. Forking is therefore order-independent: the
   'visual' stream can burn a million draws per frame and the 'cohorts'
   stream never notices. Tests assert this.

   Math.random() is banned everywhere in the race feature except the single
   newSeed() below, which mints the seed for a brand-new race — a fresh seed
   is the one legitimate use the spec allows.
   ═══════════════════════════════════════════════════════════════════════════ */

/* splitmix32 — seed expander. Decorrelates consecutive integers, so
   seed and seed+1 give unrelated streams. */
export function splitmix32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/* FNV-1a over UTF-16 code units — stable label → uint32. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;

export class RNG {
  /** @param {number} seed uint32 root seed @param {string} label stream label */
  constructor(seed, label = 'root') {
    this.seed = seed >>> 0;
    this.label = label;
    const mix = splitmix32((this.seed ^ hashString(label)) >>> 0);
    /* xoshiro must not start at all-zero state; splitmix32 output never
       yields four zeros from a non-degenerate walk, but guard anyway. */
    this.s0 = mix(); this.s1 = mix(); this.s2 = mix(); this.s3 = mix();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s3 = 1;
    this.draws = 0;
  }

  /** Independent stream for a sub-system. Derives from (seed, path label)
      only — see THE STREAM RULE above. */
  fork(label) {
    return new RNG(this.seed, `${this.label}/${label}`);
  }

  nextUint32() {
    const { s0, s1, s2, s3 } = this;
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9)) >>> 0;
    const t = (s1 << 9) >>> 0;
    let n2 = (s2 ^ s0) >>> 0;
    let n3 = (s3 ^ s1) >>> 0;
    this.s1 = (s1 ^ n2) >>> 0;
    this.s0 = (s0 ^ n3) >>> 0;
    this.s2 = (n2 ^ t) >>> 0;
    this.s3 = rotl(n3, 11);
    this.draws += 1;
    return result;
  }

  /** Uniform [0, 1) with 53-bit precision. */
  nextFloat() {
    const hi = this.nextUint32() >>> 5;  // 27 bits
    const lo = this.nextUint32() >>> 6;  // 26 bits
    return (hi * 67108864 + lo) * (1 / 9007199254740992);
  }

  /** Uniform [0, 1) that can never be exactly 0 — safe under log(). */
  nextFloatOpen() {
    const u = this.nextFloat();
    return u > 0 ? u : 5e-324 * 2 ** 52; // smallest normal-ish positive
  }

  /** Integer in [0, n). */
  nextInt(n) {
    return Math.floor(this.nextFloat() * n);
  }
}

/* The ONLY place Math.random may appear in the race feature: minting the
   seed of a brand-new race. Everything downstream of the seed is exact. */
export function newSeed() {
  return (Math.floor(Math.random() * 0x100000000) ^ Date.now()) >>> 0;
}
