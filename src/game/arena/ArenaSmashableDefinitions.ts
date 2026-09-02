import type { ArenaSmashableDurability, ArenaSmashableKind, PickupType } from '../types.ts';

export type ArenaSmashableLoot = Extract<PickupType,
  'credits' | 'health' | 'energy' | 'coreToken' | 'damageBoost' | 'speedBoost'
  | 'rapidFire' | 'ricochet' | 'grenadeRounds' | 'scattershot' | 'plasmaChip' | 'fluxCore'>;

export type SmashableEnvironment = 'arena' | 'heist';
export type SmashableDestructionFamily = 'cabinet' | 'electronics' | 'power' | 'equipment';

export interface ArenaSmashableDefinition {
  kind: ArenaSmashableKind;
  durability: ArenaSmashableDurability;
  width: number;
  height: number;
  destructionFamily: SmashableDestructionFamily;
}

export const ARENA_SMASHABLE_DURABILITY: Readonly<Record<ArenaSmashableDurability, number>> = {
  light: 55,
  medium: 115,
  heavy: 210
};

export const ARENA_SMASHABLE_DEFINITIONS: readonly ArenaSmashableDefinition[] = Object.freeze([
  { kind: 'supply-locker', durability: 'medium', width: 44, height: 62, destructionFamily: 'cabinet' },
  { kind: 'vending-unit', durability: 'heavy', width: 50, height: 70, destructionFamily: 'electronics' },
  { kind: 'server-tower', durability: 'medium', width: 42, height: 62, destructionFamily: 'electronics' },
  { kind: 'neon-canister', durability: 'light', width: 32, height: 42, destructionFamily: 'power' },
  { kind: 'maintenance-cart', durability: 'light', width: 56, height: 34, destructionFamily: 'equipment' },
  { kind: 'equipment-case', durability: 'medium', width: 58, height: 36, destructionFamily: 'equipment' },
  { kind: 'tool-cabinet', durability: 'medium', width: 46, height: 58, destructionFamily: 'cabinet' },
  { kind: 'battery-rack', durability: 'heavy', width: 56, height: 56, destructionFamily: 'power' },
  { kind: 'drone-dock', durability: 'light', width: 52, height: 32, destructionFamily: 'electronics' },
  { kind: 'containment-bin', durability: 'heavy', width: 62, height: 44, destructionFamily: 'power' }
]);

// Every prop yields one small physical bonus. Credits dominate; premium
// progression currencies are intentionally rare and always use one pickup.
export const ARENA_SMASHABLE_LOOT_TABLE: readonly { type: ArenaSmashableLoot; weight: number }[] = Object.freeze([
  { type: 'credits', weight: 55 },
  { type: 'health', weight: 13 },
  { type: 'energy', weight: 13 },
  { type: 'coreToken', weight: 2.4 },
  { type: 'plasmaChip', weight: 0.8 },
  { type: 'fluxCore', weight: 0.35 },
  { type: 'damageBoost', weight: 4 },
  { type: 'speedBoost', weight: 4 },
  { type: 'rapidFire', weight: 3 },
  { type: 'ricochet', weight: 1.8 },
  { type: 'grenadeRounds', weight: 1.3 },
  { type: 'scattershot', weight: 1.35 }
]);

// HEIST scenery remains a tiny side bonus. The vault is still overwhelmingly
// more valuable than searching the facility furniture.
export const HEIST_SMASHABLE_LOOT_TABLE: readonly { type: ArenaSmashableLoot; weight: number }[] = Object.freeze([
  { type: 'credits', weight: 48 },
  { type: 'health', weight: 15 },
  { type: 'energy', weight: 15 },
  { type: 'coreToken', weight: 3 },
  { type: 'plasmaChip', weight: 1.2 },
  { type: 'fluxCore', weight: 0.55 },
  { type: 'damageBoost', weight: 4.5 },
  { type: 'speedBoost', weight: 4.5 },
  { type: 'rapidFire', weight: 3.5 },
  { type: 'ricochet', weight: 1.8 },
  { type: 'grenadeRounds', weight: 1.4 },
  { type: 'scattershot', weight: 1.55 }
]);

const normalizeRoll = (roll: number): number => Math.max(0, Math.min(0.999999, roll));

const resolveWeightedLoot = (
  table: readonly { type: ArenaSmashableLoot; weight: number }[],
  unitRoll: number
): ArenaSmashableLoot => {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let remaining = normalizeRoll(unitRoll) * total;
  for (const entry of table) {
    remaining -= entry.weight;
    if (remaining < 0) return entry.type;
  }
  return 'credits';
};

export const resolveArenaSmashableLoot = (unitRoll: number): ArenaSmashableLoot => {
  return resolveWeightedLoot(ARENA_SMASHABLE_LOOT_TABLE, unitRoll);
};

export const resolveSmashableLootDrops = (
  environment: SmashableEnvironment,
  unitRoll: number
): readonly ArenaSmashableLoot[] => {
  const table = environment === 'heist' ? HEIST_SMASHABLE_LOOT_TABLE : ARENA_SMASHABLE_LOOT_TABLE;
  const roll = normalizeRoll(unitRoll);
  const first = resolveWeightedLoot(table, roll);
  const combinationRoll = (roll * 13.731 + 0.417) % 1;
  const combinationChance = environment === 'heist' ? 0.14 : 0.055;
  if (combinationRoll >= combinationChance) return [first];
  let second = resolveWeightedLoot(table, (roll * 7.193 + 0.263) % 1);
  if (second === first) second = resolveWeightedLoot(table, (roll * 5.117 + 0.691) % 1);
  return second === first ? [first] : [first, second];
};
