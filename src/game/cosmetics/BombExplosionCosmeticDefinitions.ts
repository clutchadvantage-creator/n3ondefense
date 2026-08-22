import type { BombExplosionCosmeticEffectId } from '../types.ts';
import type { AudioSfxName } from '../config/audio.ts';

export type BombExplosionCosmeticSound = Extract<
  AudioSfxName,
  'bombsiteSkull' | 'bombsiteFlower' | 'bombsiteBats' | 'bombsiteWitch'
>;

export interface BombExplosionCosmeticDefinition {
  lifetimeMs: number;
  heroScale: number;
  sound: BombExplosionCosmeticSound;
}

export const BOMB_EXPLOSION_COSMETIC_DEFINITIONS: Readonly<Record<BombExplosionCosmeticEffectId, BombExplosionCosmeticDefinition>> = {
  'death-signal': { lifetimeMs: 2_700, heroScale: 1, sound: 'bombsiteSkull' },
  'neon-bloom': { lifetimeMs: 2_750, heroScale: 1, sound: 'bombsiteFlower' },
  'neon-bats': { lifetimeMs: 2_850, heroScale: 1.04, sound: 'bombsiteBats' },
  'witch-signal': { lifetimeMs: 2_900, heroScale: 1.06, sound: 'bombsiteWitch' }
};
