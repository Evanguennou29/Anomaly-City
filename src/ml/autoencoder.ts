import type * as tfNs from '@tensorflow/tfjs';
import { N_FEATURES } from '../core/city';
import { generateNormalDataset } from '../core/dataGenerator';

export interface ThresholdStats {
  mean: number;
  std: number;
  p99: number;
  count: number;
}

export interface ScoreResult {
  raw: number;
  perFeature: number[];
  normalized: number[];
}

export interface Detector {
  /** Erreur de reconstruction (MSE) + erreur par capteur, à partir d'un vecteur brut. */
  score(raw: number[]): Promise<ScoreResult>;
  threshold: number;
  thresholdStats: ThresholdStats;
  means: number[];
  stds: number[];
  epochs: number;
  finalLoss: number;
  nFeatures: number;
}

export interface TrainOptions {
  trainSeed: number;
  valSeed: number;
  trainSamples: number;
  valSamples: number;
  epochs: number;
  onProgress?: (epoch: number, total: number, loss: number) => void;
}

// Statistiques par capteur (moyenne / écart-type) sur le jeu d'entraînement normal.
export function computeStats(data: number[][]): { means: number[]; stds: number[] } {
  const n = data.length;
  const means = new Array<number>(N_FEATURES).fill(0);
  for (const row of data) for (let i = 0; i < N_FEATURES; i++) means[i] += row[i];
  for (let i = 0; i < N_FEATURES; i++) means[i] /= n;

  const stds = new Array<number>(N_FEATURES).fill(0);
  for (const row of data)
    for (let i = 0; i < N_FEATURES; i++) {
      const d = row[i] - means[i];
      stds[i] += d * d;
    }
  for (let i = 0; i < N_FEATURES; i++) stds[i] = Math.sqrt(stds[i] / n);
  return { means, stds };
}

export function normalize(raw: number[], means: number[], stds: number[]): number[] {
  const eps = 1e-6;
  return raw.map((v, i) => (v - means[i]) / (stds[i] + eps));
}

/** Calibre le seuil : 99e centile des erreurs de reconstruction du jeu de validation. */
export function computeThreshold(errors: number[]): ThresholdStats {
  const n = errors.length;
  const mean = errors.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(errors.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sorted = errors.slice().sort((a, b) => a - b);
  const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
  return { mean, std, p99, count: n };
}

/**
 * Entraîne un autoencodeur dans le navigateur sur des données normales
 * reproductibles, puis calibre le seuil sur un jeu de validation distinct.
 * Le score d'anomalie est l'erreur de reconstruction (aucune règle ad hoc).
 */
export async function trainDetector(opts: TrainOptions): Promise<Detector> {
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  // CPU : déterministe et sans dépendance au GPU / WebGL.
  await tf.setBackend('cpu');

  const train = generateNormalDataset(opts.trainSeed, opts.trainSamples);
  const val = generateNormalDataset(opts.valSeed, opts.valSamples);

  const { means, stds } = computeStats(train);
  const normTrain = train.map((r) => normalize(r, means, stds));
  const normVal = val.map((r) => normalize(r, means, stds));

  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [N_FEATURES], units: 12, activation: 'tanh' }));
  model.add(tf.layers.dense({ units: 6, activation: 'tanh' }));
  model.add(tf.layers.dense({ units: 12, activation: 'tanh' }));
  model.add(tf.layers.dense({ units: N_FEATURES, activation: 'linear' }));
  model.compile({ optimizer: tf.train.adam(0.002), loss: 'meanSquaredError' });

  const xs = tf.tensor2d(normTrain);
  const history = await model.fit(xs, xs, {
    epochs: opts.epochs,
    batchSize: 64,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        opts.onProgress?.(epoch + 1, opts.epochs, Number(logs?.loss ?? 0));
      },
    },
  });
  xs.dispose();
  const finalLoss = Number(history.history.loss?.[history.history.loss.length - 1] ?? 0);

  // Erreurs de reconstruction sur le jeu de validation (distinct de l'entraînement).
  const valXs = tf.tensor2d(normVal);
  const valPred = model.predict(valXs) as tfNs.Tensor;
  const valErr = tf.mean(tf.square(tf.sub(valXs, valPred)), -1);
  const valErrArr = Array.from(await valErr.data());
  valXs.dispose();
  valPred.dispose();
  valErr.dispose();
  const thresholdStats = computeThreshold(valErrArr);

  const score = async (raw: number[]): Promise<ScoreResult> => {
    const norm = normalize(raw, means, stds);
    const sq = tf.tidy(() => {
      const inT = tf.tensor2d([norm]);
      const outT = model.predict(inT) as tfNs.Tensor;
      return tf.square(tf.sub(inT, outT));
    });
    const perFeature = Array.from(await sq.data());
    sq.dispose();
    const rawErr = perFeature.reduce((a, b) => a + b, 0) / perFeature.length;
    return { raw: rawErr, perFeature, normalized: norm };
  };

  return {
    score,
    threshold: thresholdStats.p99,
    thresholdStats,
    means,
    stds,
    epochs: opts.epochs,
    finalLoss,
    nFeatures: N_FEATURES,
  };
}
