import type { BombExplosionCosmeticEffectId } from '../types.ts';

export interface BombExplosionCosmeticDefinition {
  lifetimeMs: number;
  heroScale: number;
}

export const BOMB_EXPLOSION_COSMETIC_DEFINITIONS: Readonly<Record<BombExplosionCosmeticEffectId, BombExplosionCosmeticDefinition>> = {
  'death-signal': { lifetimeMs: 2_700, heroScale: 1 },
  'neon-bloom': { lifetimeMs: 2_750, heroScale: 1 },
  'neon-bats': { lifetimeMs: 2_850, heroScale: 1.04 },
  'witch-signal': { lifetimeMs: 2_900, heroScale: 1.06 }
};
