import type { ModDefinition, ModRank, ModStat, ModStatModifier, SupremeEffectDescriptor } from './types.ts';

const ranks = (a: number, b: number, c: number, d: number): Record<ModRank, number> => ({ 0: a, 1: b, 2: c, 3: d });
const multiply = (stat: ModStat, values: Record<ModRank, number>): ModStatModifier => ({ stat, mode: 'multiply', values });
const effects = (
  first: SupremeEffectDescriptor,
  second: SupremeEffectDescriptor,
  third: SupremeEffectDescriptor
): readonly [SupremeEffectDescriptor, SupremeEffectDescriptor, SupremeEffectDescriptor] => [first, second, third];

/** Stable ownership IDs, rebuilt as cross-system endgame cards. */
export const SUPREME_MOD_DEFINITIONS: readonly ModDefinition[] = [
  {
    id: 'supreme-eventide-arsenal', name: 'Eventide Arsenal', icon: '\u2726', iconColor: 0xf2ffff, category: 'weapon', rarity: 'supreme', maxRank: 3, dropWeight: 1,
    description: 'A dusk-star weapons lattice links destructive fire, accelerated charge detonation, and rapid shield recovery.',
    rankDescriptions: { 0: 'Weapon damage +70%; detonation time -25%; shield cooldown -22%.', 1: 'Damage +90%; detonation -32%; shield cooldown -28%.', 2: 'Damage +115%; detonation -40%; shield cooldown -34%.', 3: 'Damage +145%; detonation -50%; shield cooldown -40%.' },
    tags: ['supreme', 'weapon', 'bombsite', 'shield'],
    supremeEffects: effects(
      { family: 'weapon', label: 'EVENTIDE FIRE // +70-145% weapon damage' },
      { family: 'bombsite', label: 'DUSK IGNITION // 25-50% faster detonation' },
      { family: 'shield', label: 'ECLIPSE CYCLE // shield cooldown -22-40%' }
    ),
    modifiers: [multiply('weaponDamage', ranks(1.7, 1.9, 2.15, 2.45)), multiply('bombDuration', ranks(.75, .68, .6, .5)), multiply('shieldCooldown', ranks(.78, .72, .66, .6))]
  },
  {
    id: 'supreme-singularity-chamber', name: 'Singularity Chamber', icon: '\u2299', iconColor: 0xbdfcff, category: 'weapon', rarity: 'supreme', maxRank: 3, dropWeight: .92,
    description: 'Critical impacts feed long-lived combat pickups while a gravity field suppresses nearby enemies.',
    rankDescriptions: { 0: 'Crit damage +80%; timed pickups +45%; nearby enemies slowed 14%.', 1: 'Crit damage +110%; pickups +60%; slow 18%.', 2: 'Crit damage +145%; pickups +78%; slow 22%.', 3: 'Crit damage +185%; pickups +100%; slow 26%.' },
    tags: ['supreme', 'weapon', 'pickup', 'enemy-control'],
    supremeEffects: effects(
      { family: 'weapon', label: 'COLLAPSE IMPACT // +80-185% critical damage' },
      { family: 'pickup', label: 'TIME DILATION // +45-100% timed pickup duration' },
      { family: 'enemy-control', label: 'SUPPRESSION FIELD // 230-300 radius; bosses unaffected' }
    ),
    modifiers: [multiply('weaponCritDamage', ranks(1.8, 2.1, 2.45, 2.85)), multiply('buffDuration', ranks(1.45, 1.6, 1.78, 2))]
  },
  {
    id: 'supreme-quantum-carapace', name: 'Quantum Carapace', icon: '\u2b21', iconColor: 0xe7faff, category: 'player', rarity: 'supreme', maxRank: 3, dropWeight: .95,
    description: 'Phase armor expands operative integrity, amplifies healing, and filters arena hazards.',
    rankDescriptions: { 0: 'Health +70%; healing +55%; gas damage -50%.', 1: 'Health +90%; healing +70%; gas damage -60%.', 2: 'Health +115%; healing +90%; gas damage -70%.', 3: 'Health +145%; healing +115%; gas damage -80%.' },
    tags: ['supreme', 'survivability', 'pickup', 'hazard'],
    supremeEffects: effects(
      { family: 'survivability', label: 'QUANTUM PLATING // +70-145% maximum health' },
      { family: 'pickup', label: 'RECONSTRUCTION // +55-115% health restoration' },
      { family: 'defense', label: 'HAZARD FILTER // gas damage reduced 50-80%' }
    ),
    modifiers: [multiply('playerMaxHealth', ranks(1.7, 1.9, 2.15, 2.45)), multiply('healthPickupValue', ranks(1.55, 1.7, 1.9, 2.15)), multiply('gasDamageTaken', ranks(.5, .4, .3, .2))]
  },
  {
    id: 'supreme-zero-point-drive', name: 'Zero Point Drive', icon: '\u221e', iconColor: 0xd9fbff, category: 'player', rarity: 'supreme', maxRank: 3, dropWeight: .88,
    description: 'A causality-breaking drive links operative velocity, energy regeneration, and weapon force.',
    rankDescriptions: { 0: 'Move +40%; energy regen +65%; weapon damage +35%.', 1: 'Move +52%; regen +85%; damage +45%.', 2: 'Move +65%; regen +110%; damage +58%.', 3: 'Move +80%; regen +140%; damage +72%.' },
    tags: ['supreme', 'mobility', 'energy', 'weapon'],
    supremeEffects: effects(
      { family: 'mobility', label: 'ZERO-POINT MOTION // +40-80% movement speed' },
      { family: 'energy', label: 'VACUUM TAP // +65-140% energy regeneration' },
      { family: 'weapon', label: 'KINETIC CONVERSION // +35-72% weapon damage' }
    ),
    modifiers: [multiply('playerMoveSpeed', ranks(1.4, 1.52, 1.65, 1.8)), multiply('playerEnergyRegen', ranks(1.65, 1.85, 2.1, 2.4)), multiply('weaponDamage', ranks(1.35, 1.45, 1.58, 1.72))]
  },
  {
    id: 'supreme-triune-bastion', name: 'Triune Bastion', icon: '\u25ec', iconColor: 0xc9ffff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: 1,
    description: 'One defense intelligence binds lethal fences, accelerated bomb detonation, and persistent personal shielding.',
    rankDescriptions: { 0: 'Fence damage +75%; detonation time -30%; shield duration +40%.', 1: 'Fence +100%; detonation -38%; shield +52%.', 2: 'Fence +130%; detonation -48%; shield +66%.', 3: 'Fence +165%; detonation -60%; shield +82%.' },
    tags: ['supreme', 'defense', 'bombsite', 'shield'],
    supremeEffects: effects(
      { family: 'defense', label: 'BASTION GRID // +75-165% fence damage' },
      { family: 'bombsite', label: 'TRIUNE IGNITION // 30-60% faster detonation' },
      { family: 'shield', label: 'THIRD AEGIS // +40-82% shield duration' }
    ),
    modifiers: [multiply('fenceDamage', ranks(1.75, 2, 2.3, 2.65)), multiply('bombDuration', ranks(.7, .62, .52, .4)), multiply('shieldDuration', ranks(1.4, 1.52, 1.66, 1.82))]
  },
  {
    id: 'supreme-immortal-emplacements', name: 'Immortal Emplacements', icon: '\u26ca', iconColor: 0xafffff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: .9,
    description: 'Self-repairing hardlight reinforces defenses, the operative, and every healing acquisition.',
    rankDescriptions: { 0: 'Fence health +90%; operative health +45%; healing +45%.', 1: 'Fence +120%; health +58%; healing +60%.', 2: 'Fence +155%; health +72%; healing +78%.', 3: 'Fence +195%; health +90%; healing +100%.' },
    tags: ['supreme', 'defense', 'survivability', 'pickup'],
    supremeEffects: effects(
      { family: 'defense', label: 'IMMORTAL GRID // +90-195% fence health' },
      { family: 'survivability', label: 'HARDLIGHT GRAFT // +45-90% maximum health' },
      { family: 'pickup', label: 'REPAIR PROTOCOL // +45-100% healing pickups' }
    ),
    modifiers: [multiply('fenceHealth', ranks(1.9, 2.2, 2.55, 2.95)), multiply('playerMaxHealth', ranks(1.45, 1.58, 1.72, 1.9)), multiply('healthPickupValue', ranks(1.45, 1.6, 1.78, 2))]
  },
  {
    id: 'supreme-infinite-ordnance', name: 'Infinite Ordnance', icon: '\u2739', iconColor: 0xfff4ff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: .82,
    description: 'Impossible ordnance amplifies mine blasts, energy acquisitions, and the lifetime of combat pickups.',
    rankDescriptions: { 0: 'Mine damage +90%; energy pickups +60%; timed pickups +40%.', 1: 'Mine +120%; energy +80%; pickups +52%.', 2: 'Mine +155%; energy +105%; pickups +68%.', 3: 'Mine +200%; energy +135%; pickups +88%.' },
    tags: ['supreme', 'mine', 'energy', 'pickup'],
    supremeEffects: effects(
      { family: 'mine', label: 'INFINITE PAYLOAD // +90-200% mine damage' },
      { family: 'energy', label: 'ORDNANCE RECLAIM // +60-135% energy pickups' },
      { family: 'pickup', label: 'FOLDED TIME // +40-88% timed pickup duration' }
    ),
    modifiers: [multiply('mineDamage', ranks(1.9, 2.2, 2.55, 3)), multiply('energyPickupValue', ranks(1.6, 1.8, 2.05, 2.35)), multiply('buffDuration', ranks(1.4, 1.52, 1.68, 1.88))]
  },
  {
    id: 'supreme-omniscient-sentry', name: 'Omniscient Sentry', icon: '\u265c', iconColor: 0xe2ffff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: .8,
    description: 'Predictive sentry cognition links turret force, acquisition reach, and shield readiness.',
    rankDescriptions: { 0: 'Turret damage +80%; pickup radius +85%; shield cooldown -20%.', 1: 'Turret +105%; radius +110%; cooldown -27%.', 2: 'Turret +135%; radius +140%; cooldown -34%.', 3: 'Turret +175%; radius +175%; cooldown -42%.' },
    tags: ['supreme', 'turret', 'pickup', 'shield'],
    supremeEffects: effects(
      { family: 'turret', label: 'OMNISCIENT FIRE // +80-175% turret damage' },
      { family: 'pickup', label: 'TOTAL AWARENESS // +85-175% pickup radius' },
      { family: 'shield', label: 'PREDICTIVE AEGIS // shield cooldown -20-42%' }
    ),
    modifiers: [multiply('turretDamage', ranks(1.8, 2.05, 2.35, 2.75)), multiply('playerPickupRadius', ranks(1.85, 2.1, 2.4, 2.75)), multiply('shieldCooldown', ranks(.8, .73, .66, .58))]
  },
  {
    id: 'supreme-final-protocol', name: 'Final Protocol', icon: '\u25c7', iconColor: 0xffd9f6, category: 'bombSite', rarity: 'supreme', maxRank: 3, dropWeight: .76,
    description: 'Armed sites become terminal weapons, pulsing neon force while fences kill and the operative regenerates energy.',
    rankDescriptions: { 0: 'Fence damage +55%; energy regen +45%; armed-site pulse every 7.0s.', 1: 'Fence +72%; regen +60%; pulse every 6.4s.', 2: 'Fence +92%; regen +78%; pulse every 5.8s.', 3: 'Fence +118%; regen +100%; pulse every 5.2s.' },
    tags: ['supreme', 'bombsite', 'defense', 'energy', 'pulse'],
    supremeEffects: effects(
      { family: 'bombsite', label: 'FINAL PULSE // repeating damaging knockback wave' },
      { family: 'defense', label: 'TERMINAL FENCE // +55-118% fence damage' },
      { family: 'energy', label: 'LAST RESERVE // +45-100% energy regeneration' }
    ),
    modifiers: [multiply('fenceDamage', ranks(1.55, 1.72, 1.92, 2.18)), multiply('playerEnergyRegen', ranks(1.45, 1.6, 1.78, 2))]
  },
  {
    id: 'supreme-crown-of-stars', name: 'Crown of Stars', icon: '\u2606', iconColor: 0xf7ffff, category: 'utility', rarity: 'supreme', maxRank: 3, dropWeight: .72,
    description: 'Every combat pickup crowns the operative with a brief damage surge while pickups last longer and dashes recover faster.',
    rankDescriptions: { 0: 'Timed pickups +55%; dash cooldown -28%; pickup grants +18% damage for 5s.', 1: 'Pickups +72%; dash -35%; surge +22% for 5.5s.', 2: 'Pickups +92%; dash -42%; surge +27% for 6s.', 3: 'Pickups +120%; dash -50%; surge +33% for 6.5s.' },
    tags: ['supreme', 'pickup', 'mobility', 'weapon', 'trigger'],
    supremeEffects: effects(
      { family: 'pickup', label: 'STELLAR TIME // +55-120% timed pickup duration' },
      { family: 'mobility', label: 'CROWN STEP // dash cooldown -28-50%' },
      { family: 'weapon', label: 'ACQUISITION SURGE // combat pickup grants damage' }
    ),
    modifiers: [multiply('buffDuration', ranks(1.55, 1.72, 1.92, 2.2)), multiply('playerDashCooldown', ranks(.72, .65, .58, .5))]
  }
] as const;
