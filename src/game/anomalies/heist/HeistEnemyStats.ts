import { ENEMY_BALANCE, getDifficultyCurve, type BalanceEnemyType } from '../../config/balance/index.ts';
import { applyEnemyDamageMode, applyEnemyHealthMode, getProtocolModeBalance } from '../../config/modeBalance.ts';
import type { EnemyStats } from '../../enemies/Enemy.ts';
import type { RunProtocolId } from '../../mods/types.ts';

/** Existing Heist scaling, applied once for patrols, the mini-boss and sentries. */
export const heistEnemyStats = (type: BalanceEnemyType, position: number, protocol: RunProtocolId,
  elite: boolean, loadout: { health: number; damage: number } = { health: 1, damage: 1 }): EnemyStats => {
  const base = ENEMY_BALANCE[type], curve = getDifficultyCurve(position), mode = getProtocolModeBalance(protocol);
  return {
    type, valueCredits: base.credits, valueCoreTokens: base.tokens,
    hp: applyEnemyHealthMode(base.hp * curve.healthMultiplier * (elite ? 2.8 : 1) * loadout.health, protocol),
    damage: applyEnemyDamageMode(base.damage * curve.damageMultiplier * (elite ? 1.35 : 1) * loadout.damage, protocol),
    speed: base.speed * curve.speedMultiplier * mode.enemySpeedMultiplier * (elite ? 0.92 : 1),
    size: base.size * (elite ? 1.55 : 1), color: elite ? 0xffd85c : base.color
  };
};

export const heistSentryStats = (position: number, protocol: RunProtocolId,
  loadout?: { health: number; damage: number }): EnemyStats => ({
  ...heistEnemyStats('shooter', position, protocol, false, loadout),
  hp: heistEnemyStats('tank', position, protocol, true, loadout).hp * 0.5,
  size: 32, speed: 0, color: 0xff5575
});
