import { MOD_BALANCE } from './modBalance.ts';
import { MOD_BY_ID } from './definitions.ts';
import type { EquippedModSnapshot, LocalModCollection, ModInfusionId, ModRank } from './types.ts';
import { MOD_INFUSION_BY_ID } from './infusions.ts';

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
      snapshot.forEach(({ id, rank, infusionId }) => {
        if (!MOD_BY_ID.has(id) || this.equipped.has(id)) return;
        this.equipped.set(id, Math.max(0, Math.min(3, Math.floor(rank))) as ModRank);
        // Old run snapshots contain only id/rank. Resolve those from the exact
        // currently equipped card so in-progress local sessions remain valid.
        addInfusion(id, infusionId ?? equippedCardFor(id)?.infusionId);
      });
      return;
    }
    for (const modId of Object.values(loadout?.slots ?? {})) {
      if (!modId || this.equipped.has(modId)) continue;
      const owned = mods.inventory[modId];
      const card = equippedCardFor(modId);
      if (owned?.discovered) {
        this.equipped.set(modId, card?.upgradeLevel ?? owned.rank);
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
  naniteFuelSpeedMultiplier(): number {
    return this.has('nanite-fuel') ? MOD_BALANCE.naniteFuel.speedMultiplier[this.rank('nanite-fuel')] : 1;
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
