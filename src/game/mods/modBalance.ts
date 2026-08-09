import type { ModRarity, ModDropSource, RunProtocolId } from './types.ts';

export const MOD_BALANCE = {
  maxRank: 3,
  duplicateRequirements: { 1: 0, 2: 0, 3: 0 } as const,
  rankCreditCosts: { 1: 600, 2: 1200, 3: 2000 } as const,
  conditionalDirectDamageBonusCap: 0.3,
  duplicateCreditValueByRarity: { common: 100, uncommon: 180, rare: 320, epic: 550, legendary: 900 } satisfies Record<ModRarity, number>,
  duplicatePlasmaValueByRarity: { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8 } satisfies Record<ModRarity, number>,
  infusionPlasmaCost: { 'enemy-growth': 5, 'detonation-fireworks': 7 } as const,
  detonationFireworks: { minDurationMs: 20_000, maxDurationMs: 30_000, burstIntervalMs: 520, sparksPerBurst: 12 },
  dropChance: { normalEnemy: 0.0005, eliteEnemy: 0.04, milestone: 0.12, boss: 0.55 } satisfies Record<ModDropSource, number>,
  rarityWeights: { common: 56, uncommon: 27, rare: 12, epic: 4.5, legendary: 0.5 } satisfies Record<ModRarity, number>,
  raritySourceMultipliers: {
    normalEnemy: { common: 1, uncommon: 0.65, rare: 0.25, epic: 0, legendary: 0 },
    eliteEnemy: { common: 0.7, uncommon: 1, rare: 1.4, epic: 0.8, legendary: 0.2 },
    milestone: { common: 0.5, uncommon: 1, rare: 1.7, epic: 1.5, legendary: 0.5 },
    boss: { common: 0.08, uncommon: 0.18, rare: 0.8, epic: 2.2, legendary: 18 }
  } satisfies Record<ModDropSource, Record<ModRarity, number>>,
  rarityRoundBonusPerRound: 0.025,
  guaranteedMilestoneEveryRounds: 5,
  splitCurrent: { damageShare: { 0: 0.15, 1: 0.2, 2: 0.3, 3: 0.4 }, radius: { 0: 130, 1: 150, 2: 180, 3: 220 } },
  fracturedCurrent: { extraShotEnergyCost: 0.25, damageShare: { 0: 0.18, 1: 0.25, 2: 0.35, 3: 0.45 }, radius: { 0: 140, 1: 160, 2: 195, 3: 235 } },
  naniteFuel: { speedMultiplier: { 0: 1.05, 1: 1.075, 2: 1.1, 3: 1.125 } },
  emergencyCapacitor: { healthThreshold: 0.25, energyShare: { 0: 0.1, 1: 0.2, 2: 0.35, 3: 0.5 }, rank3SpeedMultiplier: 1.18, rank3SpeedDurationMs: 2500 },
  priorityTargeting: { markedDurationMs: 2500, rank3TurretDamageBonus: 0.1 },
  emergencyShield: { durationMs: { 0: 500, 1: 1000, 2: 2000, 3: 2000 }, cooldownMs: 30_000, knockbackRadius: 125, knockbackSpeed: 260 },
  magneticPayload: { preDetonationMs: 240, pullRadius: { 0: 90, 1: 105, 2: 125, 3: 140 }, pullStrength: { 0: 75, 1: 105, 2: 155, 3: 195 }, rank3SlowFactor: 0.72, rank3SlowDurationMs: 1400 }
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
