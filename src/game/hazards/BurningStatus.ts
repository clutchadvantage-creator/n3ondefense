import { FIRE_HAZARD_BALANCE as FIRE } from '../config/fireHazards.ts';

/** One target, no timers or queued catch-up damage. Contact refreshes the
 * tail; only out-of-flame ticks deal DoT, so it cannot consume direct-hit i-frames. */
export class BurningStatus {
  expiresAt = 0;
  private nextPulseAt = 0;

  update(now: number, touchingFire: boolean): number {
    if (touchingFire) {
      this.expiresAt = now + FIRE.burnDurationMs;
      this.nextPulseAt = now + FIRE.burnPulseIntervalMs;
      return 0;
    }
    if (!this.isActive(now)) { this.reset(); return 0; }
    if (now < this.nextPulseAt) return 0;
    this.nextPulseAt = now + FIRE.burnPulseIntervalMs;
    return FIRE.burnDamagePerPulse;
  }

  isActive(now: number): boolean { return now < this.expiresAt; }
  reset(): void { this.expiresAt = 0; this.nextPulseAt = 0; }
}
