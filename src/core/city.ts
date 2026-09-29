import type { DistrictDef, SignalKey } from './types';

export const N_SIGNALS = 3;

// Six quartiers disposés sur une grille isométrique 3 × 2.
export const DISTRICTS: DistrictDef[] = [
  { id: 0, name: 'Aurora', code: 'AUR', gridX: 0, gridY: 0, base: { power: 240, traffic: 320, latency: 38 }, phase: 0.4 },
  { id: 1, name: 'Nova', code: 'NOV', gridX: 1, gridY: 0, base: { power: 195, traffic: 250, latency: 30 }, phase: 1.2 },
  { id: 2, name: 'Vertex', code: 'VRX', gridX: 2, gridY: 0, base: { power: 285, traffic: 305, latency: 34 }, phase: 2.1 },
  { id: 3, name: 'Bastion', code: 'BST', gridX: 0, gridY: 1, base: { power: 320, traffic: 465, latency: 52 }, phase: 3.0 },
  { id: 4, name: 'Docks', code: 'DCK', gridX: 1, gridY: 1, base: { power: 210, traffic: 395, latency: 44 }, phase: 4.2 },
  { id: 5, name: 'Horizon', code: 'HRZ', gridX: 2, gridY: 1, base: { power: 160, traffic: 215, latency: 26 }, phase: 5.3 },
];

export const N_DISTRICTS = DISTRICTS.length;
export const N_FEATURES = N_DISTRICTS * N_SIGNALS; // 18

export function signalIndex(signal: SignalKey): number {
  return signal === 'power' ? 0 : signal === 'traffic' ? 1 : 2;
}

export function featureIndex(districtId: number, signal: SignalKey): number {
  return districtId * N_SIGNALS + signalIndex(signal);
}

export function districtName(id: number): string {
  return DISTRICTS.find((d) => d.id === id)?.name ?? `Quartier ${id}`;
}
