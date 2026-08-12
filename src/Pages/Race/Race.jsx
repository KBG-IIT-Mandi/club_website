import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './Race.css';
import useDocumentTitle from '../../CustomHooks/useDocumentTitle';
import { createSimulation } from '../../race/engine/engine.js';
import { newSeed } from '../../race/engine/rng.js';
import { SEMEN_PRESETS, OVULATION_PRESETS, SPEED_STEPS } from '../../race/engine/presets.js';
import { formatBioClock } from '../../race/engine/units.js';
import { createRaceScene } from './raceScene.js';
import ControlDeck from './ControlDeck.jsx';
import { CountsStrip, FunnelPanel, EventLog, OutcomePlate } from './RacePanels.jsx';
import Inspector from './Inspector.jsx';
import SciencePanel from './SciencePanel.jsx';

/* The whole page (engine included) is a lazy route chunk — the main bundle
   never pays for it. See App.jsx. */

const INITIAL_SEED = newSeed();

export default function Race() {
  useDocumentTitle('The Race');

  const [seed, setSeed] = useState(INITIAL_SEED);
  const [presetId, setPresetId] = useState('who-median');
  const [ovulationOffsetH, setOvulationOffsetH] = useState(4);
  const [mode, setMode] = useState('biology');
  const [epoch, setEpoch] = useState(0);       // bump = rebuild the same race
  const [running, setRunning] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(2); // 600×
  const [snapshot, setSnapshot] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showScience, setShowScience] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [cameraMode, setCameraMode] = useState('auto');

  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const simRef = useRef(null);
  const rendererRef = useRef(null);
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const speedRef = useRef(SPEED_STEPS[speedIdx]);
  speedRef.current = SPEED_STEPS[speedIdx];
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;

  const config = useMemo(() => {
    const preset = SEMEN_PRESETS.find((p) => p.id === presetId) ?? SEMEN_PRESETS[0];
    return { ...preset.config, ovulationOffsetH, mode };
  }, [presetId, ovulationOffsetH, mode]);

  /* ── the simulation lives here ──────────────────────────────────────── */

  useEffect(() => {
    const sim = createSimulation(config, seed);
    simRef.current = sim;
    setSnapshot(sim.getSnapshot());
    setSelectedId(null);
    setRunning(false);
    return () => {
      if (simRef.current === sim) simRef.current = null;
    };
  }, [config, seed, epoch]);

  /* ── canvas + scene lifecycle (the OrganismCanvas discipline) ───────── */

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    let renderer;
    try {
      renderer = createRaceScene(canvas, {
        seed,
        reducedMotion: reduced,
        particleTarget: coarse ? 1200 : (config.visualCount ?? 2600),
      });
    } catch {
      /* No WebGL: the statistics still run — only the film is missing. */
      setGlFailed(true);
      return undefined;
    }
    rendererRef.current = renderer;
    const dprCap = coarse ? 1.3 : 1.75;
    const resize = () => {
      renderer.resize(host.clientWidth || 1, host.clientHeight || 1,
        Math.min(window.devicePixelRatio || 1, dprCap));
      const sim = simRef.current;
      if (sim) renderer.draw(sim.getSnapshot(), sim.peekFinalists(), 16);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    /* Konami mutation recolours --bio: keep the canvas in the loop. */
    const mo = new MutationObserver(() => renderer.refreshPalette());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [seed, epoch, reduced, config.visualCount]);

  /* ── the drive loop: wall clock × speed → biological seconds ────────── */

  useEffect(() => {
    if (reduced) return undefined; // reduced motion: no free-running loop
    let raf = 0;
    let last = performance.now();
    let lastPanel = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dtMs = Math.min(100, now - last);
      last = now;
      const sim = simRef.current;
      if (!sim) return;
      /* The engine runs with or without a picture: when WebGL failed, the
         panels below are still the live instrument. */
      if (runningRef.current && !sim.outcome) {
        sim.step(Math.min(7200, (dtMs / 1000) * speedRef.current));
        if (sim.outcome) setRunning(false);
      }
      if (now - lastPanel > 125) {
        lastPanel = now;
        setSnapshot(sim.getSnapshot());
      }
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.setSelected(selectedRef.current);
        renderer.setCameraMode(cameraModeRef.current);
        renderer.draw(sim.getSnapshot(), sim.peekFinalists(), dtMs);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  /* Reduced motion: draw exactly one calm frame per snapshot. */
  useEffect(() => {
    if (!reduced) return;
    const sim = simRef.current;
    const renderer = rendererRef.current;
    if (sim && renderer) {
      renderer.setSelected(selectedId);
      renderer.draw(snapshot ?? sim.getSnapshot(), sim.peekFinalists(), 16);
    }
  }, [reduced, snapshot, selectedId]);

  /* ── actions ────────────────────────────────────────────────────────── */

  const advance = useCallback((bioSeconds) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.step(bioSeconds);
    setSnapshot(sim.getSnapshot());
  }, []);

  const actions = useMemo(() => ({
    /* Under reduced motion there is no free-running loop — "run" means
       advance a meaningful quantum, so the HUD never lies about motion. */
    toggleRun: () => {
      if (reduced) advance(3600);
      else setRunning((r) => (simRef.current?.outcome ? false : !r));
    },
    stepOnce: () => advance(30),
    advanceHour: () => advance(3600),
    toOutcome: () => {
      const sim = simRef.current;
      if (!sim) return;
      sim.runUntil('outcome');
      setRunning(false);
      setSnapshot(sim.getSnapshot());
    },
    reset: () => setEpoch((e) => e + 1),                    // same seed — replay
    newRace: () => { setSeed(newSeed()); setEpoch((e) => e + 1); },
    setSeedManual: (s) => { setSeed(s >>> 0); setEpoch((e) => e + 1); },
    faster: () => setSpeedIdx((i) => Math.min(SPEED_STEPS.length - 1, i + 1)),
    slower: () => setSpeedIdx((i) => Math.max(0, i - 1)),
    setSpeedIdx,
    setMode,
    setPresetId,
    setOvulationOffsetH,
    toggleCamera: () => setCameraMode((m) => (m === 'auto' ? 'overview' : 'auto')),
    setCameraMode,
  }), [advance, reduced]);

  /* ── keyboard ───────────────────────────────────────────────────────── */

  const showScienceRef = useRef(showScience);
  showScienceRef.current = showScience;

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      /* The science sheet is modal: hotkeys must not drive the race behind
         it, and Escape is its only shortcut. */
      if (showScienceRef.current) {
        if (e.key === 'Escape') setShowScience(false);
        return;
      }
      /* Space on a focused button is the button's activation — native. */
      if (e.key === ' ' && tag === 'BUTTON') return;
      if (e.key === ' ') { e.preventDefault(); actions.toggleRun(); }
      else if (e.key === '.') actions.stepOnce();
      else if (e.key === '+' || e.key === '=') actions.faster();
      else if (e.key === '-') actions.slower();
      else if (e.key === 'r' || e.key === 'R') actions.reset();
      else if (e.key === 'n' || e.key === 'N') actions.newRace();
      else if (e.key === 'v' || e.key === 'V') actions.toggleCamera();
      else if (e.key === 's' || e.key === 'S') setShowScience((v) => !v);
      else if (e.key === 'Escape') setShowScience(false);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const fs = (snapshot?.finalists ?? []).filter((f) => !f.whyEnded);
        if (!fs.length) return;
        const idx = fs.findIndex((f) => f.id === selectedRef.current);
        const next = e.key === 'ArrowRight'
          ? fs[(idx + 1) % fs.length]
          : fs[(idx - 1 + fs.length) % fs.length];
        setSelectedId(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, snapshot]);

  const s = snapshot;

  return (
    <div className="p-race world-lab">
      {/* ── THE INSTRUMENT — full-bleed canvas + HUD overlays ─────────── */}
      <section className="race-stage" aria-label="Race visualization">
        <div ref={hostRef} className="race-canvas-host" data-cursor="observe">
          <canvas ref={canvasRef} className="race-canvas" aria-hidden="true" />
          {glFailed && (
            <p className="race-glfallback caption">
              3D view unavailable on this device — the simulation itself still
              runs below: counts, funnel, events and racers are live.
            </p>
          )}
        </div>

        <div className="race-hud race-hud--tl">
          <p className="label label--live">SPECIMEN RACE · 10⁸ : 1</p>
          <h1 className="race-title">Virtual Sperm Race</h1>
          <p className="race-disclaimer label">
            Educational simulation — not medical or fertility advice
          </p>
          {mode === 'arcade' && (
            <p className="race-arcade-badge label" role="status">
              ARCADE MODE — GAME MECHANICS ACTIVE
            </p>
          )}
        </div>

        <div className="race-hud race-hud--tr" aria-live="off">
          <p className="race-clock" aria-label="Biological clock">
            {formatBioClock(s?.tBio ?? 0)}
          </p>
          <p className="label">
            <span className="race-clock-caption">BIOLOGICAL TIME </span>
            {reduced ? '· MANUAL' : `· ${SPEED_STEPS[speedIdx]}× ${running ? '· RUNNING' : '· HELD'}`}
          </p>
          <p className="label race-seed-line">
            SEED <span className="race-seed">{String(seed >>> 0).padStart(10, '0')}</span>
          </p>
        </div>

        <p className="race-hud race-hud--bl label" aria-hidden="true">
          DISPLAY NOT TO SCALE — RADII LOG-SCALED · TRUE LENGTHS IN MM
        </p>

        {s?.outcome && <OutcomePlate outcome={s.outcome} />}
      </section>

      {/* ── CONTROL DECK ──────────────────────────────────────────────── */}
      <ControlDeck
        running={running}
        reduced={reduced}
        speedIdx={speedIdx}
        seed={seed}
        mode={mode}
        cameraMode={cameraMode}
        presetId={presetId}
        ovulationOffsetH={ovulationOffsetH}
        outcome={s?.outcome ?? null}
        presets={SEMEN_PRESETS}
        ovulationPresets={OVULATION_PRESETS}
        speeds={SPEED_STEPS}
        actions={actions}
        onScience={() => setShowScience(true)}
      />

      {/* ── TELEMETRY ─────────────────────────────────────────────────── */}
      <section className="section race-panels">
        <div className="shell">
          {/* On phones the in-canvas scale note hides to declutter the film;
              the honesty line lives here instead. */}
          <p className="label race-scale-note" aria-hidden="true">
            DISPLAY NOT TO SCALE — RADII LOG-SCALED · TRUE LENGTHS IN MM
          </p>
          <CountsStrip snapshot={s} />
          <div className="race-grid">
            <FunnelPanel snapshot={s} />
            <EventLog snapshot={s} />
            <Inspector
              snapshot={s}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </div>
      </section>

      {showScience && (
        <SciencePanel onClose={() => setShowScience(false)} snapshot={s} />
      )}
    </div>
  );
}
