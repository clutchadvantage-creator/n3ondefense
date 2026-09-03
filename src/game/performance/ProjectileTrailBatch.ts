import Phaser from 'phaser';

interface TrailSample {
  x: number;
  y: number;
  color: number;
  radius: number;
  bornAt: number;
  expiresAt: number;
}

export interface ProjectileTrailBatchStats {
  active: number;
  retained: number;
  peak: number;
}

const TRAIL_LIFETIME_MS = 130;

/**
 * Draws combat trails through one Graphics object instead of creating a
 * display object and tween for every projectile every frame. Samples retain
 * the original 130ms fade/contract visual and are recycled after expiry.
 */
export class ProjectileTrailBatch {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly active: TrailSample[] = [];
  private readonly available: TrailSample[] = [];
  private peak = 0;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics()
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Moves the tiny sample allocation cost out of the first live firefight. */
  prewarm(targetRetained: number): number {
    const target = Math.max(0, Math.floor(targetRetained));
    let added = 0;
    while (this.active.length + this.available.length < target) {
      this.available.push({ x: 0, y: 0, color: 0, radius: 1, bornAt: 0, expiresAt: 0 });
      added += 1;
    }
    return added;
  }

  beginFrame(now: number): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.active.length; readIndex += 1) {
      const sample = this.active[readIndex];
      if (sample.expiresAt <= now) {
        this.available.push(sample);
        continue;
      }
      this.active[writeIndex] = sample;
      writeIndex += 1;
    }
    this.active.length = writeIndex;
    this.graphics.clear();
  }

  emit(x: number, y: number, color: number, now: number): void {
    const sample = this.available.pop() ?? {
      x: 0,
      y: 0,
      color: 0,
      radius: 1,
      bornAt: 0,
      expiresAt: 0
    };
    sample.x = x;
    sample.y = y;
    sample.color = color;
    sample.radius = 1 + Math.floor(Math.random() * 3);
    sample.bornAt = now;
    sample.expiresAt = now + TRAIL_LIFETIME_MS;
    this.active.push(sample);
    this.peak = Math.max(this.peak, this.active.length);
  }

  /**
   * Small pooled emissive sample for authored-color projectile art. This lets
   * the equipped projectile color remain visible without tinting the whole
   * texture or creating another display object per shot.
   */
  emitAccent(x: number, y: number, color: number, now: number): void {
    const sample = this.available.pop() ?? {
      x: 0,
      y: 0,
      color: 0,
      radius: 1,
      bornAt: 0,
      expiresAt: 0
    };
    sample.x = x;
    sample.y = y;
    sample.color = color;
    sample.radius = 2.25;
    sample.bornAt = now;
    sample.expiresAt = now + 76;
    this.active.push(sample);
    this.peak = Math.max(this.peak, this.active.length);
  }

  render(now: number): void {
    for (const sample of this.active) {
      const lifetime = Math.max(1, sample.expiresAt - sample.bornAt);
      const remaining = Math.max(0, (sample.expiresAt - now) / lifetime);
      this.graphics.fillStyle(sample.color, 0.62 * remaining);
      this.graphics.fillCircle(sample.x, sample.y, sample.radius * (0.3 + remaining * 0.7));
    }
  }

  reset(): void {
    while (this.active.length > 0) this.available.push(this.active.pop() as TrailSample);
    this.graphics.clear();
  }

  /** Drops only dormant high-water samples at an encounter boundary. Trail
   * behavior is unchanged and the next runtime still prewarms its calculated
   * reserve before combat becomes active. */
  trimRetained(maxRetained: number): number {
    const target = Math.max(0, Math.floor(maxRetained) - this.active.length);
    const before = this.available.length;
    if (before > target) this.available.length = target;
    return before - this.available.length;
  }

  stats(): ProjectileTrailBatchStats {
    return {
      active: this.active.length,
      retained: this.active.length + this.available.length,
      peak: this.peak
    };
  }

  ownsDisplayObject(object: unknown): boolean {
    return object === this.graphics;
  }

  destroy(): void {
    this.active.length = 0;
    this.available.length = 0;
    this.graphics.destroy();
  }
}
