import { useEffect } from 'react';
import { useSnapshot } from './hooks/useSnapshot';
import { engine } from './sim/engine';
import type { IncidentType } from './core/types';
import { CityCanvas } from './components/CityCanvas';
import { ScoreChart } from './components/ScoreChart';
import { ControlPanel } from './components/ControlPanel';
import { DistrictPanel } from './components/DistrictPanel';
import { EventLog } from './components/EventLog';
import { ModelPanel } from './components/ModelPanel';
import { HowItWorks } from './components/HowItWorks';

const INCIDENT_KEYS: Record<string, IncidentType> = {
  '1': 'power',
  '2': 'traffic',
  '3': 'network',
};

export default function App() {
  const s = useSnapshot();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = (el?.tagName ?? '').toUpperCase();
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === ' ' && !typing && tag !== 'BUTTON') {
        e.preventDefault();
        engine.toggle();
      } else if ((e.key === 'r' || e.key === 'R') && !typing) {
        engine.reset();
      } else if (!typing && INCIDENT_KEYS[e.key]) {
        engine.triggerIncident(INCIDENT_KEYS[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ready = s.detectorReady;
  const running = s.runState === 'running';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>
            ANOMALY <span className="brand-accent">CITY</span>
          </h1>
          <p className="tagline">Centre de contrôle · détection d'anomalies par autoencodeur</p>
        </div>

        <div className="top-right">
          <span className={`chip chip-${s.modelPhase}`} aria-live="polite">
            {s.modelPhase === 'training'
              ? `Entraînement ${Math.round(s.trainingProgress * 100)} %`
              : s.modelPhase === 'ready'
                ? 'MODÈLE PRÊT'
                : s.modelPhase === 'error'
                  ? 'ERREUR MODÈLE'
                  : 'INITIALISATION…'}
          </span>
          <div className="score-readout">
            <span className="score-label">SCORE</span>
            <span className={`score-value${s.detected ? ' is-danger' : ''}`}>{s.score.toFixed(2)}</span>
            <span className="score-threshold">
              seuil <b>{s.threshold.toFixed(2)}</b>
            </span>
          </div>
        </div>
      </header>

      <main className="main-layout">
        <div className="col-main">
          <section className="city-stage" aria-label="Ville">
            <CityCanvas />

            {s.detected && (
              <div className="alert-banner" role="alert">
                <span className="alert-pulse" aria-hidden="true" />
                ANOMALIE DÉTECTÉE
              </div>
            )}

            {!running && (
              <div className="stage-overlay">
                {s.runState === 'idle' ? (
                  <button className="launch-btn" onClick={() => engine.start()} disabled={!ready}>
                    <span className="launch-icon" aria-hidden="true">
                      {ready ? '▶' : '◌'}
                    </span>
                    <span>
                      {ready
                        ? 'Lancer la simulation'
                        : `Initialisation du modèle… ${Math.round(s.trainingProgress * 100)} %`}
                    </span>
                    <span className="launch-sub">{ready ? 'flux normal en direct' : s.trainingDetail}</span>
                  </button>
                ) : (
                  <button className="launch-btn" onClick={() => engine.start()}>
                    <span className="launch-icon" aria-hidden="true">
                      ▶
                    </span>
                    <span>Reprendre la simulation</span>
                    <span className="launch-sub">en pause</span>
                  </button>
                )}
              </div>
            )}
          </section>

          <ScoreChart />
          <HowItWorks />
        </div>

        <div className="col-side">
          <ControlPanel />
          <DistrictPanel />
          <EventLog />
          <ModelPanel />
        </div>
      </main>
    </div>
  );
}
