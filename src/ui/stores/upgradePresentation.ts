import type { UpgradeDefinition } from '../../game/types';
import { ABILITY_BALANCE, PLAYER_BALANCE, WEAPON_BALANCE } from '../../game/config/balance';

interface UpgradeValue {
  value: number;
  unit: string;
  decimals?: number;
}

export const getUpgradeValue = (definition: UpgradeDefinition, level: number): UpgradeValue => {
  const id = definition.id;
  const effect = definition.effectPerLevel * level;
  if (id === 'player.maxHealth') return { value: PLAYER_BALANCE.maxHealth + effect, unit: 'HP' };
  if (id === 'player.moveSpeed') return { value: PLAYER_BALANCE.moveSpeed + effect, unit: 'speed' };
  if (id === 'player.dashCooldown') return { value: Math.max(1500, PLAYER_BALANCE.dashCooldownMs + effect), unit: 'ms' };
  if (id === 'player.dashDistance') return { value: (PLAYER_BALANCE.dashDistanceMultiplier + effect) * 100, unit: '% distance' };
  if (id === 'player.pickupRadius') return { value: PLAYER_BALANCE.pickupRadius + effect, unit: 'radius' };
  if (id === 'player.shieldDuration') return { value: Math.min(ABILITY_BALANCE.shield.maximumDurationMs, ABILITY_BALANCE.shield.durationMs + effect) / 1000, unit: 'seconds', decimals: 2 };
  if (id === 'player.energyMax') return { value: PLAYER_BALANCE.energyMax + effect, unit: 'energy' };
  if (id === 'player.energyRegen') return { value: PLAYER_BALANCE.energyRegenPerSecond + effect, unit: 'energy/s', decimals: 1 };
  if (id === 'weapon.damage') return { value: WEAPON_BALANCE.damage + effect, unit: 'damage' };
  if (id === 'weapon.fireRate') return { value: Math.min(WEAPON_BALANCE.maximumFireRate, WEAPON_BALANCE.fireRate + effect), unit: 'shots/s', decimals: 1 };
  if (id === 'weapon.projectileSpeed') return { value: WEAPON_BALANCE.projectileSpeed + effect, unit: 'projectile speed' };
  if (id === 'weapon.critChance') return { value: Math.min(WEAPON_BALANCE.maximumCritChance, WEAPON_BALANCE.critChance + effect) * 100, unit: '% crit', decimals: 0 };
  if (id === 'weapon.heatEfficiency') return { value: Math.max(WEAPON_BALANCE.minimumHeatPerShot, WEAPON_BALANCE.heatPerShot + effect), unit: 'heat/shot', decimals: 1 };
  if (id === 'fence.damage') return { value: ABILITY_BALANCE.fence.damage + effect, unit: 'DPS' };
  if (id === 'fence.duration') return { value: (ABILITY_BALANCE.fence.durationMs + effect) / 1000, unit: 'seconds', decimals: 1 };
  if (id === 'fence.health') return { value: ABILITY_BALANCE.fence.hp + effect, unit: 'HP' };
  if (id === 'fence.max') return { value: ABILITY_BALANCE.fence.maxActive + effect, unit: 'active fences' };
  if (id === 'turret.damage') return { value: ABILITY_BALANCE.turret.damage + effect, unit: 'damage/shot' };
  if (id === 'turret.fireRate') return { value: ABILITY_BALANCE.turret.fireRate + effect, unit: 'shots/s', decimals: 2 };
  if (id === 'turret.range') return { value: ABILITY_BALANCE.turret.range + effect, unit: 'range' };
  if (id === 'turret.health') return { value: ABILITY_BALANCE.turret.hp + effect, unit: 'HP' };
  if (id === 'turret.max') return { value: ABILITY_BALANCE.turret.maxActive + effect, unit: 'active turrets' };
  if (id === 'mine.damage') return { value: ABILITY_BALANCE.mine.damage + effect, unit: 'damage' };
  if (id === 'mine.radius') return { value: ABILITY_BALANCE.mine.radius + effect, unit: 'radius' };
  if (id === 'mine.arm') return { value: Math.max(400, ABILITY_BALANCE.mine.armMs + effect), unit: 'ms arm time' };
  if (id === 'mine.max') return { value: ABILITY_BALANCE.mine.maxActive + effect, unit: 'active mines' };
  return { value: effect, unit: definition.description };
};

export const formatUpgradeValue = (value: UpgradeValue): string =>
  `${value.value.toFixed(value.decimals ?? 0)} ${value.unit}`;

export const getUpgradeComparison = (definition: UpgradeDefinition, level: number) => {
  const current = getUpgradeValue(definition, level);
  const next = getUpgradeValue(definition, Math.min(definition.maxLevel, level + 1));
  const delta = next.value - current.value;
  const percentage = current.value === 0 ? 0 : Math.abs(delta / current.value) * 100;
  return {
    current: formatUpgradeValue(current),
    next: formatUpgradeValue(next),
    improvement: `${delta >= 0 ? '+' : ''}${delta.toFixed(next.decimals ?? 0)} ${next.unit}`,
    percentage: percentage >= 0.1 ? `${percentage.toFixed(1)}%` : null
  };
};
