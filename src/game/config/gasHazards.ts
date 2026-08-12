export const GAS_HAZARD_BALANCE = {
  unlockRound: 4,
  initialDelayMs: 34_000,
  telegraphMs: 2200,
  fallMs: 1000,
  staggerMs: 110,
  activeMs: 11_500,
  dissipateMs: 3200,
  laserRecoveryDelayMs: 2800,
  baseCooldownMs: 68_000,
  minimumCooldownMs: 54_000,
  cooldownReductionPerRoundMs: 180,
  cooldownVarianceMs: 9000,
  playerDamageAtUnlock: 5,
  playerDamagePerRound: 0.5,
  maximumPlayerDamage: 24,
  damageTickIntervalMs: 1100,
  cloudRadius: 260,
  tunnelRadius: 68,
  enemyTunnelRadius: 34,
  projectileTunnelRadius: 24,
  bombletTunnelRadiusMultiplier: 1.35,
  mineIgnitionRadiusMultiplier: 3,
  mineIgnitionVisualMs: 720,
  densityCellSize: 40,
  minimumCanisters: 8,
  maximumCanisters: 12,
  roundsPerAdditionalCanister: 4,
  safeEdgeInset: 72,
  fallHeight: 230
} as const;

export const getGasExposureDamage = (round: number): number => {
  const roundsPastUnlock = Math.max(0, Math.floor(round) - GAS_HAZARD_BALANCE.unlockRound);
  return Math.min(
    GAS_HAZARD_BALANCE.maximumPlayerDamage,
    GAS_HAZARD_BALANCE.playerDamageAtUnlock + roundsPastUnlock * GAS_HAZARD_BALANCE.playerDamagePerRound
  );
};
