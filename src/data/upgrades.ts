import type { UpgradeDefinition } from '../game/types.ts';

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  { id: 'player.maxHealth', category: 'player', label: 'Max Health', description: '+10 max HP', maxLevel: 10, baseCost: 75, growth: 1.26, effectPerLevel: 10, visual: { hero: 'operative', effect: 'health', direction: 'add', layout: 'capacity', accent: 'green' } },
  { id: 'player.moveSpeed', category: 'player', label: 'Move Speed', description: '+9 speed', maxLevel: 10, baseCost: 90, growth: 1.27, effectPerLevel: 9, visual: { hero: 'operative', effect: 'speed', direction: 'increase', layout: 'directional', accent: 'cyan' } },
  { id: 'player.dashCooldown', category: 'player', label: 'Dash Cooldown', description: '-120ms dash cooldown', maxLevel: 8, baseCost: 110, growth: 1.3, effectPerLevel: -120, visual: { hero: 'operative', effect: 'dash', direction: 'decrease', layout: 'directional', accent: 'cyan' } },
  { id: 'player.dashDistance', category: 'player', label: 'Dash Distance', description: '+8% dash distance', maxLevel: 8, baseCost: 120, growth: 1.29, effectPerLevel: 0.08, visual: { hero: 'operative', effect: 'dash', direction: 'increase', layout: 'directional', accent: 'cyan' } },
  { id: 'player.pickupRadius', category: 'player', label: 'Pickup Radius', description: '+7 pickup radius', maxLevel: 8, baseCost: 80, growth: 1.25, effectPerLevel: 7, visual: { hero: 'operative', effect: 'pickupRadius', direction: 'increase', layout: 'radial', accent: 'green' } },
  { id: 'player.shieldDuration', category: 'player', label: 'Shield Duration', description: '+0.35s shield duration', maxLevel: 8, baseCost: 145, growth: 1.31, effectPerLevel: 350, visual: { hero: 'operative', effect: 'shield', direction: 'increase', layout: 'radial', accent: 'cyan' } },
  { id: 'player.energyMax', category: 'player', label: 'Energy Capacity', description: '+5 max energy', maxLevel: 10, baseCost: 100, growth: 1.27, effectPerLevel: 5, visual: { hero: 'operative', effect: 'battery', direction: 'increase', layout: 'capacity', accent: 'green' } },
  { id: 'player.energyRegen', category: 'player', label: 'Energy Regen', description: '+0.14 energy/s', maxLevel: 10, baseCost: 125, growth: 1.29, effectPerLevel: 0.14, visual: { hero: 'operative', effect: 'energyRegen', direction: 'increase', layout: 'hero-effect', accent: 'cyan' } },

  { id: 'weapon.damage', category: 'weapon', label: 'Weapon Damage', description: '+2 damage', maxLevel: 10, baseCost: 125, growth: 1.3, effectPerLevel: 2, visual: { hero: 'weapon', effect: 'damage', direction: 'increase', layout: 'hero-effect', accent: 'gold' } },
  { id: 'weapon.fireRate', category: 'weapon', label: 'Weapon Fire Rate', description: '+0.4 shots/s', maxLevel: 10, baseCost: 160, growth: 1.31, effectPerLevel: 0.4, visual: { hero: 'weapon', effect: 'fireRate', direction: 'increase', layout: 'directional', accent: 'cyan' } },
  { id: 'weapon.projectileSpeed', category: 'weapon', label: 'Projectile Speed', description: '+30 speed', maxLevel: 8, baseCost: 105, growth: 1.25, effectPerLevel: 30, visual: { hero: 'weapon', effect: 'projectileSpeed', direction: 'increase', layout: 'directional', accent: 'cyan' } },
  { id: 'weapon.critChance', category: 'weapon', label: 'Critical Chance', description: '+2% crit chance', maxLevel: 10, baseCost: 175, growth: 1.31, effectPerLevel: 0.02, visual: { hero: 'weapon', effect: 'critical', direction: 'increase', layout: 'radial', accent: 'magenta' } },
  { id: 'weapon.heatEfficiency', category: 'weapon', label: 'Heat Efficiency', description: '-0.4 heat per shot', maxLevel: 10, baseCost: 145, growth: 1.28, effectPerLevel: -0.4, visual: { hero: 'weapon', effect: 'efficiency', direction: 'decrease', layout: 'hero-effect', accent: 'cyan' } },

  { id: 'fence.damage', category: 'fence', label: 'Fence Damage', description: '+4 dps', maxLevel: 10, baseCost: 105, growth: 1.27, effectPerLevel: 4, visual: { hero: 'fence', effect: 'damage', direction: 'increase', layout: 'hero-effect', accent: 'cyan' } },
  { id: 'fence.duration', category: 'fence', label: 'Fence Duration', description: '+1.2s duration', maxLevel: 10, baseCost: 90, growth: 1.25, effectPerLevel: 1200, visual: { hero: 'fence', effect: 'duration', direction: 'increase', layout: 'hero-effect', accent: 'cyan' } },
  { id: 'fence.health', category: 'fence', label: 'Fence Health', description: '+16 health', maxLevel: 10, baseCost: 115, growth: 1.27, effectPerLevel: 16, visual: { hero: 'fence', effect: 'armor', direction: 'increase', layout: 'capacity', accent: 'green' } },
  { id: 'fence.max', category: 'fence', label: 'Fence Capacity', description: '+1 max fence', maxLevel: 3, baseCost: 320, growth: 1.45, effectPerLevel: 1, visual: { hero: 'fence', effect: 'capacity', direction: 'add', layout: 'capacity', accent: 'green' } },

  { id: 'turret.damage', category: 'turret', label: 'Turret Damage', description: '+2 damage', maxLevel: 10, baseCost: 135, growth: 1.28, effectPerLevel: 2, visual: { hero: 'turret', effect: 'damage', direction: 'increase', layout: 'hero-effect', accent: 'gold' } },
  { id: 'turret.fireRate', category: 'turret', label: 'Turret Fire Rate', description: '+0.25 shots/s', maxLevel: 10, baseCost: 150, growth: 1.29, effectPerLevel: 0.25, visual: { hero: 'turret', effect: 'fireRate', direction: 'increase', layout: 'directional', accent: 'cyan' } },
  { id: 'turret.range', category: 'turret', label: 'Turret Range', description: '+12 range', maxLevel: 10, baseCost: 120, growth: 1.27, effectPerLevel: 12, visual: { hero: 'turret', effect: 'range', direction: 'increase', layout: 'radial', accent: 'cyan' } },
  { id: 'turret.health', category: 'turret', label: 'Turret Health', description: '+20 health', maxLevel: 10, baseCost: 120, growth: 1.27, effectPerLevel: 20, visual: { hero: 'turret', effect: 'armor', direction: 'increase', layout: 'capacity', accent: 'green' } },
  { id: 'turret.max', category: 'turret', label: 'Turret Capacity', description: '+1 max turret', maxLevel: 3, baseCost: 340, growth: 1.45, effectPerLevel: 1, visual: { hero: 'turret', effect: 'capacity', direction: 'add', layout: 'capacity', accent: 'green' } },

  { id: 'mine.damage', category: 'mine', label: 'Mine Damage', description: '+7 damage', maxLevel: 10, baseCost: 115, growth: 1.27, effectPerLevel: 7, visual: { hero: 'mine', effect: 'explosion', direction: 'increase', layout: 'radial', accent: 'gold' } },
  { id: 'mine.radius', category: 'mine', label: 'Mine Radius', description: '+7 radius', maxLevel: 10, baseCost: 115, growth: 1.27, effectPerLevel: 7, visual: { hero: 'mine', effect: 'range', direction: 'increase', layout: 'radial', accent: 'cyan' } },
  { id: 'mine.arm', category: 'mine', label: 'Mine Arming', description: '-70ms arm time', maxLevel: 8, baseCost: 125, growth: 1.27, effectPerLevel: -70, visual: { hero: 'mine', effect: 'arming', direction: 'decrease', layout: 'hero-effect', accent: 'cyan' } },
  { id: 'mine.max', category: 'mine', label: 'Mine Capacity', description: '+1 max mine', maxLevel: 3, baseCost: 270, growth: 1.45, effectPerLevel: 1, visual: { hero: 'mine', effect: 'capacity', direction: 'add', layout: 'capacity', accent: 'green' } }
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
