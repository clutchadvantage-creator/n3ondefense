import { MOD_DEFINITIONS } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import type { ModDefinition, ModDropSource, RunProtocolId } from './types.ts';
import { RUN_PROTOCOLS } from './modBalance.ts';

export interface ModDropRequest {
  source: ModDropSource;
  round: number;
  seed: number;
  sequence: number;
  protocol: RunProtocolId;
  guaranteed?: boolean;
}

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
  const protocolMultiplier = RUN_PROTOCOLS[request.protocol].modDropMultiplier;
  const chance = Math.min(1, MOD_BALANCE.dropChance[request.source] * protocolMultiplier);
  if (!request.guaranteed && roll() >= chance) return null;

  return weighted(MOD_DEFINITIONS, (definition) => {
    const base = MOD_BALANCE.rarityWeights[definition.rarity]
      * MOD_BALANCE.raritySourceMultipliers[request.source][definition.rarity]
      * definition.dropWeight;
    const highRarity = definition.rarity === 'rare' || definition.rarity === 'prototype' || definition.rarity === 'legendary';
    return base * (highRarity ? 1 + Math.max(0, request.round - 1) * MOD_BALANCE.rarityRoundBonusPerRound : 1);
  }, roll);
};

export const isGuaranteedMilestone = (round: number): boolean => round > 0 && round % MOD_BALANCE.guaranteedMilestoneEveryRounds === 0;
