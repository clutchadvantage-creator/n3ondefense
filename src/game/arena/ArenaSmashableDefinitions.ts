import type { ArenaSmashableDurability, ArenaSmashableKind, PickupType } from '../types.ts';

export type ArenaSmashableLoot = Extract<PickupType,
  'credits' | 'health' | 'energy' | 'coreToken' | 'damageBoost' | 'speedBoost'
  | 'rapidFire' | 'ricochet' | 'grenadeRounds' | 'scattershot'>;

export type SmashableEnvironment = 'arena' | 'heist';
export type SmashableDestructionFamily = 'cabinet' | 'electronics' | 'power' | 'equipment';

export interface ArenaSmashableDefinition {
  kind: ArenaSmashableKind;
  durability: ArenaSmashableDurability;
  width: number;
  height: number;
  lootChance: number;
  destructionFamily: SmashableDestructionFamily;
}

export const ARENA_SMASHABLE_DURABILITY: Readonly<Record<ArenaSmashableDurability, number>> = {
  light: 55,
  medium: 115,
  heavy: 210
};

export const ARENA_SMASHABLE_DEFINITIONS: readonly ArenaSmashableDefinition[] = Object.freeze([
  { kind: 'supply-locker', durability: 'medium', width: 44, height: 62, lootChance: 0.30, destructionFamily: 'cabinet' },
  { kind: 'vending-unit', durability: 'heavy', width: 50, height: 70, lootChance: 0.38, destructionFamily: 'electronics' },
  { kind: 'server-tower', durability: 'medium', width: 42, height: 62, lootChance: 0.25, destructionFamily: 'electronics' },
  { kind: 'neon-canister', durability: 'light', width: 32, height: 42, lootChance: 0.20, destructionFamily: 'power' },
  { kind: 'maintenance-cart', durability: 'light', width: 56, height: 34, lootChance: 0.19, destructionFamily: 'equipment' },
  { kind: 'equipment-case', durability: 'medium', width: 58, height: 36, lootChance: 0.30, destructionFamily: 'equipment' },
  { kind: 'tool-cabinet', durability: 'medium', width: 46, height: 58, lootChance: 0.26, destructionFamily: 'cabinet' },
  { kind: 'battery-rack', durability: 'heavy', width: 56, height: 56, lootChance: 0.34, destructionFamily: 'power' },
  { kind: 'drone-dock', durability: 'light', width: 52, height: 32, lootChance: 0.18, destructionFamily: 'electronics' },
  { kind: 'containment-bin', durability: 'heavy', width: 62, height: 44, lootChance: 0.36, destructionFamily: 'power' }
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

// HEIST scenery is a little more worth searching, but it still cannot yield
// Mods or premium progression currencies. Vault containers remain the source
// of the anomaly's high-value rewards.
export const HEIST_SMASHABLE_LOOT_TABLE: readonly { type: ArenaSmashableLoot; weight: number }[] = Object.freeze([
  { type: 'credits', weight: 30 },
  { type: 'health', weight: 18 },
  { type: 'energy', weight: 18 },
  { type: 'coreToken', weight: 3 },
  { type: 'damageBoost', weight: 6 },
  { type: 'speedBoost', weight: 6 },
  { type: 'rapidFire', weight: 5 },
  { type: 'ricochet', weight: 4 },
  { type: 'grenadeRounds', weight: 5 },
  { type: 'scattershot', weight: 5 }
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

export const smashableLootChance = (
  definition: ArenaSmashableDefinition,
  environment: SmashableEnvironment
): number => Math.min(0.52, definition.lootChance * (environment === 'heist' ? 1.22 : 0.72));

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
