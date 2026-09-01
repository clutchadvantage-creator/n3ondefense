import { FramePerformanceMonitor, type FramePerformanceSnapshot } from './FramePerformanceMonitor.ts';

export interface ArenaGenerationPerformanceReport {
  generation: number;
  label: string;
  setupMs: number;
  framesSampled: number;
  frameTime: FramePerformanceSnapshot;
  projectileAllocationsDuringSample: number;
  fxAllocationsDuringSample: number;
  endReason: string | null;
}

export interface ArenaResumePerformanceReport {
  label: string;
  framesSampled: number;
  frameTime: FramePerformanceSnapshot;
  projectileAllocationsDuringSample: number;
  fxAllocationsDuringSample: number;
}

interface ActiveSample {
  generation: number;
  label: string;
  setupMs: number;
  frames: number;
  monitor: FramePerformanceMonitor;
  projectileCreatedAtStart: number;
  fxCreatedAtStart: number;
  projectileCreated: number;
  fxCreated: number;
}

const EMPTY_FRAME: FramePerformanceSnapshot = {
  samples: 0, averageMs: 0, p95Ms: 0, p99Ms: 0, maximumMs: 0, framesOver33Ms: 0, framesOver50Ms: 0
};

/** DEV-facing generation profiler. Recording uses fixed typed buffers. */
export class ArenaLifecycleProfiler {
  private active: ActiveSample | null = null;
  private resume: ActiveSample | null = null;
  private readonly generations: ArenaGenerationPerformanceReport[] = [];
  private readonly resumes: ArenaResumePerformanceReport[] = [];

  beginGeneration(generation: number, label: string, setupMs: number, projectilesCreated: number, fxCreated: number): void {
    if (this.active) this.finishGeneration('replaced');
    this.active = this.createSample(generation, label, setupMs, projectilesCreated, fxCreated, 600);
  }

  beginResume(label: string, projectilesCreated: number, fxCreated: number): void {
    this.resume = this.createSample(-1, label, 0, projectilesCreated, fxCreated, 180);
  }

  recordFrame(deltaMs: number, projectilesCreated: number, fxCreated: number): void {
    this.record(this.active, deltaMs, projectilesCreated, fxCreated, 600);
    if (!this.resume) return;
    this.record(this.resume, deltaMs, projectilesCreated, fxCreated, 180);
    if (this.resume.frames >= 180) this.finishResume();
  }

  finishGeneration(reason: string): void {
    if (!this.active) return;
    this.generations.push(this.generationReport(this.active, reason));
    this.generations.splice(0, Math.max(0, this.generations.length - 12));
    this.active = null;
  }

  report(): { generations: ArenaGenerationPerformanceReport[]; anomalyResumes: ArenaResumePerformanceReport[] } {
    const generations = [...this.generations];
    if (this.active) generations.push(this.generationReport(this.active, null));
    const anomalyResumes = [...this.resumes];
    if (this.resume) anomalyResumes.push(this.resumeReport(this.resume));
    return { generations, anomalyResumes };
  }

  reset(): void {
    this.active = null;
    this.resume = null;
    this.generations.length = 0;
    this.resumes.length = 0;
  }

  private createSample(
    generation: number,
    label: string,
    setupMs: number,
    projectilesCreated: number,
    fxCreated: number,
    capacity: number
  ): ActiveSample {
    return {
      generation, label, setupMs, frames: 0, monitor: new FramePerformanceMonitor(capacity),
      projectileCreatedAtStart: projectilesCreated, fxCreatedAtStart: fxCreated,
      projectileCreated: projectilesCreated, fxCreated: fxCreated
    };
  }

  private record(sample: ActiveSample | null, deltaMs: number, projectilesCreated: number, fxCreated: number, limit: number): void {
    if (!sample || sample.frames >= limit) return;
    sample.monitor.record(deltaMs);
    sample.frames += 1;
    sample.projectileCreated = projectilesCreated;
    sample.fxCreated = fxCreated;
  }

  private finishResume(): void {
    if (!this.resume) return;
    this.resumes.push(this.resumeReport(this.resume));
    this.resumes.splice(0, Math.max(0, this.resumes.length - 12));
    this.resume = null;
  }

  private generationReport(sample: ActiveSample, endReason: string | null): ArenaGenerationPerformanceReport {
    return {
      generation: sample.generation,
      label: sample.label,
      setupMs: sample.setupMs,
      framesSampled: sample.frames,
      frameTime: sample.frames ? sample.monitor.snapshot() : { ...EMPTY_FRAME },
      projectileAllocationsDuringSample: sample.projectileCreated - sample.projectileCreatedAtStart,
      fxAllocationsDuringSample: sample.fxCreated - sample.fxCreatedAtStart,
      endReason
    };
  }

  private resumeReport(sample: ActiveSample): ArenaResumePerformanceReport {
    return {
      label: sample.label,
      framesSampled: sample.frames,
      frameTime: sample.frames ? sample.monitor.snapshot() : { ...EMPTY_FRAME },
      projectileAllocationsDuringSample: sample.projectileCreated - sample.projectileCreatedAtStart,
      fxAllocationsDuringSample: sample.fxCreated - sample.fxCreatedAtStart
    };
  }
}
