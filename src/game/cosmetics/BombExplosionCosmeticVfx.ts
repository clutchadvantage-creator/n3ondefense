import Phaser from 'phaser';
import { getCosmeticById } from '../../data/cosmetics.ts';
import type { BombExplosionCosmeticEffectId } from '../types.ts';
import { BOMB_EXPLOSION_COSMETIC_DEFINITIONS } from './BombExplosionCosmeticDefinitions.ts';

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
const SKULL_FRAGMENT_COUNT = 18;
const BLOOM_COLORS = [0x63efff, 0xff61d6, 0xffe568, 0xa978ff, 0x76ff8e, 0xffa44e, 0xffffff] as const;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;
const easeOutBack = (value: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
};
const pseudoRandom = (seed: number, index: number): number => {
  const value = Math.sin(seed * 0.000_013 + index * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
};

/**
 * Bounded, batched renderer for premium bombsite explosion signatures.
 *
 * ArenaScene remains authoritative for timing, damage, radius, audio, scoring,
 * and its existing MineExplosionVfx. This renderer only adds a translucent
 * afterimage over that explosion and never creates physics or input objects.
 */
export class BombExplosionCosmeticVfx {
  readonly maximumActiveEffects: number;
  private readonly smokeGraphics: Phaser.GameObjects.Graphics;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly states: BombExplosionCosmeticState[];
  private readonly fragmentCos = new Float32Array(SKULL_FRAGMENT_COUNT);
  private readonly fragmentSin = new Float32Array(SKULL_FRAGMENT_COUNT);
  private readonly renderers: Record<BombExplosionCosmeticEffectId, CosmeticRenderer>;
  private sequence = 0;

  constructor(scene: Phaser.Scene, private readonly particlesEnabled: boolean) {
    this.maximumActiveEffects = particlesEnabled ? MAX_ACTIVE_EFFECTS : REDUCED_ACTIVE_EFFECTS;
    this.smokeGraphics = scene.add.graphics().setDepth(16).setBlendMode(Phaser.BlendModes.NORMAL);
    this.graphics = scene.add.graphics().setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
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
    for (let index = 0; index < SKULL_FRAGMENT_COUNT; index += 1) {
      const angle = index * Math.PI * 2 / SKULL_FRAGMENT_COUNT + (index % 3) * 0.08;
      this.fragmentCos[index] = Math.cos(angle);
      this.fragmentSin[index] = Math.sin(angle);
    }
    this.renderers = {
      'death-signal': (state, elapsed, reducedDetail) => this.drawDeathSignal(state, elapsed, reducedDetail),
      'neon-bloom': (state, elapsed, reducedDetail) => this.drawNeonBloom(state, elapsed, reducedDetail)
    };
  }

  emitEquipped(cosmeticId: string | null, x: number, y: number, radius: number, now: number): boolean {
    const effectId = getCosmeticById(cosmeticId)?.bombExplosionEffect;
    if (!effectId) return false;
    this.emit(effectId, x, y, radius, now);
    return true;
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
    this.smokeGraphics.clear();
    this.graphics.clear();
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
    for (const state of this.states) state.active = false;
    this.smokeGraphics.clear();
    this.graphics.clear();
  }

  destroy(): void {
    this.reset();
    this.smokeGraphics.destroy();
    this.graphics.destroy();
  }

  get activeEffectCount(): number {
    let count = 0;
    for (const state of this.states) if (state.active) count += 1;
    return count;
  }

  private drawDeathSignal(state: BombExplosionCosmeticState, elapsed: number, reducedDetail: boolean): void {
    const lifetime = BOMB_EXPLOSION_COSMETIC_DEFINITIONS['death-signal'].lifetimeMs;
    const formation = easeOutBack(clamp01(elapsed / 360));
    const dissolve = 1 - clamp01((elapsed - 1_950) / (lifetime - 1_950));
    const settledFade = Math.min(1, elapsed / 120) * dissolve;
    const rise = easeOutCubic(clamp01((elapsed - 280) / 2_100)) * state.radius * 0.13;
    const breath = 1 + Math.sin(elapsed * 0.0048 + state.phase) * 0.018;
    const scale = (0.38 + formation * 0.62) * breath;
    const glitch = Math.sin(elapsed * 0.041 + state.phase * 3.1) * state.radius * 0.008 * dissolve;
    const centerX = state.x + glitch;
    const centerY = state.y - state.radius * 0.22 - rise;
    const width = state.radius * 0.62 * scale;
    const height = state.radius * 0.71 * scale;
    const shellAlpha = 0.72 * settledFade;

    // Dark plasma volume keeps the outline readable without becoming opaque.
    this.smokeGraphics.fillStyle(0x02050b, 0.22 * settledFade);
    this.smokeGraphics.fillEllipse(centerX, centerY - height * 0.08, width * 1.06, height * 0.78);
    this.smokeGraphics.fillStyle(0x132437, 0.08 * settledFade);
    this.smokeGraphics.fillEllipse(centerX, centerY, width * 0.92, height * 0.94);

    // Broken digital shock ring rides behind the skull during formation.
    const shockProgress = easeOutCubic(clamp01(elapsed / 620));
    const shockFade = 1 - clamp01((elapsed - 180) / 720);
    if (shockFade > 0) {
      const shockRadius = state.radius * (0.18 + shockProgress * 0.83);
      this.graphics.lineStyle(5 * shockFade + 1, 0x62efff, 0.56 * shockFade);
      this.graphics.strokeCircle(state.x, state.y, shockRadius);
      for (let segment = 0; segment < 10; segment += 1) {
        const angle = state.phase + segment * Math.PI * 0.2;
        this.graphics.lineStyle(segment % 2 ? 2 : 4, 0xff58cf, 0.74 * shockFade);
        this.graphics.beginPath();
        this.graphics.arc(state.x, state.y, shockRadius * 1.04, angle, angle + 0.09 + (segment % 3) * 0.025, false);
        this.graphics.strokePath();
      }
    }

    // Offset magenta back shell and bright cyan front shell create 2D volume.
    this.drawSkullShell(centerX + width * 0.025, centerY + height * 0.018, width * 1.025, height * 1.025, 0xff55ce, shellAlpha * 0.33, elapsed, true);
    this.drawSkullShell(centerX, centerY, width, height, 0x66efff, shellAlpha, elapsed, false);
    this.graphics.lineStyle(Math.max(1.2, width * 0.009), 0xffffff, 0.44 * settledFade);
    this.graphics.strokeEllipse(centerX, centerY - height * 0.13, width * 0.88, height * 0.61);

    // Dark sockets ignite after the skull snaps into place.
    const eyeIgnition = easeOutCubic(clamp01((elapsed - 250) / 230)) * dissolve;
    const eyePulse = 0.72 + Math.sin(elapsed * 0.019) * 0.18;
    const eyeY = centerY - height * 0.11;
    const eyeOffset = width * 0.205;
    const eyeWidth = width * 0.22;
    const eyeHeight = height * 0.17;
    this.smokeGraphics.fillStyle(0x010208, 0.88 * settledFade);
    this.smokeGraphics.fillEllipse(centerX - eyeOffset, eyeY, eyeWidth * 1.12, eyeHeight * 1.06);
    this.smokeGraphics.fillEllipse(centerX + eyeOffset, eyeY, eyeWidth * 1.12, eyeHeight * 1.06);
    this.graphics.fillStyle(0x6df4ff, 0.54 * eyeIgnition * eyePulse);
    this.graphics.fillEllipse(centerX - eyeOffset, eyeY, eyeWidth, eyeHeight);
    this.graphics.fillStyle(0xff55cf, 0.48 * eyeIgnition * eyePulse);
    this.graphics.fillEllipse(centerX + eyeOffset, eyeY, eyeWidth, eyeHeight);
    this.graphics.fillStyle(0xffffff, 0.78 * eyeIgnition);
    this.graphics.fillCircle(centerX - eyeOffset, eyeY, Math.max(1.5, width * 0.018));
    this.graphics.fillCircle(centerX + eyeOffset, eyeY, Math.max(1.5, width * 0.018));

    const scannerFade = (1 - clamp01((elapsed - 450) / 300)) * eyeIgnition;
    if (scannerFade > 0) {
      const scanX = centerX - width * 0.38 + width * 0.76 * clamp01((elapsed - 250) / 340);
      this.graphics.lineStyle(Math.max(1, width * 0.014), 0xffffff, 0.68 * scannerFade);
      this.graphics.lineBetween(scanX, eyeY - eyeHeight * 0.68, scanX, eyeY + eyeHeight * 0.68);
    }

    // Nose, teeth, and a cheap jaw drop make the silhouette unmistakable.
    this.graphics.fillStyle(0xff5acf, 0.58 * settledFade);
    this.graphics.fillTriangle(
      centerX, centerY + height * 0.02,
      centerX - width * 0.055, centerY + height * 0.13,
      centerX + width * 0.055, centerY + height * 0.13
    );
    const jawKick = Math.sin(clamp01((elapsed - 330) / 520) * Math.PI) * height * 0.055;
    const mouthY = centerY + height * 0.285 + jawKick;
    this.graphics.lineStyle(Math.max(1.2, width * 0.012), 0x8ff8ff, 0.72 * settledFade);
    this.graphics.lineBetween(centerX - width * 0.22, mouthY, centerX + width * 0.22, mouthY);
    for (let tooth = -2; tooth <= 2; tooth += 1) {
      const toothX = centerX + tooth * width * 0.075;
      this.graphics.lineBetween(toothX, mouthY - height * 0.065, toothX, mouthY + height * 0.07);
    }

    // Glitch bars shift around the apparition without fullscreen post effects.
    const glitchCount = reducedDetail ? 4 : 8;
    for (let index = 0; index < glitchCount; index += 1) {
      const cycle = (Math.floor(elapsed / 85) + index * 3) % 11;
      if (cycle > 4) continue;
      const lineY = centerY - height * 0.43 + index * height * 0.12;
      const offset = Math.sin(state.phase + index * 3.7 + elapsed * 0.03) * width * 0.12;
      this.graphics.fillStyle(index % 2 ? 0xff54ce : 0x73f5ff, 0.2 * settledFade);
      this.graphics.fillRect(centerX - width * 0.42 + offset, lineY, width * (0.18 + (index % 3) * 0.08), Math.max(1, height * 0.009));
    }

    this.drawSkullDissolve(state, centerX, centerY, width, height, elapsed, reducedDetail);
  }

  private drawSkullShell(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha: number,
    elapsed: number,
    rear: boolean
  ): void {
    this.graphics.lineStyle(Math.max(1.4, width * (rear ? 0.018 : 0.014)), color, alpha);
    this.graphics.strokeEllipse(x, y - height * 0.13, width * 0.9, height * 0.64);
    const jawDrop = Math.sin(clamp01((elapsed - 330) / 520) * Math.PI) * height * 0.055;
    this.graphics.beginPath();
    this.graphics.moveTo(x - width * 0.43, y - height * 0.02);
    this.graphics.lineTo(x - width * 0.36, y + height * 0.18);
    this.graphics.lineTo(x - width * 0.22, y + height * 0.35 + jawDrop);
    this.graphics.lineTo(x - width * 0.11, y + height * 0.45 + jawDrop);
    this.graphics.lineTo(x + width * 0.11, y + height * 0.45 + jawDrop);
    this.graphics.lineTo(x + width * 0.22, y + height * 0.35 + jawDrop);
    this.graphics.lineTo(x + width * 0.36, y + height * 0.18);
    this.graphics.lineTo(x + width * 0.43, y - height * 0.02);
    this.graphics.strokePath();
    if (rear) return;
    this.graphics.lineStyle(Math.max(1, width * 0.007), 0xff61d5, alpha * 0.62);
    this.graphics.lineBetween(x - width * 0.39, y - height * 0.29, x - width * 0.12, y - height * 0.42);
    this.graphics.lineBetween(x + width * 0.39, y - height * 0.29, x + width * 0.12, y - height * 0.42);
    this.graphics.lineBetween(x - width * 0.38, y + height * 0.08, x - width * 0.22, y + height * 0.2);
    this.graphics.lineBetween(x + width * 0.38, y + height * 0.08, x + width * 0.22, y + height * 0.2);
  }

  private drawSkullDissolve(
    state: BombExplosionCosmeticState,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    elapsed: number,
    reducedDetail: boolean
  ): void {
    const progress = clamp01((elapsed - 1_860) / 840);
    if (progress <= 0) return;
    const fade = 1 - progress;
    const count = reducedDetail ? 9 : SKULL_FRAGMENT_COUNT;
    for (let index = 0; index < count; index += 1) {
      const directionX = this.fragmentCos[index];
      const directionY = this.fragmentSin[index];
      const distance = state.radius * progress * (0.12 + (index % 5) * 0.055);
      const fragmentX = centerX + directionX * width * (0.22 + (index % 3) * 0.09) + directionX * distance;
      const fragmentY = centerY + directionY * height * 0.3 + directionY * distance - progress * height * 0.1;
      const size = Math.max(1.2, width * (0.018 + (index % 3) * 0.009) * fade);
      this.graphics.fillStyle(index % 3 === 0 ? 0xffffff : index % 2 ? 0xff58cf : 0x64efff, 0.85 * fade);
      this.graphics.fillRect(fragmentX, fragmentY, size * (index % 2 ? 2.2 : 1), size);
    }
  }

  private drawNeonBloom(state: BombExplosionCosmeticState, elapsed: number, reducedDetail: boolean): void {
    const lifetime = BOMB_EXPLOSION_COSMETIC_DEFINITIONS['neon-bloom'].lifetimeMs;
    const overallFade = Math.min(1, elapsed / 110) * (1 - clamp01((elapsed - 1_980) / (lifetime - 1_980)));
    const heroCount = reducedDetail ? 2 : 4;
    const mediumCount = reducedDetail ? 5 : 10;
    const flowerCount = heroCount + mediumCount;

    // A tinted, translucent pollen cloud binds the colorful flowers to the blast.
    const hazeProgress = easeOutCubic(clamp01(elapsed / 850));
    this.smokeGraphics.fillStyle(0x130921, 0.08 * overallFade);
    this.smokeGraphics.fillCircle(state.x, state.y, state.radius * (0.18 + hazeProgress * 0.52));
    this.smokeGraphics.fillStyle(0xff5bd4, 0.035 * overallFade);
    this.smokeGraphics.fillCircle(state.x - state.radius * 0.12, state.y - state.radius * 0.04, state.radius * 0.32);
    this.smokeGraphics.fillStyle(0x5ceeff, 0.035 * overallFade);
    this.smokeGraphics.fillCircle(state.x + state.radius * 0.14, state.y + state.radius * 0.05, state.radius * 0.29);

    const ringProgress = easeOutCubic(clamp01(elapsed / 680));
    const ringFade = 1 - clamp01((elapsed - 130) / 760);
    if (ringFade > 0) {
      this.graphics.lineStyle(4 * ringFade + 1, 0xff69d9, 0.58 * ringFade);
      this.graphics.strokeCircle(state.x, state.y, state.radius * (0.12 + ringProgress * 0.9));
      this.graphics.lineStyle(2, 0x67efff, 0.5 * ringFade);
      this.graphics.strokeCircle(state.x, state.y, state.radius * (0.08 + ringProgress * 0.72));
    }

    for (let index = 0; index < flowerCount; index += 1) {
      const hero = index < heroCount;
      const randomA = pseudoRandom(state.seed, index * 5 + 1);
      const randomB = pseudoRandom(state.seed, index * 5 + 2);
      const randomC = pseudoRandom(state.seed, index * 5 + 3);
      const stagger = index === 0 ? 80 : 120 + randomA * 390;
      const localElapsed = elapsed - stagger;
      if (localElapsed <= 0) continue;
      const bloom = easeOutBack(clamp01(localElapsed / (hero ? 430 : 340)));
      const flowerFade = (1 - clamp01((elapsed - (hero ? 2_020 : 1_760) - randomB * 180) / (hero ? 700 : 620))) * overallFade;
      if (flowerFade <= 0) continue;
      const angle = state.phase + index * 2.399963229728653 + (randomA - 0.5) * 0.5;
      const travel = easeOutCubic(clamp01(localElapsed / 960));
      const distanceBase = index === 0 ? 0.035 : hero ? 0.19 + randomB * 0.18 : 0.28 + randomB * 0.37;
      const distance = state.radius * distanceBase * travel;
      const drift = Math.sin(localElapsed * 0.003 + index) * state.radius * 0.012;
      const flowerX = state.x + Math.cos(angle) * distance - Math.sin(angle) * drift;
      const flowerY = state.y + Math.sin(angle) * distance + Math.cos(angle) * drift - state.radius * 0.07 * travel * travel;
      const baseRadius = state.radius * (hero ? 0.12 + randomC * 0.055 : 0.052 + randomC * 0.032);
      const radius = baseRadius * bloom * (1 + Math.sin(localElapsed * 0.004 + index) * 0.025);
      const petalCount = hero ? 7 + index % 3 : 5 + index % 4;
      const color = BLOOM_COLORS[(state.seed + index * 3) % BLOOM_COLORS.length];
      const coreColor = BLOOM_COLORS[(state.seed + index * 5 + 2) % BLOOM_COLORS.length];
      this.drawFlower(flowerX, flowerY, radius, petalCount, color, coreColor, angle + localElapsed * (index % 2 ? -0.00055 : 0.0007), flowerFade);
    }

    // Petals and pixel pollen are bounded and derived from the state's seed.
    const particleCount = reducedDetail ? 14 : 28;
    for (let index = 0; index < particleCount; index += 1) {
      const delay = 140 + pseudoRandom(state.seed, index * 7 + 40) * 450;
      const localElapsed = elapsed - delay;
      if (localElapsed <= 0) continue;
      const progress = clamp01(localElapsed / (1_550 + (index % 5) * 90));
      const fade = (1 - progress) * overallFade;
      const angle = state.phase + index * 2.399963229728653 + pseudoRandom(state.seed, index * 7 + 41) * 0.7;
      const distance = state.radius * progress * (0.34 + pseudoRandom(state.seed, index * 7 + 42) * 0.62);
      const curl = Math.sin(progress * 7 + index) * state.radius * 0.035;
      const px = state.x + Math.cos(angle) * distance - Math.sin(angle) * curl;
      const py = state.y + Math.sin(angle) * distance + Math.cos(angle) * curl + state.radius * progress * progress * 0.1;
      const size = Math.max(1.4, state.radius * (0.008 + (index % 3) * 0.004) * (0.55 + fade));
      const color = BLOOM_COLORS[(state.seed + index * 2) % BLOOM_COLORS.length];
      this.graphics.fillStyle(color, 0.82 * fade);
      if (index % 4 === 0) this.graphics.fillRect(px, py, size, size);
      else this.graphics.fillEllipse(px, py, size * 1.8, size * 0.72);
    }
  }

  private drawFlower(
    x: number,
    y: number,
    radius: number,
    petalCount: number,
    color: number,
    coreColor: number,
    rotation: number,
    alpha: number
  ): void {
    if (radius <= 0.5 || alpha <= 0) return;
    this.graphics.lineStyle(Math.max(1, radius * 0.045), color, 0.58 * alpha);
    for (let petal = 0; petal < petalCount; petal += 1) {
      const angle = rotation + petal / petalCount * Math.PI * 2;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      const petalX = x + directionX * radius * 0.58;
      const petalY = y + directionY * radius * 0.58;
      this.graphics.lineBetween(x, y, petalX, petalY);
      this.graphics.fillStyle(color, 0.17 * alpha);
      this.graphics.fillCircle(petalX, petalY, radius * 0.43);
      this.graphics.lineStyle(Math.max(1, radius * 0.035), color, 0.72 * alpha);
      this.graphics.strokeCircle(petalX, petalY, radius * 0.42);
    }
    this.graphics.fillStyle(coreColor, 0.78 * alpha);
    this.graphics.fillCircle(x, y, radius * 0.31);
    this.graphics.fillStyle(0xffffff, 0.62 * alpha);
    this.graphics.fillCircle(x, y, Math.max(1.4, radius * 0.1));
    this.graphics.lineStyle(Math.max(1, radius * 0.04), 0xffffff, 0.34 * alpha);
    this.graphics.strokeCircle(x, y, radius * 0.35);
  }
}
