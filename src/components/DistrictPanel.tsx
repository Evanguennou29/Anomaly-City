import { SIGNAL_LABELS, SIGNAL_UNITS, type SignalKey } from '../core/types';
import { useSnapshot } from '../hooks/useSnapshot';

const SIGNALS: SignalKey[] = ['power', 'traffic', 'latency'];

/** Capteurs par quartier, avec barres relatives et mise en évidence des contributeurs. */
export function DistrictPanel() {
  const s = useSnapshot();
  const contributorIds = new Set(s.contributions.map((c) => c.districtId));

  return (
    <section className="panel" aria-label="Capteurs par quartier">
      <header className="panel-head">
        <h2 className="panel-title">Quartiers & capteurs</h2>
        <span className="panel-meta">18 capteurs simulés</span>
      </header>

      <div className="district-grid">
        {s.districts.map((d) => (
          <div
            key={d.id}
            className={`district-card status-${d.status}${contributorIds.has(d.id) ? ' is-contributor' : ''}`}
          >
            <div className="district-card-head">
              <span className="status-dot" aria-hidden="true" />
              <span className="district-name">{d.name}</span>
              <span className="district-code">{d.code}</span>
            </div>
            <div className="sig-list">
              {SIGNALS.map((sig) => {
                const value = d.signalValues[sig];
                const base = d.base[sig];
                const ratio = value / base;
                const pct = Math.max(0, Math.min(1.5, ratio)) / 1.5;
                const over = ratio > 1.35 || ratio < 0.6;
                return (
                  <div key={sig} className="sig-row">
                    <span className="sig-name">{SIGNAL_LABELS[sig]}</span>
                    <span className={`sig-val${over ? ' sig-over' : ''}`}>
                      {Math.round(value)} <small>{SIGNAL_UNITS[sig]}</small>
                    </span>
                    <span className="sig-bar">
                      <span className="sig-bar-fill" style={{ width: `${pct * 100}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
