import type { ModRarity, ModDropSource, RunProtocolId } from './types.ts';

export const MOD_BALANCE = {
  maxRank: 3,
  duplicateRequirements: { 1: 0, 2: 0, 3: 0 } as const,
  rankCreditCosts: { 1: 600, 2: 1200, 3: 2000 } as const,
  rankCoreTokenCostsByRarity: {
    common: { 1: 0, 2: 0, 3: 0 },
    uncommon: { 1: 0, 2: 0, 3: 0 },
    rare: { 1: 2, 2: 5, 3: 10 },
    epic: { 1: 15, 2: 40, 3: 90 },
    legendary: { 1: 100, 2: 250, 3: 500 }
  } satisfies Record<ModRarity, Record<1 | 2 | 3, number>>,
  conditionalDirectDamageBonusCap: 0.3,
  duplicateCreditValueByRarity: { common: 100, uncommon: 180, rare: 320, epic: 550, legendary: 900 } satisfies Record<ModRarity, number>,
  duplicatePlasmaValueByRarity: { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8 } satisfies Record<ModRarity, number>,
  infusionPlasmaCost: {
    'enemy-growth': 5,
    'detonation-fireworks': 7,
    'prismatic-rounds': 6,
    'holo-afterimage': 8,
    'pickup-orbit': 6,
    'ghost-echoes': 8,
    'arcade-pop': 5
  } as const,
  detonationFireworks: { minDurationMs: 20_000, maxDurationMs: 30_000, burstIntervalMs: 520, sparksPerBurst: 12 },
  dropChance: { normalEnemy: 0.0005, eliteEnemy: 0.04, milestone: 0.12, boss: 0.62 } satisfies Record<ModDropSource, number>,
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
  magneticService: {
    attractionRangeMultiplier: { 0: 1.75, 1: 2.25, 2: 2.75, 3: 3.5 },
    pullSpeed: { 0: 155, 1: 195, 2: 245, 3: 315 }
  },
  jailbrokeTurrets: {
    streamCount: { 0: 1, 1: 2, 2: 3, 3: 4 },
    streamDamageShare: { 0: 1, 1: 0.7, 2: 0.55, 3: 0.45 }
  },
  conductiveFencing: { damageMultiplier: { 0: 1.1, 1: 1.15, 2: 1.2, 3: 1.25 } },
  highYieldMines: { damageMultiplier: { 0: 1.1, 1: 1.15, 2: 1.2, 3: 1.25 } },
  hardlightWeave: { healthMultiplier: { 0: 1.15, 1: 1.25, 2: 1.35, 3: 1.5 } },
  quickFuse: { armTimeMultiplier: { 0: 0.85, 1: 0.75, 2: 0.65, 3: 0.5 } },
  emergencyCapacitor: { healthThreshold: 0.25, energyShare: { 0: 0.1, 1: 0.2, 2: 0.35, 3: 0.5 }, rank3SpeedMultiplier: 1.18, rank3SpeedDurationMs: 2500 },
  priorityTargeting: { markedDurationMs: 2500, rank3TurretDamageBonus: 0.1 },
  emergencyShield: { durationMs: { 0: 500, 1: 1000, 2: 2000, 3: 2000 }, cooldownMs: 30_000, knockbackRadius: 125, knockbackSpeed: 260 },
  magneticPayload: { preDetonationMs: 240, pullRadius: { 0: 90, 1: 105, 2: 125, 3: 140 }, pullStrength: { 0: 75, 1: 105, 2: 155, 3: 195 }, rank3SlowFactor: 0.72, rank3SlowDurationMs: 1400 },
  fullRackSalvo: {
    spacing: 72,
    staggerMs: 42,
    energyCostMultiplier: { 0: 1, 1: 0.92, 2: 0.84, 3: 0.75 },
    flightMs: { 0: 460, 1: 410, 2: 355, 3: 300 }
  },
  bombsite: {
    fieldRadius: 230,
    fieldScanIntervalMs: 120,
    arcSurge: {
      intervalMs: { 0: 11_000, 1: 10_000, 2: 8_000, 3: 6_000 },
      weaponDamageMultiplier: { 0: 0.32, 1: 0.42, 2: 0.54, 3: 0.68 }
    },
    defuseFeedback: {
      weaponDamageMultiplier: { 0: 0.35, 1: 0.5, 2: 0.68, 3: 0.85 },
      staggerMs: { 0: 0, 1: 0, 2: 220, 3: 360 }
    },
    pressureField: {
      slowFactor: { 0: 0.92, 1: 0.9, 2: 0.85, 3: 0.8 },
      refreshMs: 190
    },
    combatUplink: { fireRateBonus: { 0: 0.04, 1: 0.05, 2: 0.08, 3: 0.12 } },
    countermeasureArray: {
      charges: { 0: 1, 1: 1, 2: 2, 3: 3 },
      threshold: 0.7,
      radius: 265,
      knockbackSpeed: { 0: 265, 1: 300, 2: 335, 3: 380 },
      staggerMs: 650
    },
    killSwitch: {
      killsRequired: { 0: 5, 1: 5, 2: 4, 3: 3 },
      countdownReductionMs: { 0: 500, 1: 650, 2: 850, 3: 1100 }
    },
    hotZone: {
      tickMs: 900,
      maxStacks: { 0: 4, 1: 4, 2: 5, 3: 6 },
      weaponDamageMultiplierPerStack: { 0: 0.045, 1: 0.06, 2: 0.075, 3: 0.09 }
    },
    finalCountdown: {
      thresholdMs: 15_000,
      bonus: { 0: 0.06, 1: 0.08, 2: 0.12, 3: 0.16 }
    },
    capacitorField: { fenceDamageBonus: { 0: 0.08, 1: 0.1, 2: 0.15, 3: 0.2 } },
    sentryUplink: { turretFireRateBonus: { 0: 0.08, 1: 0.1, 2: 0.15, 3: 0.2 } },
    munitionsRelay: { rechargeBonus: { 0: 0.08, 1: 0.1, 2: 0.15, 3: 0.2 } },
    emergencyShielding: { rechargeBonus: { 0: 0.06, 1: 0.08, 2: 0.12, 3: 0.18 } },
    dangerClose: { creditMultiplier: { 0: 1.1, 1: 1.15, 2: 1.25, 3: 1.35 } },
    criticalMass: { spawnCadenceMultiplier: { 0: 1 / 1.15, 1: 1 / 1.16, 2: 1 / 1.18, 3: 1 / 1.2 } },
    unstableReactor: {
      intervalMs: { 0: 9000, 1: 8000, 2: 7000, 3: 6000 },
      warningMs: 760,
      outerRadius: 275,
      innerRadius: 92,
      enemyWeaponDamageMultiplier: { 0: 0.82, 1: 0.98, 2: 1.16, 3: 1.35 },
      playerDamage: { 0: 5, 1: 6, 2: 7, 3: 8 }
    },
    bloodBeacon: {
      creditMultiplier: { 0: 1.35, 1: 1.45, 2: 1.6, 3: 1.75 },
      objectiveAssigneeBonus: { 0: 1, 1: 1, 2: 2, 3: 3 }
    },
    groundZero: {
      threshold: 0.84,
      radius: 340,
      knockbackSpeed: { 0: 420, 1: 470, 2: 520, 3: 580 },
      staggerMs: { 0: 1300, 1: 1550, 2: 1800, 3: 2200 },
      weaponDamageMultiplier: { 0: 1.15, 1: 1.35, 2: 1.55, 3: 1.8 },
      chargedDurationMs: { 0: 3000, 1: 4000, 2: 5000, 3: 6000 },
      chargedTickMs: 650,
      chargedDamageMultiplier: 0.22
    },
    eventHorizon: {
      intervalMs: { 0: 12_000, 1: 11_000, 2: 9000, 3: 8000 },
      warningMs: 780,
      outerRadius: 390,
      killRingRadius: 185,
      pullDurationMs: { 0: 620, 1: 720, 2: 820, 3: 920 },
      pullSpeed: { 0: 170, 1: 205, 2: 245, 3: 285 }
    },
    secondSun: {
      thresholdsMs: [15_000, 10_000, 5_000] as const,
      radius: [175, 225, 290] as const,
      weaponDamageMultiplier: [0.28, 0.5, 0.9] as const,
      rankDamageMultiplier: { 0: 1, 1: 1.12, 2: 1.25, 3: 1.42 },
      slowFactor: 0.72,
      slowDurationMs: 900
    }
  }
} as const;

export interface RunProtocolDefinition {
  id: RunProtocolId;
  family: 'normal' | 'overdrive';
  tier: number;
  label: string;
  description: string;
  unlockHighestRound: number;
  startingRound: number;
  scoreMultiplier: number;
  modDropMultiplier: number;
}

export const RUN_PROTOCOL_IDS = [
  'normal',
  'overdrive',
  'overdrive-orion',
  'overdrive-ares',
  'overdrive-lyra',
  'overdrive-draco',
  'overdrive-phoenix',
  'overdrive-hydra',
  'overdrive-andromeda',
  'overdrive-perseus',
  'overdrive-pegasus'
] as const satisfies readonly RunProtocolId[];

export const RUN_PROTOCOLS: Record<RunProtocolId, RunProtocolDefinition> = {
  normal: { id: 'normal', family: 'normal', tier: 0, label: 'NORMAL PROTOCOL', description: 'Classic operation beginning at Round 1.', unlockHighestRound: 0, startingRound: 1, scoreMultiplier: 1, modDropMultiplier: 1 },
  overdrive: { id: 'overdrive', family: 'overdrive', tier: 1, label: 'OVERDRIVE CYGNUS', description: 'Begin at Round 5. Skipped rounds grant no rewards.', unlockHighestRound: 8, startingRound: 5, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-orion': { id: 'overdrive-orion', family: 'overdrive', tier: 2, label: 'OVERDRIVE ORION', description: 'Begin at Round 10. Skipped rounds grant no rewards.', unlockHighestRound: 13, startingRound: 10, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-ares': { id: 'overdrive-ares', family: 'overdrive', tier: 3, label: 'OVERDRIVE ARES', description: 'Begin at Round 15. Skipped rounds grant no rewards.', unlockHighestRound: 18, startingRound: 15, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-lyra': { id: 'overdrive-lyra', family: 'overdrive', tier: 4, label: 'OVERDRIVE LYRA', description: 'Begin at Round 20. Skipped rounds grant no rewards.', unlockHighestRound: 23, startingRound: 20, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-draco': { id: 'overdrive-draco', family: 'overdrive', tier: 5, label: 'OVERDRIVE DRACO', description: 'Begin at Round 25. Skipped rounds grant no rewards.', unlockHighestRound: 28, startingRound: 25, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-phoenix': { id: 'overdrive-phoenix', family: 'overdrive', tier: 6, label: 'OVERDRIVE PHOENIX', description: 'Begin at Round 30. Skipped rounds grant no rewards.', unlockHighestRound: 33, startingRound: 30, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-hydra': { id: 'overdrive-hydra', family: 'overdrive', tier: 7, label: 'OVERDRIVE HYDRA', description: 'Begin at Round 35. Skipped rounds grant no rewards.', unlockHighestRound: 38, startingRound: 35, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-andromeda': { id: 'overdrive-andromeda', family: 'overdrive', tier: 8, label: 'OVERDRIVE ANDROMEDA', description: 'Begin at Round 40. Skipped rounds grant no rewards.', unlockHighestRound: 43, startingRound: 40, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-perseus': { id: 'overdrive-perseus', family: 'overdrive', tier: 9, label: 'OVERDRIVE PERSEUS', description: 'Begin at Round 45. Skipped rounds grant no rewards.', unlockHighestRound: 48, startingRound: 45, scoreMultiplier: 1.25, modDropMultiplier: 1.35 },
  'overdrive-pegasus': { id: 'overdrive-pegasus', family: 'overdrive', tier: 10, label: 'OVERDRIVE PEGASUS', description: 'Begin at Round 50. Skipped rounds grant no rewards.', unlockHighestRound: 53, startingRound: 50, scoreMultiplier: 1.25, modDropMultiplier: 1.35 }
};

export const isRunProtocolId = (value: unknown): value is RunProtocolId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(RUN_PROTOCOLS, value);

export const normalizeRunProtocolId = (value: unknown): RunProtocolId =>
  isRunProtocolId(value) ? value : 'normal';

export const getUnlockedProtocolIds = (highestRound: number): RunProtocolId[] =>
  RUN_PROTOCOL_IDS.filter((id) => highestRound >= RUN_PROTOCOLS[id].unlockHighestRound);

export const cycleUnlockedProtocol = (current: RunProtocolId, highestRound: number, direction: 1 | -1): RunProtocolId => {
  const unlocked = getUnlockedProtocolIds(highestRound);
  const currentIndex = Math.max(0, unlocked.indexOf(current));
  return unlocked[(currentIndex + direction + unlocked.length) % unlocked.length] ?? 'normal';
};
