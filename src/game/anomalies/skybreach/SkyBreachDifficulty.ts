import { getDifficultyCurve, getSpawnProfile } from '../../config/balance/index.ts';
import { getProtocolModeBalance } from '../../config/modeBalance.ts';
import { getBossHealth, getBossDamageMultiplier } from '../../config/bossBalance.ts';
import { RUN_PROTOCOLS } from '../../mods/modBalance.ts';
import { getHeistCampaignPositions } from '../heist/HeistCampaignProgression.ts';
import type { HeistSessionData } from '../types.ts';

export function skyBreachDifficulty(session: HeistSessionData) {
  const positions = getHeistCampaignPositions(session.protocol, session.round);
  const family = RUN_PROTOCOLS[session.protocol].family;
  const mode = getProtocolModeBalance(session.protocol);
  const curve = session.difficulty ?? {
    ...getDifficultyCurve(positions.difficultyPosition, 0),
    activeCount: getSpawnProfile(positions.difficultyPosition, 0, family).activeCountCap,
    contractHealthMultiplier: 1, rewardMultiplier: 1
  };
  return {
    ...positions,
    health: curve.healthMultiplier * curve.contractHealthMultiplier * mode.enemyHealthMultiplier,
    damage: curve.damageMultiplier * mode.enemyDamageMultiplier,
    speed: curve.speedMultiplier * mode.enemySpeedMultiplier,
    pressure: mode.activePressureMultiplier,
    activeCap: Math.max(5, Math.min(24, Math.round(curve.activeCount * mode.activePressureMultiplier))),
    formationCount: Math.max(3, Math.min(7, Math.round(3 + positions.difficultyPosition / 35))),
    bossHealth: getBossHealth(positions.difficultyPosition, family) * curve.contractHealthMultiplier,
    bossDamage: getBossDamageMultiplier(positions.difficultyPosition, family),
    rewardMultiplier: curve.rewardMultiplier
  };
}
