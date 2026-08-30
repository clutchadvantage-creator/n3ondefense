import { generateHeistFacilityLayout } from './HeistFacilityLayout.ts';

export { HEIST_WORLD } from './HeistFacilityLayout.ts';

/** Stable compatibility fixture used by tests and diagnostics. Live HEIST runs
 * generate their own layout from the run/session seed. */
export const DEFAULT_HEIST_LAYOUT = generateHeistFacilityLayout(0x48333135);
export const HEIST_WALL_RECTS = DEFAULT_HEIST_LAYOUT.wallRects;
export const HEIST_ROUTE = DEFAULT_HEIST_LAYOUT.route;

export const HEIST_BALANCE = {
  containerMinimum: 5,
  containerMaximum: 8,
  miniBossChance: 0.4,
  initialEnemyCount: 7,
  enemyPerEightRounds: 1,
  maximumRegularEnemies: 16,
  extractionRadius: 104,
  vaultApproachRadius: 330,
  doorOpenDurationMs: 980,
  alarmDelayMs: 1350,
  extractionDurationMs: 45_000,
  escapeReinforcementIntervalMs: 5_800,
  escapeInitialEnemyCount: 11,
  escapeMaximumEnemies: 24,
  escapeReinforcementCount: 3,
  enemyAnomalyLootChance: 0.075,
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
  fallbackCreditsPerRound: 1_000,
  enemyBonusCreditsBase: 650,
  enemyBonusCreditsPerRound: 85
} as const;
