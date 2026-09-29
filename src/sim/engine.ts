import { DISTRICTS, featureIndex, districtName } from '../core/city';
import { normalSampleAt } from '../core/dataGenerator';
import { INCIDENT_DEFS, applyIncidents, incidentEnvelope } from '../core/incidents';
import { clamp01, mulberry32 } from '../core/prng';
import {
  SIGNAL_KEYS,
  SIGNAL_LABELS,
  type ActiveIncident,
  type DistrictRuntime,
  type DistrictStatus,
  type FeatureContribution,
  type IncidentType,
  type LogEntry,
  type LogLevel,
  type ModelPhase,
  type RunState,
  type ScorePoint,
  type SelfTestResult,
  type Snapshot,
} from '../core/types';
import { trainDetector, type Detector } from '../ml/autoencoder';
import { runSelfTest } from '../ml/selfTest';
import { ema } from '../ml/metrics';

const TICK_MS = 125; // cadence de la simulation (8 ticks/s)
const SIM_DT = 0.125; // seconde simulée par tick
const HISTORY_LIMIT = 1600;
const LOG_LIMIT = 300;
const EMA_ALPHA = 0.22;
const CONFIRM_TICKS = 3; // confirme l'anomalie après N ticks au-dessus du seuil
const CLEAR_TICKS = 6; // retour à la normale après N ticks sous le seuil

class SimulationEngine {
  private detector: Detector | null = null;
  private modelPhase: ModelPhase = 'loading';
  private trainingProgress = 0;
  private trainingDetail = '';

  private runState: RunState = 'idle';
  private tickCount = 0;
  private simTime = 0;
  private history: ScorePoint[] = [];
  private log: LogEntry[] = [];
  private logId = 0;
  private activeIncidents: ActiveIncident[] = [];
  private incidentCounter = 0;

  private rawScore = 0;
  private smoothedScore = Number.NaN;
  private detected = false;
  private confirmCount = 0;
  private clearCount = 0;
  private lastContributions: FeatureContribution[] = [];
  private metrics: SelfTestResult | null = null;

  private intensity = 0.7;
  private incidentRand = mulberry32(777);
  private timer: ReturnType<typeof setInterval> | null = null;
  private scoring = false;
  private autoStartWhenReady = false;
  private startedTrain = false;

  private districtStates: DistrictRuntime[];
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;

  constructor() {
    this.districtStates = DISTRICTS.map((d) => ({
      ...d,
      signalValues: { power: d.base.power, traffic: d.base.traffic, latency: d.base.latency },
      contribution: 0,
      status: 'normal',
      incidentType: null,
      activity: 0,
    }));
    this.snapshot = this.buildSnapshot();
    void this.train();
  }

  // ---- Abonnement React -------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): Snapshot => this.snapshot;

  /** État vivant (références mutables) pour le rendu canvas à 60 fps. */
  getLive() {
    return {
      runState: this.runState,
      simTime: this.simTime,
      detected: this.detected,
      score: this.scoreValue(),
      threshold: this.detector?.threshold ?? 0,
      modelPhase: this.modelPhase,
      districts: this.districtStates,
      activeIncidents: this.activeIncidents,
    };
  }

  // ---- Cycle de vie -----------------------------------------------------

  private async train() {
    if (this.startedTrain) return;
    this.startedTrain = true;
    this.modelPhase = 'training';
    this.trainingProgress = 0;
    this.trainingDetail = 'Chargement du moteur TensorFlow.js…';
    this.notify();

    try {
      this.detector = await trainDetector({
        trainSeed: 101,
        valSeed: 202,
        trainSamples: 4000,
        valSamples: 2000,
        epochs: 50,
        onProgress: (epoch, total, loss) => {
          this.trainingProgress = epoch / total;
          this.trainingDetail = `Entraînement · époque ${epoch}/${total} · perte ${loss.toFixed(4)}`;
          if (epoch === 1 || epoch % 5 === 0 || epoch === total) this.notify();
        },
      });
      this.modelPhase = 'ready';
      this.trainingDetail = '';
      this.notify();

      this.metrics = await runSelfTest(this.detector);
      this.notify();

      if (this.autoStartWhenReady) {
        this.autoStartWhenReady = false;
        this.start();
      }
    } catch (err) {
      this.modelPhase = 'error';
      this.trainingDetail = '';
      this.pushLog('danger', `Échec d'initialisation du modèle : ${(err as Error)?.message ?? 'erreur inconnue'}`);
      this.notify();
    }
  }

  start() {
    if (this.runState === 'running') return;
    if (this.modelPhase !== 'ready') {
      this.autoStartWhenReady = true;
      return;
    }
    this.runState = 'running';
    this.pushLog('info', 'Simulation lancée — flux de données normal en cours.');
    this.startTimer();
    this.notify();
  }

  pause() {
    if (this.runState !== 'running') return;
    this.runState = 'paused';
    this.stopTimer();
    this.pushLog('info', 'Simulation en pause.');
    this.notify();
  }

  toggle() {
    if (this.runState === 'running') this.pause();
    else this.start();
  }

  reset() {
    this.stopTimer();
    this.runState = 'idle';
    this.tickCount = 0;
    this.simTime = 0;
    this.history = [];
    this.activeIncidents = [];
    this.rawScore = 0;
    this.smoothedScore = Number.NaN;
    this.detected = false;
    this.confirmCount = 0;
    this.clearCount = 0;
    this.lastContributions = [];
    this.incidentRand = mulberry32(777);
    this.resetDistricts();
    this.pushLog('info', 'Simulation réinitialisée — état nominal restauré.');
    this.notify();
  }

  setIntensity(value: number) {
    this.intensity = clamp01(value);
    this.notify();
  }

  triggerIncident(type: IncidentType) {
    const def = INCIDENT_DEFS[type];
    const inc: ActiveIncident = {
      id: ++this.incidentCounter,
      type,
      intensity: this.intensity,
      startTick: this.tickCount,
      rampIn: 6,
      hold: 55,
      rampOut: 8,
      targetDistricts: def.targetDistricts,
    };
    this.activeIncidents.push(inc);
    const names = def.targetDistricts.map((id) => districtName(id)).join(', ');
    this.pushLog('warn', `${def.emoji} ${def.label} déclenché — ${names} (intensité ${Math.round(this.intensity * 100)} %).`);
    if (this.runState === 'idle') this.start();
    this.notify();
  }

  // ---- Boucle de simulation --------------------------------------------

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.runState !== 'running' || !this.detector) return;
    if (this.scoring) return; // évite le chevauchement des prédictions async
    this.scoring = true;
    try {
      this.tickCount++;
      this.simTime += SIM_DT;

      const raw = normalSampleAt(this.tickCount, 2025);
      const mod = applyIncidents(raw, this.activeIncidents, this.incidentRand, this.tickCount);
      const { raw: rawErr, perFeature } = await this.detector.score(mod);

      this.rawScore = rawErr;
      this.smoothedScore = Number.isFinite(this.smoothedScore)
        ? ema(this.smoothedScore, rawErr, EMA_ALPHA)
        : rawErr;

      this.updateDistricts(mod, perFeature);
      this.updateDetection(perFeature);
      this.expireIncidents();

      this.history.push({ t: this.simTime, raw: rawErr, score: this.scoreValue(), detected: this.detected });
      if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);

      this.notify();
    } finally {
      this.scoring = false;
    }
  }

  private updateDetection(perFeature: number[]) {
    const threshold = this.detector?.threshold ?? Infinity;
    const above = this.smoothedScore > threshold;

    if (above) {
      this.confirmCount++;
      this.clearCount = 0;
      if (!this.detected && this.confirmCount >= CONFIRM_TICKS) {
        this.detected = true;
        this.lastContributions = this.computeContributions(perFeature);
        this.pushLog(
          'danger',
          `Anomalie détectée — score ${this.smoothedScore.toFixed(2)} > seuil ${threshold.toFixed(2)}. ${this.describeContributions(this.lastContributions)}`,
        );
      }
    } else {
      this.clearCount++;
      this.confirmCount = 0;
      if (this.detected && this.clearCount >= CLEAR_TICKS) {
        this.detected = false;
        this.lastContributions = [];
        this.pushLog('good', `Retour à la normale — score ${this.smoothedScore.toFixed(2)} sous le seuil ${threshold.toFixed(2)}.`);
      }
    }
  }

  private updateDistricts(mod: number[], perFeature: number[]) {
    const threshold = this.detector?.threshold ?? Infinity;
    for (const d of this.districtStates) {
      const power = mod[featureIndex(d.id, 'power')];
      const traffic = mod[featureIndex(d.id, 'traffic')];
      const latency = mod[featureIndex(d.id, 'latency')];
      d.signalValues = { power, traffic, latency };

      const e =
        (perFeature[featureIndex(d.id, 'power')] +
          perFeature[featureIndex(d.id, 'traffic')] +
          perFeature[featureIndex(d.id, 'latency')]) /
        3;
      d.contribution = e;

      d.activity = clamp01(
        (Math.abs(power - d.base.power) / d.base.power) * 0.5 +
          (Math.abs(traffic - d.base.traffic) / d.base.traffic) * 0.35,
      );

      d.incidentType = null;
      for (const inc of this.activeIncidents) {
        if (inc.targetDistricts.includes(d.id) && incidentEnvelope(inc, this.tickCount) > 0.01) {
          d.incidentType = inc.type;
        }
      }

      let status: DistrictStatus = 'normal';
      if (d.incidentType) status = 'anomaly';
      else if (e > threshold * 1.3) status = 'anomaly';
      else if (e > threshold * 0.85) status = 'warning';
      d.status = status;
    }
  }

  private computeContributions(perFeature: number[]): FeatureContribution[] {
    const contribs: FeatureContribution[] = [];
    for (const d of this.districtStates) {
      for (const sig of SIGNAL_KEYS) {
        contribs.push({
          districtId: d.id,
          districtName: d.name,
          signal: sig,
          signalLabel: SIGNAL_LABELS[sig],
          error: perFeature[featureIndex(d.id, sig)],
        });
      }
    }
    contribs.sort((a, b) => b.error - a.error);
    return contribs.slice(0, 4);
  }

  private describeContributions(c: FeatureContribution[]): string {
    if (c.length === 0) return '';
    const top = c[0];
    const signals = Array.from(new Set(c.slice(0, 3).map((x) => x.signalLabel))).join(' · ');
    return `Origine principale : ${top.signalLabel} · ${top.districtName}. Signaux : ${signals}.`;
  }

  private expireIncidents() {
    const before = this.activeIncidents;
    this.activeIncidents = this.activeIncidents.filter((inc) => incidentEnvelope(inc, this.tickCount) > 0);
    for (const inc of before) {
      if (!this.activeIncidents.includes(inc)) {
        const def = INCIDENT_DEFS[inc.type];
        this.pushLog('info', `${def.emoji} ${def.label} terminé.`);
      }
    }
  }

  // ---- Utilitaires ------------------------------------------------------

  private resetDistricts() {
    for (const d of this.districtStates) {
      d.signalValues = { power: d.base.power, traffic: d.base.traffic, latency: d.base.latency };
      d.contribution = 0;
      d.status = 'normal';
      d.incidentType = null;
      d.activity = 0;
    }
  }

  private scoreValue(): number {
    return Number.isFinite(this.smoothedScore) ? this.smoothedScore : 0;
  }

  private pushLog(level: LogLevel, text: string) {
    this.log.unshift({ id: ++this.logId, tick: this.tickCount, simTime: this.simTime, level, text });
    if (this.log.length > LOG_LIMIT) this.log.pop();
  }

  private buildSnapshot(): Snapshot {
    return {
      modelPhase: this.modelPhase,
      trainingProgress: this.trainingProgress,
      trainingDetail: this.trainingDetail,
      runState: this.runState,
      simTime: this.simTime,
      tickCount: this.tickCount,
      rawScore: this.rawScore,
      score: this.scoreValue(),
      threshold: this.detector?.threshold ?? 0,
      detected: this.detected,
      history: this.history.slice(),
      log: this.log.slice(),
      districts: this.districtStates.map((d) => ({ ...d, signalValues: { ...d.signalValues } })),
      activeIncidents: this.activeIncidents.slice(),
      contributions: this.lastContributions.slice(),
      metrics: this.metrics,
      modelStats: this.detector
        ? {
            finalLoss: this.detector.finalLoss,
            epochs: this.detector.epochs,
            thresholdMean: this.detector.thresholdStats.mean,
            thresholdStd: this.detector.thresholdStats.std,
            thresholdP99: this.detector.thresholdStats.p99,
          }
        : null,
      intensity: this.intensity,
      detectorReady: this.modelPhase === 'ready',
    };
  }

  private notify() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export const engine = new SimulationEngine();
