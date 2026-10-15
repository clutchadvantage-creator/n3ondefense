import { KINETIC } from '../config/kinetic.ts';

interface MovingContact { readonly x: number; readonly y: number; readonly radius: number }
interface Contact {
  key: object | null; nx: number; ny: number; x: number; y: number;
  target: MovingContact | null;
}

/** Input is a command, never momentum. Only a new solid impact starts this
 * short response. Contact slots are reused, with no per-step allocations. */
export class OperativeRebound {
  inputX = 0;
  inputY = 0;
  velocityX = 0;
  velocityY = 0;
  remaining = 0;
  inputOwnsMotion = false;
  private cursor = 0;
  private readonly contacts: Contact[] = Array.from({ length: KINETIC.maxIterations }, () =>
    ({ key: null, nx: 0, ny: 0, x: 0, y: 0, target: null }));

  /** Release, reversal and fresh direction input win immediately. A speed
   * modifier also takes effect without rebuilding speed after a collision. */
  input(x: number, y: number): boolean {
    const oldLength = Math.hypot(this.inputX, this.inputY), length = Math.hypot(x, y);
    const changed = (oldLength === 0) !== (length === 0)
      || (oldLength > 0 && length > 0 && (x * this.inputX + y * this.inputY) / (oldLength * length) < 0.9999)
      || Math.abs(oldLength - length) > 1;
    const cancelled = this.remaining > 0 && changed;
    this.inputX = x; this.inputY = y;
    if (cancelled) this.stop();
    return cancelled;
  }

  advance(dt: number): boolean {
    if (this.remaining <= 0) return false;
    this.remaining = Math.max(0, this.remaining - Math.max(0, dt));
    if (this.remaining > 1e-8) return false;
    this.stop(); return true;
  }

  /** A bounce's own separation must not rearm a held-wall contact. Intentional
   * retreat, substantial separation, or a departing enemy can rearm it. */
  separate(x: number, y: number, radius: number): void {
    const clearance = KINETIC.operativeReboundSpeedMax * KINETIC.operativeReboundSeconds + 8;
    for (const contact of this.contacts) {
      if (!contact.key) continue;
      const outward = (x - contact.x) * contact.nx + (y - contact.y) * contact.ny;
      const retreating = this.inputX * contact.nx + this.inputY * contact.ny > 0;
      const target = contact.target;
      if ((retreating && outward > 4) || outward > clearance
        || (target && Math.hypot(x - target.x, y - target.y) > radius + target.radius + clearance)) {
        contact.key = null; contact.target = null;
      }
    }
  }

  collide(key: object, nx: number, ny: number, speed: number, x: number, y: number, target: MovingContact | null = null): boolean {
    if (speed <= KINETIC.threshold) return false;
    for (const contact of this.contacts) {
      if (contact.key === key && contact.nx * nx + contact.ny * ny > 0.98) return false;
    }
    const slot = this.contacts.find(c => !c.key) ?? this.contacts[this.cursor++ % this.contacts.length];
    slot.key = key; slot.nx = nx; slot.ny = ny; slot.x = x; slot.y = y; slot.target = target;
    const kick = Math.min(KINETIC.operativeReboundSpeedMax, Math.max(KINETIC.operativeReboundSpeedMin, speed * 0.72));
    this.velocityX = nx * kick; this.velocityY = ny * kick;
    this.remaining = KINETIC.operativeReboundSeconds;
    this.inputOwnsMotion = true;
    return true;
  }

  private stop(): void { this.remaining = 0; this.velocityX = this.velocityY = 0; }
  reset(): void {
    this.stop(); this.inputX = this.inputY = this.cursor = 0; this.inputOwnsMotion = false;
    for (const contact of this.contacts) { contact.key = null; contact.target = null; }
  }
}
