import { MOD_DEFINITIONS } from '../mods/definitions.ts';
import { RUN_PROTOCOLS } from '../mods/modBalance.ts';
import type { RunProtocolId } from '../mods/types.ts';

export const SUPREME_BRIDGE_WINDOW_START = 48;
export const SUPREME_BRIDGE_WINDOW_END = 50;

export interface SupremeBridgeRequest {
  protocol: RunProtocolId;
  completedRound: number;
  seed: number;
  alreadyAwarded: boolean;
  ownedModIds: readonly string[];
}

export interface SupremeBridgeResolution {
  eligible: boolean;
  markSatisfied: boolean;
  modId: string | null;
  guaranteed: boolean;
}

const stableUnit = (seed: number, round: number): number => {
  let value = (seed ^ Math.imul(round, 0x45d9f3b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
};

/** Dedicated one-time bridge. It never changes regular Mod drop weights. */
export const resolveSupremeBridgeReward = (request: SupremeBridgeRequest): SupremeBridgeResolution => {
  const regularOverdrive = RUN_PROTOCOLS[request.protocol].family === 'overdrive';
  const inWindow = request.completedRound >= SUPREME_BRIDGE_WINDOW_START
    && request.completedRound <= SUPREME_BRIDGE_WINDOW_END;
  if (!regularOverdrive || !inWindow || request.alreadyAwarded) {
    return { eligible: false, markSatisfied: false, modId: null, guaranteed: false };
  }

  const supremeDefinitions = MOD_DEFINITIONS.filter((definition) => definition.rarity === 'supreme');
  const owned = new Set(request.ownedModIds);
  if (supremeDefinitions.some((definition) => owned.has(definition.id))) {
    return { eligible: true, markSatisfied: true, modId: null, guaranteed: false };
  }

  const guaranteed = request.completedRound === SUPREME_BRIDGE_WINDOW_END;
  const opportunityChance = request.completedRound === 48 ? 0.28 : request.completedRound === 49 ? 0.55 : 1;
  const opportunityRoll = stableUnit(request.seed ^ 0x51a7e, request.completedRound);
  if (!guaranteed && opportunityRoll >= opportunityChance) {
    return { eligible: true, markSatisfied: false, modId: null, guaranteed: false };
  }

  const unowned = supremeDefinitions.filter((definition) => !owned.has(definition.id));
  const pool = unowned.length > 0 ? unowned : supremeDefinitions;
  const index = Math.min(pool.length - 1, Math.floor(stableUnit(request.seed ^ 0x5f3759df, request.completedRound + 17) * pool.length));
  return {
    eligible: true,
    markSatisfied: true,
    modId: pool[index]?.id ?? null,
    guaranteed
  };
};
