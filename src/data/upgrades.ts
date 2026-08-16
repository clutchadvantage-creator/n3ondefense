import type { UpgradeDefinition } from '../game/types.ts';

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  { id: 'player.maxHealth', category: 'player', label: 'Max Health', description: '+10 max HP', maxLevel: 10, baseCost: 75, growth: 1.26, effectPerLevel: 10 },
  { id: 'player.moveSpeed', category: 'player', label: 'Move Speed', description: '+9 speed', maxLevel: 10, baseCost: 90, growth: 1.27, effectPerLevel: 9 },
  { id: 'player.dashCooldown', category: 'player', label: 'Dash Cooldown', description: '-120ms dash cooldown', maxLevel: 8, baseCost: 110, growth: 1.3, effectPerLevel: -120 },
  { id: 'player.dashDistance', category: 'player', label: 'Dash Distance', description: '+8% dash distance', maxLevel: 8, baseCost: 120, growth: 1.29, effectPerLevel: 0.08 },
  { id: 'player.pickupRadius', category: 'player', label: 'Pickup Radius', description: '+7 pickup radius', maxLevel: 8, baseCost: 80, growth: 1.25, effectPerLevel: 7 },
  { id: 'player.shieldDuration', category: 'player', label: 'Shield Duration', description: '+0.35s shield duration', maxLevel: 8, baseCost: 145, growth: 1.31, effectPerLevel: 350 },
  { id: 'player.energyMax', category: 'player', label: 'Energy Capacity', description: '+5 max energy', maxLevel: 10, baseCost: 100, growth: 1.27, effectPerLevel: 5 },
  { id: 'player.energyRegen', category: 'player', label: 'Energy Regen', description: '+0.14 energy/s', maxLevel: 10, baseCost: 125, growth: 1.29, effectPerLevel: 0.14 },

  { id: 'weapon.damage', category: 'weapon', label: 'Weapon Damage', description: '+2 damage', maxLevel: 10, baseCost: 125, growth: 1.3, effectPerLevel: 2 },
  { id: 'weapon.fireRate', category: 'weapon', label: 'Weapon Fire Rate', description: '+0.4 shots/s', maxLevel: 10, baseCost: 160, growth: 1.31, effectPerLevel: 0.4 },
  { id: 'weapon.projectileSpeed', category: 'weapon', label: 'Projectile Speed', description: '+30 speed', maxLevel: 8, baseCost: 105, growth: 1.25, effectPerLevel: 30 },
  { id: 'weapon.critChance', category: 'weapon', label: 'Critical Chance', description: '+2% crit chance', maxLevel: 10, baseCost: 175, growth: 1.31, effectPerLevel: 0.02 },
  { id: 'weapon.heatEfficiency', category: 'weapon', label: 'Heat Efficiency', description: '-0.4 heat per shot', maxLevel: 10, baseCost: 145, growth: 1.28, effectPerLevel: -0.4 },

  { id: 'fence.damage', category: 'fence', label: 'Fence Damage', description: '+4 dps', maxLevel: 10, baseCost: 105, growth: 1.27, effectPerLevel: 4 },
  { id: 'fence.duration', category: 'fence', label: 'Fence Duration', description: '+1.2s duration', maxLevel: 10, baseCost: 90, growth: 1.25, effectPerLevel: 1200 },
  { id: 'fence.health', category: 'fence', label: 'Fence Health', description: '+16 health', maxLevel: 10, baseCost: 115, growth: 1.27, effectPerLevel: 16 },
  { id: 'fence.max', category: 'fence', label: 'Fence Capacity', description: '+1 max fence', maxLevel: 3, baseCost: 320, growth: 1.45, effectPerLevel: 1 },

  { id: 'turret.damage', category: 'turret', label: 'Turret Damage', description: '+2 damage', maxLevel: 10, baseCost: 135, growth: 1.28, effectPerLevel: 2 },
  { id: 'turret.fireRate', category: 'turret', label: 'Turret Fire Rate', description: '+0.25 shots/s', maxLevel: 10, baseCost: 150, growth: 1.29, effectPerLevel: 0.25 },
  { id: 'turret.range', category: 'turret', label: 'Turret Range', description: '+12 range', maxLevel: 10, baseCost: 120, growth: 1.27, effectPerLevel: 12 },
  { id: 'turret.health', category: 'turret', label: 'Turret Health', description: '+20 health', maxLevel: 10, baseCost: 120, growth: 1.27, effectPerLevel: 20 },
  { id: 'turret.max', category: 'turret', label: 'Turret Capacity', description: '+1 max turret', maxLevel: 3, baseCost: 340, growth: 1.45, effectPerLevel: 1 },

  { id: 'mine.damage', category: 'mine', label: 'Mine Damage', description: '+7 damage', maxLevel: 10, baseCost: 115, growth: 1.27, effectPerLevel: 7 },
  { id: 'mine.radius', category: 'mine', label: 'Mine Radius', description: '+7 radius', maxLevel: 10, baseCost: 115, growth: 1.27, effectPerLevel: 7 },
  { id: 'mine.arm', category: 'mine', label: 'Mine Arming', description: '-70ms arm time', maxLevel: 8, baseCost: 125, growth: 1.27, effectPerLevel: -70 },
  { id: 'mine.max', category: 'mine', label: 'Mine Capacity', description: '+1 max mine', maxLevel: 3, baseCost: 270, growth: 1.45, effectPerLevel: 1 }
];

export const getUpgradeCost = (baseCost: number, growth: number, level: number): number =>
  Math.round(baseCost * growth ** Math.max(0, level));

export const getUpgradeLevel = (upgrades: Record<string, number>, id: string): number => {
  const definition = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === id);
  return Math.min(definition?.maxLevel ?? 0, Math.max(0, Math.floor(upgrades[id] ?? 0)));
};

export const getUpgradeEffect = (upgrades: Record<string, number>, id: string): number => {
  const definition = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === id);
  return definition ? getUpgradeLevel(upgrades, id) * definition.effectPerLevel : 0;
};
