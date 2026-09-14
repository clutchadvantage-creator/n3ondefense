import type { RectSpec } from '../../types.ts';

export interface DroneFlightState { x: number; y: number; vx: number; vy: number }
/** A movement strategy only: no scene, weapons, health, drops, or event ownership. */
export interface DroneMovement {
  update(state: DroneFlightState, targetX: number, targetY: number, speed: number, bounds: RectSpec, dt: number): void;
}

export class ArenaDroneStrafe implements DroneMovement {
  private elapsed: number;
  private readonly direction: number;
  constructor(sequence: number) {
    this.elapsed = sequence * 1.37;
    this.direction = sequence % 2 ? -1 : 1;
  }
  update(s: DroneFlightState, tx: number, ty: number, speed: number, b: RectSpec, dt: number): void {
    dt = Math.max(0, Math.min(.05, dt));
    this.elapsed += dt;
    const dx = tx - s.x, dy = ty - s.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const radial = Math.max(-1, Math.min(1, (distance - 265 - Math.sin(this.elapsed * .7) * 28) / 100));
    const tangent = this.direction * (.55 + .2 * Math.sin(this.elapsed * .9));
    let vx = (dx * radial - dy * tangent) / distance;
    let vy = (dy * radial + dx * tangent) / distance;
    // Soft bounds steer before contact; the hard inset also protects scripted entrances.
    vx += Math.max(0, (b.x + 95 - s.x) / 70) - Math.max(0, (s.x - b.x - b.w + 95) / 70);
    vy += Math.max(0, (b.y + 95 - s.y) / 70) - Math.max(0, (s.y - b.y - b.h + 95) / 70);
    const scale = speed / Math.max(1, Math.hypot(vx, vy));
    const blend = 1 - Math.exp(-dt * 3.8);
    s.vx += (vx * scale - s.vx) * blend;
    s.vy += (vy * scale - s.vy) * blend;
    s.x = Math.max(b.x + 24, Math.min(b.x + b.w - 24, s.x));
    s.y = Math.max(b.y + 24, Math.min(b.y + b.h - 24, s.y));
    if (s.x <= b.x + 24) s.vx = Math.max(0, s.vx);
    if (s.x >= b.x + b.w - 24) s.vx = Math.min(0, s.vx);
    if (s.y <= b.y + 24) s.vy = Math.max(0, s.vy);
    if (s.y >= b.y + b.h - 24) s.vy = Math.min(0, s.vy);
  }
}

/** At most one shot per update; suspended or slow frames never dump a backlog. */
export class DroneBurstWeapon {
  private remaining = 0;
  private nextAt = 900;
  private aim = 0;
  update(elapsedMs: number, angle: number, inRange: boolean, cadenceMs: number, fire: (angle: number) => void): void {
    if (elapsedMs < this.nextAt) return;
    if (this.remaining === 0) {
      if (!inRange) return;
      this.remaining = 3;
      this.aim = angle;
    }
    fire(this.aim + (2 - this.remaining) * .075);
    this.remaining--;
    this.nextAt = elapsedMs + (this.remaining ? 170 : Math.max(1100, cadenceMs));
  }
}

export type DroneVariant = 'standard' | 'redline' | 'target';
export const DRONE_VARIANTS = {
  standard: { speed: 1, color: null, lifetimeMs: Infinity },
  redline: { speed: 1.06, color: 0xff8cbd, lifetimeMs: Infinity },
  target: { speed: 1.2, color: 0xff496c, lifetimeMs: 11000 }
} as const;
