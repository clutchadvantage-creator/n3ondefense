export const LASER_HAZARD_BALANCE = {
  initialDelayMs: 9000,
  telegraphMs: 1700,
  activeMs: 6200,
  baseCooldownMs: 10000,
  minimumCooldownMs: 6000,
  cooldownReductionPerRoundMs: 260,
  playerDamagePerHit: 9,
  maximumPlayerDamagePerHit: 16,
  enemyDamagePerSecond: 24,
  maximumEnemyDamagePerSecond: 42,
  collisionRadius: 13
} as const;
