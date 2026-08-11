/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — EVENT SCHEDULER
   Binary min-heap of { t, seq, type, payload }. seq breaks time ties in
   insertion order, so the pop sequence — and therefore every RNG draw made
   inside event handlers — is fully deterministic regardless of how the
   caller slices step(). Long waits (reservoir, pre-ovulation) cost nothing:
   biological time jumps between events instead of ticking through them.
   ═══════════════════════════════════════════════════════════════════════════ */

export class Scheduler {
  constructor() {
    this.heap = [];
    this.seq = 0;
  }

  schedule(t, type, payload = null) {
    const ev = { t, seq: this.seq++, type, payload };
    const h = this.heap;
    h.push(ev);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (before(h[i], h[p])) {
        [h[i], h[p]] = [h[p], h[i]];
        i = p;
      } else break;
    }
    return ev;
  }

  peekTime() {
    return this.heap.length ? this.heap[0].t : Infinity;
  }

  /** Pop the earliest event if it is due at or before t. */
  popDue(t) {
    const h = this.heap;
    if (!h.length || h[0].t > t) return null;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && before(h[l], h[m])) m = l;
        if (r < h.length && before(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }

  get size() {
    return this.heap.length;
  }
}

const before = (a, b) => a.t < b.t || (a.t === b.t && a.seq < b.seq);
