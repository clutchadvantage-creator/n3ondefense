export const HEIST_WORLD = { width: 2400, height: 1200 } as const;

export const HEIST_BALANCE = {
  containerMinimum: 5,
  containerMaximum: 8,
  miniBossChance: 0.4,
  initialEnemyCount: 7,
  enemyPerEightRounds: 1,
  maximumRegularEnemies: 16,
  extractionRadius: 82,
  vaultTriggerX: 1580,
  vaultInsideX: 1880,
  vaultExitX: 1740,
  doorOpenDurationMs: 850,
  alarmDelayMs: 1050,
  safeReturnInvulnerabilityMs: 1500,
  supportHealthAmount: 34,
  supportEnergyFraction: 0.55,
  contactCooldownMs: 620,
  playerProjectileLifeMs: 1100,
  enemyProjectileLifeMs: 1800
} as const;

