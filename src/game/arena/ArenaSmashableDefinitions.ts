import type { ArenaSmashableDurability, ArenaSmashableKind, PickupType } from '../types.ts';

export type ArenaSmashableLoot = Extract<PickupType,
  'credits' | 'health' | 'energy' | 'coreToken' | 'damageBoost' | 'speedBoost'
  | 'rapidFire' | 'ricochet' | 'grenadeRounds' | 'scattershot'>;

export interface ArenaSmashableDefinition {
  kind: ArenaSmashableKind;
  durability: ArenaSmashableDurability;
  width: number;
  height: number;
  lootChance: number;
}

export const ARENA_SMASHABLE_DURABILITY: Readonly<Record<ArenaSmashableDurability, number>> = {
  light: 55,
  medium: 115,
  heavy: 210
};

export const ARENA_SMASHABLE_DEFINITIONS: readonly ArenaSmashableDefinition[] = Object.freeze([
  { kind: 'supply-locker', durability: 'medium', width: 44, height: 62, lootChance: 0.30 },
  { kind: 'vending-unit', durability: 'heavy', width: 50, height: 70, lootChance: 0.38 },
  { kind: 'server-tower', durability: 'medium', width: 42, height: 62, lootChance: 0.25 },
  { kind: 'neon-canister', durability: 'light', width: 32, height: 42, lootChance: 0.20 },
  { kind: 'maintenance-cart', durability: 'light', width: 56, height: 34, lootChance: 0.19 },
  { kind: 'equipment-case', durability: 'medium', width: 58, height: 36, lootChance: 0.30 },
  { kind: 'tool-cabinet', durability: 'medium', width: 46, height: 58, lootChance: 0.26 },
  { kind: 'battery-rack', durability: 'heavy', width: 56, height: 56, lootChance: 0.34 },
  { kind: 'drone-dock', durability: 'light', width: 52, height: 32, lootChance: 0.18 },
  { kind: 'containment-bin', durability: 'heavy', width: 62, height: 44, lootChance: 0.36 }
]);

// Deliberately excludes Mods, Flux Cores, and Plasma Chips.
export const ARENA_SMASHABLE_LOOT_TABLE: readonly { type: ArenaSmashableLoot; weight: number }[] = Object.freeze([
  { type: 'credits', weight: 36 },
  { type: 'health', weight: 13 },
  { type: 'energy', weight: 13 },
  { type: 'coreToken', weight: 2 },
  { type: 'damageBoost', weight: 7 },
  { type: 'speedBoost', weight: 7 },
  { type: 'rapidFire', weight: 6 },
  { type: 'ricochet', weight: 5 },
  { type: 'grenadeRounds', weight: 5 },
  { type: 'scattershot', weight: 6 }
]);

export const resolveArenaSmashableLoot = (unitRoll: number): ArenaSmashableLoot => {
  const total = ARENA_SMASHABLE_LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
  let remaining = Math.max(0, Math.min(0.999999, unitRoll)) * total;
  for (const entry of ARENA_SMASHABLE_LOOT_TABLE) {
    remaining -= entry.weight;
    if (remaining < 0) return entry.type;
  }
  return 'credits';
};
