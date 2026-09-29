import { normalSampleAt } from '../core/dataGenerator';
import { INCIDENT_DEFS, applyIncidents } from '../core/incidents';
import { mulberry32 } from '../core/prng';
import type { ActiveIncident, IncidentType, SelfTestResult } from '../core/types';
import type { Detector } from './autoencoder';
import { computeBinaryMetrics, ema } from './metrics';

const EMA_ALPHA = 0.22;
const WINDOW = 40; // échantillons normaux avant le début de l'incident

/**
 * Évalue le détecteur sur des séquences simulées étiquetées et renvoie
 * uniquement des métriques réellement calculées (aucune valeur inventée).
 */
export async function runSelfTest(detector: Detector): Promise<SelfTestResult> {
  const predicted: boolean[] = [];
  const truth: boolean[] = [];
  const scenarios: { type: IncidentType; label: string; recall: number; samples: number }[] = [];

  // 1) Séquence 100 % normale → mesure du taux de faux positifs.
  let normalFalsePositiveRate = 0;
  {
    const n = 200;
    let s: number | null = null;
    let fp = 0;
    for (let t = 0; t < n; t++) {
      const { raw } = await detector.score(normalSampleAt(t, 909));
      s = s === null ? raw : ema(s, raw, EMA_ALPHA);
      if (s > detector.threshold) fp++;
    }
    normalFalsePositiveRate = fp / n;
  }

  // 2) Une séquence étiquetée par type d'incident.
  const types: IncidentType[] = ['power', 'traffic', 'network'];
  for (let k = 0; k < types.length; k++) {
    const type = types[k];
    const def = INCIDENT_DEFS[type];
    const rand = mulberry32(1234 + k);
    const incident: ActiveIncident = {
      id: 1,
      type,
      intensity: 0.8,
      startTick: WINDOW,
      rampIn: 6,
      hold: 160,
      rampOut: 6,
      targetDistricts: def.targetDistricts,
    };
    const total = WINDOW + 80;
    let s: number | null = null;
    let tp = 0;
    let fn = 0;
    for (let t = 0; t < total; t++) {
      const raw = normalSampleAt(t, 4242 + k);
      const mod = applyIncidents(raw, [incident], rand, t);
      const { raw: err } = await detector.score(mod);
      s = s === null ? err : ema(s, err, EMA_ALPHA);
      const isAnomaly = t >= WINDOW;
      const positive = s > detector.threshold;
      predicted.push(positive);
      truth.push(isAnomaly);
      if (isAnomaly && positive) tp++;
      else if (isAnomaly && !positive) fn++;
    }
    scenarios.push({
      type,
      label: def.label,
      recall: tp + fn > 0 ? tp / (tp + fn) : 0,
      samples: total,
    });
  }

  return {
    metrics: computeBinaryMetrics(predicted, truth),
    normalFalsePositiveRate,
    scenarios,
    threshold: detector.threshold,
  };
}
