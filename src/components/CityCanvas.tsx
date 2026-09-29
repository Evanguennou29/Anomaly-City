import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../render/cityRenderer';
import { engine } from '../sim/engine';
import { useSnapshot } from '../hooks/useSnapshot';

/**
 * Vue isométrique de la ville (canvas 2D). Si le canvas 2D n'est pas
 * disponible, bascule sur un rendu de secours en CSS.
 */
export function CityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: CityRenderer | null = null;
    try {
      renderer = new CityRenderer(canvas, () => engine.getLive());
    } catch {
      setFallback(true);
      return;
    }
    return () => renderer?.destroy();
  }, []);

  if (fallback) return <FallbackCity />;

  return (
    <canvas
      ref={canvasRef}
      className="city-canvas"
      role="img"
      aria-label="Vue isométrique animée de la ville ANOMALY CITY"
    />
  );
}

function FallbackCity() {
  const s = useSnapshot();
  return (
    <div className="city-fallback" role="img" aria-label="Vue simplifiée de la ville">
      {s.districts.map((d) => (
        <div key={d.id} className={`fallback-district status-${d.status}`}>
          <span className="fallback-dot" />
          <span className="fallback-name">{d.name}</span>
          <span className="fallback-val">
            {Math.round(d.signalValues.power)} MW · {Math.round(d.signalValues.traffic)} véh/min ·{' '}
            {Math.round(d.signalValues.latency)} ms
          </span>
        </div>
      ))}
    </div>
  );
}
