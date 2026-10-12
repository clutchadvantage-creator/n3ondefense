import { TEMPORARY_AMMO_BALANCE as AMMO, type TemporaryAmmoMode } from './TemporaryAmmoMode.ts';

/** Physics and ammunition identity are independent of the equipped artwork. */
export interface ProjectileBehaviorProfile {
  readonly speedMultiplier: number;
  readonly damageMultiplier: number;
  readonly lifetimeMs: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly surfaceContact: 'airborne' | 'bouncing';
}

export const PROJECTILE_BEHAVIOR_PROFILES: Readonly<Record<TemporaryAmmoMode, ProjectileBehaviorProfile>> = {
  normal: { speedMultiplier: 1, damageMultiplier: 1, lifetimeMs: 950, bodyWidth: 8, bodyHeight: 8, surfaceContact: 'airborne' },
  grenade: { speedMultiplier: AMMO.grenade.projectileSpeedMultiplier, damageMultiplier: 1,
    lifetimeMs: AMMO.grenade.projectileLifetimeMs, bodyWidth: AMMO.grenade.width, bodyHeight: AMMO.grenade.height, surfaceContact: 'bouncing' },
  scattershot: { speedMultiplier: AMMO.scattershot.projectileSpeedMultiplier, damageMultiplier: AMMO.scattershot.pelletDamageMultiplier,
    lifetimeMs: AMMO.scattershot.projectileLifetimeMs, bodyWidth: AMMO.scattershot.width, bodyHeight: AMMO.scattershot.height, surfaceContact: 'airborne' }
};
