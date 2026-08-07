import type { ArenaTemplate, ObjectiveMode } from '../types';
import { OBJECTIVE_BALANCE, getRoundSiteCountBalanced } from './balance';
import { ARENA_ARCHETYPES } from './arenaGeneration.ts';

export const GAME_TITLE = 'N3ONDefense';
export const GAME_TAGLINE = 'Plant. Defend. Survive. Detonate.';

export const SPLASH_SESSION_KEY = 'n3on-defense.splash.played';

export const OBJECTIVE_CONFIG = {
  defaultMode: 'open' as ObjectiveMode,
  maxActiveBombs: 1,
  plantHoldMs: OBJECTIVE_BALANCE.plantHoldMs,
  bombDefenseMs: OBJECTIVE_BALANCE.bombDefenseMs,
  defuseRequiredMs: OBJECTIVE_BALANCE.defuseRequiredMs,
  recoveryMs: OBJECTIVE_BALANCE.recoveryMs,
  clearEnemiesOnSiteDestroy: false
};

export const ARENA_TEMPLATES: ArenaTemplate[] = ARENA_ARCHETYPES;

export const ROUND_SITE_RULES = [2, 3, 3, 4] as const;

export const getRoundSiteCount = (round: number): number => {
  return getRoundSiteCountBalanced(round);
};
