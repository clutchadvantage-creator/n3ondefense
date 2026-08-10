import type { ModInfusionId } from './types.ts';
import { MOD_BALANCE } from './modBalance.ts';

export interface ModInfusionDefinition {
  id: ModInfusionId;
  name: string;
  description: string;
  icon: string;
  plasmaCost: number;
  cosmeticOnly: true;
}

export const MOD_INFUSIONS: readonly ModInfusionDefinition[] = [
  {
    id: 'enemy-growth',
    name: 'Titan Projection',
    description: 'Projects enemies 12% larger visually. Hitboxes, health, damage, speed, and behavior are unchanged.',
    icon: '⬡+',
    plasmaCost: MOD_BALANCE.infusionPlasmaCost['enemy-growth'],
    cosmeticOnly: true
  },
  {
    id: 'detonation-fireworks',
    name: 'Victory Fireworks',
    description: 'Launches colorful neon fireworks after a successfully defended bomb detonates.',
    icon: '✦',
    plasmaCost: MOD_BALANCE.infusionPlasmaCost['detonation-fireworks'],
    cosmeticOnly: true
  },
  {
    id: 'prismatic-rounds',
    name: 'Prism Cascade',
    description: 'Cycles allied projectiles and their trails through a neon spectrum. Projectile damage and behavior are unchanged.',
    icon: '◈',
    plasmaCost: MOD_BALANCE.infusionPlasmaCost['prismatic-rounds'],
    cosmeticOnly: true
  },
  {
    id: 'holo-afterimage',
    name: 'Holo Wake',
    description: 'Leaves fading holographic operative echoes while moving. Speed, collision, and evasion are unchanged.',
    icon: '▱',
    plasmaCost: MOD_BALANCE.infusionPlasmaCost['holo-afterimage'],
    cosmeticOnly: true
  },
  {
    id: 'pickup-orbit',
    name: 'Loot Satellites',
    description: 'Adds tiny orbiting neon satellites to every pickup. Collection range and pickup values are unchanged.',
    icon: '⊙',
    plasmaCost: MOD_BALANCE.infusionPlasmaCost['pickup-orbit'],
    cosmeticOnly: true
  },
  {
    id: 'ghost-echoes',
    name: 'Neon Revenants',
    description: 'Defeated enemies leave a brief rising holographic echo. Enemy drops, health, and hitboxes are unchanged.',
    icon: '♢',
    plasmaCost: MOD_BALANCE.infusionPlasmaCost['ghost-echoes'],
    cosmeticOnly: true
  },
  {
    id: 'arcade-pop',
    name: 'Arcade Pop',
    description: 'Splashes playful neon callouts over defeated enemies. Scores, rewards, and combat outcomes are unchanged.',
    icon: '★',
    plasmaCost: MOD_BALANCE.infusionPlasmaCost['arcade-pop'],
    cosmeticOnly: true
  }
] as const;

export const MOD_INFUSION_BY_ID = new Map(MOD_INFUSIONS.map((definition) => [definition.id, definition]));
