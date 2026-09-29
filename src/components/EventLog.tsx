import type { LogLevel } from '../core/types';
import { useSnapshot } from '../hooks/useSnapshot';

function formatTime(t: number): string {
  const s = Math.floor(t);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const LEVEL_ICON: Record<LogLevel, string> = {
  info: 'ℹ',
  warn: '⚠',
  good: '✓',
  danger: '⛔',
};

/** Journal des événements (détections, incidents, états). */
export function EventLog() {
  const s = useSnapshot();
  return (
    <section className="panel log-panel" aria-label="Journal des événements">
      <header className="panel-head">
        <h2 className="panel-title">Journal</h2>
        <span className="panel-meta">{s.log.length} entrées</span>
      </header>
      <ol className="log">
        {s.log.length === 0 ? (
          <li className="log-empty">Aucun événement pour l'instant.</li>
        ) : (
          s.log.slice(0, 40).map((entry) => (
            <li key={entry.id} className={`log-entry level-${entry.level}`}>
              <span className="log-time">{formatTime(entry.simTime)}</span>
              <span className="log-icon" aria-hidden="true">
                {LEVEL_ICON[entry.level]}
              </span>
              <span className="log-text">{entry.text}</span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
