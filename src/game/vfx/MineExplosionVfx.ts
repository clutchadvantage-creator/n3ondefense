import Phaser from 'phaser';
import type { MineExplosionPalette } from '../abilities/Mine.ts';

const EXPLOSION_LIFETIME_MS = 680;
const MAX_ACTIVE_EXPLOSIONS = 18;
const REDUCED_ACTIVE_EXPLOSIONS = 10;
const FULL_RAY_COUNT = 18;
const REDUCED_RAY_COUNT = 10;
const FULL_FRAGMENT_COUNT = 12;
const REDUCED_FRAGMENT_COUNT = 6;

interface MineExplosionState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  startedAt: number;
  phase: number;
  palette: MineExplosionPalette;
}

const EMPTY_PALETTE: MineExplosionPalette = [0xffffff, 0xffffff, 0xffffff, 0xffffff];
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

/**
 * One batched, allocation-free renderer for every active mine detonation.
 * Gameplay damage and radius remain owned by ArenaScene; this class only draws.
 */
export class MineExplosionVfx {
  readonly maximumActiveExplosions: number;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly states: MineExplosionState[];
  private readonly rayCos = new Float32Array(FULL_RAY_COUNT);
  private readonly raySin = new Float32Array(FULL_RAY_COUNT);
  private readonly fragmentCos = new Float32Array(FULL_FRAGMENT_COUNT);
  private readonly fragmentSin = new Float32Array(FULL_FRAGMENT_COUNT);
  private sequence = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly particlesEnabled: boolean) {
    this.maximumActiveExplosions = particlesEnabled ? MAX_ACTIVE_EXPLOSIONS : REDUCED_ACTIVE_EXPLOSIONS;
    this.graphics = scene.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    this.states = Array.from({ length: this.maximumActiveExplosions }, (): MineExplosionState => ({
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      startedAt: 0,
      phase: 0,
      palette: EMPTY_PALETTE
    }));
    for (let index = 0; index < FULL_RAY_COUNT; index += 1) {
      const angle = index * Math.PI * 2 / FULL_RAY_COUNT;
      this.rayCos[index] = Math.cos(angle);
      this.raySin[index] = Math.sin(angle);
    }
    for (let index = 0; index < FULL_FRAGMENT_COUNT; index += 1) {
      const angle = index * Math.PI * 2 / FULL_FRAGMENT_COUNT + (index % 3) * 0.09;
      this.fragmentCos[index] = Math.cos(angle);
      this.fragmentSin[index] = Math.sin(angle);
    }
  }

  emit(x: number, y: number, radius: number, palette: MineExplosionPalette, now: number): void {
    let state = this.states[0];
    let oldestStartedAt = Number.POSITIVE_INFINITY;
    for (const candidate of this.states) {
      if (!candidate.active) {
        state = candidate;
        oldestStartedAt = Number.NEGATIVE_INFINITY;
        break;
      }
      if (candidate.startedAt < oldestStartedAt) {
        oldestStartedAt = candidate.startedAt;
        state = candidate;
      }
    }
    state.active = true;
    state.x = x;
    state.y = y;
    state.radius = radius;
    state.startedAt = now;
    state.phase = (this.sequence * 2.399963229728653) % (Math.PI * 2);
    state.palette = palette;
    this.sequence += 1;

    // force=false prevents rapid mine chains from repeatedly restarting shake.
    this.scene.cameras.main.shake(260, 0.008, false);
  }

  update(now: number): void {
    this.graphics.clear();
    for (const state of this.states) {
      if (!state.active) continue;
      const elapsed = now - state.startedAt;
      if (elapsed >= EXPLOSION_LIFETIME_MS) {
        state.active = false;
        continue;
      }
      this.drawExplosion(state, elapsed);
    }
  }

  reset(): void {
    for (const state of this.states) state.active = false;
    this.graphics.clear();
  }

  destroy(): void {
    this.reset();
    this.graphics.destroy();
  }

  get activeExplosionCount(): number {
    let count = 0;
    for (const state of this.states) if (state.active) count += 1;
    return count;
  }

  private drawExplosion(state: MineExplosionState, elapsed: number): void {
    const { x, y, radius, palette, phase } = state;
    const lifetimeProgress = clamp01(elapsed / EXPLOSION_LIFETIME_MS);
    const lifetimeFade = (1 - lifetimeProgress) ** 1.5;
    const phaseCos = Math.cos(phase);
    const phaseSin = Math.sin(phase);

    // A restrained floor response anchors the otherwise airborne neon energy.
    const floorProgress = easeOutCubic(clamp01(elapsed / 420));
    this.graphics.fillStyle(palette[3], 0.075 * lifetimeFade);
    this.graphics.fillCircle(x, y, radius * (0.25 + floorProgress * 0.72));
    this.graphics.lineStyle(Math.max(1, 3.5 * lifetimeFade), palette[2], 0.22 * lifetimeFade);
    this.graphics.strokeCircle(x, y, radius * (0.18 + floorProgress * 0.78));

    // The first 120 ms contains the concentrated white-hot core and plasma bloom.
    const coreFade = 1 - clamp01(elapsed / 125);
    if (coreFade > 0) {
      const flashProgress = easeOutCubic(clamp01(elapsed / 80));
      this.graphics.fillStyle(palette[1], 0.24 * coreFade);
      this.graphics.fillCircle(x, y, radius * (0.25 + flashProgress * 0.19));
      this.graphics.fillStyle(palette[0], 0.88 * coreFade);
      this.graphics.fillCircle(x, y, radius * (0.08 + flashProgress * 0.11));
      this.graphics.fillStyle(0xffffff, 0.82 * coreFade);
      this.graphics.fillCircle(x, y, radius * (0.035 + flashProgress * 0.04));
    }

    // Two thin wave fronts communicate the blast without creating opaque discs.
    const primaryProgress = easeOutCubic(clamp01((elapsed - 24) / 330));
    if (elapsed >= 24 && primaryProgress < 1) {
      const waveFade = 1 - primaryProgress;
      this.graphics.lineStyle(2 + waveFade * 5, palette[1], 0.94 * waveFade);
      this.graphics.strokeCircle(x, y, radius * (0.1 + primaryProgress * 0.9));
      this.graphics.lineStyle(1.5 + waveFade * 2.5, palette[0], 0.48 * waveFade);
      this.graphics.strokeCircle(x, y, radius * (0.07 + primaryProgress * 0.93));
    }
    const secondaryProgress = easeOutCubic(clamp01((elapsed - 78) / 390));
    if (elapsed >= 78 && secondaryProgress < 1) {
      const waveFade = 1 - secondaryProgress;
      this.graphics.lineStyle(1.5 + waveFade * 3, palette[2], 0.72 * waveFade);
      this.graphics.strokeCircle(x, y, radius * (0.12 + secondaryProgress * 1.06));
    }

    // Sharp radial energy spikes peak early, then retract visually into fragments.
    const rayProgress = easeOutCubic(clamp01(elapsed / 250));
    const rayFade = 1 - clamp01((elapsed - 80) / 290);
    if (rayFade > 0) {
      const rayCount = this.particlesEnabled ? FULL_RAY_COUNT : REDUCED_RAY_COUNT;
      for (let index = 0; index < rayCount; index += 1) {
        const baseX = this.rayCos[index];
        const baseY = this.raySin[index];
        const directionX = baseX * phaseCos - baseY * phaseSin;
        const directionY = baseX * phaseSin + baseY * phaseCos;
        const inner = radius * (0.05 + (index % 3) * 0.018);
        const outer = radius * (0.34 + rayProgress * (0.34 + (index % 4) * 0.075));
        const color = index % 4 === 0 ? palette[0] : index % 2 === 0 ? palette[1] : palette[2];
        this.graphics.lineStyle(index % 4 === 0 ? 2 : 3.5, color, (index % 4 === 0 ? 0.9 : 0.68) * rayFade);
        this.graphics.lineBetween(
          x + directionX * inner,
          y + directionY * inner,
          x + directionX * outer,
          y + directionY * outer
        );
      }
    }

    // Jagged rotating plasma arcs keep the silhouette electrical rather than fiery.
    const arcFade = 1 - clamp01((elapsed - 55) / 470);
    if (elapsed >= 40 && arcFade > 0) {
      for (let index = 0; index < 5; index += 1) {
        const arcRadius = radius * (0.22 + index * 0.105 + lifetimeProgress * 0.18);
        const start = phase + index * 1.37 - lifetimeProgress * (index % 2 === 0 ? 0.9 : -0.7);
        this.graphics.lineStyle(index % 2 === 0 ? 2.5 : 1.5, index % 2 === 0 ? palette[2] : palette[1], 0.62 * arcFade);
        this.graphics.beginPath();
        this.graphics.arc(x, y, arcRadius, start, start + 0.48 + index * 0.06, false);
        this.graphics.strokePath();
      }
    }

    // Bounded fragments are drawn into this same batch; there are no sprites,
    // physics bodies, particle emitters, or per-fragment tweens.
    const fragmentProgress = easeOutCubic(clamp01((elapsed - 45) / 540));
    const fragmentFade = 1 - clamp01((elapsed - 190) / 450);
    if (elapsed >= 45 && fragmentFade > 0) {
      const fragmentCount = this.particlesEnabled ? FULL_FRAGMENT_COUNT : REDUCED_FRAGMENT_COUNT;
      for (let index = 0; index < fragmentCount; index += 1) {
        const baseX = this.fragmentCos[index];
        const baseY = this.fragmentSin[index];
        const directionX = baseX * phaseCos - baseY * phaseSin;
        const directionY = baseX * phaseSin + baseY * phaseCos;
        const distance = radius * fragmentProgress * (0.52 + (index % 4) * 0.17);
        const fragmentX = x + directionX * distance;
        const fragmentY = y + directionY * distance + radius * 0.08 * fragmentProgress * fragmentProgress;
        const size = Math.max(1.2, radius * (0.018 + (index % 3) * 0.006) * fragmentFade);
        const tangentX = -directionY * size;
        const tangentY = directionX * size;
        this.graphics.fillStyle(index % 3 === 0 ? palette[0] : index % 2 === 0 ? palette[1] : palette[2], 0.88 * fragmentFade);
        this.graphics.fillTriangle(
          fragmentX + directionX * size * 1.8,
          fragmentY + directionY * size * 1.8,
          fragmentX + tangentX,
          fragmentY + tangentY,
          fragmentX - tangentX,
          fragmentY - tangentY
        );
      }
    }

    // Short, narrow crack traces vanish with the blast and never accumulate.
    const crackFade = 1 - clamp01(elapsed / 430);
    if (crackFade > 0) {
      for (let index = 0; index < 7; index += 1) {
        const baseX = this.rayCos[index * 2];
        const baseY = this.raySin[index * 2];
        const directionX = baseX * phaseCos - baseY * phaseSin;
        const directionY = baseX * phaseSin + baseY * phaseCos;
        const middle = radius * (0.18 + (index % 3) * 0.04);
        const end = radius * (0.36 + (index % 2) * 0.08);
        this.graphics.lineStyle(1.5, index % 2 === 0 ? palette[1] : palette[2], 0.38 * crackFade);
        this.graphics.beginPath();
        this.graphics.moveTo(x + directionX * radius * 0.08, y + directionY * radius * 0.08);
        this.graphics.lineTo(
          x + directionX * middle - directionY * radius * 0.035,
          y + directionY * middle + directionX * radius * 0.035
        );
        this.graphics.lineTo(x + directionX * end, y + directionY * end);
        this.graphics.strokePath();
      }
    }

    // A compact plasma afterglow gives the fading blast some volume.
    const cloudFade = 1 - clamp01((elapsed - 90) / 500);
    if (elapsed >= 70 && cloudFade > 0) {
      for (let index = 0; index < 5; index += 1) {
        const baseX = this.fragmentCos[index * 2];
        const baseY = this.fragmentSin[index * 2];
        const offset = radius * (0.08 + index * 0.018);
        this.graphics.fillStyle(index % 2 === 0 ? palette[1] : palette[2], 0.055 * cloudFade);
        this.graphics.fillCircle(
          x + baseX * offset,
          y + baseY * offset,
          radius * (0.18 + index * 0.018) * (0.7 + lifetimeProgress * 0.55)
        );
      }
    }
  }
}
