import { getUpgradeEffect, getUpgradeLevel } from '../../data/upgrades.ts';
import { ABILITY_BALANCE } from '../config/balance/index.ts';
import type { AbilityType } from '../types.ts';
import type { ModRuntime } from '../mods/ModRuntime.ts';

export interface AbilityRuntimeConfig {
  energyCost: number;
  cooldownMs: number;
  maxActive: number;
  damage: number;
  hp: number;
  durationMs: number;
  range: number;
  fireRate: number;
  armMs: number;
  radius: number;
}

/**
 * Authoritative permanent-upgrade + Mod calculation used by every combat map.
 * Arena and anomaly scenes must never maintain separate copies of these rules.
 */
export const resolveAbilityRuntimeConfig = (
  type: AbilityType,
  upgrades: Record<string, number>,
  mods: ModRuntime
): AbilityRuntimeConfig => {
  if (type === 'fence') {
    const upgradedDamage = ABILITY_BALANCE.fence.damage + getUpgradeLevel(upgrades, 'fence.damage') * 4;
    const upgradedHealth = ABILITY_BALANCE.fence.hp + getUpgradeLevel(upgrades, 'fence.health') * 16;
    return {
      energyCost: ABILITY_BALANCE.fence.energyCost * mods.multiplier('fenceEnergyCost'),
      cooldownMs: ABILITY_BALANCE.fence.cooldownMs * mods.multiplier('fenceCooldown'),
      maxActive: ABILITY_BALANCE.fence.maxActive + getUpgradeLevel(upgrades, 'fence.max') + Math.floor(mods.addition('fenceMaxActive')),
      damage: upgradedDamage * mods.fenceDamageMultiplier() * mods.multiplier('fenceDamage'),
      hp: upgradedHealth * mods.fenceHealthMultiplier() * mods.multiplier('fenceHealth'),
      durationMs: (ABILITY_BALANCE.fence.durationMs + getUpgradeLevel(upgrades, 'fence.duration') * 1200) * mods.multiplier('fenceDuration'),
      range: 0,
      fireRate: 0,
      armMs: 0,
      radius: 0
    };
  }

  if (type === 'turret') {
    return {
      energyCost: ABILITY_BALANCE.turret.energyCost * mods.multiplier('turretEnergyCost'),
      cooldownMs: ABILITY_BALANCE.turret.cooldownMs * mods.multiplier('turretCooldown'),
      maxActive: ABILITY_BALANCE.turret.maxActive + getUpgradeLevel(upgrades, 'turret.max') + Math.floor(mods.addition('turretMaxActive')),
      damage: (ABILITY_BALANCE.turret.damage + getUpgradeLevel(upgrades, 'turret.damage') * 2) * mods.multiplier('turretDamage'),
      hp: (ABILITY_BALANCE.turret.hp + getUpgradeLevel(upgrades, 'turret.health') * 20) * mods.multiplier('turretHealth'),
      durationMs: 0,
      range: (ABILITY_BALANCE.turret.range + getUpgradeLevel(upgrades, 'turret.range') * 12) * mods.multiplier('turretRange'),
      fireRate: (ABILITY_BALANCE.turret.fireRate + getUpgradeLevel(upgrades, 'turret.fireRate') * 0.25) * mods.multiplier('turretFireRate'),
      armMs: 0,
      radius: 0
    };
  }

  const upgradedMineDamage = ABILITY_BALANCE.mine.damage + getUpgradeLevel(upgrades, 'mine.damage') * 7;
  const upgradedMineArmMs = Math.max(400, ABILITY_BALANCE.mine.armMs - getUpgradeLevel(upgrades, 'mine.arm') * 70);
  return {
    energyCost: ABILITY_BALANCE.mine.energyCost * mods.multiplier('mineEnergyCost'),
    cooldownMs: ABILITY_BALANCE.mine.cooldownMs * mods.multiplier('mineCooldown'),
    maxActive: ABILITY_BALANCE.mine.maxActive + getUpgradeLevel(upgrades, 'mine.max') + Math.floor(mods.addition('mineMaxActive')),
    damage: upgradedMineDamage * mods.mineDamageMultiplier() * mods.multiplier('mineDamage'),
    hp: 0,
    durationMs: 0,
    range: 0,
    fireRate: 0,
    armMs: Math.max(100, upgradedMineArmMs * mods.mineArmTimeMultiplier() * mods.multiplier('mineArmTime')),
    radius: (ABILITY_BALANCE.mine.radius + getUpgradeLevel(upgrades, 'mine.radius') * 7) * mods.multiplier('mineRadius')
  };
};

export const resolveShieldRuntime = (
  upgrades: Record<string, number>,
  mods: ModRuntime
): { durationMs: number; cooldownMs: number; energyCost: number } => ({
  durationMs: Math.min(
    ABILITY_BALANCE.shield.maximumDurationMs,
    ABILITY_BALANCE.shield.durationMs + getUpgradeEffect(upgrades, 'player.shieldDuration')
  ) * mods.multiplier('shieldDuration'),
  cooldownMs: ABILITY_BALANCE.shield.cooldownMs * mods.multiplier('shieldCooldown'),
  energyCost: ABILITY_BALANCE.shield.energyCost * mods.multiplier('shieldEnergyCost')
});
