import { MOD_BALANCE } from './modBalance.ts';
import { MOD_BY_ID } from './definitions.ts';
import type { EquippedModSnapshot, LocalModCollection, ModInfusionId, ModRank, ModStat } from './types.ts';
import { MOD_INFUSION_BY_ID } from './infusions.ts';
import { isLegendaryModId } from './ModLoadoutRules.ts';

/** Engine-stability ceilings, not intended balance nerfs. They prevent future
 * Supreme combinations from producing zero cooldowns or unbounded entities. */
export const SUPREME_MOD_STABILITY_CAPS = {
  legacyMinimumMultiplier: 0.05,
  minimumMultiplier: 0.12,
  defaultMaximumMultiplier: 8,
  multiplier: {
    playerMoveSpeed: 2.75,
    weaponProjectileSpeed: 3,
    playerPickupRadius: 5,
    buffDuration: 5,
    bombDuration: 4,
    gasDamageTaken: 1
  } satisfies Partial<Record<ModStat, number>>,
  addition: {
    weaponCritChance: 0.6,
    fenceMaxActive: 8,
    turretMaxActive: 6,
    mineMaxActive: 8
  } satisfies Partial<Record<ModStat, number>>
} as const;

export class ModRuntime {
  private readonly equipped = new Map<string, ModRank>();
  private readonly infusions = new Set<ModInfusionId>();
  private readonly infusionByModId = new Map<string, ModInfusionId>();
  private emergencyCapacitorUsed = false;
  private previousHealthRatio = 1;
  private readonly bombShieldCooldownUntil = new Map<string, number>();
  private readonly bombShieldActiveUntil = new Map<string, number>();

  constructor(mods: LocalModCollection, snapshot?: EquippedModSnapshot[]) {
    const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const equippedCardFor = (modId: string) => {
      const slot = Object.entries(loadout?.slots ?? {}).find(([, equippedId]) => equippedId === modId)?.[0] as keyof typeof loadout.slots | undefined;
      return slot ? mods.cards.find((entry) => entry.instanceId === loadout.cardSlots[slot] && entry.modId === modId) : undefined;
    };
    const addInfusion = (modId: string, infusionId: ModInfusionId | undefined): void => {
      if (!infusionId || !MOD_INFUSION_BY_ID.has(infusionId)) return;
      this.infusions.add(infusionId);
      this.infusionByModId.set(modId, infusionId);
    };

    if (snapshot) {
      let hasLegendary = false;
      snapshot.forEach(({ id, rank, infusionId }) => {
        if (!MOD_BY_ID.has(id) || this.equipped.has(id)) return;
        if (isLegendaryModId(id) && hasLegendary) return;
        this.equipped.set(id, Math.max(0, Math.min(3, Math.floor(rank))) as ModRank);
        if (isLegendaryModId(id)) hasLegendary = true;
        // Old run snapshots contain only id/rank. Resolve those from the exact
        // currently equipped card so in-progress local sessions remain valid.
        addInfusion(id, infusionId ?? equippedCardFor(id)?.infusionId);
      });
      return;
    }
    let hasLegendary = false;
    for (const modId of Object.values(loadout?.slots ?? {})) {
      if (!modId || this.equipped.has(modId)) continue;
      if (isLegendaryModId(modId) && hasLegendary) continue;
      const owned = mods.inventory[modId];
      const card = equippedCardFor(modId);
      if (owned?.discovered) {
        this.equipped.set(modId, card?.upgradeLevel ?? owned.rank);
        if (isLegendaryModId(modId)) hasLegendary = true;
        addInfusion(modId, card?.infusionId);
      }
    }
  }

  beginRound(initialHealthRatio = 1): void {
    this.emergencyCapacitorUsed = false;
    this.previousHealthRatio = initialHealthRatio;
    this.bombShieldCooldownUntil.clear();
    this.bombShieldActiveUntil.clear();
  }

  rank(modId: string): ModRank | 0 { return this.equipped.get(modId) ?? 0; }
  has(modId: string): boolean { return this.equipped.has(modId); }
  multiplier(stat: ModStat): number {
    let result = 1;
    let includesSupreme = false;
    for (const [modId, rank] of this.equipped) {
      const definition = MOD_BY_ID.get(modId);
      if (definition?.rarity === 'supreme') includesSupreme = true;
      for (const modifier of definition?.modifiers ?? []) {
        if (modifier.stat === stat && modifier.mode === 'multiply') result *= modifier.values[rank];
      }
    }
    if (!includesSupreme) return Math.max(SUPREME_MOD_STABILITY_CAPS.legacyMinimumMultiplier, result);
    const maximum = SUPREME_MOD_STABILITY_CAPS.multiplier[stat as keyof typeof SUPREME_MOD_STABILITY_CAPS.multiplier]
      ?? SUPREME_MOD_STABILITY_CAPS.defaultMaximumMultiplier;
    return Math.min(maximum, Math.max(SUPREME_MOD_STABILITY_CAPS.minimumMultiplier, result));
  }
  addition(stat: ModStat): number {
    let result = 0;
    let includesSupreme = false;
    for (const [modId, rank] of this.equipped) {
      const definition = MOD_BY_ID.get(modId);
      if (definition?.rarity === 'supreme') includesSupreme = true;
      for (const modifier of definition?.modifiers ?? []) {
        if (modifier.stat === stat && modifier.mode === 'add') result += modifier.values[rank];
      }
    }
    if (!includesSupreme) return result;
    const maximum = SUPREME_MOD_STABILITY_CAPS.addition[stat as keyof typeof SUPREME_MOD_STABILITY_CAPS.addition];
    return maximum === undefined ? result : Math.min(maximum, result);
  }
  permanentMoveSpeedMultiplier(): number {
    return this.naniteFuelSpeedMultiplier() * this.multiplier('playerMoveSpeed');
  }
  naniteFuelSpeedMultiplier(): number {
    return this.has('nanite-fuel') ? MOD_BALANCE.naniteFuel.speedMultiplier[this.rank('nanite-fuel')] : 1;
  }
  magneticServiceField(collectionRadius: number): { attractionRadius: number; pullSpeed: number } {
    if (!this.has('magnetic-service')) return { attractionRadius: collectionRadius, pullSpeed: 0 };
    const rank = this.rank('magnetic-service');
    return {
      attractionRadius: collectionRadius * MOD_BALANCE.magneticService.attractionRangeMultiplier[rank],
      pullSpeed: MOD_BALANCE.magneticService.pullSpeed[rank]
    };
  }
  jailbrokeTurretFan(): { streamCount: number; damageShare: number } | null {
    if (!this.has('jailbroke-turrets')) return null;
    const rank = this.rank('jailbroke-turrets');
    return {
      streamCount: MOD_BALANCE.jailbrokeTurrets.streamCount[rank],
      damageShare: MOD_BALANCE.jailbrokeTurrets.streamDamageShare[rank]
    };
  }
  fenceDamageMultiplier(): number {
    return this.has('conductive-fencing') ? MOD_BALANCE.conductiveFencing.damageMultiplier[this.rank('conductive-fencing')] : 1;
  }
  fenceHealthMultiplier(): number {
    return this.has('hardlight-weave') ? MOD_BALANCE.hardlightWeave.healthMultiplier[this.rank('hardlight-weave')] : 1;
  }
  mineDamageMultiplier(): number {
    return this.has('high-yield-mines') ? MOD_BALANCE.highYieldMines.damageMultiplier[this.rank('high-yield-mines')] : 1;
  }
  mineArmTimeMultiplier(): number {
    return this.has('quick-fuse') ? MOD_BALANCE.quickFuse.armTimeMultiplier[this.rank('quick-fuse')] : 1;
  }
  fullRackSalvo(): { spacing: number; staggerMs: number; energyCostMultiplier: number; flightMs: number } | null {
    if (!this.has('full-rack-salvo')) return null;
    const rank = this.rank('full-rack-salvo');
    return {
      spacing: MOD_BALANCE.fullRackSalvo.spacing,
      staggerMs: MOD_BALANCE.fullRackSalvo.staggerMs,
      energyCostMultiplier: MOD_BALANCE.fullRackSalvo.energyCostMultiplier[rank],
      flightMs: MOD_BALANCE.fullRackSalvo.flightMs[rank]
    };
  }
  hasInfusion(infusionId: ModInfusionId): boolean { return this.infusions.has(infusionId); }
  snapshot(): EquippedModSnapshot[] {
    return Array.from(this.equipped, ([id, rank]) => ({ id, rank, infusionId: this.infusionByModId.get(id) }));
  }

  checkEmergencyCapacitor(currentHealthRatio: number): { energyShare: number; speedMultiplier: number; speedDurationMs: number } | null {
    const rank = this.rank('emergency-capacitor');
    const crossed = this.previousHealthRatio >= MOD_BALANCE.emergencyCapacitor.healthThreshold && currentHealthRatio < MOD_BALANCE.emergencyCapacitor.healthThreshold;
    this.previousHealthRatio = currentHealthRatio;
    if (!this.has('emergency-capacitor') || this.emergencyCapacitorUsed || !crossed) return null;
    this.emergencyCapacitorUsed = true;
    return {
      energyShare: MOD_BALANCE.emergencyCapacitor.energyShare[rank],
      speedMultiplier: rank === 3 ? MOD_BALANCE.emergencyCapacitor.rank3SpeedMultiplier : 1,
      speedDurationMs: rank === 3 ? MOD_BALANCE.emergencyCapacitor.rank3SpeedDurationMs : 0
    };
  }

  activateBombShield(siteId: string, now: number): { activeUntil: number; knockback: boolean } | null {
    const rank = this.rank('emergency-shield');
    if (!this.has('emergency-shield') || now < (this.bombShieldCooldownUntil.get(siteId) ?? 0)) return null;
    const activeUntil = now + MOD_BALANCE.emergencyShield.durationMs[rank];
    this.bombShieldActiveUntil.set(siteId, activeUntil);
    this.bombShieldCooldownUntil.set(siteId, now + MOD_BALANCE.emergencyShield.cooldownMs);
    return { activeUntil, knockback: rank === 3 };
  }

  bombShieldBlocks(siteId: string, now: number): boolean { return now < (this.bombShieldActiveUntil.get(siteId) ?? 0); }

  conditionalDamageBonus(bonuses: number[]): number {
    return Math.min(MOD_BALANCE.conditionalDirectDamageBonusCap, bonuses.reduce((sum, bonus) => sum + Math.max(0, bonus), 0));
  }
}
