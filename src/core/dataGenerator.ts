import { DISTRICTS, N_FEATURES, featureIndex } from './city';
import { gaussianFactory, mulberry32 } from './prng';

// Période (en échantillons) du rythme "journalier" principal.
const P_DAY = 220;

// Mélange déterministe de `t` et `seed` pour obtenir un PRNG indépendant par échantillon.
function hashTick(t: number, seed: number): number {
  return (seed ^ Math.imul(t + 1, 0x9e3779b1)) >>> 0;
}

/**
 * Génère un échantillon "normal" (18 capteurs) à l'instant `t`.
 * Reproductible : même `t` + même `seed` ⇒ même vecteur, sans état global.
 *
 * Le modèle sous-jacent crée des corrélations crédibles :
 *  - un facteur global "activité de la ville" (rythme journalier),
 *  - un facteur local par quartier,
 *  - électricité et trafic fortement corrélés à l'activité,
 *  - latence plus indépendante (gigue haute fréquence).
 */
export function normalSampleAt(t: number, seed = 101): number[] {
  const rand = mulberry32(hashTick(t, seed));
  const gauss = gaussianFactory(rand);

  const global =
    Math.sin((2 * Math.PI * t) / P_DAY) +
    0.45 * Math.sin((2 * Math.PI * t) / (P_DAY * 3.1) + 1.2);

  const out = new Array<number>(N_FEATURES);

  for (const d of DISTRICTS) {
    const local =
      Math.sin((2 * Math.PI * t) / P_DAY + d.phase) +
      0.35 * Math.sin((2 * Math.PI * t) / (P_DAY * 0.61) + d.phase * 2);
    const activity = 0.55 * global + 0.45 * local;

    const power = d.base.power * (1 + 0.45 * activity) * (1 + 0.04 * gauss());
    const traffic = d.base.traffic * (1 + 0.78 * activity) * (1 + 0.05 * gauss());
    const latency =
      d.base.latency *
      (1 + 0.18 * activity + 0.22 * Math.sin((2 * Math.PI * t) / (P_DAY * 0.19) + d.phase * 3.7)) *
      (1 + 0.06 * gauss());

    out[featureIndex(d.id, 'power')] = power;
    out[featureIndex(d.id, 'traffic')] = traffic;
    out[featureIndex(d.id, 'latency')] = latency;
  }

  return out;
}

/** Génère un jeu de données normal complet (reproductible grâce à `seed`). */
export function generateNormalDataset(seed: number, samples: number): number[][] {
  const data: number[][] = [];
  for (let t = 0; t < samples; t++) data.push(normalSampleAt(t, seed));
  return data;
}
