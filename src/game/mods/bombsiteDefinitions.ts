import type { ModDefinition, ModRank, ModStatModifier } from './types.ts';

const multiply = (stat: ModStatModifier['stat'], ...values: [number, number, number, number]): ModStatModifier => ({
  stat,
  mode: 'multiply',
  values: { 0: values[0], 1: values[1], 2: values[2], 3: values[3] } satisfies Record<ModRank, number>
});

/**
 * Objective-centric cards live in one registry so the collection, drops, Garage,
 * save normalization, and runtime all consume the same definitions.
 */
export const BOMBSITE_MOD_DEFINITIONS: readonly ModDefinition[] = [
  {
    id: 'arc-surge', name: 'Arc Surge', icon: 'ϟ', iconColor: 0x63efff,
    category: 'bombSite', rarity: 'uncommon', maxRank: 3, dropWeight: 0.82,
    description: 'The planted bomb periodically discharges an electrical pulse through its combat field.',
    rankDescriptions: { 0: 'Pulse every 11s.', 1: 'Pulse every 10s with increased damage.', 2: 'Pulse every 8s.', 3: 'Pulse every 6s with maximum damage.' },
    tags: ['bomb-site', 'field', 'pulse', 'damage']
  },
  {
    id: 'defuse-feedback', name: 'Defuse Feedback', icon: '↯', iconColor: 0x7dfff2,
    category: 'bombSite', rarity: 'uncommon', maxRank: 3, dropWeight: 0.8,
    description: 'Enemies that begin a legitimate defuse interaction are shocked by the charge.',
    rankDescriptions: { 0: 'Light electrical retaliation.', 1: 'Increased shock damage.', 2: 'Heavy shock with a brief stagger.', 3: 'Maximum shock and stagger.' },
    tags: ['bomb-site', 'defuse', 'retaliation', 'damage']
  },
  {
    id: 'pressure-field', name: 'Pressure Field', icon: '◎', iconColor: 0x92a7ff,
    category: 'bombSite', rarity: 'uncommon', maxRank: 3, dropWeight: 0.86,
    description: 'The planted bomb projects a tactical pressure field that slows enemies inside it.',
    rankDescriptions: { 0: 'Enemies slowed 8%.', 1: 'Enemies slowed 10%.', 2: 'Enemies slowed 15%.', 3: 'Enemies slowed 20%.' },
    tags: ['bomb-site', 'field', 'slow', 'control']
  },
  {
    id: 'combat-uplink', name: 'Combat Uplink', icon: '⌁', iconColor: 0xff72c7,
    category: 'bombSite', rarity: 'uncommon', maxRank: 3, dropWeight: 0.78,
    description: 'While inside an active Bombsite field, the operative receives a fire-control uplink.',
    rankDescriptions: { 0: 'Fire rate +4% in the field.', 1: 'Fire rate +5%.', 2: 'Fire rate +8%.', 3: 'Fire rate +12%.' },
    tags: ['bomb-site', 'field', 'player', 'fire-rate']
  },
  {
    id: 'countermeasure-array', name: 'Countermeasure Array', icon: '⊛', iconColor: 0x56dfff,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.57,
    description: 'Threatening defuse progress consumes a finite charge to interrupt and repel attackers.',
    rankDescriptions: { 0: '1 countermeasure per planted bomb.', 1: '1 stronger countermeasure.', 2: '2 countermeasures.', 3: '3 countermeasures.' },
    tags: ['bomb-site', 'defuse', 'charges', 'knockback']
  },
  {
    id: 'kill-switch', name: 'Kill Switch', icon: '⌛', iconColor: 0xffcf58,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.55,
    description: 'Eligible enemy kills inside the Bombsite field remove time from the active countdown.',
    rankDescriptions: { 0: 'Every 5 kills removes 0.5s.', 1: 'Every 5 kills removes 0.65s.', 2: 'Every 4 kills removes 0.85s.', 3: 'Every 3 kills removes 1.1s.' },
    tags: ['bomb-site', 'field', 'kills', 'countdown']
  },
  {
    id: 'hot-zone', name: 'Hot Zone', icon: '◉', iconColor: 0xff6b62,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.52,
    description: 'Enemies that remain inside the Bombsite field accumulate escalating reactor exposure.',
    rankDescriptions: { 0: 'Exposure deals light escalating damage.', 1: 'Exposure damage +30%.', 2: 'Exposure builds faster.', 3: 'Maximum escalating field damage.' },
    tags: ['bomb-site', 'field', 'exposure', 'damage-over-time']
  },
  {
    id: 'capacitor-field', name: 'Capacitor Field', icon: '╫', iconColor: 0x69ffbf,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.5,
    description: 'Electric Fences intersecting the Bombsite field receive a localized damage charge.',
    rankDescriptions: { 0: 'Field Fences deal +8% damage.', 1: '+10% damage.', 2: '+15% damage.', 3: '+20% damage.' },
    tags: ['bomb-site', 'field', 'fence', 'synergy']
  },
  {
    id: 'sentry-uplink', name: 'Sentry Uplink', icon: '♜', iconColor: 0x78deff,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.5,
    description: 'Turrets deployed inside the Bombsite field receive a temporary fire-control uplink.',
    rankDescriptions: { 0: 'Field Turret fire rate +8%.', 1: '+10%.', 2: '+15%.', 3: '+20%.' },
    tags: ['bomb-site', 'field', 'turret', 'synergy']
  },
  {
    id: 'munitions-relay', name: 'Munitions Relay', icon: '✹', iconColor: 0xffa847,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.5,
    description: 'Defending inside the Bombsite field accelerates the authoritative Mine charge rack.',
    rankDescriptions: { 0: 'Mine recharge +8% in the field.', 1: '+10%.', 2: '+15%.', 3: '+20%.' },
    tags: ['bomb-site', 'field', 'mine', 'recharge']
  },
  {
    id: 'emergency-shielding', name: 'Emergency Shielding', icon: '⬡', iconColor: 0x65f8ff,
    category: 'bombSite', rarity: 'rare', maxRank: 3, dropWeight: 0.48,
    description: 'Standing inside an active Bombsite field accelerates operative shield recovery.',
    rankDescriptions: { 0: 'Shield recovery +6%.', 1: '+8%.', 2: '+12%.', 3: '+18%.' },
    tags: ['bomb-site', 'field', 'shield', 'recharge']
  },
  {
    id: 'final-countdown', name: 'Final Countdown', icon: '◴', iconColor: 0xd36cff,
    category: 'bombSite', rarity: 'epic', maxRank: 3, dropWeight: 0.34,
    description: 'The final 15 seconds activate an emergency combat field around the planted charge.',
    rankDescriptions: { 0: 'Field combat and recharge +6%.', 1: '+8%.', 2: '+12%.', 3: '+16%.' },
    tags: ['bomb-site', 'final-countdown', 'player', 'combat-field']
  },
  {
    id: 'danger-close', name: 'Danger Close', icon: '¢', iconColor: 0xffd768,
    category: 'bombSite', rarity: 'epic', maxRank: 3, dropWeight: 0.33,
    description: 'Enemy kills inside the Bombsite field generate increased eligible kill Credits.',
    rankDescriptions: { 0: 'Eligible kill Credits +10%.', 1: '+15%.', 2: '+25%.', 3: '+35%.' },
    tags: ['bomb-site', 'field', 'kills', 'economy']
  },
  {
    id: 'critical-mass-charge', name: 'Critical Mass', icon: '☢', iconColor: 0xff3fba,
    category: 'bombSite', rarity: 'epic', maxRank: 3, dropWeight: 0.21, variant: 'corrupted',
    description: 'An illegally overclocked charge detonates faster while driving enemy spawn pressure higher.',
    positiveEffect: 'Bomb countdown duration is significantly reduced.',
    negativeEffect: 'Enemy spawn cadence becomes significantly faster.',
    rankDescriptions: { 0: 'Timer -18%; spawn rate +15%.', 1: 'Timer -20%; spawn rate +16%.', 2: 'Timer -22%; spawn rate +18%.', 3: 'Timer -25%; spawn rate +20%.' },
    tags: ['corrupted', 'bomb-site', 'countdown', 'spawn-pressure', 'tradeoff'],
    modifiers: [multiply('bombDuration', 0.82, 0.8, 0.78, 0.75)]
  },
  {
    id: 'unstable-reactor', name: 'Unstable Reactor', icon: '☣', iconColor: 0x8dff3f,
    category: 'bombSite', rarity: 'epic', maxRank: 3, dropWeight: 0.2, variant: 'corrupted',
    description: 'The bomb emits powerful reactor waves, but its clearly marked inner pulse also harms the operative.',
    positiveEffect: 'Large reactor pulses deal heavy field damage to enemies.',
    negativeEffect: 'The telegraphed inner danger radius damages the operative.',
    rankDescriptions: { 0: 'Reactor pulse every 9s.', 1: 'Pulse every 8s.', 2: 'Pulse every 7s with more damage.', 3: 'Pulse every 6s with maximum damage.' },
    tags: ['corrupted', 'bomb-site', 'pulse', 'player-hazard', 'tradeoff']
  },
  {
    id: 'blood-beacon', name: 'Blood Beacon', icon: '☠', iconColor: 0xff496f,
    category: 'bombSite', rarity: 'epic', maxRank: 3, dropWeight: 0.19, variant: 'corrupted',
    description: 'The bomb becomes a lucrative kill beacon while drawing more enemies into objective duty.',
    positiveEffect: 'Kills inside the Bombsite field generate greatly increased Credits.',
    negativeEffect: 'More enemies prioritize defusing the planted objective.',
    rankDescriptions: { 0: 'Credits +35%; +1 objective attacker.', 1: '+45%; +1 attacker.', 2: '+60%; +2 attackers.', 3: '+75%; +3 attackers.' },
    tags: ['corrupted', 'bomb-site', 'economy', 'objective-pressure', 'tradeoff']
  },
  {
    id: 'ground-zero', name: 'Ground Zero', icon: '⎊', iconColor: 0xff8a00,
    category: 'bombSite', rarity: 'legendary', maxRank: 3, dropWeight: 0.038,
    description: 'Once per charge, a critical defuse triggers a massive EMP that clears and electrifies the site.',
    rankDescriptions: { 0: 'Ground Zero EMP with a 3s charged field.', 1: 'Stronger EMP and 4s field.', 2: 'Greater knockback and 5s field.', 3: 'Maximum EMP and 6s field.' },
    tags: ['legendary', 'bomb-site', 'defuse', 'emp', 'once-per-bomb']
  },
  {
    id: 'event-horizon-array', name: 'Event Horizon', icon: '◉', iconColor: 0xff9a24,
    category: 'bombSite', rarity: 'legendary', maxRank: 3, dropWeight: 0.036,
    description: 'Controlled gravity pulses draw normal enemies into a tactical kill ring around the bomb.',
    rankDescriptions: { 0: 'Gravity pulse every 12s.', 1: 'Pulse every 11s with stronger pull.', 2: 'Pulse every 9s.', 3: 'Pulse every 8s with maximum pull.' },
    tags: ['legendary', 'bomb-site', 'field', 'gravity', 'control']
  },
  {
    id: 'second-sun', name: 'Second Sun', icon: '☀', iconColor: 0xffa01f,
    category: 'bombSite', rarity: 'legendary', maxRank: 3, dropWeight: 0.034,
    description: 'At 15, 10, and 5 seconds, the overcharging bomb releases escalating solar pulses.',
    rankDescriptions: { 0: 'Three escalating final-countdown stages.', 1: 'Stronger Stage II and III pulses.', 2: 'Improved slow and stagger.', 3: 'Maximum three-stage overcharge.' },
    tags: ['legendary', 'bomb-site', 'final-countdown', 'staged-pulse']
  }
] as const;
