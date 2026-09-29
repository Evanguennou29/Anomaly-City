import { useSnapshot } from '../hooks/useSnapshot';

const W = 640;
const H = 240;
const PAD_X = 6;
const PAD_TOP = 18;
const PAD_BOTTOM = 16;

/** Courbe du score d'anomalie (erreur de reconstruction) + seuil, synchronisée. */
export function ScoreChart() {
  const s = useSnapshot();
  const { history, threshold } = s;
  const n = history.length;

  let maxVal = Math.max(threshold * 1.8, 0.05);
  for (const p of history) maxVal = Math.max(maxVal, p.raw * 1.1, p.score * 1.1);

  const xOf = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - PAD_X * 2));
  const yOf = (v: number) => H - PAD_BOTTOM - (v / maxVal) * (H - PAD_BOTTOM - PAD_TOP);

  let rawD = '';
  let scoreD = '';
  for (let i = 0; i < n; i++) {
    const x = xOf(i).toFixed(1);
    rawD += `${i === 0 ? 'M' : 'L'}${x} ${yOf(history[i].raw).toFixed(1)} `;
    scoreD += `${i === 0 ? 'M' : 'L'}${x} ${yOf(history[i].score).toFixed(1)} `;
  }
  const areaD = scoreD
    ? `${scoreD}L${xOf(n - 1).toFixed(1)} ${H - PAD_BOTTOM} L${xOf(0).toFixed(1)} ${H - PAD_BOTTOM} Z`
    : '';

  const segs: { x: number; w: number }[] = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (history[i].detected && start < 0) start = i;
    if ((!history[i].detected || i === n - 1) && start >= 0) {
      const end = history[i].detected ? i : i - 1;
      if (end >= start) segs.push({ x: xOf(start), w: Math.max(2, xOf(end) - xOf(start)) });
      start = -1;
    }
  }

  const thrY = yOf(threshold);

  return (
    <section className="panel chart-panel" aria-label="Évolution du score d'anomalie">
      <header className="panel-head">
        <h2 className="panel-title">Score d'anomalie</h2>
        <div className="chart-meta">
          <span className="meta-item">
            Score <b className={s.detected ? 'text-danger' : 'text-cyan'}>{s.score.toFixed(2)}</b>
          </span>
          <span className="meta-item">
            Seuil <b className="text-amber">{threshold.toFixed(2)}</b>
          </span>
          <span className={`meta-item state-${s.detected ? 'danger' : 'ok'}`}>
            {s.detected ? 'ANOMALIE' : 'NOMINAL'}
          </span>
        </div>
      </header>

      {n === 0 ? (
        <div className="chart-empty">En attente de données… lancez la simulation.</div>
      ) : (
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="scoreArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#35e0ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#35e0ff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {segs.map((seg, i) => (
            <rect key={i} x={seg.x} y={0} width={seg.w} height={H} fill="rgba(255,77,109,0.14)" />
          ))}

          {/* ligne de seuil */}
          <line x1={PAD_X} y1={thrY} x2={W - PAD_X} y2={thrY} stroke="#ffb020" strokeWidth="1.4" strokeDasharray="6 4" />
          <text x={W - PAD_X} y={thrY - 5} textAnchor="end" className="chart-label" fill="#ffb020">
            seuil
          </text>

          {areaD && <path d={areaD} fill="url(#scoreArea)" />}
          {rawD && <path d={rawD} fill="none" stroke="#35e0ff" strokeOpacity="0.25" strokeWidth="1" />}
          {scoreD && (
            <path
              d={scoreD}
              fill="none"
              stroke={s.detected ? '#ff4d6d' : '#35e0ff'}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}

      <footer className="chart-foot">
        <span>{n} échantillons</span>
        <span>erreur de reconstruction lissée (MSE)</span>
      </footer>
    </section>
  );
}
