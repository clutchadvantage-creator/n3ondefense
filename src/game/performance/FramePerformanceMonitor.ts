export interface FramePerformanceSnapshot {
  samples: number;
  averageMs: number;
  p95Ms: number;
  maximumMs: number;
  framesOver33Ms: number;
  framesOver50Ms: number;
}

export class FramePerformanceMonitor {
  private readonly samples: Float32Array;
  private cursor = 0;
  private count = 0;

  constructor(capacity = 600) {
    this.samples = new Float32Array(Math.max(1, Math.floor(capacity)));
  }

  record(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
    this.samples[this.cursor] = deltaMs;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.samples.length, this.count + 1);
  }

  snapshot(): FramePerformanceSnapshot {
    if (this.count === 0) return { samples: 0, averageMs: 0, p95Ms: 0, maximumMs: 0, framesOver33Ms: 0, framesOver50Ms: 0 };
    const ordered = new Array<number>(this.count);
    let total = 0;
    let maximum = 0;
    let framesOver33Ms = 0;
    let framesOver50Ms = 0;
    for (let index = 0; index < this.count; index += 1) {
      const value = this.samples[index];
      ordered[index] = value;
      total += value;
      maximum = Math.max(maximum, value);
      if (value > 33) framesOver33Ms += 1;
      if (value > 50) framesOver50Ms += 1;
    }
    ordered.sort((a, b) => a - b);
    return {
      samples: this.count,
      averageMs: total / this.count,
      p95Ms: ordered[Math.min(this.count - 1, Math.floor(this.count * 0.95))],
      maximumMs: maximum,
      framesOver33Ms,
      framesOver50Ms
    };
  }
}
