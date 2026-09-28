import type { AnomalyDefinition, AnomalyId } from './types.ts';
import type { RunProtocolId } from '../mods/types.ts';

export { ANOMALY_ENTRY_COSTS } from './AnomalyPricing.ts';

export const ANOMALY_SCHEDULING = {
  portalLifetimeMs: 50_000,
  locationClearance: 112,
  interactionRadius: 96,
  transitionDurationMs: 820
} as const;

export const ANOMALY_DEFINITIONS: readonly AnomalyDefinition[] = [{
  id: 'heist',
  displayName: 'HEIST',
  description: 'BREACH THE VAULT // SECURE THE HAUL // EXTRACT ALIVE',
  minimumRound: 1,
  weight: 1,
  chargeBase: 12,
  chargePerRound: 0.28,
  chargeMaximum: 26,
  rarity: 'rare',
  layoutId: 'facility-07',
  encounterTableId: 'heist-security-response',
  rewardTableId: 'heist-provisional-vault',
  environmentTheme: 'abandoned-dimensional-research',
  portalVariant: 'dimensional-breach',
  extractionRule: 'interact'
}, {
  id: 'skybreach', displayName: 'SKYBREACH',
  description: 'BREACH HOSTILE AIRSPACE // DISARM THE DREADNOUGHT // RETURN ALIVE',
  minimumRound: 1, weight: 1, chargeBase: 12, chargePerRound: 0.28, chargeMaximum: 26,
  rarity: 'rare', layoutId: 'storm-corridor', encounterTableId: 'skybreach-air-campaign',
  rewardTableId: 'boss-provisional', environmentTheme: 'rwg-high-altitude', extractionRule: 'interact'
}] as const;

export const ANOMALY_BY_ID = new Map<AnomalyId, AnomalyDefinition>(
  ANOMALY_DEFINITIONS.map((definition) => [definition.id, definition])
);

export const getEligibleAnomalies = (_round: number, _protocol: RunProtocolId): AnomalyDefinition[] =>
  [...ANOMALY_DEFINITIONS];
