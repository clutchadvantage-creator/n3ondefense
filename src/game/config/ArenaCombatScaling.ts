import type { DifficultyCurve } from './balance/index.ts';
import { getProtocolModeBalance, type RunModeFamily } from './modeBalance.ts';
import { getBossHealth, getBossDamageMultiplier } from './bossBalance.ts';
import { CAMPAIGN_ROUNDS, getCampaignProtocol } from '../progression/CampaignProgression.ts';
import { getCampaignCombatPosition } from '../progression/CampaignDifficulty.ts';
import type { RunProtocolId } from '../mods/types.ts';

/** Shared by Arena spawns and excursions: round, phase, Contract, then mode, once. */
export function arenaEnemyScaling(curve: DifficultyCurve, protocol: RunProtocolId, defensePhase: boolean, contractHealth = 1) {
  const mode = getProtocolModeBalance(protocol), phase = defensePhase ? 1 : .9;
  return {
    health: (1 + (curve.healthMultiplier - 1) * phase) * contractHealth * mode.enemyHealthMultiplier,
    damage: (1 + (curve.damageMultiplier - 1) * phase) * mode.enemyDamageMultiplier,
    speed: curve.speedMultiplier * mode.enemySpeedMultiplier
  };
}

export function scaleArenaEnemyStats<T extends { hp: number; damage: number; speed: number }>(
  base: T, scaling: ReturnType<typeof arenaEnemyScaling>, classHealth = 1
) {
  return { ...base, hp: Math.round(base.hp * scaling.health * classHealth),
    damage: Math.round(base.damage * scaling.damage), speed: Math.round(base.speed * scaling.speed) };
}

/** Arena's family helpers already apply the family multiplier; only apply the stage delta. */
export function arenaBossStageScaling(protocol: RunProtocolId, family: RunModeFamily) {
  const stage = getProtocolModeBalance(protocol), baseline = getProtocolModeBalance(family);
  return { healthMultiplier: stage.bossHealthMultiplier / baseline.bossHealthMultiplier,
    damageMultiplier: stage.bossDamageMultiplier / baseline.bossDamageMultiplier };
}

export function arenaBossBenchmark(mode: RunModeFamily, localRound: number) {
  // Clamp to scheduled encounters in this mode; never reach into the next campaign.
  getCampaignCombatPosition(mode, localRound);
  const round = Math.max(5, Math.min(CAMPAIGN_ROUNDS, Math.round(localRound / 5) * 5));
  const protocol = getCampaignProtocol(mode, round), position = getCampaignCombatPosition(mode, round);
  const stage = arenaBossStageScaling(protocol, mode);
  return { mode, round, protocol, difficultyPosition: position,
    health: Math.max(1, Math.round(getBossHealth(position, mode) * stage.healthMultiplier)) };
}

export function arenaBossDamage(mode: RunModeFamily, localRound: number, protocol: RunProtocolId) {
  return getBossDamageMultiplier(getCampaignCombatPosition(mode, localRound), mode)
    * arenaBossStageScaling(protocol, mode).damageMultiplier;
}
