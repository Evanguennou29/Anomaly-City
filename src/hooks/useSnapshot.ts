import { useSyncExternalStore } from 'react';
import { engine } from '../sim/engine';
import type { Snapshot } from '../core/types';

/** Abonne un composant à l'état de la simulation. */
export function useSnapshot(): Snapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}
