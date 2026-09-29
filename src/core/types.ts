// Shared domain types for ANOMALY CITY.

export type SignalKey = 'power' | 'traffic' | 'latency';
export type IncidentType = 'power' | 'traffic' | 'network';
export type RunState = 'idle' | 'running' | 'paused';
export type ModelPhase = 'loading' | 'training' | 'ready' | 'error';
export type DistrictStatus = 'normal' | 'warning' | 'anomaly';
export type LogLevel = 'info' | 'warn' | 'good' | 'danger';

export const SIGNAL_KEYS: SignalKey[] = ['power', 'traffic', 'latency'];
export const SIGNAL_LABELS: Record<SignalKey, string> = {
  power: 'Électricité',
  traffic: 'Trafic',
  latency: 'Latence',
};
export const SIGNAL_UNITS: Record<SignalKey, string> = {
  power: 'MW',
  traffic: 'véh/min',
  latency: 'ms',
};

export interface SignalValues {
  power: number;
  traffic: number;
  latency: number;
}

export interface DistrictDef {
  id: number;
  name: string;
  code: string;
  gridX: number;
  gridY: number;
  base: SignalValues;
  phase: number;
}

/** Runtime, mutable state of a district (shared with the canvas renderer). */
export interface DistrictRuntime extends DistrictDef {
  signalValues: SignalValues;
  contribution: number;
  status: DistrictStatus;
  incidentType: IncidentType | null;
  activity: number;
}

export interface ActiveIncident {
  id: number;
  type: IncidentType;
  intensity: number; // 0..1
  startTick: number;
  rampIn: number;
  hold: number;
  rampOut: number;
  targetDistricts: number[];
}

export interface LogEntry {
  id: number;
  tick: number;
  simTime: number;
  level: LogLevel;
  text: string;
}

export interface ScorePoint {
  t: number;
  raw: number;
  score: number;
  detected: boolean;
}

export interface FeatureContribution {
  districtId: number;
  districtName: string;
  signal: SignalKey;
  signalLabel: string;
  error: number;
}

export interface ModelStats {
  finalLoss: number;
  epochs: number;
  thresholdMean: number;
  thresholdStd: number;
  thresholdP99: number;
}

export interface BinaryMetrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface ScenarioResult {
  type: IncidentType;
  label: string;
  recall: number;
  samples: number;
}

export interface SelfTestResult {
  metrics: BinaryMetrics;
  normalFalsePositiveRate: number;
  scenarios: ScenarioResult[];
  threshold: number;
}

/** Immutable snapshot consumed by React via useSyncExternalStore. */
export interface Snapshot {
  modelPhase: ModelPhase;
  trainingProgress: number;
  trainingDetail: string;
  runState: RunState;
  simTime: number;
  tickCount: number;
  rawScore: number;
  score: number;
  threshold: number;
  detected: boolean;
  history: ScorePoint[];
  log: LogEntry[];
  districts: DistrictRuntime[];
  activeIncidents: ActiveIncident[];
  contributions: FeatureContribution[];
  metrics: SelfTestResult | null;
  modelStats: ModelStats | null;
  intensity: number;
  detectorReady: boolean;
}
