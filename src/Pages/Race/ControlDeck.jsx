import React, { useState } from 'react';

/* The transport + configuration deck. Square instruments, mono labels —
   everything here writes CONFIG; the engine re-runs deterministically from
   (config, seed), so each change is a fresh, comparable race. */

export default function ControlDeck({
  running, reduced, speedIdx, seed, mode, cameraMode, presetId, ovulationOffsetH,
  outcome, presets, ovulationPresets, speeds, actions, onScience,
}) {
  const [seedDraft, setSeedDraft] = useState('');

  return (
    <section className="race-deck" aria-label="Simulation controls">
      <div className="shell race-deck__inner">
        {/* transport */}
        <div className="race-deck__group race-deck__group--transport" role="group" aria-label="Transport">
          {reduced ? (
            <>
              <button type="button" className="btn-primary" onClick={actions.advanceHour} disabled={!!outcome}>
                Advance 1h
              </button>
              <button type="button" className="btn-ghost" onClick={actions.stepOnce} disabled={!!outcome}>
                Step 30s
              </button>
              <button type="button" className="btn-ghost" onClick={actions.toOutcome} disabled={!!outcome}>
                To outcome
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={actions.toggleRun}
                disabled={!!outcome}
                aria-pressed={running}
              >
                {running ? 'Pause' : 'Start'}
              </button>
              <button type="button" className="btn-ghost" onClick={actions.stepOnce} disabled={!!outcome}>
                Step
              </button>
              <button type="button" className="btn-ghost" onClick={actions.toOutcome} disabled={!!outcome}>
                Fast-forward
              </button>
            </>
          )}
          <button type="button" className="btn-ghost" onClick={actions.reset}>
            Replay seed
          </button>
          <button type="button" className="btn-ghost" onClick={actions.newRace}>
            New race
          </button>
        </div>

        {/* speed */}
        {!reduced && (
          <div className="race-deck__group race-deck__group--time" role="group" aria-label="Time scale">
            <span className="label">TIME ×</span>
            {speeds.map((sp, i) => (
              <button
                key={sp}
                type="button"
                className={`race-chip ${i === speedIdx ? 'is-on' : ''}`}
                onClick={() => actions.setSpeedIdx(i)}
                aria-pressed={i === speedIdx}
              >
                {sp >= 3600 ? `${sp / 3600}h/s` : sp >= 60 ? `${sp / 60}m/s` : '1:1'}
              </button>
            ))}
          </div>
        )}

        {/* camera */}
        <div className="race-deck__group race-deck__group--camera" role="group" aria-label="Camera">
          <span className="label">CAMERA</span>
          <button
            type="button"
            className={`race-chip race-chip--arcade ${cameraMode === 'auto' ? 'is-on' : ''}`}
            onClick={() => actions.setCameraMode('auto')}
            aria-pressed={cameraMode === 'auto'}
            title="The director follows the race shot by shot"
          >
            Director
          </button>
          <button
            type="button"
            className={`race-chip race-chip--arcade ${cameraMode === 'overview' ? 'is-on' : ''}`}
            onClick={() => actions.setCameraMode('overview')}
            aria-pressed={cameraMode === 'overview'}
            title="The whole anatomy, front-on (V)"
          >
            Anatomy view
          </button>
        </div>

        {/* mode */}
        <div className="race-deck__group race-deck__group--mode" role="group" aria-label="Mode">
          <span className="label">MODE</span>
          <button
            type="button"
            className={`race-chip ${mode === 'biology' ? 'is-on' : ''}`}
            onClick={() => actions.setMode('biology')}
            aria-pressed={mode === 'biology'}
          >
            Biology mode
          </button>
          <button
            type="button"
            className={`race-chip race-chip--arcade ${mode === 'arcade' ? 'is-on' : ''}`}
            onClick={() => actions.setMode('arcade')}
            aria-pressed={mode === 'arcade'}
            title="Guaranteed finish + hazard relief — labelled game mechanics, not biology"
          >
            Arcade mode
          </button>
        </div>

        {/* sample presets */}
        <div className="race-deck__group race-deck__group--sample" role="group" aria-label="Semen profile preset">
          <span className="label">SAMPLE</span>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`race-chip ${p.id === presetId ? 'is-on' : ''}`}
              onClick={() => actions.setPresetId(p.id)}
              aria-pressed={p.id === presetId}
              title={p.note}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* ovulation offset */}
        <div className="race-deck__group race-deck__group--ov" role="group" aria-label="Ovulation timing">
          <label className="label" htmlFor="ov-offset">
            OVULATION {ovulationOffsetH >= 0 ? `T+${ovulationOffsetH}H` : `T−${-ovulationOffsetH}H`}
          </label>
          <input
            id="ov-offset"
            type="range"
            min={-24}
            max={48}
            step={1}
            value={ovulationOffsetH}
            onChange={(e) => actions.setOvulationOffsetH(Number(e.target.value))}
            className="race-slider"
          />
          <div className="race-deck__ovchips">
            {ovulationPresets.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`race-chip ${o.offsetH === ovulationOffsetH ? 'is-on' : ''}`}
                onClick={() => actions.setOvulationOffsetH(o.offsetH)}
                title={o.note}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* seed entry + science */}
        <div className="race-deck__group race-deck__group--seed" role="group" aria-label="Seed">
          <label className="label" htmlFor="seed-input">SEED</label>
          <input
            id="seed-input"
            className="race-seed-input"
            inputMode="numeric"
            placeholder={String(seed >>> 0)}
            value={seedDraft}
            onChange={(e) => setSeedDraft(e.target.value.replace(/\D/g, '').slice(0, 10))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && seedDraft) {
                actions.setSeedManual(Number(seedDraft));
                setSeedDraft('');
              }
            }}
          />
          <button
            type="button"
            className="race-chip"
            onClick={() => {
              if (seedDraft) { actions.setSeedManual(Number(seedDraft)); setSeedDraft(''); }
            }}
          >
            Load
          </button>
          <button type="button" className="btn-ghost race-deck__science" onClick={onScience}>
            Assumptions &amp; sources
          </button>
        </div>
      </div>
    </section>
  );
}
