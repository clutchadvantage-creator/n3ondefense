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
  }
] as const;

export const MOD_INFUSION_BY_ID = new Map(MOD_INFUSIONS.map((definition) => [definition.id, definition]));
