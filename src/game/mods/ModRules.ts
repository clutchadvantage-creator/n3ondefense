import { MOD_BALANCE, RUN_PROTOCOLS } from './modBalance.ts';
import type { ModRank, RunProtocolId } from './types.ts';

export const splitCurrentSecondaryDamage = (finalKillingHitDamage: number, rank: ModRank, isSecondaryEffect: boolean): number => {
  if (isSecondaryEffect) return 0;
  return Math.max(0, finalKillingHitDamage) * MOD_BALANCE.splitCurrent.damageShare[rank];
};

export const magneticResistanceForEnemy = (enemyType: string): number => {
  if (enemyType === 'star') return 0.15;
  if (enemyType === 'tank') return 0.35;
  if (enemyType === 'disruptor') return 0.7;
  return 1;
};

export const prioritizeTurretTargets = <T extends { distance: number; activelyDefusing: boolean; marked: boolean }>(targets: T[], rank: number): T[] => {
  return [...targets].sort((a, b) => {
    const aPriority = rank >= 0 && (a.activelyDefusing || (rank >= 2 && a.marked));
    const bPriority = rank >= 0 && (b.activelyDefusing || (rank >= 2 && b.marked));
    if (aPriority !== bPriority) return aPriority ? -1 : 1;
    return a.distance - b.distance;
  });
};

export const protocolStart = (protocol: RunProtocolId, highestRound: number) => {
  const requested = RUN_PROTOCOLS[protocol];
  const active = highestRound >= requested.unlockHighestRound ? requested : RUN_PROTOCOLS.normal;
  return { protocol: active.id, startingRound: active.startingRound, scoreMultiplier: active.scoreMultiplier, modDropMultiplier: active.modDropMultiplier, skippedRewards: { credits: 0, coreTokens: 0, mods: 0, kills: 0, score: 0 } } as const;
};
