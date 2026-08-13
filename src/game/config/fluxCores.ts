export const FLUX_CORE_BALANCE = {
  unlockRound: 1,
  initialSpawnMinMs: 4200,
  initialSpawnMaxMs: 7200,
  respawnMinMs: 16_000,
  respawnMaxMs: 27_000,
  lowRoundMaximum: 3,
  absoluteMaximum: 6,
  roundsPerAdditionalCore: 7,
  baseHealth: 52,
  healthPerRound: 4,
  maximumHealth: 176,
  collisionRadius: 22,
  spawnEdgeInset: 84,
  minimumCoreSpacing: 150,
  floorRiseMs: 1200,
  windowOpenMs: 620,
  floorRiseDistance: 29,
  laserShutdownMs: 9000,
  recoveryAlarmLeadMs: 1500,
  proximitySoundRadius: 245
} as const;

/** Low rounds support up to three cores; one more comes online every seven rounds. */
export const getFluxCoreCapacity = (round: number): number => Math.min(
  FLUX_CORE_BALANCE.absoluteMaximum,
  FLUX_CORE_BALANCE.lowRoundMaximum + Math.floor(Math.max(0, Math.floor(round) - 1) / FLUX_CORE_BALANCE.roundsPerAdditionalCore)
);

export const getFluxCoreHealth = (round: number): number => Math.min(
  FLUX_CORE_BALANCE.maximumHealth,
  FLUX_CORE_BALANCE.baseHealth + Math.max(0, Math.floor(round) - 1) * FLUX_CORE_BALANCE.healthPerRound
);
