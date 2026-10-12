import { LegacyBombVisual } from './LegacyBombVisual.ts';
import { isLegacyBomb } from './LegacyBombArt.ts';
import Phaser from 'phaser';
import { getCosmeticById } from '../../data/cosmetics.ts';
import type { BombExplosionCosmeticEffectId } from '../types.ts';
import { BOMB_EXPLOSION_COSMETIC_DEFINITIONS } from './BombExplosionCosmeticDefinitions.ts';
import { TugLifeWhistleVisual } from './TugLifeWhistleVisual.ts';
import { HalloweenBombsiteVisual } from './HalloweenBombsiteVisual.ts';
import { halloweenSetFromEffect } from './HalloweenCosmeticArt.ts';

interface BombExplosionCosmeticState {
  active: boolean;
  effectId: BombExplosionCosmeticEffectId;
  x: number;
  y: number;
  radius: number;
  startedAt: number;
  phase: number;
  seed: number;
}

type CosmeticRenderer = (state: BombExplosionCosmeticState, elapsed: number, reducedDetail: boolean) => void;

const MAX_ACTIVE_EFFECTS = 6;
const REDUCED_ACTIVE_EFFECTS = 4;
/**
 * Bounded, batched renderer for premium bombsite explosion signatures.
 *
 * ArenaScene remains authoritative for timing, damage, radius, audio, scoring,
 * and its existing MineExplosionVfx. This renderer only adds a translucent
 * afterimage over that explosion and never creates physics or input objects.
 */
export class BombExplosionCosmeticVfx {
  readonly maximumActiveEffects: number;
  private readonly states: BombExplosionCosmeticState[];
  private readonly renderers: Record<BombExplosionCosmeticEffectId, CosmeticRenderer>;
  private sequence = 0;
  private readonly legacy = new Map<BombExplosionCosmeticState, LegacyBombVisual>();
  private readonly whistles = new Map<BombExplosionCosmeticState, TugLifeWhistleVisual>();
  private readonly halloween = new Map<BombExplosionCosmeticState, HalloweenBombsiteVisual>();

  constructor(private readonly scene: Phaser.Scene, private readonly particlesEnabled: boolean) {
    this.maximumActiveEffects = particlesEnabled ? MAX_ACTIVE_EFFECTS : REDUCED_ACTIVE_EFFECTS;
    this.states = Array.from({ length: this.maximumActiveEffects }, (): BombExplosionCosmeticState => ({
      active: false,
      effectId: 'death-signal',
      x: 0,
      y: 0,
      radius: 0,
      startedAt: 0,
      phase: 0,
      seed: 0
    }));
    this.renderers = {
      'tug-life': (state, elapsed, reducedDetail) => {
        let visual = this.whistles.get(state);
        if (!visual) { visual = new TugLifeWhistleVisual(this.scene); this.whistles.set(state, visual); }
        visual.update(state.x, state.y, state.radius, elapsed, reducedDetail);
      },
      'violet-plasma': (state, elapsed, reduced) => this.drawLegacy(state, elapsed, reduced),
      'scarlet-heat': (state, elapsed, reduced) => this.drawLegacy(state, elapsed, reduced),
      'cryo-shatter': (state, elapsed, reduced) => this.drawLegacy(state, elapsed, reduced),
      'emerald-ion': (state, elapsed, reduced) => this.drawLegacy(state, elapsed, reduced),
      'solar-flare': (state, elapsed, reduced) => this.drawLegacy(state, elapsed, reduced),
      'prism-spectrum': (state, elapsed, reduced) => this.drawLegacy(state, elapsed, reduced),
      'death-signal': (state, elapsed, reduced) => this.drawLegacy(state, elapsed, reduced),
      'neon-bloom': (state, elapsed, reducedDetail) => this.drawLegacy(state, elapsed, reducedDetail),
      'neon-bats': (state, elapsed, reducedDetail) => this.drawHalloween(state, elapsed, reducedDetail),
      'witch-signal': (state, elapsed, reducedDetail) => this.drawHalloween(state, elapsed, reducedDetail),
      'pumpkin-reactor': (state, elapsed, reducedDetail) => this.drawHalloween(state, elapsed, reducedDetail)
    };
  }

  emitEquipped(
    cosmeticId: string | null,
    x: number,
    y: number,
    radius: number,
    now: number
  ): BombExplosionCosmeticEffectId | null {
    const effectId = getCosmeticById(cosmeticId)?.bombExplosionEffect;
    if (!effectId) return null;
    this.emit(effectId, x, y, radius, now);
    return effectId;
  }

  emit(effectId: BombExplosionCosmeticEffectId, x: number, y: number, radius: number, now: number): void {
    let state = this.states[0];
    let oldestStartedAt = Number.POSITIVE_INFINITY;
    for (const candidate of this.states) {
      if (!candidate.active) {
        state = candidate;
        oldestStartedAt = Number.NEGATIVE_INFINITY;
        break;
      }
      if (candidate.startedAt < oldestStartedAt) {
        state = candidate;
        oldestStartedAt = candidate.startedAt;
      }
    }
    state.active = true;
    state.effectId = effectId;
    state.x = x;
    state.y = y;
    state.radius = radius * BOMB_EXPLOSION_COSMETIC_DEFINITIONS[effectId].heroScale;
    state.startedAt = now;
    state.phase = (this.sequence * 2.399963229728653) % (Math.PI * 2);
    state.seed = ((Math.floor(x) * 73_856_093) ^ (Math.floor(y) * 19_349_663) ^ Math.imul(this.sequence + 1, 83_492_791)) >>> 0;
    this.sequence += 1;
  }

  update(now: number): void {
    for (const visual of this.legacy.values()) visual.hide();
    for (const visual of this.halloween.values()) visual.hide();
    for (const visual of this.whistles.values()) visual.hide();
    let activeCount = 0;
    for (const state of this.states) if (state.active) activeCount += 1;
    const crowded = activeCount > 2;
    for (const state of this.states) {
      if (!state.active) continue;
      const elapsed = now - state.startedAt;
      const definition = BOMB_EXPLOSION_COSMETIC_DEFINITIONS[state.effectId];
      if (elapsed >= definition.lifetimeMs) {
        state.active = false;
        continue;
      }
      this.renderers[state.effectId](state, elapsed, crowded || !this.particlesEnabled);
    }
  }

  recommendedSceneHoldMs(minimumMs: number, now: number): number {
    let latestEnd = now + minimumMs;
    for (const state of this.states) {
      if (!state.active) continue;
      latestEnd = Math.max(latestEnd, state.startedAt + BOMB_EXPLOSION_COSMETIC_DEFINITIONS[state.effectId].lifetimeMs + 40);
    }
    return Math.max(minimumMs, Math.ceil(latestEnd - now));
  }

  reset(): void {
    for (const visual of this.legacy.values()) visual.hide();
    for (const visual of this.halloween.values()) visual.hide();
    for (const visual of this.whistles.values()) visual.hide();
    for (const state of this.states) state.active = false;
  }

  destroy(): void {
    for (const visual of this.legacy.values()) visual.destroy();
    this.legacy.clear();
    for (const visual of this.halloween.values()) visual.destroy();
    this.halloween.clear();
    for (const visual of this.whistles.values()) visual.destroy();
    this.whistles.clear();
    this.reset();
  }

  get activeEffectCount(): number {
    let count = 0;
    for (const state of this.states) if (state.active) count += 1;
    return count;
  }

  private drawHalloween(state: BombExplosionCosmeticState, elapsed: number, reduced: boolean): void {
    const set = halloweenSetFromEffect(state.effectId);
    if (!set) return;
    let visual = this.halloween.get(state);
    if (!visual) { visual = new HalloweenBombsiteVisual(this.scene); this.halloween.set(state, visual); }
    visual.update(set, state.x, state.y, state.radius, elapsed, reduced);
  }

  private drawLegacy(state: BombExplosionCosmeticState, elapsed: number, reduced: boolean): void {
    if(!isLegacyBomb(state.effectId))return;
    let visual=this.legacy.get(state);
    if(!visual){visual=new LegacyBombVisual(this.scene);this.legacy.set(state,visual);}
    visual.update(state.effectId,state.x,state.y,state.radius,elapsed,reduced);
  }
}
