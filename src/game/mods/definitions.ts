import type { ModDefinition } from './types.ts';

export const MOD_DEFINITIONS: readonly ModDefinition[] = [
  {
    id: 'split-current', name: 'Split Current', category: 'weapon', rarity: 'common', maxRank: 3, dropWeight: 1,
    description: 'A killing weapon shot arcs a portion of its final hit damage into one nearby enemy.',
    rankDescriptions: { 1: '20% arc damage, 150 range.', 2: '30% arc damage, 180 range.', 3: '40% arc damage, 220 range.' },
    tags: ['weapon-kill', 'chain', 'secondary-damage']
  },
  {
    id: 'emergency-capacitor', name: 'Emergency Capacitor', category: 'player', rarity: 'uncommon', maxRank: 3, dropWeight: 1,
    description: 'Once per round, crossing below 25% health restores energy.',
    rankDescriptions: { 1: 'Restore 20% energy.', 2: 'Restore 35% energy.', 3: 'Restore 50% energy and gain a brief movement boost.' },
    tags: ['health-threshold', 'energy', 'survival']
  },
  {
    id: 'priority-targeting', name: 'Priority Targeting', category: 'defense', rarity: 'rare', maxRank: 3, dropWeight: 0.8,
    description: 'Turrets identify and prioritize enemies assigned to defuse the active bomb.',
    rankDescriptions: { 1: 'Prioritize active defusers.', 2: 'Targets remain marked for 2.5 seconds.', 3: 'Turrets deal 10% bonus damage to marked targets.' },
    tags: ['turret', 'targeting', 'conditional-damage']
  },
  {
    id: 'emergency-shield', name: 'Emergency Shield', category: 'bombSite', rarity: 'prototype', maxRank: 3, dropWeight: 0.55,
    description: 'The first defuse contact can temporarily block progress at that bomb site.',
    rankDescriptions: { 1: 'Block progress for 1 second.', 2: 'Block progress for 2 seconds.', 3: 'Block for 2 seconds and repel nearby light enemies.' },
    tags: ['bomb-site', 'defuse', 'cooldown']
  },
  {
    id: 'magnetic-payload', name: 'Magnetic Payload', category: 'utility', rarity: 'rare', maxRank: 3, dropWeight: 0.75,
    description: 'Armed mines pull nearby enemies inward immediately before detonating.',
    rankDescriptions: { 1: 'Light pull within 105 range.', 2: 'Stronger pull within 125 range.', 3: 'Strong pull and briefly slow survivors.' },
    tags: ['mine', 'control', 'pull']
  }
] as const;

export const MOD_BY_ID = new Map(MOD_DEFINITIONS.map((definition) => [definition.id, definition]));
