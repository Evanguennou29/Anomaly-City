import { useSnapshot } from '../hooks/useSnapshot';

/** État du modèle, seuil calibré, métriques réelles et explication pédagogique. */
export function ModelPanel() {
  const s = useSnapshot();
  const m = s.modelStats;
  const metrics = s.metrics;

  return (
    <section className="panel model-panel" aria-label="État du modèle et explication">
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

      <details className="how-it-works">
        <summary>Comment fonctionne le modèle ?</summary>
        <div className="how-body">
          <p>
            Un <strong>autoencodeur</strong> est un réseau de neurones qui apprend à <em>recopier</em> son entrée à
            travers un goulot d'étranglement. On ne lui montre que des journées <strong>normales</strong> : il apprend
            les corrélations habituelles entre électricité, trafic et latence des 6 quartiers.
          </p>
          <p>
            À chaque instant, le modèle tente de reconstruire les 18 capteurs. Le <strong>score d'anomalie</strong> est
            l'écart entre l'entrée et cette reconstruction : plus l'écart est grand, plus la situation est inhabituelle.
          </p>
          <p>
            Le <strong>seuil</strong> n'est pas arbitraire : il est calibré sur un jeu de validation normal
            (99<sup>e</sup> centile des erreurs). Quand le score dépasse ce seuil de façon persistante, l'incident est
            signalé, et l'on remonte aux capteurs qui ont le plus contribué à l'erreur.
          </p>
          <p className="how-note">
            ⚠️ Toutes les données et métriques de cette démonstration sont <strong>100 % simulées</strong>, générées de
            façon reproductible dans votre navigateur. Aucune donnée réelle n'est utilisée.
          </p>
        </div>
      </details>
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
