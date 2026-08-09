import type { ModDefinition } from './types.ts';

export const MOD_DEFINITIONS: readonly ModDefinition[] = [
  {
    id: 'split-current', name: 'Split Current', category: 'weapon', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'A killing weapon shot arcs a portion of its final hit damage into one nearby enemy.',
    rankDescriptions: { 0: '15% arc damage, 130 range.', 1: '20% arc damage, 150 range.', 2: '30% arc damage, 180 range.', 3: '40% arc damage, 220 range.' },
    tags: ['weapon-kill', 'chain', 'secondary-damage']
  },
  {
    id: 'emergency-capacitor', name: 'Emergency Capacitor', category: 'player', rarity: 'uncommon', maxRank: 3, dropWeight: 1,
    description: 'Once per round, crossing below 25% health restores energy.',
    rankDescriptions: { 0: 'Restore 10% energy.', 1: 'Restore 20% energy.', 2: 'Restore 35% energy.', 3: 'Restore 50% energy and gain a brief movement boost.' },
    tags: ['health-threshold', 'energy', 'survival']
  },
  {
    id: 'priority-targeting', name: 'Priority Targeting', category: 'defense', rarity: 'rare', maxRank: 3, dropWeight: 0.8,
    description: 'Turrets identify and prioritize enemies assigned to defuse the active bomb.',
    rankDescriptions: { 0: 'Defusers receive a basic targeting preference.', 1: 'Prioritize active defusers.', 2: 'Targets remain marked for 2.5 seconds.', 3: 'Turrets deal 10% bonus damage to marked targets.' },
    tags: ['turret', 'targeting', 'conditional-damage']
  },
  {
    id: 'emergency-shield', name: 'Emergency Shield', category: 'bombSite', rarity: 'epic', maxRank: 3, dropWeight: 0.55,
    description: 'The first defuse contact can temporarily block progress at that bomb site.',
    rankDescriptions: { 0: 'Block progress for 0.5 seconds.', 1: 'Block progress for 1 second.', 2: 'Block progress for 2 seconds.', 3: 'Block for 2 seconds and repel nearby light enemies.' },
    tags: ['bomb-site', 'defuse', 'cooldown']
  },
  {
    id: 'magnetic-payload', name: 'Magnetic Payload', category: 'utility', rarity: 'rare', maxRank: 3, dropWeight: 0.75,
    description: 'Armed mines pull nearby enemies inward immediately before detonating.',
    rankDescriptions: { 0: 'Minor pull within 90 range.', 1: 'Light pull within 105 range.', 2: 'Stronger pull within 125 range.', 3: 'Strong pull and briefly slow survivors.' },
    tags: ['mine', 'control', 'pull']
  },
  {
    id: 'fractured-current', name: 'Fractured Current', category: 'weapon', rarity: 'legendary', maxRank: 3, dropWeight: 0.08,
    variant: 'corrupted',
    description: 'An unstable current turns weapon kills into violent arcs, but every shot drains additional energy.',
    positiveEffect: 'Weapon kills release a stronger arc.',
    negativeEffect: 'Each weapon shot costs 0.25 additional energy.',
    rankDescriptions: { 0: 'Arc 18% of the killing hit within 140 range.', 1: 'Arc 25% of the killing hit within 160 range.', 2: 'Arc 35% within 195 range.', 3: 'Arc 45% within 235 range.' },
    tags: ['corrupted', 'weapon-kill', 'tradeoff', 'secondary-damage']
  },
  {
    id: 'nanite-fuel', name: 'Nanite Fuel', category: 'player', rarity: 'legendary', maxRank: 3, dropWeight: 0.045,
    description: 'Self-replicating nanites permanently accelerate the operative while this card is equipped, stacking with purchased speed and temporary boosts.',
    rankDescriptions: { 0: 'Operative movement speed +5%.', 1: 'Operative movement speed +7.5%.', 2: 'Operative movement speed +10%.', 3: 'Operative movement speed +12.5%.' },
    tags: ['player', 'movement', 'permanent-while-equipped', 'stacking-speed']
  },
  {
    id: 'magnetic-service', name: 'Magnetic Service', category: 'player', rarity: 'rare', maxRank: 3, dropWeight: 0.65,
    description: 'An operative-mounted magnetic service field pulls pickups inward from beyond the normal collection radius.',
    rankDescriptions: { 0: 'Attract pickups within 1.75x collection range.', 1: 'Attract pickups within 2.25x collection range.', 2: 'Attract pickups within 2.75x collection range.', 3: 'Attract pickups within 3.5x collection range.' },
    tags: ['player', 'pickup', 'attraction', 'stacking-radius']
  },
  {
    id: 'jailbroke-turrets', name: 'Jailbroke Turrets', category: 'defense', rarity: 'epic', maxRank: 3, dropWeight: 0.5,
    description: 'Unauthorized targeting firmware lets turret rounds cross friendly fences and split into independently tracked streams.',
    rankDescriptions: { 0: 'Fence crossing: 1 stream at 100% damage.', 1: 'Fence crossing: 2 streams at 70% damage each.', 2: 'Fence crossing: 3 streams at 55% damage each.', 3: 'Fence crossing: 4 streams at 45% damage each.' },
    tags: ['turret', 'fence', 'projectile-fan', 'stream-count']
  },
  {
    id: 'conductive-fencing', name: 'Conductive Fencing', category: 'defense', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'Conductive filaments amplify the final damage output of every deployed fence.',
    rankDescriptions: { 0: 'Fence damage +10%.', 1: 'Fence damage +15%.', 2: 'Fence damage +20%.', 3: 'Fence damage +25%.' },
    tags: ['fence', 'damage', 'stacking-upgrade']
  },
  {
    id: 'high-yield-mines', name: 'High-Yield Mines', category: 'defense', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'Denser reactive compound increases final mine blast damage without changing its trigger behavior.',
    rankDescriptions: { 0: 'Mine damage +10%.', 1: 'Mine damage +15%.', 2: 'Mine damage +20%.', 3: 'Mine damage +25%.' },
    tags: ['mine', 'damage', 'stacking-upgrade']
  },
  {
    id: 'hardlight-weave', name: 'Hardlight Weave', category: 'defense', rarity: 'uncommon', maxRank: 3, dropWeight: 0.85,
    description: 'A reinforced hardlight weave multiplies fence durability after permanent health upgrades are applied.',
    rankDescriptions: { 0: 'Fence health +15%.', 1: 'Fence health +25%.', 2: 'Fence health +35%.', 3: 'Fence health +50%.' },
    tags: ['fence', 'health', 'stacking-upgrade']
  },
  {
    id: 'quick-fuse', name: 'Quick Fuse', category: 'defense', rarity: 'uncommon', maxRank: 3, dropWeight: 0.85,
    description: 'Accelerated priming firmware reduces mine arming time after permanent arm-speed upgrades are applied.',
    rankDescriptions: { 0: 'Mine arming time -15%.', 1: 'Mine arming time -25%.', 2: 'Mine arming time -35%.', 3: 'Mine arming time -50%.' },
    tags: ['mine', 'arming-time', 'stacking-upgrade']
  }
] as const;

export const MOD_BY_ID = new Map(MOD_DEFINITIONS.map((definition) => [definition.id, definition]));
