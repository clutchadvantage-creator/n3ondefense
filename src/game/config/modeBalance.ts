/**
 * Authoritative Normal-versus-Overdrive tuning.
 *
 * Round curves, Contracts, Mods, and archetype-specific values are applied by
 * their owning systems. These multipliers are applied once, at the final
 * combat/drop pipeline for the selected protocol family.
 */
export type RunModeFamily = 'normal' | 'overdrive';

export interface ModeBalanceDefinition {
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  enemySpeedMultiplier: number;
  hazardDamageMultiplier: number;
  enemyDefuseTimeMultiplier: number;
  spawnCadenceMultiplier: number;
  bossHealthMultiplier: number;
  bossDamageMultiplier: number;
  pickupStackLimit: number;
  resourcePickupCapMultiplier: number;
  overhealthEnabled: boolean;
  overchargeEnabled: boolean;
  modDropChanceMultiplier: number;
  highRarityWeightMultiplier: number;
  legendaryWeightMultiplier: number;
  scoreMultiplier: number;
  usesUnlockedStartingRounds: boolean;
}

export const MODE_BALANCE: Record<RunModeFamily, ModeBalanceDefinition> = {
  normal: {
    enemyHealthMultiplier: 0.76,
    enemyDamageMultiplier: 0.72,
    enemySpeedMultiplier: 1,
    hazardDamageMultiplier: 0.7,
    enemyDefuseTimeMultiplier: 1.32,
    // Lower cadence means a modestly faster stream, while existing count and
    // weight caps remain the authoritative performance ceiling.
    spawnCadenceMultiplier: 0.92,
    bossHealthMultiplier: 0.76,
    bossDamageMultiplier: 0.78,
    pickupStackLimit: 1,
    resourcePickupCapMultiplier: 1,
    overhealthEnabled: false,
    overchargeEnabled: false,
    modDropChanceMultiplier: 1,
    highRarityWeightMultiplier: 1,
    legendaryWeightMultiplier: 1,
    scoreMultiplier: 1,
    usesUnlockedStartingRounds: false
  },
  overdrive: {
    enemyHealthMultiplier: 1,
    enemyDamageMultiplier: 1,
    enemySpeedMultiplier: 1,
    hazardDamageMultiplier: 1,
    enemyDefuseTimeMultiplier: 1,
    spawnCadenceMultiplier: 1,
    bossHealthMultiplier: 1,
    bossDamageMultiplier: 1,
    pickupStackLimit: 2,
    resourcePickupCapMultiplier: 2,
    overhealthEnabled: true,
    overchargeEnabled: true,
    modDropChanceMultiplier: 1.35,
    highRarityWeightMultiplier: 1.12,
    legendaryWeightMultiplier: 1.75,
    scoreMultiplier: 1.25,
    usesUnlockedStartingRounds: true
  }
} as const;

export const getModeBalance = (family: RunModeFamily): ModeBalanceDefinition => MODE_BALANCE[family];

export const applyEnemyHealthMode = (health: number, family: RunModeFamily): number =>
  Math.max(0, health) * MODE_BALANCE[family].enemyHealthMultiplier;

export const applyEnemyDamageMode = (damage: number, family: RunModeFamily): number =>
  Math.max(0, damage) * MODE_BALANCE[family].enemyDamageMultiplier;

export const applyHazardDamageMode = (damage: number, family: RunModeFamily): number =>
  Math.max(0, damage) * MODE_BALANCE[family].hazardDamageMultiplier;

export const getEnemyDefuseDuration = (baseDurationMs: number, family: RunModeFamily): number =>
  Math.max(0, baseDurationMs) * MODE_BALANCE[family].enemyDefuseTimeMultiplier;

export const getModeSpawnCadence = (baseCadenceMs: number, family: RunModeFamily): number =>
  Math.max(0, baseCadenceMs) * MODE_BALANCE[family].spawnCadenceMultiplier;
