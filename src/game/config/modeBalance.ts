/**
 * Authoritative Normal-versus-Overdrive tuning.
 *
 * Round curves, Contracts, Mods, and archetype-specific values are applied by
 * their owning systems. These multipliers are applied once, at the final
 * combat/drop pipeline for the selected protocol family.
 */
import type { RunProtocolId } from '../mods/types.ts';
import { getSupremeStage } from '../progression/SupremeProgression.ts';

export type RunModeFamily = 'normal' | 'overdrive' | 'supreme';

export interface ModeBalanceDefinition {
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  enemySpeedMultiplier: number;
  hazardDamageMultiplier: number;
  enemyDefuseTimeMultiplier: number;
  spawnCadenceMultiplier: number;
  /** Bounded multiplier for simultaneous standard-enemy count/weight caps. */
  activePressureMultiplier: number;
  /** Relative weighting for tanks, disruptors, and star enemies. */
  elitePressureMultiplier: number;
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
    activePressureMultiplier: 1,
    elitePressureMultiplier: 1,
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
    usesUnlockedStartingRounds: true
  },
  overdrive: {
    enemyHealthMultiplier: 1,
    enemyDamageMultiplier: 1,
    enemySpeedMultiplier: 1,
    hazardDamageMultiplier: 1,
    enemyDefuseTimeMultiplier: 1,
    spawnCadenceMultiplier: 1,
    activePressureMultiplier: 1,
    elitePressureMultiplier: 1,
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
  },
  // The baseline is Supreme Leo. A selected Supreme protocol resolves to its
  // exact stage below; this fallback keeps family-only boss helpers valid.
  supreme: {
    enemyHealthMultiplier: 1.35,
    enemyDamageMultiplier: 1.22,
    enemySpeedMultiplier: 1.04,
    hazardDamageMultiplier: 1.25,
    enemyDefuseTimeMultiplier: 0.9,
    spawnCadenceMultiplier: 0.9,
    activePressureMultiplier: 1.06,
    elitePressureMultiplier: 1.15,
    bossHealthMultiplier: 1.4,
    bossDamageMultiplier: 1.22,
    pickupStackLimit: 2,
    resourcePickupCapMultiplier: 2,
    overhealthEnabled: true,
    overchargeEnabled: true,
    modDropChanceMultiplier: 1.48,
    highRarityWeightMultiplier: 1.2,
    legendaryWeightMultiplier: 1.9,
    scoreMultiplier: 1.55,
    usesUnlockedStartingRounds: true
  }
} as const;

export const getModeBalance = (family: RunModeFamily): ModeBalanceDefinition => MODE_BALANCE[family];

export const getProtocolModeBalance = (protocolOrFamily: RunModeFamily | RunProtocolId): ModeBalanceDefinition =>
  getSupremeStage(protocolOrFamily)?.difficulty
  ?? MODE_BALANCE[protocolOrFamily === 'normal' ? 'normal' : protocolOrFamily === 'supreme' ? 'supreme' : 'overdrive'];

export const applyEnemyHealthMode = (health: number, protocolOrFamily: RunModeFamily | RunProtocolId): number =>
  Math.max(0, health) * getProtocolModeBalance(protocolOrFamily).enemyHealthMultiplier;

export const applyEnemyDamageMode = (damage: number, protocolOrFamily: RunModeFamily | RunProtocolId): number =>
  Math.max(0, damage) * getProtocolModeBalance(protocolOrFamily).enemyDamageMultiplier;

export const applyHazardDamageMode = (damage: number, protocolOrFamily: RunModeFamily | RunProtocolId): number =>
  Math.max(0, damage) * getProtocolModeBalance(protocolOrFamily).hazardDamageMultiplier;

export const getEnemyDefuseDuration = (baseDurationMs: number, protocolOrFamily: RunModeFamily | RunProtocolId): number =>
  Math.max(0, baseDurationMs) * getProtocolModeBalance(protocolOrFamily).enemyDefuseTimeMultiplier;

export const getModeSpawnCadence = (baseCadenceMs: number, protocolOrFamily: RunModeFamily | RunProtocolId): number =>
  Math.max(0, baseCadenceMs) * getProtocolModeBalance(protocolOrFamily).spawnCadenceMultiplier;
