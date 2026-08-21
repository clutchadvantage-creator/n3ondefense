import type { ArcadeEventDefinition, ArcadeEventFactory, ArcadeEventId, ArcadeRuntimeContext } from './types.ts';
import { GoldenHuntEvent } from './events/GoldenHuntEvent.ts';
import { MiniBossEvent } from './events/MiniBossEvent.ts';
import { NeonCircuitEvent } from './events/NeonCircuitEvent.ts';

const randomRewardPool = (
  creditsBase: number,
  creditsPerRound: number,
  coreTokenBase: number,
  coreTokensPerRound: number,
  fluxCoreBase: number,
  fluxCoresPerRound: number,
  plasmaBase: number,
  plasmaPerRound: number
): ArcadeEventDefinition['reward'] => ({
  kind: 'random-pool',
  options: [
    { kind: 'credits', weight: 28, baseAmount: creditsBase, amountPerRound: creditsPerRound },
    { kind: 'core-tokens', weight: 18, baseAmount: coreTokenBase, amountPerRound: coreTokensPerRound },
    { kind: 'flux-cores', weight: 16, baseAmount: fluxCoreBase, amountPerRound: fluxCoresPerRound },
    { kind: 'plasma-chips', weight: 20, baseAmount: plasmaBase, amountPerRound: plasmaPerRound },
    { kind: 'mod', weight: 18 }
  ]
});

export const ARCADE_SCHEDULING = {
  minimumRound: 2,
  initialOpportunityMinimumMs: 28_000,
  initialOpportunityMaximumMs: 52_000,
  retryAfterMissMs: 48_000,
  eventCooldownMs: 105_000,
  opportunityChance: { normal: 0.46, overdrive: 0.54 },
  recentHistorySize: 2
} as const;

export const ARCADE_EVENT_DEFINITIONS: readonly ArcadeEventDefinition[] = [
  {
    id: 'golden-hunt',
    displayName: 'GOLDEN HUNT',
    description: 'Eliminate all 5 Golden Enemies.',
    weight: 1.15,
    minimumRound: 2,
    durationMs: 60_000,
    reward: randomRewardPool(800, 30, 2, 0.08, 1, 0.025, 5, 0.18)
  },
  {
    id: 'mini-boss',
    displayName: 'MINI-BOSS DETECTED',
    description: 'Destroy the Arcade boss before it phases out.',
    weight: 0.72,
    minimumRound: 5,
    durationMs: 78_000,
    reward: randomRewardPool(1_100, 45, 3, 0.1, 2, 0.035, 8, 0.25)
  },
  {
    id: 'neon-circuit',
    displayName: 'NEON CIRCUIT',
    description: 'Hit every checkpoint before time expires.',
    weight: 1,
    minimumRound: 2,
    durationMs: 34_000,
    reward: randomRewardPool(650, 25, 2, 0.07, 1, 0.02, 5, 0.16)
  }
] as const;

const FACTORIES: Record<ArcadeEventId, ArcadeEventFactory> = {
  'golden-hunt': { create: (context, definition) => new GoldenHuntEvent(context, definition) },
  'mini-boss': { create: (context, definition) => new MiniBossEvent(context, definition) },
  'neon-circuit': { create: (context, definition) => new NeonCircuitEvent(context, definition) }
};

export const getEligibleArcadeDefinitions = (round: number): ArcadeEventDefinition[] =>
  ARCADE_EVENT_DEFINITIONS.filter((definition) => round >= definition.minimumRound);

export const chooseWeightedArcadeDefinition = (
  definitions: readonly ArcadeEventDefinition[],
  roll: number,
  recent: readonly ArcadeEventId[]
): ArcadeEventDefinition | null => {
  if (definitions.length === 0) return null;
  const alternatives = definitions.filter((definition) => !recent.includes(definition.id));
  const pool = alternatives.length > 0 ? alternatives : [...definitions];
  const totalWeight = pool.reduce((sum, definition) => sum + Math.max(0, definition.weight), 0);
  if (totalWeight <= 0) return null;
  let cursor = Math.max(0, Math.min(0.999999, roll)) * totalWeight;
  for (const definition of pool) {
    cursor -= Math.max(0, definition.weight);
    if (cursor <= 0) return definition;
  }
  return pool.at(-1) ?? null;
};

export const createArcadeEvent = (
  context: ArcadeRuntimeContext,
  definition: ArcadeEventDefinition
) => FACTORIES[definition.id].create(context, definition);
