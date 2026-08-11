import React from 'react';
import { formatCount, formatBioClock, formatDuration } from '../../race/engine/units.js';

/* ── COUNTS STRIP — the instrument readouts ──────────────────────────────── */

export function CountsStrip({ snapshot: s }) {
  if (!s) return null;
  const cells = [
    ['DEPOSITED', s.totals.deposited],
    ['ALIVE', s.totals.alive],
    ['MOTILE', s.totals.motile],
    ['CAPACITATED', s.totals.capacitated],
    ['IN THE TUBES', s.totals.tubal],
    ['NEAR OOCYTE', s.totals.nearOocyte],
  ];
  return (
    <div className="race-counts band" role="group" aria-label="Population counts">
      {cells.map(([label, v]) => (
        <div key={label} className="race-count">
          <span className="race-count__value">{formatCount(v)}</span>
          <span className="label">{label}</span>
        </div>
      ))}
      <div className="race-count">
        <span className="race-count__value race-count__value--data">
          {s.oocyte.present ? `${Math.round((s.oocyte.viability ?? 0) * 100)}%` : '—'}
        </span>
        <span className="label label--data">OOCYTE VIABILITY</span>
      </div>
    </div>
  );
}

/* ── ATTRITION FUNNEL — log-scaled; the true story of the race ───────────── */

export function FunnelPanel({ snapshot: s }) {
  if (!s) return null;
  const max = Math.log10(1 + (s.funnel[0]?.ever ?? 1));
  return (
    <article className="entry race-panel" aria-label="Attrition funnel">
      <p className="label label--live">SELECTION FUNNEL</p>
      <ul className="race-funnel">
        {s.funnel.map((f) => {
          const w = max > 0 ? Math.max(f.ever > 0 ? 4 : 0, (Math.log10(1 + f.ever) / max) * 100) : 0;
          return (
            <li key={f.id} className="race-funnel__row">
              <span className="label race-funnel__label">{f.label}</span>
              <span className="race-funnel__bar" aria-hidden="true">
                <span className="race-funnel__fill" style={{ width: `${w}%` }} />
              </span>
              <span className="race-funnel__num">{formatCount(f.ever)}</span>
            </li>
          );
        })}
      </ul>
      <p className="caption race-panel__foot">
        Bars are log-scaled — a linear bar for 10⁸ → 10³ would vanish.
        Counts are cells that EVER reached each checkpoint.
      </p>
    </article>
  );
}

/* ── EVENT LOG — the live feed ───────────────────────────────────────────── */

export function EventLog({ snapshot: s }) {
  if (!s) return null;
  const events = [...(s.events ?? [])].reverse().slice(0, 32);
  return (
    <article className="entry race-panel" aria-label="Event log">
      <p className="label label--live">EVENT LOG</p>
      {/* No aria-live: at 8 refreshes/s a live region floods screen readers.
          The outcome plate (role="status") announces the moment that matters. */}
      <ul className="race-log">
        {events.map((e) => (
          <li key={e.seq} className={`race-log__row race-log__row--${e.type}`}>
            <span className="race-log__t">{formatBioClock(e.t)}</span>
            <span className="race-log__detail">{e.detail}</span>
          </li>
        ))}
        {events.length === 0 && (
          <li className="race-log__row"><span className="caption">Awaiting deposition…</span></li>
        )}
      </ul>
    </article>
  );
}

/* ── OUTCOME PLATE — overlays the stage when the race resolves ───────────── */

export function OutcomePlate({ outcome }) {
  const fert = outcome.type === 'fertilization';
  return (
    <div className="race-outcome" role="status">
      <p className="label label--live">RACE RESOLVED · {formatBioClock(outcome.tBio)}</p>
      <p className="race-outcome__head">
        {fert
          ? `${outcome.winner.callsign} fused`
          : 'No fertilization'}
      </p>
      {fert && outcome.arcadeOverride && (
        <p className="race-outcome__note label">
          ARCADE OVERRIDE — a game mechanic granted this finish, not biology
        </p>
      )}
      {fert && !outcome.arcadeOverride && (
        <p className="race-outcome__note caption">
          {outcome.winner.sexChromosome}-bearing · arrived {formatDuration(outcome.winner.arrivedAt)} in ·
          fused {formatDuration(outcome.tBio - outcome.winner.arrivedAt)} later. The first arrivals
          waited in the reservoir — travelling furthest fastest is not what wins.
        </p>
      )}
      {!fert && (
        <p className="race-outcome__note caption">
          {outcome.reason === 'oocyte-expired' && 'The oocyte aged out before any competent cell reached it — a real and common outcome.'}
          {outcome.reason === 'population-exhausted' && 'Every cell died, expired or was filtered before fusion — a real and common outcome.'}
          {outcome.reason === 'horizon' && 'Nothing could resolve within the simulation horizon.'}
          {outcome.oocyteCompetent === false &&
            ' Post-hoc: this cycle’s oocyte was not fertilization-competent — no swim, however perfect, could have won.'}
        </p>
      )}
      {Array.isArray(outcome.decisive) && outcome.decisive.length > 0 && (
        <details className="race-outcome__decisive">
          <summary className="label">THE DECISIVE SEQUENCE</summary>
          <ul>
            {outcome.decisive.slice(-8).map((e) => (
              <li key={e.seq} className="caption">
                <span className="race-log__t">{formatBioClock(e.t)}</span> {e.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
