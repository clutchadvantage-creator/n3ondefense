/** Shared weapon geometry for presentation and combat; never changes the chassis collider. */
export const BRAWLER_MACE = {
  pivotX: 24, pivotY: -36,
  reach: 62, extendedReach: 142,
  headRadius: 29,
  swingsBeforeExtension: 3,
  enemyRotationMs: 1100, controlledRotationMs: 800,
  extendMs: 280, holdMs: 850, retractMs: 350
} as const;

export interface MacePoint { x: number; y: number }
const TAU = Math.PI * 2;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const extensionDuration = BRAWLER_MACE.extendMs + BRAWLER_MACE.holdMs + BRAWLER_MACE.retractMs;

export class BrawlerMaceMotion {
  angle = 0;
  extension = 0;
  swinging = false;
  private rotationProgress = 0;
  private extensionTime = -1;

  update(deltaMs: number, swinging: boolean, rotationMs = BRAWLER_MACE.enemyRotationMs as number): void {
    let remaining = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.swinging = swinging;
    if (!swinging) {
      this.rotationProgress = 0;
      this.extensionTime = -1;
      this.extension = Math.max(0, this.extension - remaining / BRAWLER_MACE.retractMs);
      // Reel back to a forward resting pose instead of leaving the head on the chassis.
      const toRest = Math.atan2(Math.sin(-this.angle), Math.cos(-this.angle));
      const step = Math.min(Math.abs(toRest), remaining * TAU / BRAWLER_MACE.retractMs);
      this.angle = (this.angle + Math.sign(toRest) * step + TAU) % TAU;
      return;
    }
    const speed = TAU / Math.max(100, rotationMs);
    this.angle = (this.angle + remaining * speed) % TAU;
    // Consume phase boundaries, so the cycle is independent of rendering frame rate.
    while (remaining > 0) {
      if (this.extensionTime < 0) {
        const untilExtension = (TAU * BRAWLER_MACE.swingsBeforeExtension - this.rotationProgress) / speed;
        const step = Math.min(remaining, untilExtension);
        this.rotationProgress += step * speed;
        remaining -= step;
        // Also finish retracting when primary is pressed again during release.
        this.extension = Math.max(0, this.extension - step / BRAWLER_MACE.retractMs);
        if (step >= untilExtension) { this.rotationProgress = 0; this.extensionTime = 0; }
      } else {
        const step = Math.min(remaining, extensionDuration - this.extensionTime);
        this.extensionTime += step;
        remaining -= step;
        const t = this.extensionTime;
        this.extension = t < BRAWLER_MACE.extendMs ? smooth(t / BRAWLER_MACE.extendMs)
          : t < BRAWLER_MACE.extendMs + BRAWLER_MACE.holdMs ? 1
          : 1 - smooth((t - BRAWLER_MACE.extendMs - BRAWLER_MACE.holdMs) / BRAWLER_MACE.retractMs);
        if (t >= extensionDuration) { this.extensionTime = -1; this.extension = 0; }
      }
    }
  }

  get reach(): number {
    return BRAWLER_MACE.reach + (BRAWLER_MACE.extendedReach - BRAWLER_MACE.reach) * this.extension;
  }

  head(x: number, y: number, facing: number): MacePoint {
    const c = Math.cos(facing), s = Math.sin(facing);
    return {
      x: x + c * BRAWLER_MACE.pivotX - s * BRAWLER_MACE.pivotY + Math.cos(facing + this.angle) * this.reach,
      y: y + s * BRAWLER_MACE.pivotX + c * BRAWLER_MACE.pivotY + Math.sin(facing + this.angle) * this.reach
    };
  }

  reset(): void {
    this.angle = this.extension = this.rotationProgress = 0;
    this.extensionTime = -1;
    this.swinging = false;
  }
}

/** Test a swept head path once per target, avoiding duplicate damage from overlapping samples. */
export function macePathIntersects(path: readonly MacePoint[], x: number, y: number, radius: number): boolean {
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared)) : 0;
    if ((x - a.x - dx * t) ** 2 + (y - a.y - dy * t) ** 2 <= radius * radius) return true;
  }
  return false;
}
