import type { ModDefinition, ModRank, ModStat, ModStatModifier } from './types.ts';

const ranks = (rank0: number, rank1: number, rank2: number, rank3: number): Record<ModRank, number> => ({
  0: rank0, 1: rank1, 2: rank2, 3: rank3
});

const multiply = (stat: ModStat, rank0: number, rank1: number, rank2: number, rank3: number): ModStatModifier => ({
  stat, mode: 'multiply', values: ranks(rank0, rank1, rank2, rank3)
});

const add = (stat: ModStat, rank0: number, rank1: number, rank2: number, rank3: number): ModStatModifier => ({
  stat, mode: 'add', values: ranks(rank0, rank1, rank2, rank3)
});

export const EXPANDED_MOD_DEFINITIONS: readonly ModDefinition[] = [
  // Common: clean, focused improvements that establish the basic build vocabulary.
  {
    id: 'calibrated-barrel', name: 'Calibrated Barrel', icon: '➤', iconColor: 0xff6e8a,
    category: 'weapon', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'Precision barrel machining raises final weapon damage.',
    rankDescriptions: { 0: 'Weapon damage +3%.', 1: 'Weapon damage +5%.', 2: 'Weapon damage +7%.', 3: 'Weapon damage +9%.' },
    tags: ['weapon', 'damage', 'stacking-upgrade'], modifiers: [multiply('weaponDamage', 1.03, 1.05, 1.07, 1.09)]
  },
  {
    id: 'cycling-servo', name: 'Cycling Servo', icon: '↻', iconColor: 0x6cf6ff,
    category: 'weapon', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'A faster cycling servo improves the weapon firing cadence.',
    rankDescriptions: { 0: 'Fire rate +3%.', 1: 'Fire rate +5%.', 2: 'Fire rate +7%.', 3: 'Fire rate +9%.' },
    tags: ['weapon', 'fire-rate'], modifiers: [multiply('weaponFireRate', 1.03, 1.05, 1.07, 1.09)]
  },
  {
    id: 'accelerator-coil', name: 'Accelerator Coil', icon: '≫', iconColor: 0x7ad8ff,
    category: 'weapon', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'Compact acceleration coils increase projectile velocity.',
    rankDescriptions: { 0: 'Projectile speed +6%.', 1: 'Projectile speed +9%.', 2: 'Projectile speed +12%.', 3: 'Projectile speed +15%.' },
    tags: ['weapon', 'projectile-speed'], modifiers: [multiply('weaponProjectileSpeed', 1.06, 1.09, 1.12, 1.15)]
  },
  {
    id: 'coolant-jacket', name: 'Coolant Jacket', icon: '❄', iconColor: 0x66eaff,
    category: 'weapon', rarity: 'common', maxRank: 3, dropWeight: 0.95,
    description: 'A microchannel jacket reduces heat produced by each shot.',
    rankDescriptions: { 0: 'Heat per shot -4%.', 1: 'Heat per shot -7%.', 2: 'Heat per shot -10%.', 3: 'Heat per shot -13%.' },
    tags: ['weapon', 'heat'], modifiers: [multiply('weaponHeatPerShot', 0.96, 0.93, 0.9, 0.87)]
  },
  {
    id: 'reinforced-suit', name: 'Reinforced Suit', icon: '⬟', iconColor: 0x78ff9b,
    category: 'player', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'Layered impact mesh increases operative maximum health.',
    rankDescriptions: { 0: 'Maximum health +4%.', 1: 'Maximum health +6%.', 2: 'Maximum health +8%.', 3: 'Maximum health +10%.' },
    tags: ['player', 'health'], modifiers: [multiply('playerMaxHealth', 1.04, 1.06, 1.08, 1.1)]
  },
  {
    id: 'reserve-cell', name: 'Reserve Cell', icon: '▰', iconColor: 0x4cecff,
    category: 'player', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'A supplemental cell expands operative maximum energy.',
    rankDescriptions: { 0: 'Maximum energy +4%.', 1: 'Maximum energy +6%.', 2: 'Maximum energy +8%.', 3: 'Maximum energy +10%.' },
    tags: ['player', 'energy'], modifiers: [multiply('playerEnergyMax', 1.04, 1.06, 1.08, 1.1)]
  },
  {
    id: 'persistence-field', name: 'Persistence Field', icon: '║', iconColor: 0x73ffd8,
    category: 'defense', rarity: 'common', maxRank: 3, dropWeight: 0.95,
    description: 'Stable emitters keep deployed fences active longer.',
    rankDescriptions: { 0: 'Fence duration +6%.', 1: 'Fence duration +10%.', 2: 'Fence duration +14%.', 3: 'Fence duration +18%.' },
    tags: ['fence', 'duration'], modifiers: [multiply('fenceDuration', 1.06, 1.1, 1.14, 1.18)]
  },
  {
    id: 'sentry-optics', name: 'Sentry Optics', icon: '⌖', iconColor: 0xffd96b,
    category: 'defense', rarity: 'common', maxRank: 3, dropWeight: 0.95,
    description: 'Improved optics extend turret acquisition range.',
    rankDescriptions: { 0: 'Turret range +5%.', 1: 'Turret range +8%.', 2: 'Turret range +11%.', 3: 'Turret range +14%.' },
    tags: ['turret', 'range'], modifiers: [multiply('turretRange', 1.05, 1.08, 1.11, 1.14)]
  },
  {
    id: 'blast-lattice', name: 'Blast Lattice', icon: '✣', iconColor: 0xff9854,
    category: 'defense', rarity: 'common', maxRank: 3, dropWeight: 0.95,
    description: 'A shaped-charge lattice broadens every mine blast.',
    rankDescriptions: { 0: 'Mine radius +5%.', 1: 'Mine radius +8%.', 2: 'Mine radius +11%.', 3: 'Mine radius +14%.' },
    tags: ['mine', 'radius'], modifiers: [multiply('mineRadius', 1.05, 1.08, 1.11, 1.14)]
  },
  {
    id: 'med-gel', name: 'Med-Gel', icon: '✚', iconColor: 0x62ff8d,
    category: 'utility', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'Reactive med-gel increases health restored by pickups.',
    rankDescriptions: { 0: 'Health pickup value +6%.', 1: 'Health pickup value +10%.', 2: 'Health pickup value +14%.', 3: 'Health pickup value +18%.' },
    tags: ['pickup', 'health', 'restoration'], modifiers: [multiply('healthPickupValue', 1.06, 1.1, 1.14, 1.18)]
  },

  // Uncommon: stronger economy, mobility, capacity, and sustain choices.
  {
    id: 'critical-lens', name: 'Critical Lens', icon: '◉', iconColor: 0xff70b7,
    category: 'weapon', rarity: 'uncommon', maxRank: 3, dropWeight: 0.85,
    description: 'Target-analysis optics raise weapon critical chance.',
    rankDescriptions: { 0: 'Critical chance +2%.', 1: 'Critical chance +3%.', 2: 'Critical chance +4%.', 3: 'Critical chance +5%.' },
    tags: ['weapon', 'critical'], modifiers: [add('weaponCritChance', 0.02, 0.03, 0.04, 0.05)]
  },
  {
    id: 'ruptured-heat-sink', name: 'Ruptured Heat Sink', icon: '☢', iconColor: 0xff3fbd,
    category: 'weapon', rarity: 'uncommon', maxRank: 3, dropWeight: 0.48, variant: 'corrupted',
    description: 'A ruptured sink vents heat violently, cooling the weapon faster while making every shot run hotter.',
    positiveEffect: 'Weapon cooling is dramatically faster.', negativeEffect: 'Each shot generates additional heat.',
    rankDescriptions: { 0: 'Cooling +35%; shot heat +15%.', 1: 'Cooling +50%; shot heat +18%.', 2: 'Cooling +70%; shot heat +21%.', 3: 'Cooling +95%; shot heat +24%.' },
    tags: ['corrupted', 'weapon', 'heat', 'tradeoff'],
    modifiers: [multiply('weaponCooling', 1.35, 1.5, 1.7, 1.95), multiply('weaponHeatPerShot', 1.15, 1.18, 1.21, 1.24)]
  },
  {
    id: 'regenerative-circuit', name: 'Regenerative Circuit', icon: '⌁', iconColor: 0x5df7ff,
    category: 'player', rarity: 'uncommon', maxRank: 3, dropWeight: 0.85,
    description: 'A regenerative power circuit improves passive energy recovery.',
    rankDescriptions: { 0: 'Energy regeneration +10%.', 1: 'Energy regeneration +15%.', 2: 'Energy regeneration +20%.', 3: 'Energy regeneration +28%.' },
    tags: ['player', 'energy', 'regeneration'], modifiers: [multiply('playerEnergyRegen', 1.1, 1.15, 1.2, 1.28)]
  },
  {
    id: 'dash-relay', name: 'Dash Relay', icon: '↯', iconColor: 0x8deeff,
    category: 'player', rarity: 'uncommon', maxRank: 3, dropWeight: 0.85,
    description: 'A dedicated relay shortens the operative dash recharge.',
    rankDescriptions: { 0: 'Dash cooldown -7%.', 1: 'Dash cooldown -11%.', 2: 'Dash cooldown -15%.', 3: 'Dash cooldown -20%.' },
    tags: ['player', 'dash', 'cooldown'], modifiers: [multiply('playerDashCooldown', 0.93, 0.89, 0.85, 0.8)]
  },
  {
    id: 'vector-thrusters', name: 'Vector Thrusters', icon: '➹', iconColor: 0x79bfff,
    category: 'player', rarity: 'uncommon', maxRank: 3, dropWeight: 0.85,
    description: 'Directional microthrusters extend dash travel distance.',
    rankDescriptions: { 0: 'Dash distance +8%.', 1: 'Dash distance +12%.', 2: 'Dash distance +17%.', 3: 'Dash distance +23%.' },
    tags: ['player', 'dash', 'distance'], modifiers: [multiply('playerDashDistance', 1.08, 1.12, 1.17, 1.23)]
  },
  {
    id: 'spare-pylons', name: 'Spare Pylons', icon: '╫', iconColor: 0x63ffc5,
    category: 'defense', rarity: 'uncommon', maxRank: 3, dropWeight: 0.72,
    description: 'Additional field pylons raise the active fence capacity.',
    rankDescriptions: { 0: '+1 active fence.', 1: '+1 fence and duration +6%.', 2: '+1 fence and duration +12%.', 3: '+2 active fences.' },
    tags: ['fence', 'capacity'], modifiers: [add('fenceMaxActive', 1, 1, 1, 2), multiply('fenceDuration', 1, 1.06, 1.12, 1.12)]
  },
  {
    id: 'auxiliary-mounts', name: 'Auxiliary Mounts', icon: '♟', iconColor: 0xffdb70,
    category: 'defense', rarity: 'uncommon', maxRank: 3, dropWeight: 0.72,
    description: 'Portable mounts increase the number of deployed turrets.',
    rankDescriptions: { 0: '+1 active turret.', 1: '+1 turret and range +5%.', 2: '+1 turret and range +10%.', 3: '+2 active turrets.' },
    tags: ['turret', 'capacity'], modifiers: [add('turretMaxActive', 1, 1, 1, 2), multiply('turretRange', 1, 1.05, 1.1, 1.1)]
  },
  {
    id: 'mine-rack', name: 'Mine Rack', icon: '⁙', iconColor: 0xff9b63,
    category: 'defense', rarity: 'uncommon', maxRank: 3, dropWeight: 0.72,
    description: 'A compact deployment rack increases active mine capacity.',
    rankDescriptions: { 0: '+1 active mine.', 1: '+1 mine and radius +5%.', 2: '+1 mine and radius +10%.', 3: '+2 active mines.' },
    tags: ['mine', 'capacity'], modifiers: [add('mineMaxActive', 1, 1, 1, 2), multiply('mineRadius', 1, 1.05, 1.1, 1.1)]
  },
  {
    id: 'efficient-fabrication', name: 'Efficient Fabrication', icon: '⚙', iconColor: 0xb4ff71,
    category: 'utility', rarity: 'uncommon', maxRank: 3, dropWeight: 0.8,
    description: 'Material-efficient fabrication reduces fence, turret, and mine energy costs.',
    rankDescriptions: { 0: 'Construction energy -5%.', 1: 'Construction energy -8%.', 2: 'Construction energy -12%.', 3: 'Construction energy -16%.' },
    tags: ['ability', 'energy', 'construction'],
    modifiers: [multiply('fenceEnergyCost', 0.95, 0.92, 0.88, 0.84), multiply('turretEnergyCost', 0.95, 0.92, 0.88, 0.84), multiply('mineEnergyCost', 0.95, 0.92, 0.88, 0.84)]
  },
  {
    id: 'longburn-injectors', name: 'Longburn Injectors', icon: '⌛', iconColor: 0xffce64,
    category: 'utility', rarity: 'uncommon', maxRank: 3, dropWeight: 0.82,
    description: 'Timed injectors extend damage, speed, and rapid-fire pickup buffs.',
    rankDescriptions: { 0: 'Buff duration +10%.', 1: 'Buff duration +16%.', 2: 'Buff duration +23%.', 3: 'Buff duration +32%.' },
    tags: ['pickup', 'buff', 'duration'], modifiers: [multiply('buffDuration', 1.1, 1.16, 1.23, 1.32)]
  },

  // Rare: build-defining efficiency, economy, objective, and critical effects.
  {
    id: 'kinetic-reclaimer', name: 'Kinetic Reclaimer', icon: '♻', iconColor: 0x5effd0,
    category: 'weapon', rarity: 'rare', maxRank: 3, dropWeight: 0.65,
    description: 'A kinetic recovery loop reduces energy consumed by weapon fire.',
    rankDescriptions: { 0: 'Shot energy cost -8%.', 1: 'Shot energy cost -13%.', 2: 'Shot energy cost -19%.', 3: 'Shot energy cost -26%.' },
    tags: ['weapon', 'energy', 'efficiency'], modifiers: [multiply('weaponEnergyCost', 0.92, 0.87, 0.81, 0.74)]
  },
  {
    id: 'critical-mass', name: 'Critical Mass', icon: '✦', iconColor: 0xff668f,
    category: 'weapon', rarity: 'rare', maxRank: 3, dropWeight: 0.62,
    description: 'Dense impact packets amplify critical-hit damage.',
    rankDescriptions: { 0: 'Critical damage +10%.', 1: 'Critical damage +16%.', 2: 'Critical damage +23%.', 3: 'Critical damage +32%.' },
    tags: ['weapon', 'critical', 'damage'], modifiers: [multiply('weaponCritDamage', 1.1, 1.16, 1.23, 1.32)]
  },
  {
    id: 'aegis-battery', name: 'Aegis Battery', icon: '◉', iconColor: 0x65eaff,
    category: 'player', rarity: 'rare', maxRank: 3, dropWeight: 0.62,
    description: 'An isolated battery extends operative shield duration.',
    rankDescriptions: { 0: 'Shield duration +10%.', 1: 'Shield duration +17%.', 2: 'Shield duration +25%.', 3: 'Shield duration +35%.' },
    tags: ['player', 'shield', 'duration'], modifiers: [multiply('shieldDuration', 1.1, 1.17, 1.25, 1.35)]
  },
  {
    id: 'rapid-deployment', name: 'Rapid Deployment', icon: '⇊', iconColor: 0x88ffb6,
    category: 'defense', rarity: 'rare', maxRank: 3, dropWeight: 0.6,
    description: 'Streamlined deployment reduces fence, turret, and mine cooldowns.',
    rankDescriptions: { 0: 'Defense cooldowns -6%.', 1: 'Defense cooldowns -10%.', 2: 'Defense cooldowns -15%.', 3: 'Defense cooldowns -21%.' },
    tags: ['defense', 'cooldown'],
    modifiers: [multiply('fenceCooldown', 0.94, 0.9, 0.85, 0.79), multiply('turretCooldown', 0.94, 0.9, 0.85, 0.79), multiply('mineCooldown', 0.94, 0.9, 0.85, 0.79)]
  },
  {
    id: 'field-medic', name: 'Field Medic', icon: '✚', iconColor: 0x73ff98,
    category: 'utility', rarity: 'rare', maxRank: 3, dropWeight: 0.64,
    description: 'Field triage firmware improves both health capacity and pickup restoration.',
    rankDescriptions: { 0: 'Health +5%; healing +15%.', 1: 'Health +7%; healing +22%.', 2: 'Health +10%; healing +30%.', 3: 'Health +14%; healing +40%.' },
    tags: ['health', 'pickup', 'survival'], modifiers: [multiply('playerMaxHealth', 1.05, 1.07, 1.1, 1.14), multiply('healthPickupValue', 1.15, 1.22, 1.3, 1.4)]
  },
  {
    id: 'capacitor-recovery', name: 'Capacitor Recovery', icon: 'ϟ', iconColor: 0x63f7ff,
    category: 'utility', rarity: 'rare', maxRank: 3, dropWeight: 0.64,
    description: 'Recovery capacitors increase energy restored by pickups.',
    rankDescriptions: { 0: 'Energy pickup value +15%.', 1: 'Energy pickup value +23%.', 2: 'Energy pickup value +32%.', 3: 'Energy pickup value +45%.' },
    tags: ['energy', 'pickup', 'restoration'], modifiers: [multiply('energyPickupValue', 1.15, 1.23, 1.32, 1.45)]
  },
  {
    id: 'profit-protocol', name: 'Profit Protocol', icon: '¢', iconColor: 0xffe76b,
    category: 'utility', rarity: 'rare', maxRank: 3, dropWeight: 0.58,
    description: 'Combat accounting firmware increases all credits collected during a run.',
    rankDescriptions: { 0: 'Credit value +8%.', 1: 'Credit value +13%.', 2: 'Credit value +19%.', 3: 'Credit value +27%.' },
    tags: ['economy', 'credits'], modifiers: [multiply('creditValue', 1.08, 1.13, 1.19, 1.27)]
  },
  {
    id: 'salvage-algorithm', name: 'Salvage Algorithm', icon: '◇', iconColor: 0xb987ff,
    category: 'utility', rarity: 'rare', maxRank: 3, dropWeight: 0.55,
    description: 'A predictive salvage algorithm increases enemy pickup frequency.',
    rankDescriptions: { 0: 'Enemy pickup chance +10%.', 1: 'Enemy pickup chance +17%.', 2: 'Enemy pickup chance +25%.', 3: 'Enemy pickup chance +35%.' },
    tags: ['pickup', 'drop-chance'], modifiers: [multiply('enemyPickupChance', 1.1, 1.17, 1.25, 1.35)]
  },
  {
    id: 'bomb-chronometer', name: 'Bomb Chronometer', icon: '◴', iconColor: 0xff8bdc,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.56,
    description: 'Precision charge timing shortens the dangerous defense window before detonation.',
    rankDescriptions: { 0: 'Bomb detonation time -5%.', 1: 'Bomb detonation time -8%.', 2: 'Bomb detonation time -12%.', 3: 'Bomb detonation time -17%.' },
    tags: ['bomb-site', 'faster-detonation'], modifiers: [multiply('bombDuration', 0.95, 0.92, 0.88, 0.83)]
  },
  {
    id: 'glass-cannon', name: 'Glass Cannon', icon: '◆', iconColor: 0xff36ca,
    category: 'weapon', rarity: 'rare', maxRank: 3, dropWeight: 0.38, variant: 'corrupted',
    description: 'Forbidden focusing hardware grants exceptional weapon damage by stripping protective plating.',
    positiveEffect: 'Weapon damage is greatly increased.', negativeEffect: 'Operative maximum health is reduced.',
    rankDescriptions: { 0: 'Damage +22%; health -12%.', 1: 'Damage +30%; health -15%.', 2: 'Damage +40%; health -18%.', 3: 'Damage +52%; health -22%.' },
    tags: ['corrupted', 'weapon', 'health', 'tradeoff'],
    modifiers: [multiply('weaponDamage', 1.22, 1.3, 1.4, 1.52), multiply('playerMaxHealth', 0.88, 0.85, 0.82, 0.78)]
  },

  // Epic: multi-stat archetype cards and dangerous corrupted power.
  {
    id: 'singularity-rounds', name: 'Singularity Rounds', icon: '●', iconColor: 0xc46cff,
    category: 'weapon', rarity: 'epic', maxRank: 3, dropWeight: 0.4,
    description: 'Micro-singularity ammunition hits harder and reaches targets faster.',
    rankDescriptions: { 0: 'Damage +10%; velocity +12%.', 1: 'Damage +15%; velocity +18%.', 2: 'Damage +21%; velocity +25%.', 3: 'Damage +29%; velocity +34%.' },
    tags: ['weapon', 'damage', 'projectile-speed'], modifiers: [multiply('weaponDamage', 1.1, 1.15, 1.21, 1.29), multiply('weaponProjectileSpeed', 1.12, 1.18, 1.25, 1.34)]
  },
  {
    id: 'quantum-trigger', name: 'Quantum Trigger', icon: '⟲', iconColor: 0x78dfff,
    category: 'weapon', rarity: 'epic', maxRank: 3, dropWeight: 0.38,
    description: 'Entangled trigger logic increases cadence while reclaiming firing energy.',
    rankDescriptions: { 0: 'Fire rate +10%; shot energy -8%.', 1: 'Fire rate +15%; energy -12%.', 2: 'Fire rate +21%; energy -17%.', 3: 'Fire rate +29%; energy -23%.' },
    tags: ['weapon', 'fire-rate', 'energy'], modifiers: [multiply('weaponFireRate', 1.1, 1.15, 1.21, 1.29), multiply('weaponEnergyCost', 0.92, 0.88, 0.83, 0.77)]
  },
  {
    id: 'phase-armor', name: 'Phase Armor', icon: '⬢', iconColor: 0x70f4ff,
    category: 'player', rarity: 'epic', maxRank: 3, dropWeight: 0.4,
    description: 'Phase-shifted armor increases health and extends post-hit protection.',
    rankDescriptions: { 0: 'Health +10%; invulnerability +10%.', 1: 'Health +15%; invulnerability +17%.', 2: 'Health +21%; invulnerability +25%.', 3: 'Health +29%; invulnerability +35%.' },
    tags: ['player', 'health', 'invulnerability'], modifiers: [multiply('playerMaxHealth', 1.1, 1.15, 1.21, 1.29), multiply('playerInvulnerability', 1.1, 1.17, 1.25, 1.35)]
  },
  {
    id: 'arc-fortress', name: 'Arc Fortress', icon: '▥', iconColor: 0x66ffc3,
    category: 'defense', rarity: 'epic', maxRank: 3, dropWeight: 0.38,
    description: 'Fortress-grade emitters improve fence damage, durability, and duration.',
    rankDescriptions: { 0: 'Fence output +10% across systems.', 1: '+15% across systems.', 2: '+21% across systems.', 3: '+29% across systems.' },
    tags: ['fence', 'damage', 'health', 'duration'],
    modifiers: [multiply('fenceDamage', 1.1, 1.15, 1.21, 1.29), multiply('fenceHealth', 1.1, 1.15, 1.21, 1.29), multiply('fenceDuration', 1.1, 1.15, 1.21, 1.29)]
  },
  {
    id: 'siege-firmware', name: 'Siege Firmware', icon: '♜', iconColor: 0xffca67,
    category: 'defense', rarity: 'epic', maxRank: 3, dropWeight: 0.38,
    description: 'Siege firmware improves turret damage, fire rate, and range.',
    rankDescriptions: { 0: 'Turret offense +9% across systems.', 1: '+14% across systems.', 2: '+20% across systems.', 3: '+27% across systems.' },
    tags: ['turret', 'damage', 'fire-rate', 'range'],
    modifiers: [multiply('turretDamage', 1.09, 1.14, 1.2, 1.27), multiply('turretFireRate', 1.09, 1.14, 1.2, 1.27), multiply('turretRange', 1.09, 1.14, 1.2, 1.27)]
  },
  {
    id: 'cataclysm-mines', name: 'Cataclysm Mines', icon: '✺', iconColor: 0xff795d,
    category: 'defense', rarity: 'epic', maxRank: 3, dropWeight: 0.38,
    description: 'Cataclysm charges increase mine damage and radius while arming faster.',
    rankDescriptions: { 0: 'Damage/radius +10%; arm -8%.', 1: '+16%; arm -12%.', 2: '+23%; arm -17%.', 3: '+32%; arm -23%.' },
    tags: ['mine', 'damage', 'radius', 'arming-time'],
    modifiers: [multiply('mineDamage', 1.1, 1.16, 1.23, 1.32), multiply('mineRadius', 1.1, 1.16, 1.23, 1.32), multiply('mineArmTime', 0.92, 0.88, 0.83, 0.77)]
  },
  {
    id: 'infinite-reserve', name: 'Infinite Reserve', icon: '∞', iconColor: 0x6cefff,
    category: 'player', rarity: 'epic', maxRank: 3, dropWeight: 0.36,
    description: 'Recursive cells expand maximum energy and accelerate regeneration.',
    rankDescriptions: { 0: 'Energy +12%; regen +15%.', 1: 'Energy +18%; regen +22%.', 2: 'Energy +25%; regen +31%.', 3: 'Energy +34%; regen +42%.' },
    tags: ['player', 'energy', 'regeneration'], modifiers: [multiply('playerEnergyMax', 1.12, 1.18, 1.25, 1.34), multiply('playerEnergyRegen', 1.15, 1.22, 1.31, 1.42)]
  },
  {
    id: 'chrono-operative', name: 'Chrono Operative', icon: '◷', iconColor: 0x9e87ff,
    category: 'player', rarity: 'epic', maxRank: 3, dropWeight: 0.36,
    description: 'Localized time dilation improves movement and every aspect of the dash.',
    rankDescriptions: { 0: 'Speed/dash distance +7%; dash cooldown -7%.', 1: '+11%; cooldown -11%.', 2: '+16%; cooldown -16%.', 3: '+23%; cooldown -23%.' },
    tags: ['player', 'movement', 'dash'],
    modifiers: [multiply('playerMoveSpeed', 1.07, 1.11, 1.16, 1.23), multiply('playerDashDistance', 1.07, 1.11, 1.16, 1.23), multiply('playerDashCooldown', 0.93, 0.89, 0.84, 0.77)]
  },
  {
    id: 'command-uplink', name: 'Command Uplink', icon: '⌘', iconColor: 0xff78db,
    category: 'utility', rarity: 'epic', maxRank: 3, dropWeight: 0.35,
    description: 'A command uplink accelerates every deployable and shield recharge.',
    rankDescriptions: { 0: 'All ability cooldowns -8%.', 1: 'All ability cooldowns -13%.', 2: 'All ability cooldowns -19%.', 3: 'All ability cooldowns -27%.' },
    tags: ['ability', 'cooldown', 'shield'],
    modifiers: [multiply('fenceCooldown', 0.92, 0.87, 0.81, 0.73), multiply('turretCooldown', 0.92, 0.87, 0.81, 0.73), multiply('mineCooldown', 0.92, 0.87, 0.81, 0.73), multiply('shieldCooldown', 0.92, 0.87, 0.81, 0.73)]
  },
  {
    id: 'volatile-reactor', name: 'Volatile Reactor', icon: '☣', iconColor: 0xff32c8,
    category: 'player', rarity: 'epic', maxRank: 3, dropWeight: 0.22, variant: 'corrupted',
    description: 'An unstable reactor floods the suit with energy but causes weapon systems to consume more per shot.',
    positiveEffect: 'Maximum energy and regeneration are massively increased.', negativeEffect: 'Weapon shots consume substantially more energy.',
    rankDescriptions: { 0: 'Energy/regen +30%; shot cost +18%.', 1: '+42%; shot cost +22%.', 2: '+58%; shot cost +27%.', 3: '+80%; shot cost +33%.' },
    tags: ['corrupted', 'player', 'energy', 'tradeoff'],
    modifiers: [multiply('playerEnergyMax', 1.3, 1.42, 1.58, 1.8), multiply('playerEnergyRegen', 1.3, 1.42, 1.58, 1.8), multiply('weaponEnergyCost', 1.18, 1.22, 1.27, 1.33)]
  },

  // Legendary: transformative capstone cards, including the strongest tradeoff.
  {
    id: 'promethean-core', name: 'Promethean Core', icon: '✹', iconColor: 0xff9b36,
    category: 'weapon', rarity: 'legendary', maxRank: 3, dropWeight: 0.055,
    description: 'A Promethean firing core improves damage, cadence, critical force, and cooling.',
    rankDescriptions: { 0: 'Weapon systems +10%.', 1: 'Weapon systems +15%.', 2: 'Weapon systems +22%.', 3: 'Weapon systems +31%.' },
    tags: ['weapon', 'damage', 'fire-rate', 'critical'],
    modifiers: [multiply('weaponDamage', 1.1, 1.15, 1.22, 1.31), multiply('weaponFireRate', 1.1, 1.15, 1.22, 1.31), multiply('weaponCritDamage', 1.1, 1.15, 1.22, 1.31), multiply('weaponCooling', 1.1, 1.15, 1.22, 1.31)]
  },
  {
    id: 'immortal-nanites', name: 'Immortal Nanites', icon: '✚', iconColor: 0xffa43d,
    category: 'player', rarity: 'legendary', maxRank: 3, dropWeight: 0.052,
    description: 'Guardian nanites dramatically improve health capacity and all pickup healing.',
    rankDescriptions: { 0: 'Health +15%; healing +25%.', 1: 'Health +22%; healing +38%.', 2: 'Health +31%; healing +55%.', 3: 'Health +43%; healing +75%.' },
    tags: ['player', 'health', 'healing'], modifiers: [multiply('playerMaxHealth', 1.15, 1.22, 1.31, 1.43), multiply('healthPickupValue', 1.25, 1.38, 1.55, 1.75)]
  },
  {
    id: 'zero-point-battery', name: 'Zero-Point Battery', icon: '∞', iconColor: 0xffb23f,
    category: 'player', rarity: 'legendary', maxRank: 3, dropWeight: 0.05,
    description: 'A vacuum-energy cell expands reserves, regeneration, and pickup recovery while reducing shot cost.',
    rankDescriptions: { 0: 'Energy systems +15%; shot cost -8%.', 1: '+22%; cost -13%.', 2: '+31%; cost -19%.', 3: '+43%; cost -27%.' },
    tags: ['player', 'energy', 'weapon'],
    modifiers: [multiply('playerEnergyMax', 1.15, 1.22, 1.31, 1.43), multiply('playerEnergyRegen', 1.15, 1.22, 1.31, 1.43), multiply('energyPickupValue', 1.15, 1.22, 1.31, 1.43), multiply('weaponEnergyCost', 0.92, 0.87, 0.81, 0.73)]
  },
  {
    id: 'architect-prime', name: 'Architect Prime', icon: '⌂', iconColor: 0xff963d,
    category: 'defense', rarity: 'legendary', maxRank: 3, dropWeight: 0.05,
    description: 'Prime construction routines enhance the damage and durability of every defense.',
    rankDescriptions: { 0: 'All defense damage/health +12%.', 1: '+18%.', 2: '+26%.', 3: '+36%.' },
    tags: ['defense', 'fence', 'turret', 'mine'],
    modifiers: [multiply('fenceDamage', 1.12, 1.18, 1.26, 1.36), multiply('fenceHealth', 1.12, 1.18, 1.26, 1.36), multiply('turretDamage', 1.12, 1.18, 1.26, 1.36), multiply('turretHealth', 1.12, 1.18, 1.26, 1.36), multiply('mineDamage', 1.12, 1.18, 1.26, 1.36)]
  },
  {
    id: 'sentry-dominion', name: 'Sentry Dominion', icon: '♛', iconColor: 0xffbd46,
    category: 'defense', rarity: 'legendary', maxRank: 3, dropWeight: 0.048,
    description: 'Dominion firmware links turret weapons to compatible temporary offensive effects active on the Operative.',
    rankDescriptions: {
      0: 'Turret output +15%; +1 turret; Weapon Sync.',
      1: 'Output +22%; +1 turret; Weapon Sync.',
      2: 'Output +31%; +1 turret; Weapon Sync.',
      3: 'Output +43%; +2 turrets; Weapon Sync.'
    },
    tags: ['turret', 'damage', 'fire-rate', 'capacity', 'weapon-sync', 'temporary-offense'],
    modifiers: [multiply('turretDamage', 1.15, 1.22, 1.31, 1.43), multiply('turretFireRate', 1.15, 1.22, 1.31, 1.43), add('turretMaxActive', 1, 1, 1, 2)]
  },
  {
    id: 'event-horizon-mines', name: 'Event Horizon Mines', icon: '◉', iconColor: 0xff7448,
    category: 'defense', rarity: 'legendary', maxRank: 3, dropWeight: 0.048,
    description: 'Event-horizon charges arm rapidly and produce immense, wide-area detonations.',
    rankDescriptions: { 0: 'Damage/radius +18%; arm -12%.', 1: '+27%; arm -18%.', 2: '+38%; arm -26%.', 3: '+52%; arm -36%.' },
    tags: ['mine', 'damage', 'radius', 'arming-time'],
    modifiers: [multiply('mineDamage', 1.18, 1.27, 1.38, 1.52), multiply('mineRadius', 1.18, 1.27, 1.38, 1.52), multiply('mineArmTime', 0.88, 0.82, 0.74, 0.64)]
  },
  {
    id: 'eternal-rampart', name: 'Eternal Rampart', icon: '▤', iconColor: 0xffa840,
    category: 'defense', rarity: 'legendary', maxRank: 3, dropWeight: 0.048,
    description: 'Self-sustaining rampart emitters make fences stronger, deadlier, and longer-lived.',
    rankDescriptions: { 0: 'Fence systems +18%.', 1: 'Fence systems +27%.', 2: 'Fence systems +38%.', 3: 'Fence systems +52%.' },
    tags: ['fence', 'damage', 'health', 'duration'],
    modifiers: [multiply('fenceDamage', 1.18, 1.27, 1.38, 1.52), multiply('fenceHealth', 1.18, 1.27, 1.38, 1.52), multiply('fenceDuration', 1.18, 1.27, 1.38, 1.52)]
  },
  {
    id: 'golden-protocol', name: 'Golden Protocol', icon: '¤', iconColor: 0xffd34e,
    category: 'utility', rarity: 'legendary', maxRank: 3, dropWeight: 0.042,
    description: 'An illicit prosperity protocol increases both credit yield and enemy salvage drops.',
    rankDescriptions: { 0: 'Credits +15%; pickup chance +12%.', 1: 'Credits +23%; chance +19%.', 2: 'Credits +33%; chance +28%.', 3: 'Credits +46%; chance +40%.' },
    tags: ['economy', 'credits', 'pickup'], modifiers: [multiply('creditValue', 1.15, 1.23, 1.33, 1.46), multiply('enemyPickupChance', 1.12, 1.19, 1.28, 1.4)]
  },
  {
    id: 'temporal-sovereign', name: 'Temporal Sovereign', icon: '⌛', iconColor: 0xff9045,
    category: 'player', rarity: 'legendary', maxRank: 3, dropWeight: 0.045,
    description: 'Sovereign time control elevates movement, dash performance, and damage immunity windows.',
    rankDescriptions: { 0: 'Speed/dash +12%; cooldown -12%.', 1: '+18%; cooldown -18%.', 2: '+26%; cooldown -26%.', 3: '+36%; cooldown -36%.' },
    tags: ['player', 'movement', 'dash', 'invulnerability'],
    modifiers: [multiply('playerMoveSpeed', 1.12, 1.18, 1.26, 1.36), multiply('playerDashDistance', 1.12, 1.18, 1.26, 1.36), multiply('playerDashCooldown', 0.88, 0.82, 0.74, 0.64), multiply('playerInvulnerability', 1.12, 1.18, 1.26, 1.36)]
  },
  {
    id: 'black-star-engine', name: 'Black Star Engine', icon: '✷', iconColor: 0xff24bd,
    category: 'weapon', rarity: 'legendary', maxRank: 3, dropWeight: 0.025, variant: 'corrupted',
    description: 'A captive black star grants impossible weapon output while consuming the operative from within.',
    positiveEffect: 'Weapon damage, fire rate, and critical force are massively increased.', negativeEffect: 'Maximum health falls and each shot creates more heat.',
    rankDescriptions: { 0: 'Weapon output +35%; health -18%; heat +20%.', 1: '+48%; health -22%; heat +25%.', 2: '+65%; health -27%; heat +31%.', 3: '+90%; health -33%; heat +40%.' },
    tags: ['corrupted', 'weapon', 'health', 'heat', 'tradeoff'],
    modifiers: [multiply('weaponDamage', 1.35, 1.48, 1.65, 1.9), multiply('weaponFireRate', 1.35, 1.48, 1.65, 1.9), multiply('weaponCritDamage', 1.35, 1.48, 1.65, 1.9), multiply('playerMaxHealth', 0.82, 0.78, 0.73, 0.67), multiply('weaponHeatPerShot', 1.2, 1.25, 1.31, 1.4)]
  }
] as const;
