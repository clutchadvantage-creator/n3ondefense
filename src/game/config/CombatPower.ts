import { ABILITY_BALANCE, PLAYER_BALANCE, WEAPON_BALANCE } from './balance/index.ts';
import type { RunModeFamily } from './modeBalance.ts';
import type { EnergyStats, PlayerStats, WeaponStats } from '../types.ts';

type AbilityPower = { damage: number; maxActive: number; fireRate?: number; cooldownMs?: number };
export interface CombatLoadout {
  stats: Pick<PlayerStats, 'maxHealth'>;
  energyStats: EnergyStats;
  weapon: WeaponStats;
  criticalMultiplier?: number;
  abilities?: { turret: AbilityPower; fence: AbilityPower; mine: AbilityPower };
}

/** Permanent capability only: no current HP, energy, buffs, kills or temporary boss forms. */
export function combatPower(loadout: CombatLoadout) {
  const w = loadout.weapon, abilities = loadout.abilities ?? ABILITY_BALANCE;
  const shots = Math.min(WEAPON_BALANCE.maximumBuffedFireRate, w.fireRate,
    w.cooldownRate / Math.max(.5, w.heatPerShot));
  const weaponDps = w.damage * shots * (1 + Math.max(0, Math.min(.9, w.critChance))
    * (Math.max(1, loadout.criticalMultiplier ?? WEAPON_BALANCE.critMultiplier) - 1));
  // Deployables need placement, energy and targets. Discount their theoretical output;
  // capacities and damage still let dedicated engineering builds contribute to strength.
  const supportDps = abilities.turret.damage * (abilities.turret.fireRate ?? 0) * abilities.turret.maxActive * .3
    + abilities.fence.damage * abilities.fence.maxActive * .15
    + abilities.mine.damage * Math.min(abilities.mine.maxActive, 3)
      / Math.max(1, (abilities.mine.cooldownMs ?? 4200) / 1000) * .25;
  const offense = Math.max(1, weaponDps + supportDps);
  const resilience = Math.max(1, loadout.stats.maxHealth / PLAYER_BALANCE.maxHealth) ** .7
    * Math.max(1, loadout.energyStats.max / PLAYER_BALANCE.energyMax) ** .2
    * Math.max(1, loadout.energyStats.regenPerSecond / PLAYER_BALANCE.energyRegenPerSecond) ** .1;
  return { weaponDps, supportDps, offense, resilience };
}

export const STARTER_COMBAT_POWER = combatPower({
  stats: { maxHealth: PLAYER_BALANCE.maxHealth },
  energyStats: { max: PLAYER_BALANCE.energyMax, regenPerSecond: PLAYER_BALANCE.energyRegenPerSecond },
  weapon: WEAPON_BALANCE
});

// Normal tolerates beginner upgrades; Overdrive expects developed builds; Supreme
// already expects full upgrades and strong Mods. Never reduce the authored difficulty.
export const LOADOUT_DIFFICULTY = {
  normal: { expectedOffense: 1.5, expectedResilience: 2, healthCap: 1.45, pressureCap: 1.08 },
  overdrive: { expectedOffense: 6, expectedResilience: 3.5, healthCap: 1.55, pressureCap: 1.10 },
  supreme: { expectedOffense: 18, expectedResilience: 6, healthCap: 1.30, pressureCap: 1.06 }
} as const;

export function loadoutDifficulty(family: RunModeFamily, loadout?: CombatLoadout) {
  const power = loadout ? combatPower(loadout) : STARTER_COMBAT_POWER;
  const tuning = LOADOUT_DIFFICULTY[family];
  const offenseRatio = power.offense / STARTER_COMBAT_POWER.offense;
  const offenseSurplus = Math.max(1, offenseRatio / tuning.expectedOffense);
  const offenseSteps = Math.log2(offenseSurplus);
  const resilienceSteps = Math.log2(Math.max(1, power.resilience / tuning.expectedResilience));
  return {
    ...power, offenseRatio,
    health: Math.min(tuning.healthCap, 1 + offenseSteps * .12),
    damage: Math.min(1.08, 1 + resilienceSteps * .025),
    pressure: Math.min(tuning.pressureCap, 1 + Math.max(offenseSteps, resilienceSteps) * .025)
  };
}

/** One ship budget. Reference output follows the mode/round boss benchmark, not
 * player level. Sublinear growth keeps damage upgrades valuable; the ceiling
 * prevents pathological Mod combinations creating an endless health sponge. */
export function dreadnoughtHealthBudget(arenaHealth: number, power: ReturnType<typeof loadoutDifficulty>): number {
  const baseline = arenaHealth * .95;
  const expectedOutput = baseline / 50;
  const multiplier = Math.min(6, .95 * Math.max(1, power.offense / expectedOutput) ** .65);
  return Math.max(8, Math.round(arenaHealth * multiplier));
}
