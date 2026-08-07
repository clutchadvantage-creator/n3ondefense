import type { ModRarity, ModDropSource, RunProtocolId } from './types.ts';

export const MOD_BALANCE = {
  maxRank: 3,
  duplicateRequirements: { 2: 1, 3: 2 } as const,
  rankCreditCosts: { 2: 600, 3: 1200 } as const,
  conditionalDirectDamageBonusCap: 0.3,
  duplicateCreditValueByRarity: { common: 100, uncommon: 180, rare: 320, prototype: 550, legendary: 900 } satisfies Record<ModRarity, number>,
  duplicatePlasmaValueByRarity: { common: 1, uncommon: 2, rare: 3, prototype: 5, legendary: 8 } satisfies Record<ModRarity, number>,
  infusionPlasmaCost: { 'enemy-growth': 5, 'detonation-fireworks': 7 } as const,
  dropChance: { normalEnemy: 0.0005, eliteEnemy: 0.04, milestone: 0.12 } satisfies Record<ModDropSource, number>,
  rarityWeights: { common: 56, uncommon: 27, rare: 12, prototype: 4.5, legendary: 0.5 } satisfies Record<ModRarity, number>,
  raritySourceMultipliers: {
    normalEnemy: { common: 1, uncommon: 0.65, rare: 0.25, prototype: 0, legendary: 0 },
    eliteEnemy: { common: 0.7, uncommon: 1, rare: 1.4, prototype: 0.8, legendary: 0.2 },
    milestone: { common: 0.5, uncommon: 1, rare: 1.7, prototype: 1.5, legendary: 0.5 }
  } satisfies Record<ModDropSource, Record<ModRarity, number>>,
  rarityRoundBonusPerRound: 0.025,
  guaranteedMilestoneEveryRounds: 5,
  splitCurrent: { damageShare: { 1: 0.2, 2: 0.3, 3: 0.4 }, radius: { 1: 150, 2: 180, 3: 220 } },
  fracturedCurrent: { extraShotEnergyCost: 0.25, damageShare: { 1: 0.25, 2: 0.35, 3: 0.45 }, radius: { 1: 160, 2: 195, 3: 235 } },
  emergencyCapacitor: { healthThreshold: 0.25, energyShare: { 1: 0.2, 2: 0.35, 3: 0.5 }, rank3SpeedMultiplier: 1.18, rank3SpeedDurationMs: 2500 },
  priorityTargeting: { markedDurationMs: 2500, rank3TurretDamageBonus: 0.1 },
  emergencyShield: { durationMs: { 1: 1000, 2: 2000, 3: 2000 }, cooldownMs: 30_000, knockbackRadius: 125, knockbackSpeed: 260 },
  magneticPayload: { preDetonationMs: 240, pullRadius: { 1: 105, 2: 125, 3: 140 }, pullStrength: { 1: 105, 2: 155, 3: 195 }, rank3SlowFactor: 0.72, rank3SlowDurationMs: 1400 }
} as const;

export interface RunProtocolDefinition {
  id: RunProtocolId;
  label: string;
  description: string;
  unlockHighestRound: number;
  startingRound: number;
  scoreMultiplier: number;
  modDropMultiplier: number;
}

export const RUN_PROTOCOLS: Record<RunProtocolId, RunProtocolDefinition> = {
  normal: { id: 'normal', label: 'NORMAL PROTOCOL', description: 'Classic operation beginning at Round 1.', unlockHighestRound: 0, startingRound: 1, scoreMultiplier: 1, modDropMultiplier: 1 },
  overdrive: { id: 'overdrive', label: 'OVERDRIVE PROTOCOL', description: 'Begin at Round 5. Skipped rounds grant no rewards.', unlockHighestRound: 8, startingRound: 5, scoreMultiplier: 1.25, modDropMultiplier: 1.35 }
};
