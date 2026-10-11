import { getDifficultyCurve, getSpawnProfile } from '../../config/balance/index.ts';
import { getProtocolModeBalance } from '../../config/modeBalance.ts';
import { arenaEnemyScaling, arenaBossBenchmark, arenaBossDamage, scaleArenaEnemyStats } from '../../config/ArenaCombatScaling.ts';
import { RUN_PROTOCOLS } from '../../mods/modBalance.ts';
import { getHeistCampaignPositions } from '../heist/HeistCampaignProgression.ts';
import type { HeistSessionData } from '../types.ts';
import { loadoutDifficulty, dreadnoughtHealthBudget } from '../../config/CombatPower.ts';

export function skyBreachDifficulty(session: HeistSessionData) {
  const positions = getHeistCampaignPositions(session.protocol, session.round);
  const family = RUN_PROTOCOLS[session.protocol].family;
  const mode = getProtocolModeBalance(session.protocol);
  const curve = session.difficulty ?? {
    ...getDifficultyCurve(positions.difficultyPosition, 0),
    activeCount: getSpawnProfile(positions.difficultyPosition, 0, family).activeCountCap,
    contractHealthMultiplier: 1, rewardMultiplier: 1
  };
  const bossBenchmark = session.difficulty?.bossBenchmark ?? arenaBossBenchmark(family, session.round);
  const loadout = session.difficulty?.loadout ?? loadoutDifficulty(family, session.player ? {
    ...session.player, abilities: session.abilities,
    criticalMultiplier: 1.8 * (session.sharedRuntime?.modRuntime.multiplier('weaponCritDamage') ?? 1)
  } : undefined);
  const bossTotalHealth = dreadnoughtHealthBudget(bossBenchmark.health, loadout);
  const hardpointHealth = Math.max(1, Math.floor(bossTotalHealth * .7 / 7));
  return {
    ...positions,
    mode: family, protocol: session.protocol,
    ...arenaEnemyScaling(curve, session.protocol, session.difficulty?.defensePhase ?? true, curve.contractHealthMultiplier, loadout),
    entryCurve: { ...curve },
    loadout,
    pressure: mode.activePressureMultiplier * loadout.pressure,
    spawnCadence: (family === 'normal' ? 1 : mode.spawnCadenceMultiplier) / loadout.pressure,
    activeCap: Math.max(9, Math.min(24, Math.round(curve.activeCount * mode.activePressureMultiplier * loadout.pressure) + 3)),
    formationCount: Math.max(3, Math.min(7, Math.round(3 + positions.difficultyPosition / 35))),
    bossBenchmark,
    bossHealth: bossBenchmark.health,
    bossTotalHealth, hardpointHealth, coreHealth: bossTotalHealth - 7 * hardpointHealth,
    bossDamage: arenaBossDamage(family, session.round, session.protocol) * loadout.damage,
    rewardMultiplier: curve.rewardMultiplier
  };
}

export { scaleArenaEnemyStats };
