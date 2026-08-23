import { MOD_DEFINITIONS } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import type { ModDefinition, ModDropSource, RunProtocolId } from './types.ts';
import { RUN_PROTOCOLS } from './modBalance.ts';
import { ECONOMY_BALANCE, getContract } from '../economy/economyBalance.ts';
import type { ModFocusSignalId, RunContractId } from '../economy/types.ts';
import { getProtocolModeBalance } from '../config/modeBalance.ts';
import type { ModRarity } from './types.ts';
import { getSupremeStage, isSupremeProtocol } from '../progression/SupremeProgression.ts';

export interface ModDropRequest {
  source: ModDropSource;
  round: number;
  seed: number;
  sequence: number;
  protocol: RunProtocolId;
  focus?: ModFocusSignalId | null;
  contract?: RunContractId | null;
  guaranteed?: boolean;
}

export const getModDropChance = (request: ModDropRequest): number => {
  const protocolMultiplier = RUN_PROTOCOLS[request.protocol].modDropMultiplier;
  const contractMultiplier = getContract(request.contract)?.modDropChanceMultiplier ?? 1;
  return Math.min(1, MOD_BALANCE.dropChance[request.source] * protocolMultiplier * contractMultiplier);
};

export const getModDefinitionWeight = (definition: ModDefinition, request: ModDropRequest): number => {
  const supreme = isSupremeProtocol(request.protocol);
  if (definition.rarity === 'supreme' && !supreme) return 0;
  const mode = getProtocolModeBalance(request.protocol);
  const base = MOD_BALANCE.rarityWeights[definition.rarity]
    * MOD_BALANCE.raritySourceMultipliers[request.source][definition.rarity]
    * definition.dropWeight;
  const highRarity = definition.rarity === 'rare' || definition.rarity === 'epic' || definition.rarity === 'legendary' || definition.rarity === 'supreme';
  const roundMultiplier = highRarity
    ? 1 + Math.max(0, request.round - 1) * MOD_BALANCE.rarityRoundBonusPerRound
    : 1;
  const modeRarityMultiplier = definition.rarity === 'supreme'
    ? getSupremeStage(request.protocol)?.supremeModWeightMultiplier ?? 0
    : definition.rarity === 'legendary'
    ? mode.legendaryWeightMultiplier
    : definition.rarity === 'rare' || definition.rarity === 'epic'
      ? mode.highRarityWeightMultiplier
      : 1;
  const focusMultiplier = request.focus === definition.category ? ECONOMY_BALANCE.modFocus.categoryWeightMultiplier : 1;
  return base * roundMultiplier * modeRarityMultiplier * focusMultiplier;
};

export const getModRarityProbability = (request: ModDropRequest, rarity: ModRarity): number => {
  let totalWeight = 0;
  let rarityWeight = 0;
  for (const definition of MOD_DEFINITIONS) {
    const weight = Math.max(0, getModDefinitionWeight(definition, request));
    totalWeight += weight;
    if (definition.rarity === rarity) rarityWeight += weight;
  }
  return totalWeight > 0 ? rarityWeight / totalWeight : 0;
};

export const getEffectiveModRarityDropChance = (request: ModDropRequest, rarity: ModRarity): number =>
  (request.guaranteed ? 1 : getModDropChance(request)) * getModRarityProbability(request, rarity);

const seededRoller = (seed: number): (() => number) => {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const weighted = <T>(entries: readonly T[], weight: (entry: T) => number, roll: () => number): T | null => {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, weight(entry)), 0);
  if (total <= 0) return null;
  let cursor = roll() * total;
  for (const entry of entries) {
    cursor -= Math.max(0, weight(entry));
    if (cursor <= 0) return entry;
  }
  return entries.at(-1) ?? null;
};

export const rollModDrop = (request: ModDropRequest): ModDefinition | null => {
  const roll = seededRoller(request.seed ^ Math.imul(request.sequence + 1, 0x45d9f3b) ^ Math.imul(request.round, 0x9e3779b1));
  const chance = getModDropChance(request);
  if (!request.guaranteed && roll() >= chance) return null;

  return weighted(MOD_DEFINITIONS, (definition) => getModDefinitionWeight(definition, request), roll);
};

export const isGuaranteedMilestone = (round: number): boolean => round > 0 && round % MOD_BALANCE.guaranteedMilestoneEveryRounds === 0;
