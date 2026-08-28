import type { SpecialAmmoMode } from './TemporaryAmmoMode.ts';

export type TemporaryOffensiveEffectId = 'grenadeRounds' | 'scattershot' | 'damageBoost';

export interface TemporaryOffensiveEffectDefinition {
  affectsPlayerWeapon: true;
  turretShareEligible: true;
  turretDurationScale: number;
  gameplayPayload: Readonly<
    | { kind: 'ammo-mode'; mode: SpecialAmmoMode }
    | { kind: 'damage-multiplier' }
  >;
}

export const TURRET_WEAPON_SYNC_DURATION_SCALE = 0.8;

/** Data-driven opt-in list. Future temporary offensive pickups can join
 * Weapon Sync without adding another turret-specific conditional system. */
export const TEMPORARY_OFFENSIVE_EFFECTS: Readonly<Record<TemporaryOffensiveEffectId, TemporaryOffensiveEffectDefinition>> = Object.freeze({
  grenadeRounds: {
    affectsPlayerWeapon: true,
    turretShareEligible: true,
    turretDurationScale: TURRET_WEAPON_SYNC_DURATION_SCALE,
    gameplayPayload: { kind: 'ammo-mode', mode: 'grenade' }
  },
  scattershot: {
    affectsPlayerWeapon: true,
    turretShareEligible: true,
    turretDurationScale: TURRET_WEAPON_SYNC_DURATION_SCALE,
    gameplayPayload: { kind: 'ammo-mode', mode: 'scattershot' }
  },
  damageBoost: {
    affectsPlayerWeapon: true,
    turretShareEligible: true,
    turretDurationScale: TURRET_WEAPON_SYNC_DURATION_SCALE,
    gameplayPayload: { kind: 'damage-multiplier' }
  }
});

/** Encounter-only state for Legendary Sentry Dominion. It contains no save
 * data and validates every read against the still-active player effect. */
export class TurretWeaponSyncController {
  private ammoMode: SpecialAmmoMode | null = null;
  private ammoUntil = 0;
  private damageUntil = 0;

  inherit(effectId: TemporaryOffensiveEffectId, now: number, playerUntil: number, enabled: boolean): number {
    if (!enabled) return 0;
    const definition = TEMPORARY_OFFENSIVE_EFFECTS[effectId];
    if (!definition.turretShareEligible) return 0;
    const safeNow = Number.isFinite(now) ? now : 0;
    const safePlayerUntil = Math.max(safeNow, Number.isFinite(playerUntil) ? playerUntil : safeNow);
    const inheritedUntil = Math.min(
      safePlayerUntil,
      safeNow + (safePlayerUntil - safeNow) * definition.turretDurationScale
    );
    if (definition.gameplayPayload.kind === 'ammo-mode') {
      this.ammoMode = definition.gameplayPayload.mode;
      this.ammoUntil = inheritedUntil;
    } else {
      this.damageUntil = inheritedUntil;
    }
    return inheritedUntil;
  }

  activeAmmoMode(now: number, playerMode: SpecialAmmoMode | null, enabled: boolean): SpecialAmmoMode | null {
    if (!enabled || !this.ammoMode || playerMode !== this.ammoMode || now >= this.ammoUntil) {
      this.ammoMode = null;
      this.ammoUntil = 0;
      return null;
    }
    return this.ammoMode;
  }

  damageBoostActive(now: number, playerDamageBoostUntil: number, enabled: boolean): boolean {
    if (!enabled || now >= playerDamageBoostUntil || now >= this.damageUntil) {
      this.damageUntil = 0;
      return false;
    }
    return true;
  }

  activeAmmoUntil(now: number): number { return now < this.ammoUntil ? this.ammoUntil : 0; }
  activeDamageUntil(now: number): number { return now < this.damageUntil ? this.damageUntil : 0; }

  reset(): void {
    this.ammoMode = null;
    this.ammoUntil = 0;
    this.damageUntil = 0;
  }
}
