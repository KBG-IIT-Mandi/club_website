import React, { useEffect, useRef } from 'react';
import { PARAM_LIST } from '../../race/engine/biologyParameters.js';
import { STAGES } from '../../race/engine/stages.js';

/* The assumptions & references drawer: the parameter registry rendered
   verbatim — id, value, units, distribution, source, confidence, and
   whether it is measured, inferred, or a gameplay choice. Nothing is
   hidden; this panel IS the model's honesty. */

const GROUPS = [
  ['semen', 'THE SAMPLE'],
  ['motion', 'MOTION'],
  ['transport', 'TRANSPORT'],
  ['vagina', 'VAGINA'],
  ['cervix', 'CERVIX'],
  ['uterus', 'UTERUS'],
  ['utj', 'UTEROTUBAL JUNCTION'],
  ['isthmus', 'ISTHMUS RESERVOIR'],
  ['capacitation', 'CAPACITATION'],
  ['ampulla', 'AMPULLA'],
  ['oocyte', 'OOCYTE'],
  ['survival', 'SURVIVAL'],
  ['energy', 'ENERGY'],
  ['sim', 'MODEL RESOLUTION'],
  ['arcade', 'ARCADE (GAME MECHANICS)'],
];

export default function SciencePanel({ onClose }) {
  const closeRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    /* Modal discipline: remember the opener, trap Tab inside the sheet,
       restore focus on close. */
    const opener = document.activeElement;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = sheet.querySelectorAll(
        'button, a[href], summary, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="race-science" role="dialog" aria-modal="true" aria-label="Scientific assumptions and references">
      <div className="race-science__scrim" onClick={onClose} aria-hidden="true" />
      <div className="race-science__sheet" ref={sheetRef}>
        <div className="race-science__head">
          <p className="label label--live">ASSUMPTIONS &amp; SOURCES</p>
          <button ref={closeRef} type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="caption">
          Educational simulation — not medical or fertility advice, and not a
          fertility predictor. What follows is the complete parameter registry
          the engine runs on: every value with its units, distribution, source,
          confidence, and an honesty flag — <b>measured</b> (a cited source
          reports it), <b>inferred</b> (derived or calibrated from cited
          evidence), or <b>gameplay</b> (a model/game choice with no biological
          claim). WHO reference limits are population percentiles, not
          fertility verdicts. Full discussion in SCIENCE.md; citations in
          SOURCES.md in the repository.
        </p>

        <h2 className="race-science__h">What the race teaches</h2>
        <ul className="tick-list">
          <li>The cell that travels furthest first is usually NOT the one that fertilizes — early arrivals wait in the isthmic reservoir.</li>
          <li>Uterine and tubal contractions, not swimming, do the long-haul transport (minutes-scale first arrivals).</li>
          <li>Mucus, the uterotubal junction, capacitation timing, tract conditions and plain chance all select; nobody attacks anybody.</li>
          <li>Chemotaxis works only for capacitated cells, only near the oocyte. Hyperactivation is violent turning, not a speed boost.</li>
          <li>X- and Y-bearing sperm get no fictional speed difference.</li>
          <li>In Biology Mode the honest outcome may be NO fertilization; Arcade Mode's guaranteed finish is a labelled game mechanic.</li>
        </ul>

        <h2 className="race-science__h">The stages</h2>
        {STAGES.map((st) => (
          <details key={st.id} className="race-science__stage">
            <summary>
              <span className="label">{st.name}</span>
              <span className="tag">{st.kind}{st.lengthMm ? ` · ${st.lengthMm} mm` : ''} · confidence {st.confidence}</span>
            </summary>
            <p className="caption">{st.explain}</p>
          </details>
        ))}

        <h2 className="race-science__h">The parameter registry</h2>
        {GROUPS.map(([prefix, title]) => {
          const rows = PARAM_LIST.filter((p) => p.id.startsWith(`${prefix}.`));
          if (!rows.length) return null;
          return (
            <section key={prefix} className="race-science__group">
              <p className="label label--data">{title}</p>
              <div className="race-science__tablewrap">
                <table className="race-science__table">
                  <thead>
                    <tr>
                      <th>parameter</th><th>value</th><th>distribution</th>
                      <th>kind</th><th>confidence</th><th>source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className={p.kind === 'gameplay' ? 'is-gameplay' : ''}>
                        <td>
                          <span className="race-science__pid">{p.id}</span>
                          <span className="race-science__explain">{p.explain}</span>
                        </td>
                        <td>{p.value} {p.units}</td>
                        <td>{p.dist}</td>
                        <td>{p.kind}</td>
                        <td>{p.confidence}</td>
                        <td>
                          {p.url && p.url !== 'SCIENCE.md' ? (
                            <a href={p.url} target="_blank" rel="noreferrer">{p.source}</a>
                          ) : (
                            p.source
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <h2 className="race-science__h">Why this cannot predict fertility</h2>
        <p className="caption">
          The model is calibrated to population-scale literature, then run with
          seeded randomness. It contains no information about any person, and
          most clinically decisive variables (genetics, tract pathology, embryo
          development, implantation) are not modelled at all. Identical inputs
          give identical races — real biology never does.
        </p>
      </div>
    </div>
  );
}
