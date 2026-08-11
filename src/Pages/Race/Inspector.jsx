import React from 'react';
import { formatBioClock, formatDuration } from '../../race/engine/units.js';

/* Spotlight roster + selected-racer inspector. The roster is a SAMPLE of
   named finalists — a handful of the ~10³ tube arrivals, who are themselves
   weighted representatives of the 10⁸ field. Never "the whole population". */

const STATE_LABEL = {
  uncapacitated: 'UNCAPACITATED',
  capacitating: 'CAPACITATING',
  capacitated: 'CAPACITATED',
  hyperactivated: 'HYPERACTIVATED',
  'acrosome-reacted': 'ACROSOME-REACTED',
  fused: 'FUSED ★',
  immotile: 'IMMOTILE',
  filtered: 'FILTERED',
  damaged: 'DAMAGED',
  dead: 'LOST',
  'premature-acrosome-reaction': 'PREMATURE AR',
  'expired-capacitated-window': 'WINDOW EXPIRED',
};

const rosterScore = (f) => {
  const stateRank = { fused: 6, 'acrosome-reacted': 5, hyperactivated: 4, capacitated: 3, capacitating: 1 }[f.state] ?? 0;
  const phaseRank = { penetrating: 5, zona: 4, cumulus: 3, search: 2, reservoir: 1 }[f.phase] ?? 0;
  return stateRank * 10 + phaseRank + (f.whyEnded ? -100 : 0);
};

export default function Inspector({ snapshot: s, selectedId, onSelect }) {
  if (!s) return null;
  const roster = [...(s.finalists ?? [])]
    .sort((a, b) => rosterScore(b) - rosterScore(a) || a.arrivedAt - b.arrivedAt)
    .slice(0, 8);
  const selected =
    s.finalists?.find((f) => f.id === selectedId) ??
    (s.outcome?.type === 'fertilization' ? s.outcome.winner : roster[0]) ?? null;

  return (
    <article className="entry race-panel" aria-label="Spotlight roster and inspector">
      <p className="label label--live">SPOTLIGHT ROSTER</p>
      <p className="caption race-panel__note">
        Eight named racers from the tubal cohort — representatives, not the whole field.
        ← → to cycle.
      </p>
      <ul className="race-roster">
        {roster.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className={`race-roster__row ${selected?.id === f.id ? 'is-selected' : ''} ${f.whyEnded ? 'is-ended' : ''}`}
              onClick={() => onSelect(f.id)}
              aria-pressed={selected?.id === f.id}
            >
              <span className="race-roster__name">{f.callsign}</span>
              <span className="race-roster__state label">{STATE_LABEL[f.state] ?? f.state}</span>
            </button>
          </li>
        ))}
        {roster.length === 0 && (
          <li className="caption">No cells have reached the tubes yet.</li>
        )}
      </ul>

      {selected && (
        <div className="race-inspect">
          <p className="race-inspect__name">{selected.callsign}</p>
          <dl className="race-inspect__grid">
            <div><dt className="label">STATE</dt><dd>{STATE_LABEL[selected.state] ?? selected.state}</dd></div>
            <div><dt className="label">POSITION</dt><dd>{selected.stage} · {selected.sMm?.toFixed(1)} mm</dd></div>
            <div><dt className="label">CHROMOSOME</dt><dd>{selected.sexChromosome} (no speed effect)</dd></div>
            <div><dt className="label">WEIGHT</dt><dd>represents ≈{Math.max(1, Math.round(selected.weight))} cells</dd></div>
            <div><dt className="label">ENERGY</dt><dd>{Math.round((selected.energy ?? 0) * 100)}%</dd></div>
            <div><dt className="label">VSL₀</dt><dd>{selected.vsl0UmS?.toFixed(1)} µm/s</dd></div>
            {selected.casa && (
              <>
                <div><dt className="label">VCL / VSL / VAP</dt>
                  <dd>{selected.casa.vcl.toFixed(0)} / {selected.casa.vsl.toFixed(0)} / {selected.casa.vap.toFixed(0)} µm/s</dd></div>
                <div><dt className="label">LIN / STR</dt>
                  <dd>{selected.casa.lin.toFixed(2)} / {selected.casa.str.toFixed(2)}</dd></div>
              </>
            )}
          </dl>

          {selected.whyEnded && (
            <p className="race-inspect__why">
              <span className="label label--live">WHY FILTERED · {formatBioClock(selected.whyEnded.t)}</span>
              <span className="caption">{selected.whyEnded.cause}</span>
            </p>
          )}

          <p className="label race-inspect__histlabel">STATE HISTORY</p>
          <ul className="race-inspect__hist">
            {selected.history?.map((h, i) => (
              <li key={i} className="caption">
                <span className="race-log__t">{formatBioClock(h.t)}</span>{' '}
                {h.to}{h.cause ? ` — ${h.cause}` : ''}
              </li>
            ))}
          </ul>
          {selected.capDoneAt != null && !selected.whyEnded && selected.state === 'capacitating' && (
            <p className="caption">
              Capacitation projected {formatDuration(Math.max(0, selected.capDoneAt - s.tBio))} from now
              {selected.capDoneAt === null ? '' : ' (individual, stochastic)'}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
