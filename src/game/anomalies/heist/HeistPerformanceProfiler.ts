import { FramePerformanceMonitor, type FramePerformanceSnapshot } from '../../performance/FramePerformanceMonitor.ts';

export const HEIST_PROFILE_CATEGORIES = [
  'presentationInput',
  'facilityAndVfx',
  'playerCombatAndMods',
  'projectiles',
  'enemies',
  'deployables',
  'pickupsHazardsMission',
  'hudMaintenance'
] as const;

export type HeistProfileCategory = typeof HEIST_PROFILE_CATEGORIES[number];

export interface HeistPerformanceSnapshot {
  frameTime: FramePerformanceSnapshot;
  sampledFrames: number;
  updateWork: { averageMs: number; maximumMs: number };
  renderWork: { averageMs: number; maximumMs: number; samples: number };
  physicsUpdateEnvelope: { averageMs: number; maximumMs: number; samples: number };
  categories: Record<HeistProfileCategory, { averageMs: number; maximumMs: number; samples: number }>;
}

/**
 * DEV-facing fixed-buffer profiler. Recording performs no object allocation;
 * the report object is only created when the console command or overlay asks
 * for a snapshot.
 */
export class HeistPerformanceProfiler {
  private readonly frameMonitor = new FramePerformanceMonitor(600);
  private readonly totals = new Float64Array(HEIST_PROFILE_CATEGORIES.length);
  private readonly maximums = new Float64Array(HEIST_PROFILE_CATEGORIES.length);
  private readonly counts = new Uint32Array(HEIST_PROFILE_CATEGORIES.length);
  private frameStartedAt = 0;
  private segmentStartedAt = 0;
  private frameWorkTotal = 0;
  private frameWorkMaximum = 0;
  private sampledFrames = 0;
  private renderTotal = 0;
  private renderMaximum = 0;
  private renderSamples = 0;
  private physicsTotal = 0;
  private physicsMaximum = 0;
  private physicsSamples = 0;

  beginFrame(deltaMs: number, now = performance.now()): void {
    this.frameMonitor.record(deltaMs);
    this.frameStartedAt = now;
    this.segmentStartedAt = now;
  }

  mark(category: HeistProfileCategory, now = performance.now()): void {
    const elapsed = Math.max(0, now - this.segmentStartedAt);
    const index = HEIST_PROFILE_CATEGORIES.indexOf(category);
    this.totals[index] += elapsed;
    this.maximums[index] = Math.max(this.maximums[index], elapsed);
    this.counts[index] += 1;
    this.segmentStartedAt = now;
  }

  finishFrame(now = performance.now()): void {
    if (this.frameStartedAt <= 0) return;
    const elapsed = Math.max(0, now - this.frameStartedAt);
    this.frameWorkTotal += elapsed;
    this.frameWorkMaximum = Math.max(this.frameWorkMaximum, elapsed);
    this.sampledFrames += 1;
    this.frameStartedAt = 0;
  }

  recordRender(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    this.renderTotal += elapsedMs;
    this.renderMaximum = Math.max(this.renderMaximum, elapsedMs);
    this.renderSamples += 1;
  }

  recordPhysicsUpdateEnvelope(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    this.physicsTotal += elapsedMs;
    this.physicsMaximum = Math.max(this.physicsMaximum, elapsedMs);
    this.physicsSamples += 1;
  }

  snapshot(): HeistPerformanceSnapshot {
    const categories = {} as HeistPerformanceSnapshot['categories'];
    for (let index = 0; index < HEIST_PROFILE_CATEGORIES.length; index += 1) {
      const samples = this.counts[index];
      categories[HEIST_PROFILE_CATEGORIES[index]] = {
        averageMs: samples > 0 ? this.totals[index] / samples : 0,
        maximumMs: this.maximums[index],
        samples
      };
    }
    return {
      frameTime: this.frameMonitor.snapshot(),
      sampledFrames: this.sampledFrames,
      updateWork: {
        averageMs: this.sampledFrames > 0 ? this.frameWorkTotal / this.sampledFrames : 0,
        maximumMs: this.frameWorkMaximum
      },
      renderWork: {
        averageMs: this.renderSamples > 0 ? this.renderTotal / this.renderSamples : 0,
        maximumMs: this.renderMaximum,
        samples: this.renderSamples
      },
      physicsUpdateEnvelope: {
        averageMs: this.physicsSamples > 0 ? this.physicsTotal / this.physicsSamples : 0,
        maximumMs: this.physicsMaximum,
        samples: this.physicsSamples
      },
      categories
    };
  }
}
