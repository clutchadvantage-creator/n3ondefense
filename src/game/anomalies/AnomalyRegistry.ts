import type { AnomalyDefinition, AnomalyId } from './types.ts';
import type { RunProtocolId } from '../mods/types.ts';

export const ANOMALY_ENTRY_COSTS = [100, 125, 150, 175, 200, 225, 250] as const;

export const ANOMALY_SCHEDULING = {
  minimumOpportunityMs: 72_000,
  maximumOpportunityMs: 138_000,
  retryAfterMissMs: 105_000,
  portalLifetimeMs: 50_000,
  cooldownMs: 330_000,
  opportunityChance: { normal: 0.1, overdrive: 0.14, supreme: 0.18 },
  locationClearance: 112,
  interactionRadius: 96,
  transitionDurationMs: 820
} as const;

export const ANOMALY_DEFINITIONS: readonly AnomalyDefinition[] = [{
  id: 'heist',
  displayName: 'HEIST',
  description: 'BREACH THE VAULT // SECURE THE HAUL // EXTRACT ALIVE',
  minimumRound: 3,
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
}] as const;

export const ANOMALY_BY_ID = new Map<AnomalyId, AnomalyDefinition>(
  ANOMALY_DEFINITIONS.map((definition) => [definition.id, definition])
);

export const getEligibleAnomalies = (round: number, protocol: RunProtocolId): AnomalyDefinition[] =>
  ANOMALY_DEFINITIONS.filter((definition) => round >= definition.minimumRound
    && (!definition.requiredProtocols || definition.requiredProtocols.includes(protocol))
    && (!definition.supremeOnly || protocol.startsWith('supreme-')));
