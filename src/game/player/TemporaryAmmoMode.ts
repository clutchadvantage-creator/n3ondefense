export type TemporaryAmmoMode = 'normal' | 'grenade' | 'scattershot';
export type SpecialAmmoMode = Exclude<TemporaryAmmoMode, 'normal'>;

export const TEMPORARY_AMMO_BALANCE = {
  durationMs: 45_000,
  overdriveMaximumDurationMs: 90_000,
  grenade: {
    projectileSpeedMultiplier: 0.9,
    projectileLifetimeMs: 1_050,
    splashRadius: 32,
    splashDamageMultiplier: 0.35,
    width: 14,
    height: 9
  },
  scattershot: {
    pelletCount: 7,
    spreadRadians: 0.36,
    pelletDamageMultiplier: 0.3,
    projectileSpeedMultiplier: 0.94,
    projectileLifetimeMs: 680,
    width: 7,
    height: 4
  }
} as const;

const SCATTERSHOT_HALF_SPREAD = TEMPORARY_AMMO_BALANCE.scattershot.spreadRadians * 0.5;
const SCATTERSHOT_STEP = TEMPORARY_AMMO_BALANCE.scattershot.spreadRadians
  / (TEMPORARY_AMMO_BALANCE.scattershot.pelletCount - 1);

/** Precomputed once so scattershot firing never allocates a new spread array. */
export const SCATTERSHOT_ANGLE_OFFSETS: readonly number[] = Object.freeze([
  -SCATTERSHOT_HALF_SPREAD,
  -SCATTERSHOT_HALF_SPREAD + SCATTERSHOT_STEP,
  -SCATTERSHOT_HALF_SPREAD + SCATTERSHOT_STEP * 2,
  0,
  SCATTERSHOT_HALF_SPREAD - SCATTERSHOT_STEP * 2,
  SCATTERSHOT_HALF_SPREAD - SCATTERSHOT_STEP,
  SCATTERSHOT_HALF_SPREAD
]);

export interface TemporaryAmmoActivation {
  mode: SpecialAmmoMode;
  activeUntil: number;
  replacedMode: SpecialAmmoMode | null;
  extended: boolean;
}

/**
 * Owns the single active temporary primary-ammo state. Normal deployments
 * refresh a repeated pickup; Overdrive may extend it to two pickup durations.
 * Neither rule stacks projectile damage, splash power, or pellet count.
 */
export class TemporaryAmmoModeController {
  private mode: SpecialAmmoMode | null = null;
  private until = 0;

  activate(mode: SpecialAmmoMode, now: number, overdrive: boolean, durationMultiplier = 1): TemporaryAmmoActivation {
    const safeNow = Number.isFinite(now) ? now : 0;
    const current = this.activeSpecialMode(safeNow);
    const repeated = current === mode;
    const replacedMode = current && current !== mode ? current : null;
    const safeDurationMultiplier = Math.max(0.1, Number.isFinite(durationMultiplier) ? durationMultiplier : 1);
    const durationMs = TEMPORARY_AMMO_BALANCE.durationMs * safeDurationMultiplier;
    const maximumUntil = safeNow + TEMPORARY_AMMO_BALANCE.overdriveMaximumDurationMs * safeDurationMultiplier;

    this.mode = mode;
    if (repeated && overdrive) {
      this.until = Math.min(maximumUntil, this.until + durationMs);
    } else {
      this.until = safeNow + durationMs;
    }

    return {
      mode,
      activeUntil: this.until,
      replacedMode,
      extended: repeated && overdrive
    };
  }

  activeMode(now: number): TemporaryAmmoMode {
    return this.activeSpecialMode(now) ?? 'normal';
  }

  activeSpecialMode(now: number): SpecialAmmoMode | null {
    if (!this.mode || now >= this.until) {
      this.mode = null;
      this.until = 0;
      return null;
    }
    return this.mode;
  }

  activeUntil(now: number): number {
    return this.activeSpecialMode(now) ? this.until : 0;
  }

  remainingMs(now: number): number {
    return Math.max(0, this.activeUntil(now) - now);
  }

  reset(): void {
    this.mode = null;
    this.until = 0;
  }
}
