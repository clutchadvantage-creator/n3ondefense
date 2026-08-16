import { SeededRandom } from '../systems/SeededRandom.ts';

export type BossArchetype = 'artillery' | 'storm-mage' | 'void-brawler';

export const BOSS_ARCHETYPES: Record<BossArchetype, { label: string; subtitle: string; color: number; texture: string }> = {
  artillery: { label: 'ARC SIEGE ENGINE', subtitle: 'PROJECTILE WEAPONS PLATFORM', color: 0xff9f43, texture: 'boss-artillery' },
  'storm-mage': { label: 'VOLT SOVEREIGN', subtitle: 'NEON STORM CASTER', color: 0x9a72ff, texture: 'boss-storm-mage' },
  'void-brawler': { label: 'PHASE MAULER', subtitle: 'TELEPORTING BRAWLER', color: 0xff4e82, texture: 'boss-void-brawler' }
};

export const BOSS_BALANCE = {
  intervalRounds: 5,
  baseHealth: 7200,
  healthPerTier: 1900,
  maximumHealth: 22_400,
  hazardDamageMultiplier: 0.35,
  damageMultiplierPerTier: 0.08,
  maximumDamageMultiplier: 1.48,
  creditDropChunks: 18,
  creditDropsPerChunk: 1,
  rewardCreditsBase: 800,
  rewardCreditsPerTier: 350,
  rewardCoreTokensBase: 2,
  rewardCoreTokensPerTier: 1,
  rewardPlasmaChipsBase: 2,
  rewardPlasmaChipsPerTier: 1,
  rewardPlasmaChipsMaximum: 8,
  supportPickupFirstDelayMs: 5500,
  supportPickupMinimumIntervalMs: 8500,
  supportPickupMaximumIntervalMs: 12_000,
  supportPickupLifetimeMs: 22_000,
  maximumSupportPickups: 4,
  artillery: {
    movementSpeed: 68,
    projectileDamage: 13,
    projectileSpeed: 345,
    basicCooldownMs: 920,
    rapidBurstCount: 5,
    spreadRadians: 0.055,
    rocketCooldownMs: 4800,
    rocketCount: 2,
    rocketDamage: 22,
    rocketSpeed: 225,
    superCooldownMs: 8800,
    superTelegraphMs: 1350,
    superStrikeCount: 4,
    superRadius: 82,
    superDamage: 25
  },
  stormMage: {
    movementSpeed: 112,
    projectileDamage: 11,
    projectileSpeed: 285,
    basicCooldownMs: 1350,
    chargeMs: 390,
    basicProjectileCount: 1,
    superCooldownMs: 8200,
    superTelegraphMs: 900,
    superProjectileCount: 9,
    superProjectileSpeed: 305,
    superProjectileDamage: 14
  },
  voidBrawler: {
    movementSpeed: 148,
    contactDamage: 15,
    contactCooldownMs: 900,
    pounceCooldownMs: 3800,
    pounceTelegraphMs: 620,
    pounceDurationMs: 720,
    pounceSpeed: 525,
    teleportCooldownMs: 6500,
    superCooldownMs: 10_000,
    superTelegraphMs: 1050,
    superRadius: 105,
    superDamage: 27
  }
} as const;

export const isBossRound = (completedRound: number): boolean =>
  completedRound > 0 && completedRound % BOSS_BALANCE.intervalRounds === 0;

export const getBossTier = (completedRound: number): number =>
  Math.max(1, Math.floor(Math.max(1, completedRound) / BOSS_BALANCE.intervalRounds));

export const getBossHealth = (completedRound: number): number =>
  Math.min(BOSS_BALANCE.maximumHealth, BOSS_BALANCE.baseHealth + (getBossTier(completedRound) - 1) * BOSS_BALANCE.healthPerTier);

export const getBossDamageMultiplier = (completedRound: number): number =>
  Math.min(BOSS_BALANCE.maximumDamageMultiplier, 1 + (getBossTier(completedRound) - 1) * BOSS_BALANCE.damageMultiplierPerTier);

export const getBossRewards = (completedRound: number): { credits: number; coreTokens: number; plasmaChips: number } => {
  const tier = getBossTier(completedRound);
  return {
    credits: BOSS_BALANCE.rewardCreditsBase + tier * BOSS_BALANCE.rewardCreditsPerTier,
    coreTokens: BOSS_BALANCE.rewardCoreTokensBase + tier * BOSS_BALANCE.rewardCoreTokensPerTier,
    plasmaChips: Math.min(BOSS_BALANCE.rewardPlasmaChipsMaximum, BOSS_BALANCE.rewardPlasmaChipsBase + tier * BOSS_BALANCE.rewardPlasmaChipsPerTier)
  };
};

export const selectBossArchetype = (completedRound: number, seed: number): BossArchetype => {
  const choices = Object.keys(BOSS_ARCHETYPES) as BossArchetype[];
  return new SeededRandom((seed ^ Math.imul(completedRound, 0x85ebca6b) ^ 0xb055f17e) >>> 0).pick(choices);
};
