import type { RectSpec } from '../../types.ts';

export const HEIST_WORLD = { width: 4000, height: 2300 } as const;

export const HEIST_WALL_RECTS: readonly RectSpec[] = [
  { x: 0, y: 0, w: HEIST_WORLD.width, h: 90 },
  { x: 0, y: HEIST_WORLD.height - 90, w: HEIST_WORLD.width, h: 90 },
  { x: 0, y: 0, w: 90, h: HEIST_WORLD.height },
  { x: HEIST_WORLD.width - 90, y: 0, w: 90, h: HEIST_WORLD.height },
  { x: 850, y: 90, w: 105, h: 1220 },
  { x: 1600, y: 980, w: 110, h: 1230 },
  { x: 2400, y: 90, w: 110, h: 1200 },
  { x: 3158, y: 90, w: 124, h: 1290 },
  { x: 3158, y: 1940, w: 124, h: 270 },
  { x: 250, y: 920, w: 330, h: 95 },
  { x: 1080, y: 1110, w: 270, h: 90 },
  { x: 1880, y: 1190, w: 300, h: 92 },
  { x: 2670, y: 730, w: 280, h: 94 },
  { x: 2760, y: 1860, w: 250, h: 80 }
] as const;

export const HEIST_ROUTE = [
  { x: 250, y: 610 },
  { x: 650, y: 610 },
  { x: 650, y: 1560 },
  { x: 1180, y: 1560 },
  { x: 1380, y: 1560 },
  { x: 1380, y: 690 },
  { x: 2020, y: 690 },
  { x: 2200, y: 690 },
  { x: 2200, y: 1560 },
  { x: 2780, y: 1560 },
  { x: 3060, y: 1660 },
  { x: 3370, y: 1660 },
  { x: 3700, y: 1660 }
] as const;

export const HEIST_BALANCE = {
  containerMinimum: 5,
  containerMaximum: 8,
  miniBossChance: 0.4,
  initialEnemyCount: 7,
  enemyPerEightRounds: 1,
  maximumRegularEnemies: 16,
  extractionRadius: 104,
  vaultDoorX: 3220,
  vaultDoorY: 1660,
  vaultApproachRadius: 330,
  vaultInsideX: 3340,
  doorOpenDurationMs: 980,
  alarmDelayMs: 1350,
  transitionDurationMs: 620,
  safeReturnInvulnerabilityMs: 1500,
  supportHealthAmount: 34,
  supportEnergyFraction: 0.55,
  contactCooldownMs: 620,
  playerProjectileLifeMs: 1100,
  enemyProjectileLifeMs: 1800
} as const;

/** HEIST owns its container mix; shared reward systems own item behavior. */
export const HEIST_REWARD_TABLE = {
  /** The first four opened vault containers form the premium value floor. */
  guaranteedVaultSequence: ['credits', 'plasmaChips', 'coreTokens', 'mod'] as const,
  creditsWeight: 0.25,
  coreTokensWeight: 0.18,
  plasmaChipsWeight: 0.22,
  fluxCoresWeight: 0.15,
  modWeight: 0.20,
  guaranteedCreditsBase: 100_000,
  guaranteedCreditsPerFlux: 500,
  guaranteedCreditsPerRound: 1_500,
  creditsBase: 40_000,
  creditsPerFlux: 200,
  creditsPerRound: 800,
  creditsVariance: 20_000,
  guaranteedCoreBase: 24,
  guaranteedCorePerFlux: 0.08,
  guaranteedCorePerRound: 0.20,
  coreBase: 10,
  corePerFlux: 0.04,
  corePerRound: 0.10,
  guaranteedPlasmaBase: 70,
  guaranteedPlasmaPerFlux: 0.25,
  guaranteedPlasmaPerRound: 0.40,
  plasmaBase: 25,
  plasmaPerFlux: 0.10,
  plasmaPerRound: 0.20,
  fluxBase: 5,
  fluxPerEntryFlux: 0.22,
  fluxPerRound: 0.08,
  miniBossPlasmaBase: 32,
  miniBossPlasmaPerRound: 0.28,
  fallbackCreditsBase: 75_000,
  fallbackCreditsPerRound: 1_000
} as const;
