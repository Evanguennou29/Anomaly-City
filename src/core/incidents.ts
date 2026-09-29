import { featureIndex } from './city';
import type { ActiveIncident, IncidentType } from './types';

export interface IncidentDef {
  type: IncidentType;
  label: string;
  emoji: string;
  color: string;
  targetDistricts: number[];
  description: string;
}

export const INCIDENT_DEFS: Record<IncidentType, IncidentDef> = {
  power: {
    type: 'power',
    label: 'Panne électrique',
    emoji: '⚡',
    color: '#ffb020',
    targetDistricts: [0, 3], // Aurora + Bastion
    description: 'Chute brutale de la consommation électrique dans les quartiers touchés.',
  },
  traffic: {
    type: 'traffic',
    label: 'Embouteillage',
    emoji: '🚦',
    color: '#ff7a45',
    targetDistricts: [1, 4], // Nova + Docks
    description: 'Saturation anormale du trafic routier dans les quartiers touchés.',
  },
  network: {
    type: 'network',
    label: 'Attaque réseau',
    emoji: '🛰️',
    color: '#ff5ea8',
    targetDistricts: [2, 5], // Vertex + Horizon
    description: 'Latence réseau qui explose : attaque ou panne de routage.',
  },
};

/** Enveloppe temporelle lissée (0 → 1 → 0) de l'intensité d'un incident. */
export function incidentEnvelope(inc: ActiveIncident, tick: number): number {
  const dt = tick - inc.startTick;
  const { rampIn, hold, rampOut } = inc;
  let e: number;
  if (dt < rampIn) e = dt / rampIn;
  else if (dt < rampIn + hold) e = 1;
  else if (dt < rampIn + hold + rampOut) e = 1 - (dt - rampIn - hold) / rampOut;
  else e = 0;
  return inc.intensity * smoothstep(e);
}

function smoothstep(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

/**
 * Applique les incidents actifs à un vecteur brut de capteurs.
 * `rand` fournit du bruit (utilisé seulement par l'attaque réseau).
 */
export function applyIncidents(
  raw: number[],
  active: ActiveIncident[],
  rand: () => number,
  tick: number,
): number[] {
  const out = raw.slice();
  for (const inc of active) {
    const intensity = incidentEnvelope(inc, tick);
    if (intensity <= 0) continue;

    for (const dId of inc.targetDistricts) {
      if (inc.type === 'power') {
        const iP = featureIndex(dId, 'power');
        out[iP] *= 1 - 0.85 * intensity; // effondrement de la consommation
        const iL = featureIndex(dId, 'latency');
        out[iL] *= 1 + 0.5 * intensity; // générateurs de secours
      } else if (inc.type === 'traffic') {
        const iT = featureIndex(dId, 'traffic');
        out[iT] *= 1 + 1.9 * intensity; // saturation
        const iL = featureIndex(dId, 'latency');
        out[iL] *= 1 + 0.35 * intensity;
      } else {
        // network
        const iL = featureIndex(dId, 'latency');
        out[iL] *= 1 + 6.5 * intensity + 2.2 * intensity * (rand() * 2 - 1);
      }
    }
  }
  return out;
}
