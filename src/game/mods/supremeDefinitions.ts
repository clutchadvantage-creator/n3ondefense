import type { ModDefinition, ModRank, ModStat, ModStatModifier } from './types.ts';

const ranks = (a: number, b: number, c: number, d: number): Record<ModRank, number> => ({ 0: a, 1: b, 2: c, 3: d });
const multiply = (stat: ModStat, values: Record<ModRank, number>): ModStatModifier => ({ stat, mode: 'multiply', values });
const add = (stat: ModStat, values: Record<ModRank, number>): ModStatModifier => ({ stat, mode: 'add', values });

/**
 * Supreme cards intentionally touch three major dimensions. Values are broad
 * enough to define endgame builds, while ModRuntime applies engine-stability
 * caps after all equipped modifiers are composed.
 */
export const SUPREME_MOD_DEFINITIONS: readonly ModDefinition[] = [
  {
    id: 'supreme-eventide-arsenal', name: 'Eventide Arsenal', icon: '✦', iconColor: 0xf2ffff, category: 'weapon', rarity: 'supreme', maxRank: 3, dropWeight: 1,
    description: 'A stellar weapons lattice overclocks damage, cadence, and projectile velocity.',
    rankDescriptions: { 0: 'Damage +65%, fire rate +40%, velocity +30%.', 1: 'Damage +85%, fire rate +55%, velocity +42%.', 2: 'Damage +110%, fire rate +72%, velocity +55%.', 3: 'Damage +140%, fire rate +90%, velocity +70%.' },
    tags: ['supreme', 'weapon', 'damage', 'fire-rate', 'projectile-speed'],
    modifiers: [multiply('weaponDamage', ranks(1.65, 1.85, 2.1, 2.4)), multiply('weaponFireRate', ranks(1.4, 1.55, 1.72, 1.9)), multiply('weaponProjectileSpeed', ranks(1.3, 1.42, 1.55, 1.7))]
  },
  {
    id: 'supreme-singularity-chamber', name: 'Singularity Chamber', icon: '⊙', iconColor: 0xbdfcff, category: 'weapon', rarity: 'supreme', maxRank: 3, dropWeight: .92,
    description: 'Collapses critical probability, critical force, and heat efficiency into one impossible chamber.',
    rankDescriptions: { 0: 'Crit +12%, crit damage +75%, heat -30%.', 1: 'Crit +16%, crit damage +100%, heat -38%.', 2: 'Crit +21%, crit damage +135%, heat -46%.', 3: 'Crit +27%, crit damage +175%, heat -55%.' },
    tags: ['supreme', 'weapon', 'critical', 'heat'],
    modifiers: [add('weaponCritChance', ranks(.12, .16, .21, .27)), multiply('weaponCritDamage', ranks(1.75, 2, 2.35, 2.75)), multiply('weaponHeatPerShot', ranks(.7, .62, .54, .45))]
  },
  {
    id: 'supreme-quantum-carapace', name: 'Quantum Carapace', icon: '⬡', iconColor: 0xe7faff, category: 'player', rarity: 'supreme', maxRank: 3, dropWeight: .95,
    description: 'Phase-layered armor expands health and energy while filtering hostile gas.',
    rankDescriptions: { 0: 'Health +70%, energy +55%, gas damage -55%.', 1: 'Health +90%, energy +70%, gas damage -65%.', 2: 'Health +115%, energy +90%, gas damage -75%.', 3: 'Health +145%, energy +115%, gas damage -85%.' },
    tags: ['supreme', 'player', 'health', 'energy', 'hazard'],
    modifiers: [multiply('playerMaxHealth', ranks(1.7, 1.9, 2.15, 2.45)), multiply('playerEnergyMax', ranks(1.55, 1.7, 1.9, 2.15)), multiply('gasDamageTaken', ranks(.45, .35, .25, .15))]
  },
  {
    id: 'supreme-zero-point-drive', name: 'Zero Point Drive', icon: '∞', iconColor: 0xd9fbff, category: 'player', rarity: 'supreme', maxRank: 3, dropWeight: .88,
    description: 'A causality-breaking drive amplifies movement, dash recovery, and energy regeneration.',
    rankDescriptions: { 0: 'Move +45%, dash cooldown -40%, regen +70%.', 1: 'Move +58%, dash cooldown -50%, regen +90%.', 2: 'Move +72%, dash cooldown -60%, regen +115%.', 3: 'Move +88%, dash cooldown -70%, regen +145%.' },
    tags: ['supreme', 'player', 'movement', 'dash', 'energy'],
    modifiers: [multiply('playerMoveSpeed', ranks(1.45, 1.58, 1.72, 1.88)), multiply('playerDashCooldown', ranks(.6, .5, .4, .3)), multiply('playerEnergyRegen', ranks(1.7, 1.9, 2.15, 2.45))]
  },
  {
    id: 'supreme-triune-bastion', name: 'Triune Bastion', icon: '◬', iconColor: 0xc9ffff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: 1,
    description: 'One defense intelligence synchronizes fence, turret, and mine lethality.',
    rankDescriptions: { 0: 'Fence/turret/mine damage +70%.', 1: 'Defense damage +95%.', 2: 'Defense damage +125%.', 3: 'Defense damage +160%.' },
    tags: ['supreme', 'defense', 'fence', 'turret', 'mine'],
    modifiers: [multiply('fenceDamage', ranks(1.7, 1.95, 2.25, 2.6)), multiply('turretDamage', ranks(1.7, 1.95, 2.25, 2.6)), multiply('mineDamage', ranks(1.7, 1.95, 2.25, 2.6))]
  },
  {
    id: 'supreme-immortal-emplacements', name: 'Immortal Emplacements', icon: '⛊', iconColor: 0xafffff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: .9,
    description: 'Self-repairing hardlight triples down on fence life, turret armor, and shield persistence.',
    rankDescriptions: { 0: 'Fence health +80%, turret health +80%, shield +50%.', 1: 'Health +110%, shield +65%.', 2: 'Health +145%, shield +82%.', 3: 'Health +185%, shield +100%.' },
    tags: ['supreme', 'defense', 'durability', 'shield'],
    modifiers: [multiply('fenceHealth', ranks(1.8, 2.1, 2.45, 2.85)), multiply('turretHealth', ranks(1.8, 2.1, 2.45, 2.85)), multiply('shieldDuration', ranks(1.5, 1.65, 1.82, 2))]
  },
  {
    id: 'supreme-infinite-ordnance', name: 'Infinite Ordnance', icon: '✹', iconColor: 0xfff4ff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: .82,
    description: 'A self-folding mine rack increases capacity, recharge, and blast reach.',
    rankDescriptions: { 0: '+2 mines, cooldown -45%, radius +55%.', 1: '+3 mines, cooldown -55%, radius +70%.', 2: '+4 mines, cooldown -65%, radius +90%.', 3: '+5 mines, cooldown -75%, radius +115%.' },
    tags: ['supreme', 'mine', 'capacity', 'cooldown', 'radius'],
    modifiers: [add('mineMaxActive', ranks(2, 3, 4, 5)), multiply('mineCooldown', ranks(.55, .45, .35, .25)), multiply('mineRadius', ranks(1.55, 1.7, 1.9, 2.15))]
  },
  {
    id: 'supreme-omniscient-sentry', name: 'Omniscient Sentry', icon: '♜', iconColor: 0xe2ffff, category: 'defense', rarity: 'supreme', maxRank: 3, dropWeight: .8,
    description: 'Predictive sentry cognition adds emplacements while expanding range and fire cadence.',
    rankDescriptions: { 0: '+1 turret, fire rate +55%, range +55%.', 1: '+2 turrets, fire rate +70%, range +70%.', 2: '+3 turrets, fire rate +90%, range +90%.', 3: '+4 turrets, fire rate +115%, range +115%.' },
    tags: ['supreme', 'turret', 'capacity', 'fire-rate', 'range'],
    modifiers: [add('turretMaxActive', ranks(1, 2, 3, 4)), multiply('turretFireRate', ranks(1.55, 1.7, 1.9, 2.15)), multiply('turretRange', ranks(1.55, 1.7, 1.9, 2.15))]
  },
  {
    id: 'supreme-final-protocol', name: 'Final Protocol', icon: '◇', iconColor: 0xffd9f6, category: 'bombSite', rarity: 'supreme', maxRank: 3, dropWeight: .76,
    description: 'Terminal defense code extends charges while accelerating fence and turret redeployment.',
    rankDescriptions: { 0: 'Bomb time +45%, fence/turret cooldown -35%.', 1: 'Bomb time +60%, cooldown -45%.', 2: 'Bomb time +80%, cooldown -55%.', 3: 'Bomb time +105%, cooldown -65%.' },
    tags: ['supreme', 'bomb-site', 'fence', 'turret', 'cooldown'],
    modifiers: [multiply('bombDuration', ranks(1.45, 1.6, 1.8, 2.05)), multiply('fenceCooldown', ranks(.65, .55, .45, .35)), multiply('turretCooldown', ranks(.65, .55, .45, .35))]
  },
  {
    id: 'supreme-crown-of-stars', name: 'Crown of Stars', icon: '☆', iconColor: 0xf7ffff, category: 'utility', rarity: 'supreme', maxRank: 3, dropWeight: .72,
    description: 'A stellar acquisition halo magnifies pickup reach, resource restoration, and buff persistence.',
    rankDescriptions: { 0: 'Radius +90%, resources +75%, buffs +65%.', 1: 'Radius +120%, resources +100%, buffs +85%.', 2: 'Radius +155%, resources +130%, buffs +110%.', 3: 'Radius +195%, resources +165%, buffs +140%.' },
    tags: ['supreme', 'utility', 'pickup', 'resources', 'buffs'],
    modifiers: [multiply('playerPickupRadius', ranks(1.9, 2.2, 2.55, 2.95)), multiply('energyPickupValue', ranks(1.75, 2, 2.3, 2.65)), multiply('buffDuration', ranks(1.65, 1.85, 2.1, 2.4))]
  }
] as const;
