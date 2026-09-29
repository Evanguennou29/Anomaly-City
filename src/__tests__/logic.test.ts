import { describe, expect, it } from 'vitest';
import { featureIndex } from '../core/city';
import { generateNormalDataset, normalSampleAt } from '../core/dataGenerator';
import { applyIncidents, incidentEnvelope } from '../core/incidents';
import { mulberry32 } from '../core/prng';
import type { ActiveIncident } from '../core/types';
import { computeStats, computeThreshold, normalize } from '../ml/autoencoder';
import { computeBinaryMetrics } from '../ml/metrics';

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db);
}

describe('PRNG', () => {
  it('est déterministe pour un seed donné', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('diverge entre deux seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('Générateur de données normales', () => {
  it('est reproductible (même t + même seed)', () => {
    expect(normalSampleAt(123, 7)).toEqual(normalSampleAt(123, 7));
    expect(generateNormalDataset(9, 50)).toEqual(generateNormalDataset(9, 50));
  });

  it('produit des corrélations crédibles entre électricité et trafic', () => {
    const pow: number[] = [];
    const traf: number[] = [];
    for (let t = 0; t < 2000; t++) {
      const s = normalSampleAt(t, 11);
      pow.push(s[featureIndex(0, 'power')]);
      traf.push(s[featureIndex(0, 'traffic')]);
    }
    expect(pearson(pow, traf)).toBeGreaterThan(0.4);
  });
});

describe('Incidents', () => {
  const baseIncident = (type: ActiveIncident['type']): ActiveIncident => ({
    id: 1,
    type,
    intensity: 1,
    startTick: 0,
    rampIn: 1,
    hold: 100,
    rampOut: 1,
    targetDistricts: [0],
  });

  it('la panne électrique effondre la consommation', () => {
    const raw = normalSampleAt(0, 3);
    const mod = applyIncidents(raw, [baseIncident('power')], mulberry32(1), 10);
    expect(mod[featureIndex(0, 'power')]).toBeLessThan(raw[featureIndex(0, 'power')] * 0.2);
  });

  it("l'embouteillage sature le trafic", () => {
    const raw = normalSampleAt(0, 3);
    const mod = applyIncidents(raw, [baseIncident('traffic')], mulberry32(1), 10);
    expect(mod[featureIndex(0, 'traffic')]).toBeGreaterThan(raw[featureIndex(0, 'traffic')] * 2);
  });

  it("l'attaque réseau fait exploser la latence", () => {
    const raw = normalSampleAt(0, 3);
    const mod = applyIncidents(raw, [baseIncident('network')], mulberry32(1), 10);
    expect(mod[featureIndex(0, 'latency')]).toBeGreaterThan(raw[featureIndex(0, 'latency')] * 3);
  });

  it("l'enveloppe d'intensité retombe à zéro après l'incident", () => {
    const inc = baseIncident('power');
    expect(incidentEnvelope(inc, 10)).toBeGreaterThan(0.9);
    expect(incidentEnvelope(inc, 1000)).toBe(0);
  });
});

describe('ML', () => {
  it('computeBinaryMetrics calcule TP/FP/FN/TN et dérivés', () => {
    const m = computeBinaryMetrics([true, true, false, false], [true, false, true, false]);
    expect(m.tp).toBe(1);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.tn).toBe(1);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.f1).toBeCloseTo(0.5);
  });

  it('computeThreshold renvoie le 99e centile', () => {
    const errs = Array.from({ length: 100 }, (_, i) => i);
    const t = computeThreshold(errs);
    expect(t.p99).toBe(99);
    expect(t.count).toBe(100);
  });

  it('normalize centre et réduit les données', () => {
    const data = generateNormalDataset(5, 300);
    const { means, stds } = computeStats(data);
    const norm = data.map((r) => normalize(r, means, stds));
    const mean0 = norm.reduce((a, r) => a + r[0], 0) / norm.length;
    expect(Math.abs(mean0)).toBeLessThan(1e-6);
    const std0 = Math.sqrt(norm.reduce((a, r) => a + (r[0] - mean0) ** 2, 0) / norm.length);
    expect(std0).toBeCloseTo(1, 2);
  });
});
