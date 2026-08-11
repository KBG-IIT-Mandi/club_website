/* ═══════════════════════════════════════════════════════════════════════════
   RACE ENGINE — SPERM STATE MACHINE
   The arming sequence and its failure modes. Transitions are validated at
   runtime: an illegal transition is a bug, and it throws rather than
   silently corrupting an outcome.

     uncapacitated → capacitating → capacitated → hyperactivated
       → acrosome-reacted → fused

   Terminal states (no exit):
     immotile, filtered, damaged, dead,
     premature-acrosome-reaction, expired-capacitated-window, fused

   Biology encoded in the TABLE, not in prose elsewhere:
     · nothing fuses without passing through capacitated territory
     · premature AR is reachable only from the armed states
     · expiry is reachable only from the armed states
   ═══════════════════════════════════════════════════════════════════════════ */

export const S = {
  UNCAP: 'uncapacitated',
  CAPACITATING: 'capacitating',
  CAPACITATED: 'capacitated',
  HYPER: 'hyperactivated',
  AR: 'acrosome-reacted',
  FUSED: 'fused',
  IMMOTILE: 'immotile',
  FILTERED: 'filtered',
  DAMAGED: 'damaged',
  DEAD: 'dead',
  PREMATURE_AR: 'premature-acrosome-reaction',
  EXPIRED: 'expired-capacitated-window',
};

const T = {
  [S.UNCAP]:        [S.CAPACITATING, S.IMMOTILE, S.FILTERED, S.DAMAGED, S.DEAD],
  [S.CAPACITATING]: [S.CAPACITATED, S.IMMOTILE, S.FILTERED, S.DAMAGED, S.DEAD],
  [S.CAPACITATED]:  [S.HYPER, S.AR, S.PREMATURE_AR, S.EXPIRED, S.IMMOTILE, S.DAMAGED, S.DEAD],
  [S.HYPER]:        [S.AR, S.PREMATURE_AR, S.EXPIRED, S.IMMOTILE, S.DAMAGED, S.DEAD],
  /* AR here means zona-induced AR at the right place & time — it may fuse. */
  [S.AR]:           [S.FUSED, S.EXPIRED, S.IMMOTILE, S.DAMAGED, S.DEAD],
  [S.FUSED]: [],
  [S.IMMOTILE]: [],
  [S.FILTERED]: [],
  [S.DAMAGED]: [],
  [S.DEAD]: [],
  [S.PREMATURE_AR]: [],
  [S.EXPIRED]: [],
};

export const TERMINAL = new Set(
  Object.keys(T).filter((k) => T[k].length === 0)
);

/* States with fertilizing potential still ahead of them. */
export const VIABLE = new Set([S.UNCAP, S.CAPACITATING, S.CAPACITATED, S.HYPER, S.AR]);

/* States allowed to respond to the chemoattractant gradient — the armed
   window only. This set is THE chemotaxis permission check. */
export const CHEMOTACTIC = new Set([S.CAPACITATED, S.HYPER, S.AR]);

export function canTransition(from, to) {
  const outs = T[from];
  return Array.isArray(outs) && outs.includes(to);
}

/**
 * Apply a transition to an agent ({ state, history[] }). Records
 * { t, from, to, cause } in the agent's bounded history.
 * @throws on an illegal transition — tests rely on this.
 */
export function transition(agent, to, tBio, cause = '') {
  if (!canTransition(agent.state, to)) {
    throw new Error(`illegal state transition ${agent.state} → ${to} (${cause})`);
  }
  const rec = { t: tBio, from: agent.state, to, cause };
  agent.state = to;
  agent.history.push(rec);
  if (agent.history.length > 64) agent.history.shift();
  return rec;
}
