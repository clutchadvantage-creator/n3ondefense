import type { BombExplosionCosmeticEffectId } from '../types.ts';
import type { AudioSfxName } from '../config/audio.ts';
import { TUG_WHISTLE_BURST_MS, TUG_WHISTLE_LIFETIME_MS } from './TugLifeWhistleArt.ts';

export type BombExplosionCosmeticSound = Extract<
  AudioSfxName,
  'bombsiteSkull' | 'bombsiteFlower' | 'bombsiteBats' | 'bombsiteWitch' | 'bombsiteTugLife'
>;

export interface BombExplosionCosmeticDefinition {
  lifetimeMs: number;
  heroScale: number;
  sound: BombExplosionCosmeticSound;
  soundDelayMs?: number;
}

export const BOMB_EXPLOSION_COSMETIC_DEFINITIONS: Readonly<Record<BombExplosionCosmeticEffectId, BombExplosionCosmeticDefinition>> = {
  'tug-life': { lifetimeMs: TUG_WHISTLE_LIFETIME_MS, heroScale: 1, sound: 'bombsiteTugLife', soundDelayMs: TUG_WHISTLE_BURST_MS },
  'death-signal': { lifetimeMs: 2_700, heroScale: 1, sound: 'bombsiteSkull' },
  'neon-bloom': { lifetimeMs: 2_750, heroScale: 1, sound: 'bombsiteFlower' },
  'neon-bats': { lifetimeMs: 2_850, heroScale: 1.04, sound: 'bombsiteBats' },
  'witch-signal': { lifetimeMs: 2_900, heroScale: 1.06, sound: 'bombsiteWitch' }
};
