import type { BinaryMetrics } from '../core/types';

/** Calcule TP/FP/FN/TN, précision, rappel et F1 à partir de prédictions binaires. */
export function computeBinaryMetrics(predicted: boolean[], groundTruth: boolean[]): BinaryMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const n = Math.min(predicted.length, groundTruth.length);
  for (let i = 0; i < n; i++) {
    const p = predicted[i];
    const t = groundTruth[i];
    if (p && t) tp++;
    else if (p && !t) fp++;
    else if (!p && t) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, tn, precision, recall, f1 };
}

/** Moyenne glissante exponentielle. */
export function ema(prev: number, value: number, alpha: number): number {
  return prev + alpha * (value - prev);
}
