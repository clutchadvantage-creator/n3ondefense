import Phaser from 'phaser';

interface MuzzleFlashState {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  color: number;
  smokeColor: number;
  startedAt: number;
  durationMs: number;
  intensity: number;
  phase: number;
}

const TAU = Math.PI * 2;
const FULL_QUALITY_SLOTS = 12;
const REDUCED_QUALITY_SLOTS = 7;
const FULL_QUALITY_SPARKS = 4;
const REDUCED_QUALITY_SPARKS = 2;
const FULL_QUALITY_SMOKE_WISPS = 3;
const REDUCED_QUALITY_SMOKE_WISPS = 1;
const MUZZLE_FLASH_LIFETIME_MS = 150;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const mixColor = (source: number, target: number, amount: number): number => {
  const inverse = 1 - amount;
  const red = Math.round(((source >> 16) & 0xff) * inverse + ((target >> 16) & 0xff) * amount);
  const green = Math.round(((source >> 8) & 0xff) * inverse + ((target >> 8) & 0xff) * amount);
  const blue = Math.round((source & 0xff) * inverse + (target & 0xff) * amount);
  return (red << 16) | (green << 8) | blue;
};

/**
 * Compact, bounded player muzzle VFX. A pair of Graphics objects renders every
 * active flash, so rapid fire never constructs per-shot display objects,
 * tweens, emitters, timers, or listeners.
 */
export class PlayerMuzzleFlashVfx {
  private readonly smokeGraphics: Phaser.GameObjects.Graphics;
  private readonly flameGraphics: Phaser.GameObjects.Graphics;
  private readonly states: MuzzleFlashState[];
  private readonly sparkCount: number;
  private readonly smokeWispCount: number;
  private sequence = 0;

  constructor(scene: Phaser.Scene, particlesEnabled = true) {
    this.smokeGraphics = scene.add.graphics()
      .setDepth(7.85)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.flameGraphics = scene.add.graphics()
      .setDepth(9.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sparkCount = particlesEnabled ? FULL_QUALITY_SPARKS : REDUCED_QUALITY_SPARKS;
    this.smokeWispCount = particlesEnabled ? FULL_QUALITY_SMOKE_WISPS : REDUCED_QUALITY_SMOKE_WISPS;
    this.states = Array.from(
      { length: particlesEnabled ? FULL_QUALITY_SLOTS : REDUCED_QUALITY_SLOTS },
      (): MuzzleFlashState => ({
        active: false,
        x: 0,
        y: 0,
        angle: 0,
        color: 0xffffff,
        smokeColor: 0x83949d,
        startedAt: 0,
        durationMs: MUZZLE_FLASH_LIFETIME_MS,
        intensity: 1,
        phase: 0
      })
    );
  }

  emit(x: number, y: number, angle: number, color: number, now: number, intensity = 1): void {
    let slot = this.states[0];
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const candidate of this.states) {
      if (!candidate.active) {
        slot = candidate;
        oldestAt = Number.NEGATIVE_INFINITY;
        break;
      }
      if (candidate.startedAt < oldestAt) {
        oldestAt = candidate.startedAt;
        slot = candidate;
      }
    }

    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.angle = angle;
    slot.color = color;
    // Cosmetic color remains present in the translucent smoke without turning
    // it into another solid neon disc.
    slot.smokeColor = mixColor(color, 0x83949d, 0.7);
    slot.startedAt = now;
    slot.durationMs = MUZZLE_FLASH_LIFETIME_MS;
    slot.intensity = Math.max(0.75, Math.min(1.25, intensity));
    slot.phase = (this.sequence * 2.399963229728653) % TAU;
    this.sequence += 1;
  }

  update(now: number): void {
    this.smokeGraphics.clear();
    this.flameGraphics.clear();
    for (const state of this.states) {
      if (!state.active) continue;
      const progress = clamp01((now - state.startedAt) / state.durationMs);
      if (progress >= 1) {
        state.active = false;
        continue;
      }
      this.drawFlame(state, progress);
      this.drawSmoke(state, progress);
    }
  }

  reset(): void {
    for (const state of this.states) state.active = false;
    this.smokeGraphics.clear();
    this.flameGraphics.clear();
  }

  destroy(): void {
    this.reset();
    this.smokeGraphics.destroy();
    this.flameGraphics.destroy();
  }

  get activeCount(): number {
    let count = 0;
    for (const state of this.states) if (state.active) count += 1;
    return count;
  }

  private drawFlame(state: MuzzleFlashState, progress: number): void {
    const directionX = Math.cos(state.angle);
    const directionY = Math.sin(state.angle);
    const tangentX = -directionY;
    const tangentY = directionX;
    const intensity = state.intensity;
    const fade = (1 - progress) ** 2.25;
    const baseHalfWidth = (2.4 + (1 - progress) * 0.9) * intensity;
    const reach = (7.5 + (1 - progress) * 7.5) * intensity;
    const baseX = state.x + directionX * 1.5;
    const baseY = state.y + directionY * 1.5;
    const tipX = state.x + directionX * reach;
    const tipY = state.y + directionY * reach;

    // A narrow directional flame replaces the old expanding filled circle.
    this.flameGraphics.fillStyle(state.color, 0.78 * fade).fillTriangle(
      baseX + tangentX * baseHalfWidth,
      baseY + tangentY * baseHalfWidth,
      baseX - tangentX * baseHalfWidth,
      baseY - tangentY * baseHalfWidth,
      tipX,
      tipY
    );
    this.flameGraphics.fillStyle(0xffffff, 0.88 * fade)
      .fillCircle(baseX + directionX * 1.4, baseY + directionY * 1.4, 1.45 * intensity * (0.55 + fade * 0.45));

    for (let index = 0; index < this.sparkCount; index += 1) {
      const spreadUnit = this.sparkCount === 1 ? 0 : index / (this.sparkCount - 1) - 0.5;
      const sparkAngle = state.angle + spreadUnit * 0.5 + Math.sin(state.phase + index * 1.7) * 0.055;
      const sparkDirectionX = Math.cos(sparkAngle);
      const sparkDirectionY = Math.sin(sparkAngle);
      const sparkStart = 3 + index * 0.55;
      const sparkLength = (7 + (index % 2) * 3.2) * intensity * (0.8 + (1 - progress) * 0.2);
      this.flameGraphics.lineStyle(index % 2 === 0 ? 1.45 : 1, index % 2 === 0 ? state.color : 0xffffff, 0.64 * fade);
      this.flameGraphics.lineBetween(
        state.x + sparkDirectionX * sparkStart,
        state.y + sparkDirectionY * sparkStart,
        state.x + sparkDirectionX * sparkLength,
        state.y + sparkDirectionY * sparkLength
      );
    }
  }

  private drawSmoke(state: MuzzleFlashState, progress: number): void {
    const smokeProgress = clamp01((progress - 0.12) / 0.88);
    if (smokeProgress <= 0) return;
    const directionX = Math.cos(state.angle);
    const directionY = Math.sin(state.angle);
    const tangentX = -directionY;
    const tangentY = directionX;
    const fade = (1 - smokeProgress) ** 1.4;

    for (let index = 0; index < this.smokeWispCount; index += 1) {
      const offset = index - (this.smokeWispCount - 1) * 0.5;
      const curl = Math.sin(state.phase + index * 2.1 + smokeProgress * 3.2) * (1.1 + smokeProgress * 1.8);
      const drift = 1.5 + smokeProgress * (4.5 + index * 0.8);
      const x = state.x - directionX * drift + tangentX * (offset * 1.6 + curl);
      const y = state.y - directionY * drift + tangentY * (offset * 1.6 + curl);
      const radius = (1.15 + index * 0.35 + smokeProgress * 1.7) * state.intensity;
      this.smokeGraphics.fillStyle(state.smokeColor, (0.11 + index * 0.015) * fade)
        .fillCircle(x, y, radius);
    }
  }
}
