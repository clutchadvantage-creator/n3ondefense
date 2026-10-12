import type { BombExplosionCosmeticEffectId } from '../types.ts';
import type { AudioSfxName } from '../config/audio.ts';
import { TUG_WHISTLE_BURST_MS, TUG_WHISTLE_LIFETIME_MS } from './TugLifeWhistleArt.ts';
import { HALLOWEEN_TIMING } from './HalloweenCelebrationTiming.ts';

export type BombExplosionCosmeticSound = Extract<
  AudioSfxName,
  'bombsiteSkull' | 'bombsiteFlower' | 'bombsiteBats' | 'bombsiteWitch' | 'bombsiteTugLife' | 'bomb'
>;

export interface BombExplosionCosmeticDefinition {
  lifetimeMs: number;
  heroScale: number;
  sound?: BombExplosionCosmeticSound;
  soundDelayMs?: number;
}

export const BOMB_EXPLOSION_COSMETIC_DEFINITIONS: Readonly<Record<BombExplosionCosmeticEffectId, BombExplosionCosmeticDefinition>> = {
  'violet-plasma': { lifetimeMs: 2_700, heroScale: 1 },
  'scarlet-heat': { lifetimeMs: 2_700, heroScale: 1 },
  'cryo-shatter': { lifetimeMs: 2_700, heroScale: 1 },
  'emerald-ion': { lifetimeMs: 2_700, heroScale: 1 },
  'solar-flare': { lifetimeMs: 2_700, heroScale: 1 },
  'prism-spectrum': { lifetimeMs: 2_700, heroScale: 1 },
  'tug-life': { lifetimeMs: TUG_WHISTLE_LIFETIME_MS, heroScale: 1, sound: 'bombsiteTugLife', soundDelayMs: TUG_WHISTLE_BURST_MS },
  'death-signal': { lifetimeMs: 2_700, heroScale: 1, sound: 'bombsiteSkull' },
  'neon-bloom': { lifetimeMs: 2_750, heroScale: 1, sound: 'bombsiteFlower' },
  'neon-bats': { lifetimeMs: HALLOWEEN_TIMING.end, heroScale: 1.1, sound: 'bombsiteBats' },
  'witch-signal': { lifetimeMs: HALLOWEEN_TIMING.end, heroScale: 1.1, sound: 'bombsiteWitch' },
  'pumpkin-reactor': { lifetimeMs: HALLOWEEN_TIMING.end, heroScale: 1.1, sound: 'bomb', soundDelayMs: HALLOWEEN_TIMING.releaseAt }
};
