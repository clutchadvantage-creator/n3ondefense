export const LASER_HAZARD_BALANCE = {
  initialDelayMs: 7000,
  telegraphMs: 1700,
  activeMs: 6200,
  baseCooldownMs: 7800,
  minimumCooldownMs: 3800,
  cooldownReductionPerRoundMs: 260,
  playerDamagePerHit: 9,
  maximumPlayerDamagePerHit: 16,
  enemyDamagePerSecond: 24,
  maximumEnemyDamagePerSecond: 42,
  collisionRadius: 13
} as const;
