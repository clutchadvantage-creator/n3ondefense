import { ECONOMY_BALANCE, MOD_FOCUS_LABELS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { MOD_DEFINITIONS } from './definitions.ts';
import {
  getEffectiveModDefinitionDropChance,
  getModDefinitionProbability,
  getModDropChance,
  getModRarityProbability,
  isGuaranteedMilestone,
  type ModDropRequest
} from './ModDropService.ts';
import { getModRecycleValue, getModUpgradeCost } from './ModInventoryService.ts';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS } from './modBalance.ts';
import type {
  LocalModCollection,
  ModCardInstance,
  ModCategory,
  ModDefinition,
  ModDropSource,
  ModRank,
  ModRarity,
  ModStat,
  RunProtocolId
} from './types.ts';
import { formatCalibrationModifier, resolveModStatState, type ModStatPresentationState } from './PlasmaRecalibration.ts';

export type ModDiscoveryStatus = 'undiscovered' | 'discovered' | 'owned';
export type ModProtocolFamily = 'normal' | 'overdrive' | 'supreme';
export type ModDatabaseStatusFilter = 'all' | ModDiscoveryStatus | 'corrupted';

export interface ModDatabaseFilters {
  category: 'all' | ModCategory;
  rarity: 'all' | ModRarity;
  status: ModDatabaseStatusFilter;
}

export interface ModDatabaseRankEntry {
  rank: ModRank;
  description: string;
  current: boolean;
}

export interface ModDatabaseStatEntry {
  stat: ModStat;
  label: string;
  mode: 'multiply' | 'add';
  baseline: number;
  values: Record<ModRank, number>;
  displays: { baseline: string } & Record<ModRank, string>;
  calibrated: boolean;
}

export interface ModDatabaseUpgradeStep {
  targetRank: 1 | 2 | 3;
  credits: number;
  coreTokens: number;
}

export interface ModDatabaseEconomyProfile {
  upgradeSteps: ModDatabaseUpgradeStep[];
  fullCredits: number;
  fullCoreTokens: number;
  investedCredits: number;
  investedCoreTokens: number;
  remainingCredits: number;
  remainingCoreTokens: number;
  recycleCredits: number;
  recyclePlasmaChips: number;
  recycleRankIndependent: boolean;
}

export interface ModDatabaseSourceChance {
  source: ModDropSource;
  label: string;
  opportunityChance: number;
  rarityPoolChance: number;
  definitionPoolChance: number;
  effectiveChance: number;
  guaranteedOpportunity: boolean;
}

export interface ModDatabaseProtocolProfile {
  family: ModProtocolFamily;
  protocol: RunProtocolId;
  protocolLabel: string;
  referenceRound: number;
  available: boolean;
  sources: ModDatabaseSourceChance[];
}

export interface ModDatabaseAcquisitionProfile {
  protocols: ModDatabaseProtocolProfile[];
  bestSources: Array<ModDatabaseSourceChance & { protocol: RunProtocolId; protocolLabel: string }>;
  supremeExclusive: boolean;
  signalLabel: string;
  signalWeightMultiplier: number;
  contractBonuses: Array<{ label: string; multiplier: number }>;
}

export interface ModDatabaseEntry {
  definition: ModDefinition;
  status: ModDiscoveryStatus;
  owned: boolean;
  discovered: boolean;
  card: ModCardInstance | null;
  currentRank: ModRank | null;
  ranks: ModDatabaseRankEntry[];
  stats: ModDatabaseStatEntry[];
  economy: ModDatabaseEconomyProfile;
  acquisition: ModDatabaseAcquisitionProfile;
  calibrationActive: boolean;
  statState: ModStatPresentationState;
}

const DROP_SOURCE_LABELS: Record<ModDropSource, string> = {
  normalEnemy: 'REGULAR ENEMY',
  eliteEnemy: 'ELITE ENEMY',
  milestone: 'MILESTONE REWARD',
  boss: 'BOSS REWARD',
  arcade: 'N3ON ARCADE MOD REWARD',
  anomaly: 'ANOMALY VAULT REWARD'
};

const DROP_SOURCES = Object.keys(DROP_SOURCE_LABELS) as ModDropSource[];
const PROTOCOL_FAMILIES: ModProtocolFamily[] = ['normal', 'overdrive', 'supreme'];

const splitIdentifier = (value: string): string => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/\bMax\b/g, 'Maximum')
  .toUpperCase();

const formatSigned = (value: number, suffix = ''): string => {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.0001) return `0${suffix}`;
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString()}${suffix}`;
};

const formatModifierValue = (stat: ModStat, mode: 'multiply' | 'add', value: number): string => {
  if (mode === 'multiply') return formatSigned((value - 1) * 100, '%');
  if (stat.toLowerCase().includes('chance')) return formatSigned(value * 100, ' PTS');
  return formatSigned(value);
};

const getRepresentativeProtocol = (family: ModProtocolFamily): RunProtocolId => {
  const candidates = RUN_PROTOCOL_IDS
    .filter((id) => RUN_PROTOCOLS[id].family === family)
    .sort((a, b) => RUN_PROTOCOLS[b].startingRound - RUN_PROTOCOLS[a].startingRound);
  return candidates[0] ?? 'normal';
};

const getGuaranteedOpportunity = (source: ModDropSource, round: number): boolean =>
  source === 'arcade' || source === 'milestone' && isGuaranteedMilestone(round);

const createDropRequest = (source: ModDropSource, protocol: RunProtocolId): ModDropRequest => {
  const round = RUN_PROTOCOLS[protocol].startingRound;
  return {
    source,
    protocol,
    round,
    seed: 0,
    sequence: 0,
    guaranteed: getGuaranteedOpportunity(source, round)
  };
};

const createAcquisitionProfile = (definition: ModDefinition): ModDatabaseAcquisitionProfile => {
  const protocols = PROTOCOL_FAMILIES.map((family): ModDatabaseProtocolProfile => {
    const protocol = getRepresentativeProtocol(family);
    const referenceRound = RUN_PROTOCOLS[protocol].startingRound;
    const sources = DROP_SOURCES.map((source): ModDatabaseSourceChance => {
      const request = createDropRequest(source, protocol);
      return {
        source,
        label: DROP_SOURCE_LABELS[source],
        opportunityChance: request.guaranteed ? 1 : getModDropChance(request),
        rarityPoolChance: getModRarityProbability(request, definition.rarity),
        definitionPoolChance: getModDefinitionProbability(request, definition.id),
        effectiveChance: getEffectiveModDefinitionDropChance(request, definition.id),
        guaranteedOpportunity: request.guaranteed === true
      };
    }).filter((source) => source.opportunityChance > 0 && source.definitionPoolChance > 0);
    return {
      family,
      protocol,
      protocolLabel: RUN_PROTOCOLS[protocol].label,
      referenceRound,
      available: sources.length > 0,
      sources
    };
  });

  const candidates = protocols.flatMap((profile) => profile.sources.map((source) => ({
    ...source,
    protocol: profile.protocol,
    protocolLabel: profile.protocolLabel
  })));
  const highest = candidates.reduce((best, entry) => Math.max(best, entry.effectiveChance), 0);
  const bestSources = candidates.filter((entry) => highest > 0 && Math.abs(entry.effectiveChance - highest) < 1e-12);

  return {
    protocols,
    bestSources,
    supremeExclusive: definition.rarity === 'supreme',
    signalLabel: MOD_FOCUS_LABELS[definition.category],
    signalWeightMultiplier: ECONOMY_BALANCE.modFocus.categoryWeightMultiplier,
    contractBonuses: Object.values(RUN_CONTRACTS)
      .filter((contract) => contract.modDropChanceMultiplier !== 1)
      .map((contract) => ({ label: contract.label, multiplier: contract.modDropChanceMultiplier }))
  };
};

const createEconomyProfile = (definition: ModDefinition, currentRank: ModRank | null): ModDatabaseEconomyProfile => {
  const upgradeSteps = ([1, 2, 3] as const).map((targetRank) => {
    const cost = getModUpgradeCost(definition.id, targetRank);
    return { targetRank, credits: cost?.credits ?? 0, coreTokens: cost?.coreTokens ?? 0 };
  });
  const ownedRank = currentRank ?? 0;
  const invested = upgradeSteps.filter((step) => step.targetRank <= ownedRank);
  const remaining = upgradeSteps.filter((step) => step.targetRank > ownedRank);
  const recycle = getModRecycleValue(definition.id);
  return {
    upgradeSteps,
    fullCredits: upgradeSteps.reduce((sum, step) => sum + step.credits, 0),
    fullCoreTokens: upgradeSteps.reduce((sum, step) => sum + step.coreTokens, 0),
    investedCredits: invested.reduce((sum, step) => sum + step.credits, 0),
    investedCoreTokens: invested.reduce((sum, step) => sum + step.coreTokens, 0),
    remainingCredits: remaining.reduce((sum, step) => sum + step.credits, 0),
    remainingCoreTokens: remaining.reduce((sum, step) => sum + step.coreTokens, 0),
    recycleCredits: recycle?.credits ?? 0,
    recyclePlasmaChips: recycle?.plasmaChips ?? 0,
    recycleRankIndependent: true
  };
};

const createDatabaseEntry = (mods: LocalModCollection, definition: ModDefinition): ModDatabaseEntry => {
  const ownedCards = mods.cards
    .filter((card) => card.modId === definition.id)
    .sort((a, b) => b.upgradeLevel - a.upgradeLevel || a.acquiredAt.localeCompare(b.acquiredAt));
  const card = ownedCards[0] ?? null;
  const discovered = mods.inventory[definition.id]?.discovered === true || card !== null;
  const owned = card !== null;
  const status: ModDiscoveryStatus = owned ? 'owned' : discovered ? 'discovered' : 'undiscovered';
  const currentRank = card?.upgradeLevel ?? null;
  const resolvedStats = resolveModStatState(definition, card ?? undefined);
  const effectiveModifiers = resolvedStats.effectiveStats;
  const calibratedStats = new Set(resolvedStats.slots
    .filter((slot) => slot.differsFromNative && slot.effective)
    .map((slot) => slot.effective!.stat));
  const calibrationActive = resolvedStats.recalibrated;
  return {
    definition,
    status,
    discovered,
    owned,
    card,
    currentRank,
    ranks: ([0, 1, 2, 3] as const).map((rank) => ({
      rank,
      description: calibrationActive
        ? effectiveModifiers.map((modifier) => `${formatCalibrationModifier(modifier, rank)} ${splitIdentifier(modifier.stat)}`).join(' // ')
        : definition.rankDescriptions[rank],
      current: currentRank === rank
    })),
    stats: effectiveModifiers.map((modifier) => ({
      stat: modifier.stat,
      label: splitIdentifier(modifier.stat),
      mode: modifier.mode,
      baseline: modifier.mode === 'multiply' ? 1 : 0,
      values: { ...modifier.values },
      calibrated: calibratedStats.has(modifier.stat),
      displays: {
        baseline: modifier.mode === 'multiply' ? '0%' : '0',
        0: formatModifierValue(modifier.stat, modifier.mode, modifier.values[0]),
        1: formatModifierValue(modifier.stat, modifier.mode, modifier.values[1]),
        2: formatModifierValue(modifier.stat, modifier.mode, modifier.values[2]),
        3: formatModifierValue(modifier.stat, modifier.mode, modifier.values[3])
      }
    })),
    economy: createEconomyProfile(definition, currentRank),
    acquisition: createAcquisitionProfile(definition),
    calibrationActive,
    statState: resolvedStats.presentation
  };
};

export const getModDatabaseEntries = (mods: LocalModCollection): ModDatabaseEntry[] =>
  MOD_DEFINITIONS.map((definition) => createDatabaseEntry(mods, definition));

export const getModDatabaseEntry = (mods: LocalModCollection, definitionId: string): ModDatabaseEntry | null => {
  const definition = MOD_DEFINITIONS.find((candidate) => candidate.id === definitionId);
  return definition ? createDatabaseEntry(mods, definition) : null;
};

export const filterModDatabaseEntries = (entries: readonly ModDatabaseEntry[], filters: ModDatabaseFilters): ModDatabaseEntry[] =>
  entries.filter((entry) =>
    (filters.category === 'all' || entry.definition.category === filters.category)
    && (filters.rarity === 'all' || entry.definition.rarity === filters.rarity)
    && (filters.status === 'all'
      || filters.status === 'corrupted' && entry.definition.variant === 'corrupted'
      || filters.status !== 'corrupted' && entry.status === filters.status)
  );

export const formatModDatabaseProbability = (chance: number): string => {
  const percentage = chance * 100;
  if (percentage <= 0) return '0%';
  if (percentage < 0.001) return '<0.001%';
  if (percentage < 0.1) return `${percentage.toFixed(3)}%`;
  if (percentage < 1) return `${percentage.toFixed(2)}%`;
  return `${percentage.toFixed(1)}%`;
};
