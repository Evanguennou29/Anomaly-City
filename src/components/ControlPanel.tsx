import type { CSSProperties } from 'react';
import { INCIDENT_DEFS } from '../core/incidents';
import type { IncidentType } from '../core/types';
import { useSnapshot } from '../hooks/useSnapshot';
import { engine } from '../sim/engine';

const INCIDENT_ORDER: IncidentType[] = ['power', 'traffic', 'network'];

export function ControlPanel() {
  const s = useSnapshot();
  const ready = s.detectorReady;
  const running = s.runState === 'running';

  return (
    <section className="panel controls" aria-label="Contrôles de la simulation">
      <header className="panel-head">
        <h2 className="panel-title">Contrôle</h2>
      </header>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => engine.toggle()} disabled={!ready}>
          {running ? '❚❚ Pause' : s.runState === 'paused' ? '▶ Reprendre' : '▶ Lancer'}
        </button>
        <button className="btn btn-ghost" onClick={() => engine.reset()} disabled={!ready}>
          ↺ Réinitialiser
        </button>
      </div>

      <div className="intensity">
        <label htmlFor="intensity">Intensité des incidents</label>
        <div className="intensity-row">
          <input
            id="intensity"
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={s.intensity}
            onChange={(e) => engine.setIntensity(Number(e.target.value))}
          />
          <span className="intensity-val">{Math.round(s.intensity * 100)} %</span>
        </div>
      </div>

      <div className="incident-btns">
        {INCIDENT_ORDER.map((type) => {
          const def = INCIDENT_DEFS[type];
          return (
            <button
              key={type}
              className="incident-btn"
              style={{ '--inc-color': def.color } as CSSProperties}
              onClick={() => engine.triggerIncident(type)}
              disabled={!ready}
              title={`${def.label} — ${def.description}`}
            >
              <span className="inc-emoji" aria-hidden="true">
                {def.emoji}
              </span>
              <span className="inc-label">{def.label}</span>
              <span className="inc-desc">{def.description}</span>
            </button>
          );
        })}
      </div>

      <p className="keyboard-hint">
        Raccourcis : <kbd>Espace</kbd> pause · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> incidents · <kbd>R</kbd> reset
      </p>
    </section>
  );
}
