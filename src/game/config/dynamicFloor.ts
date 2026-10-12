/** Conservative active-round timing. Boss arenas opt out until their encounter geometry is validated. */
export const DYNAMIC_FLOOR = {
  enabled: true,
  trainingRounds: 3,
  bossesEnabled: false,
  panelWidth: 112, panelHeight: 96, cassetteMargin: 12, maximumCassettes: 12,
  warningMs: 3200, unlockMs: 450, moveMs: 1600, restoreWarningMs: 1500, lockMs: 600,
  openMs: 6500, extraOpenMs: 3500, intensityRampMs: 180_000,
  minimumSolidFraction: .88, objectivePadding: 124, spawnPadding: 88,
  navigationCellSize: 32, navigationPadding: 36, navigationQuantum: 8,
  fallMs: 420, ejectionMs: 480, ejectionHeight: 46, recoveryRadius: 224, recoveryStep: 16,
  playerDamageFraction: .35, enemyDamageFraction: .55, enemyDamageBase: 80,
  environmentalProtectionMs: 1400,
  modes: {
    normal: { firstDelayMs: 70_000, intervalMs: 52_000, minimumIntervalMs: 32_000, maximumPanels: 2, maximumComplexity: 2 },
    overdrive: { firstDelayMs: 60_000, intervalMs: 47_000, minimumIntervalMs: 29_000, maximumPanels: 3, maximumComplexity: 3 },
    supreme: { firstDelayMs: 55_000, intervalMs: 43_000, minimumIntervalMs: 27_000, maximumPanels: 4, maximumComplexity: 3 }
  }
} as const;

/** Routed through AudioSystem (master, SFX and existing per-sound volumes).
 * Unassigned cues deliberately remain silent until purpose-recorded assets exist. */
export const DYNAMIC_FLOOR_AUDIO = {
  warning: 'beep', unlock: null, retracting: null, open: null,
  'restore-warning': 'beep', restoring: null, locking: null, stable: null,
  impact: 'playerDamage', ejection: null
} as const;
