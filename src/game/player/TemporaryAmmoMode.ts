export type TemporaryAmmoMode = 'normal' | 'grenade' | 'scattershot';
export type SpecialAmmoMode = Exclude<TemporaryAmmoMode, 'normal'>;

export const TEMPORARY_AMMO_BALANCE = {
  durationMs: 45_000,
  overdriveMaximumDurationMs: 90_000,
  grenade: {
    /** Dedicated cadence intentionally reads permanent weapon.fireRate rather
     * than Player.fireRate, so Rapid Fire and field cadence buffs cannot turn
     * grenades into automatic artillery. */
    baseFireIntervalMs: 520,
    minimumFireIntervalMs: 420,
    maximumFireIntervalMs: 650,
    referencePermanentFireRate: 9,
    turretFireIntervalMs: 820,
    projectileSpeedMultiplier: 0.62,
    projectileLifetimeMs: 2_400,
    splashRadius: 32,
    splashDamageMultiplier: 0.35,
    width: 14,
    height: 9,
    minimumBounces: 2,
    maximumBounces: 3,
    firstBounceDelayMs: 470,
    bounceDelayScale: 0.78,
    velocityRetentionPerBounce: 0.76,
    initialArcHeight: 38,
    arcHeightScalePerBounce: 0.7,
    spinRadiansPerSecond: 8.5,
    fuseMs: 2_150
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

export const grenadeBounceCountForSequence = (sequence: number): number => {
  const span = TEMPORARY_AMMO_BALANCE.grenade.maximumBounces
    - TEMPORARY_AMMO_BALANCE.grenade.minimumBounces + 1;
  return TEMPORARY_AMMO_BALANCE.grenade.minimumBounces
    + Math.abs(Math.floor(Number.isFinite(sequence) ? sequence : 0)) % span;
};

/** Permanent weapon progression still helps, but the hard lower bound keeps
 * the temporary launcher deliberate. Temporary Rapid Fire is never an input. */
export const grenadeFireIntervalMs = (permanentFireRate: number): number => {
  const safeRate = Math.max(0.1, Number.isFinite(permanentFireRate) ? permanentFireRate : 1);
  const scaled = TEMPORARY_AMMO_BALANCE.grenade.baseFireIntervalMs
    * TEMPORARY_AMMO_BALANCE.grenade.referencePermanentFireRate / safeRate;
  return Math.max(
    TEMPORARY_AMMO_BALANCE.grenade.minimumFireIntervalMs,
    Math.min(TEMPORARY_AMMO_BALANCE.grenade.maximumFireIntervalMs, scaled)
  );
};

export const grenadeArcHeight = (
  now: number,
  bounceStartedAt: number,
  nextBounceAt: number,
  maximumHeight: number
): number => {
  const duration = Math.max(1, nextBounceAt - bounceStartedAt);
  const progress = Math.max(0, Math.min(1, (now - bounceStartedAt) / duration));
  return Math.sin(progress * Math.PI) * Math.max(0, maximumHeight);
};

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
