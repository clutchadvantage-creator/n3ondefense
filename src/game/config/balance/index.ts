export type BalanceEnemyType = 'grunt' | 'shooter' | 'defuser' | 'tank' | 'disruptor' | 'star';

export const PLAYER_BALANCE = {
  maxHealth: 130,
  moveSpeed: 265,
  invulnerabilityMs: 500,
  pickupRadius: 48,
  energyMax: 110,
  energyRegenPerSecond: 1,
  dashEnergyCost: 20,
  dashCooldownMs: 2600,
  dashDistanceMultiplier: 1,
  dashDurationBaseMs: 170,
  dashDurationPerMultiplierMs: 65,
  dashDurationMaxMs: 360,
  dashSpeedBase: 5,
  dashSpeedMultiplier: 0.45
} as const;

export const WEAPON_BALANCE = {
  name: 'VX Neon Carbine',
  damage: 16,
  fireRate: 9,
  projectileSpeed: 700,
  critChance: 0.1,
  critMultiplier: 1.8,
  heatPerShot: 9,
  maxHeat: 100,
  cooldownRate: 40,
  minimumHeatPerShot: 4.5,
  maximumFireRate: 14,
  maximumBuffedFireRate: 22,
  maximumCritChance: 0.35,
  damageBoostMultiplier: 1.4,
  rapidFireMultiplier: 1.35,
  speedBoostMultiplier: 1.3,
  buffDurationMs: 8000,
  energyCostPerShot: 0.5
} as const;

export const ENEMY_BALANCE = {
  grunt: { hp: 40, speed: 116, damage: 9, attackCooldownMs: 500, attackRange: 26, weight: 1, unlockRound: 1, credits: 3, tokens: 0, color: 0xff5f7c, size: 24 },
  shooter: { hp: 50, speed: 86, damage: 9, attackCooldownMs: 1450, attackRange: 230, weight: 1.5, unlockRound: 1, credits: 4, tokens: 0, color: 0xff9f4d, size: 24 },
  defuser: { hp: 58, speed: 88, damage: 6, attackCooldownMs: 650, attackRange: 26, weight: 2.25, unlockRound: 1, credits: 6, tokens: 0, color: 0x85f9ff, size: 26 },
  tank: { hp: 190, speed: 54, damage: 19, attackCooldownMs: 650, attackRange: 34, weight: 3.5, unlockRound: 3, credits: 10, tokens: 0, color: 0xc06eff, size: 34 },
  disruptor: { hp: 82, speed: 98, damage: 8, attackCooldownMs: 700, attackRange: 28, weight: 3, unlockRound: 6, credits: 8, tokens: 0, color: 0x66ff91, size: 28, specialCooldownMs: 5200, disableMs: 2200 },
  star: { hp: 260, speed: 70, damage: 15, attackCooldownMs: 650, attackRange: 44, weight: 5, unlockRound: 8, credits: 15, tokens: 1, color: 0xffda66, size: 44 }
} as const;

export const TANK_HOMING_MISSILE_BALANCE = {
  cooldownMs: 7200,
  launchRange: 620,
  damage: 24,
  health: 32,
  lifetimeMs: 6500,
  speedMultiplier: 0.88,
  turnRateRadiansPerSecond: 2.6,
  blastRadius: 54
} as const;

export const ABILITY_BALANCE = {
  cooldownScale: 1,
  fence: {
    energyCost: 10,
    cooldownMs: 5200,
    maxActive: 2,
    damage: 30,
    hp: 110,
    durationMs: 16_000,
    width: 90,
    slowFactor: 0.68,
    projectileFanCount: 4,
    projectileFanSpacingRadians: 0.105,
    projectileFanDamageShare: 0.45
  },
  turret: { energyCost: 10, cooldownMs: 6800, maxActive: 2, damage: 13, hp: 145, durationMs: 0, range: 215, fireRate: 2.5 },
  mine: { energyCost: 10, cooldownMs: 4200, maxActive: 3, damage: 72, hp: 0, durationMs: 0, range: 0, fireRate: 0, armMs: 1000, radius: 82 },
  shield: { energyCost: 15, durationMs: 2800, maximumDurationMs: 6000, cooldownMs: 10_000 }
} as const;

export const OBJECTIVE_BALANCE = {
  plantHoldMs: 2200,
  bombDefenseMs: 75_000,
  defuseRequiredMs: 10_000,
  recoveryMs: 7000,
  concurrentBombSpawnCadenceBonus: 0.12,
  concurrentBombActiveCountBonus: 2,
  concurrentBombActiveWeightBonus: 2,
  maxActiveDefusers: 1,
  defuserSpawnSpacingMs: 14_000
} as const;

export const PICKUP_BALANCE = {
  enemyDropChance: 0.5,
  healthShare: 0.22,
  energyShare: 0.05,
  damageBoostShare: 0.13,
  speedBoostShare: 0.13,
  rapidFireShare: 0.13,
  ricochetShare: 0.06,
  // Equal 20% relative reductions from the previous 0.04 weights.
  grenadeRoundsShare: 0.032,
  scattershotShare: 0.032,
  creditsShare: 0.25,
  coreTokenShare: 0.03,
  lifetimeMs: 14_000,
  healthRestore: 28,
  energyRestoreFraction: 0.5,
  energyAutoCollectMissingFraction: 0.2,
  credits: 24,
  arenaSupportTargetPerType: 2,
  arenaSupportRestockMinMs: 4500,
  arenaSupportRestockMaxMs: 7000,
  arenaSupportLifetimeMs: 60_000
} as const;

export const REWARD_BALANCE = {
  completionBaseTokens: 1,
  tokenRoundDivisor: 3,
  siteRecoveryCredits: 30,
  siteRecoveryHealth: 22,
  siteRecoveryEnergy: 30
} as const;

export interface DifficultyCurve {
  healthMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
}

export const getDifficultyCurve = (round: number, destroyedSites = 0): DifficultyCurve => {
  const r = Math.max(1, Math.floor(round));
  return {
    healthMultiplier: Math.min(2.1, 1 + (r - 1) * 0.065 + Math.max(0, r - 6) * 0.012 + destroyedSites * 0.035),
    damageMultiplier: Math.min(1.65, 1 + (r - 1) * 0.035 + Math.max(0, r - 8) * 0.008 + destroyedSites * 0.02),
    // Movement grows visibly but remains capped so late enemies stay readable
    // and never outrun a base-speed player solely because of level scaling.
    speedMultiplier: Math.min(1.28, 1 + (r - 1) * 0.012 + Math.max(0, r - 8) * 0.004 + destroyedSites * 0.004)
  };
};

export const getDefuseAssigneeCount = (round: number): number => {
  const r = Math.max(1, Math.floor(round));
  return Math.min(4, 1 + Math.floor((r - 1) / 4));
};

export interface SpawnProfile {
  prePlantCadenceMs: number;
  defenseCadenceMs: number;
  initialGraceMs: number;
  activeCountCap: number;
  activeWeightCap: number;
  specialSpacingMs: number;
  composition: Record<BalanceEnemyType, number>;
}

export const getConcurrentSpawnPressure = (profile: SpawnProfile, activeBombCount: number): { cadenceMultiplier: number; activeCountCap: number; activeWeightCap: number } => {
  const additionalBombs = Math.max(0, Math.floor(activeBombCount) - 1);
  return {
    cadenceMultiplier: 1 / (1 + additionalBombs * OBJECTIVE_BALANCE.concurrentBombSpawnCadenceBonus),
    activeCountCap: profile.activeCountCap + additionalBombs * OBJECTIVE_BALANCE.concurrentBombActiveCountBonus,
    activeWeightCap: profile.activeWeightCap + additionalBombs * OBJECTIVE_BALANCE.concurrentBombActiveWeightBonus
  };
};

export const getSpawnProfile = (round: number, destroyedSites = 0): SpawnProfile => {
  const r = Math.max(1, Math.floor(round));
  const late = Math.max(0, r - 5);
  const composition: Record<BalanceEnemyType, number> = {
    grunt: Math.max(0.32, 0.72 - (r - 1) * 0.035),
    shooter: r === 1 ? 0.12 : Math.min(0.24, 0.13 + r * 0.012),
    defuser: r === 1 ? 0.16 : Math.min(0.16, 0.1 + r * 0.006),
    tank: r >= 3 ? Math.min(0.15, 0.05 + (r - 3) * 0.012) : 0,
    disruptor: r >= 6 ? Math.min(0.1, 0.035 + (r - 6) * 0.01) : 0,
    star: r >= 8 ? Math.min(0.06, 0.018 + (r - 8) * 0.007) : 0
  };
  const total = Object.values(composition).reduce((sum, value) => sum + value, 0);
  for (const type of Object.keys(composition) as BalanceEnemyType[]) composition[type] /= total;

  return {
    prePlantCadenceMs: Math.max(1200, 2700 - (r - 1) * 110),
    // A small global cadence increase keeps pressure present without changing enemy durability.
    defenseCadenceMs: Math.max(580, 1380 - (r - 1) * 78 - late * 16 - destroyedSites * 45),
    initialGraceMs: Math.max(2600, 5500 - (r - 1) * 280),
    activeCountCap: Math.min(26, 7 + Math.floor((r - 1) * 1.35) + destroyedSites),
    activeWeightCap: Math.min(39, 8 + (r - 1) * 2 + destroyedSites * 1.5),
    specialSpacingMs: Math.max(6500, 13_000 - (r - 1) * 500),
    composition
  };
};

export const getSpawnCadenceMultiplier = (defenseElapsedMs: number): number | null => {
  if (defenseElapsedMs < 14_000) return 1.3;
  if (defenseElapsedMs >= 31_000 && defenseElapsedMs < 37_000) return null;
  if (defenseElapsedMs < 52_000) return 1;
  return 0.82;
};

export const getRoundSiteCountBalanced = (round: number): number => {
  if (round <= 2) return 2;
  if (round <= 5) return 3;
  if (round <= 9) return 4;
  return 5;
};

export const sustainedWeaponDps = (damage: number, fireRate: number, critChance: number, heatPerShot: number): number => {
  const adjustedDamage = damage * (1 + critChance * (WEAPON_BALANCE.critMultiplier - 1));
  // Heat dissipates while firing, so long-run shot throughput is capped by
  // coolingRate / heatPerShot rather than by a magazine-style reload cycle.
  const sustainedShotsPerSecond = Math.min(fireRate, WEAPON_BALANCE.cooldownRate / heatPerShot);
  return adjustedDamage * sustainedShotsPerSecond;
};
