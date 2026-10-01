import { useSnapshot } from '../hooks/useSnapshot';

/** État du modèle, seuil calibré et métriques calculées. */
export function ModelPanel() {
  const s = useSnapshot();
  const m = s.modelStats;
  const metrics = s.metrics;

  return (
    <section className="panel model-panel" aria-label="État du modèle et métriques">
      <header className="panel-head">
        <h2 className="panel-title">Modèle</h2>
        <span className={`chip chip-${s.modelPhase}`}>{modelLabel(s.modelPhase, s.trainingProgress)}</span>
      </header>

      {s.modelPhase === 'training' && (
        <div className="train-progress">
          <div className="train-bar">
            <span style={{ width: `${Math.round(s.trainingProgress * 100)}%` }} />
          </div>
          <p className="train-detail">{s.trainingDetail}</p>
        </div>
      )}

      {m && (
        <div className="model-grid">
          <div className="stat">
            <span className="stat-label">Architecture</span>
            <span className="stat-value">Autoencodeur 18→12→6→12→18</span>
          </div>
          <div className="stat">
            <span className="stat-label">Perte finale (train)</span>
            <span className="stat-value">{m.finalLoss.toFixed(4)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Époques</span>
            <span className="stat-value">{m.epochs}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Seuil (p99 validation)</span>
            <span className="stat-value text-amber">{s.threshold.toFixed(3)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Erreur val. · moyenne / σ</span>
            <span className="stat-value">
              {m.thresholdMean.toFixed(3)} / {m.thresholdStd.toFixed(3)}
            </span>
          </div>
        </div>
      )}

      {metrics && (
        <div className="metrics">
          <h3 className="metrics-title">Métriques calculées (séquences simulées étiquetées)</h3>
          <div className="metric-row">
            <Metric label="Précision" value={metrics.metrics.precision} />
            <Metric label="Rappel" value={metrics.metrics.recall} />
            <Metric label="F1" value={metrics.metrics.f1} />
          </div>
          <div className="metric-row">
            <div className="metric">
              <span className="metric-label">Faux positifs (normal)</span>
              <span className="metric-value">{(metrics.normalFalsePositiveRate * 100).toFixed(1)} %</span>
            </div>
            <div className="metric">
              <span className="metric-label">TP / FP / FN</span>
              <span className="metric-value">
                {metrics.metrics.tp} / {metrics.metrics.fp} / {metrics.metrics.fn}
              </span>
            </div>
          </div>
          <div className="scenario-list">
            {metrics.scenarios.map((sc) => (
              <div key={sc.type} className="scenario-row">
                <span className="scenario-name">{sc.label}</span>
                <span className="scenario-bar">
                  <span style={{ width: `${Math.round(sc.recall * 100)}%` }} />
                </span>
                <span className="scenario-val">rappel {Math.round(sc.recall * 100)} %</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value.toFixed(3)}</span>
    </div>
  );
}

function modelLabel(phase: string, progress: number): string {
  switch (phase) {
    case 'training':
      return `Entraînement ${Math.round(progress * 100)} %`;
    case 'ready':
      return 'Prêt';
    case 'error':
      return 'Erreur';
    default:
      return 'Chargement…';
  }
}
