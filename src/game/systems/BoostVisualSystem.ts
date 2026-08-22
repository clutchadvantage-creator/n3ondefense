import Phaser from 'phaser';
import type { DashTrailCosmeticEffectId } from '../types.ts';

export interface BoostFxCircleSpawn {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  depth: number;
  strokeWidth?: number;
  strokeColor?: number;
  strokeAlpha?: number;
}

interface BoostVisualSource { x: number; y: number; displayWidth: number; texture: { key: string } }
interface BoostVisualPool {
  obtain(state: BoostFxCircleSpawn): Phaser.GameObjects.Arc;
  release(circle: Phaser.GameObjects.Arc): void;
}
type AccentKind = 'grass' | 'plasma' | 'star';
interface TrailAccent {
  active: boolean;
  kind: AccentKind;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  size: number;
  rotation: number;
  spin: number;
  color: number;
  startedAt: number;
  lifetimeMs: number;
  phase: number;
}

export const BOOST_VISUAL_CONFIG = Object.freeze({
  emissionIntervalMs: 28,
  reducedEmissionIntervalMs: 58,
  smokeLifetimeMs: 1_080,
  ignitionSparkCount: 12,
  reducedIgnitionSparkCount: 6,
  maximumTrackedParticles: 88,
  maximumAccentParticles: 54
});

/**
 * Presentation-only dash exhaust. It reads the authoritative dash window but
 * never changes movement, timing, energy, collision, or other gameplay state.
 * Premium variants share one bounded pool and one batched Graphics layer.
 */
export class BoostVisualSystem {
  private readonly flame: Phaser.GameObjects.Graphics;
  private readonly accentGraphics: Phaser.GameObjects.Graphics;
  private readonly particles = new Set<Phaser.GameObjects.Arc>();
  private readonly vortexTweens = new Set<Phaser.Tweens.Tween>();
  private readonly accents: TrailAccent[];
  private activeUntil = 0;
  private nextEmissionAt = 0;
  private directionX = 1;
  private directionY = 0;
  private active = false;
  private currentEffect: DashTrailCosmeticEffectId = 'ion';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particlesEnabled: boolean,
    private readonly pool: BoostVisualPool,
    private readonly colorAt: (time: number) => number,
    private readonly effectAt: () => DashTrailCosmeticEffectId = () => 'ion'
  ) {
    this.flame = scene.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.accentGraphics = scene.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    this.accents = Array.from({ length: BOOST_VISUAL_CONFIG.maximumAccentParticles }, (): TrailAccent => ({
      active: false, kind: 'grass', x: 0, y: 0, velocityX: 0, velocityY: 0,
      size: 0, rotation: 0, spin: 0, color: 0xffffff, startedAt: 0, lifetimeMs: 0, phase: 0
    }));
  }

  start(source: BoostVisualSource, angle: number, now: number, activeUntil: number): void {
    this.directionX = Math.cos(angle);
    this.directionY = Math.sin(angle);
    this.currentEffect = this.effectAt();
    this.activeUntil = activeUntil;
    this.nextEmissionAt = now;
    this.active = true;
    this.flame.setVisible(true);
    this.emitIgnition(source, now);
  }

  update(source: BoostVisualSource, now: number): void {
    this.drawAccents(now);
    if (!this.active) return;
    if (now >= this.activeUntil) { this.finish(source, now); return; }
    this.drawFlame(source, now);
    if (now < this.nextEmissionAt) return;
    this.nextEmissionAt = now + (this.particlesEnabled ? BOOST_VISUAL_CONFIG.emissionIntervalMs : BOOST_VISUAL_CONFIG.reducedEmissionIntervalMs);
    this.emitTrail(source, now);
  }

  reset(): void {
    this.active = false;
    this.activeUntil = 0;
    this.nextEmissionAt = 0;
    this.flame.clear().setVisible(false);
    this.accentGraphics.clear();
    for (const accent of this.accents) accent.active = false;
    for (const tween of this.vortexTweens) tween.stop();
    this.vortexTweens.clear();
    for (const particle of [...this.particles]) this.releaseParticle(particle);
  }

  destroy(): void {
    this.reset();
    this.flame.destroy();
    this.accentGraphics.destroy();
  }

  private finish(source: BoostVisualSource, now: number): void {
    this.active = false;
    this.flame.clear().setVisible(false);
    if (this.currentEffect === 'bubbles') {
      for (let index = 0; index < (this.particlesEnabled ? 5 : 2); index += 1) this.emitBubble(source, now + index * 13);
      return;
    }
    if (this.currentEffect === 'grass-clippings' || this.currentEffect === 'stars' || this.currentEffect === 'plasma') {
      for (let index = 0; index < (this.particlesEnabled ? 6 : 3); index += 1) this.emitAccent(source, now + index * 7, this.accentKind());
      return;
    }
    const pairs = this.particlesEnabled ? 4 : 2;
    for (let index = 0; index < pairs; index += 1) {
      this.emitSmokeVortex(source, now + index * 23, -1, index * 0.7);
      this.emitSmokeVortex(source, now + index * 23, 1, index * 0.7 + Math.PI);
    }
  }

  private drawFlame(source: BoostVisualSource, now: number): void {
    const selectedColor = this.colorAt(now);
    const dx = this.directionX;
    const dy = this.directionY;
    const px = -dy;
    const py = dx;
    const bodyRear = Math.max(9, source.displayWidth * 0.25);
    const nozzleX = source.x - dx * bodyRear;
    const nozzleY = source.y - dy * bodyRear;
    const flicker = 0.5 + 0.5 * Math.sin(now * 0.09);
    const multiplier = this.currentEffect === 'jet-plume' ? 1.62 : this.currentEffect === 'fire-smoke' ? 1.34 : 1;
    const outerLength = (52 + flicker * 22) * multiplier;
    const innerLength = outerLength * 0.62;
    const wingOffset = this.wingOffset(source);
    const outerColor = this.currentEffect === 'fire-smoke' ? 0xff5726 : this.currentEffect === 'jet-plume' ? 0xffa94d : this.currentEffect === 'grass-clippings' ? 0x5cff70 : selectedColor;
    const innerColor = this.currentEffect === 'fire-smoke' ? 0xffe77a : this.currentEffect === 'plasma' ? 0x8cf8ff : 0xd8ffff;

    this.flame.clear();
    this.drawFlameCone(nozzleX, nozzleY, dx, dy, px, py, outerLength, 9.5, outerColor, 0.7);
    this.drawFlameCone(nozzleX, nozzleY, dx, dy, px, py, innerLength, 5.2, innerColor, 0.94);
    this.flame.fillStyle(0xffffff, 0.98).fillCircle(nozzleX, nozzleY, 2.8);
    if (this.currentEffect === 'jet-plume') this.drawShockDiamonds(nozzleX, nozzleY, dx, dy, px, py, outerLength);
    for (const side of [-1, 1]) {
      const jetX = source.x + px * wingOffset * side - dx * (bodyRear * 0.72);
      const jetY = source.y + py * wingOffset * side - dy * (bodyRear * 0.72);
      this.drawFlameCone(jetX, jetY, dx, dy, px, py, outerLength * 0.62, 3.8, side < 0 ? outerColor : selectedColor, 0.55);
      this.drawFlameCone(jetX, jetY, dx, dy, px, py, innerLength * 0.52, 1.8, 0xf2ffff, 0.86);
    }
  }

  private drawShockDiamonds(x: number, y: number, dx: number, dy: number, px: number, py: number, length: number): void {
    for (let index = 1; index <= 3; index += 1) {
      const cx = x - dx * length * index * 0.2;
      const cy = y - dy * length * index * 0.2;
      const radius = 5.8 - index * 0.8;
      this.flame.lineStyle(1.6, index % 2 ? 0x6ef2ff : 0xffb64d, 0.72);
      this.flame.beginPath();
      this.flame.moveTo(cx + px * radius, cy + py * radius);
      this.flame.lineTo(cx - dx * radius * 1.5, cy - dy * radius * 1.5);
      this.flame.lineTo(cx - px * radius, cy - py * radius);
      this.flame.lineTo(cx + dx * radius * 1.5, cy + dy * radius * 1.5);
      this.flame.closePath();
      this.flame.strokePath();
    }
  }

  private drawFlameCone(x: number, y: number, dx: number, dy: number, px: number, py: number, length: number, halfWidth: number, color: number, alpha: number): void {
    this.flame.fillStyle(color, alpha);
    this.flame.fillTriangle(x + px * halfWidth, y + py * halfWidth, x - px * halfWidth, y - py * halfWidth, x - dx * length, y - dy * length);
  }

  private emitIgnition(source: BoostVisualSource, now: number): void {
    const color = this.colorAt(now);
    for (let index = 0; index < 2; index += 1) {
      const ring = this.obtainParticle({ x: source.x, y: source.y, radius: 9 + index * 5, color, alpha: 0.08, depth: 7, strokeWidth: 2.4, strokeColor: index === 0 ? 0xffffff : color, strokeAlpha: 0.9 - index * 0.2 });
      if (!ring) continue;
      ring.setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: ring, radius: 42 + index * 14, alpha: 0, duration: 280 + index * 80, ease: 'Quad.Out', onComplete: () => this.releaseParticle(ring) });
    }
    const count = this.particlesEnabled ? BOOST_VISUAL_CONFIG.ignitionSparkCount : BOOST_VISUAL_CONFIG.reducedIgnitionSparkCount;
    for (let index = 0; index < count; index += 1) this.emitSpark(source.x, source.y, color, index - count / 2, count);
  }

  private emitTrail(source: BoostVisualSource, now: number): void {
    if (this.currentEffect === 'grass-clippings' || this.currentEffect === 'plasma' || this.currentEffect === 'stars') {
      const count = this.particlesEnabled ? 3 : 1;
      for (let index = 0; index < count; index += 1) this.emitAccent(source, now + index, this.accentKind());
      if (this.currentEffect === 'plasma') this.emitEmber(source, now);
      return;
    }
    if (this.currentEffect === 'bubbles') {
      this.emitBubble(source, now);
      if (this.particlesEnabled) this.emitBubble(source, now + 3);
      return;
    }
    this.emitSmokeVortex(source, now, -1, now * 0.017);
    this.emitSmokeVortex(source, now, 1, now * 0.017 + Math.PI);
    this.emitEmber(source, now);
    if (this.currentEffect === 'fire-smoke' && this.particlesEnabled) this.emitEmber(source, now + 4);
    if (!this.particlesEnabled) return;
    this.emitSpark(source.x, source.y, this.currentEffect === 'fire-smoke' ? 0xffc95b : this.colorAt(now), -1, 2);
    this.emitSpark(source.x, source.y, this.currentEffect === 'jet-plume' ? 0x69f4ff : 0xff65c8, 1, 2);
  }

  private accentKind(): AccentKind {
    return this.currentEffect === 'grass-clippings' ? 'grass' : this.currentEffect === 'stars' ? 'star' : 'plasma';
  }

  private emitAccent(source: BoostVisualSource, now: number, kind: AccentKind): void {
    let accent: TrailAccent | undefined;
    for (const candidate of this.accents) if (!candidate.active) { accent = candidate; break; }
    if (!accent) return;
    const px = -this.directionY;
    const py = this.directionX;
    const lateral = Phaser.Math.FloatBetween(-this.wingOffset(source), this.wingOffset(source));
    const backwardSpeed = Phaser.Math.FloatBetween(105, 155);
    const sideSpeed = Phaser.Math.FloatBetween(-48, 48);
    accent.active = true;
    accent.kind = kind;
    accent.x = source.x + px * lateral - this.directionX * 8;
    accent.y = source.y + py * lateral - this.directionY * 8;
    accent.velocityX = -this.directionX * backwardSpeed + px * sideSpeed;
    accent.velocityY = -this.directionY * backwardSpeed + py * sideSpeed;
    accent.size = kind === 'star' ? Phaser.Math.FloatBetween(3.8, 7.2) : kind === 'grass' ? Phaser.Math.FloatBetween(4, 9) : Phaser.Math.FloatBetween(3, 6);
    accent.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
    accent.spin = Phaser.Math.FloatBetween(-7, 7);
    accent.color = kind === 'grass' ? (Math.random() > 0.35 ? 0x64ff58 : 0xd9ff65) : kind === 'star' ? (Math.random() > 0.4 ? 0xffed68 : 0xff72d7) : (Math.random() > 0.5 ? 0xb75cff : 0x65efff);
    accent.startedAt = now;
    accent.lifetimeMs = kind === 'star' ? 1_150 : kind === 'grass' ? 980 : 850;
    accent.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
  }

  private drawAccents(now: number): void {
    this.accentGraphics.clear();
    for (const accent of this.accents) {
      if (!accent.active) continue;
      const elapsed = now - accent.startedAt;
      const progress = elapsed / accent.lifetimeMs;
      if (progress >= 1) { accent.active = false; continue; }
      const seconds = elapsed * 0.001;
      const fade = 1 - progress;
      const x = accent.x + accent.velocityX * seconds + Math.sin(progress * 9 + accent.phase) * 6;
      const y = accent.y + accent.velocityY * seconds + Math.cos(progress * 8 + accent.phase) * 5;
      const rotation = accent.rotation + accent.spin * seconds;
      if (accent.kind === 'grass') {
        const dx = Math.cos(rotation) * accent.size;
        const dy = Math.sin(rotation) * accent.size;
        this.accentGraphics.lineStyle(Math.max(1.3, accent.size * 0.3), accent.color, 0.9 * fade).lineBetween(x - dx, y - dy, x + dx, y + dy);
      } else if (accent.kind === 'plasma') {
        const dx = Math.cos(rotation) * accent.size;
        const dy = Math.sin(rotation) * accent.size;
        this.accentGraphics.lineStyle(2.2, accent.color, 0.92 * fade).beginPath();
        this.accentGraphics.moveTo(x - dx * 2, y - dy * 2);
        this.accentGraphics.lineTo(x + dy, y - dx);
        this.accentGraphics.lineTo(x + dx * 2, y + dy * 2);
        this.accentGraphics.strokePath();
      } else this.drawStar(x, y, accent.size * (0.72 + fade * 0.28), rotation, accent.color, 0.9 * fade);
    }
  }

  private drawStar(x: number, y: number, radius: number, rotation: number, color: number, alpha: number): void {
    this.accentGraphics.fillStyle(color, alpha).beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = rotation - Math.PI * 0.5 + point * Math.PI / 5;
      const distance = point % 2 === 0 ? radius : radius * 0.42;
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (point === 0) this.accentGraphics.moveTo(px, py); else this.accentGraphics.lineTo(px, py);
    }
    this.accentGraphics.closePath().fillPath();
  }

  private emitBubble(source: BoostVisualSource, now: number): void {
    const px = -this.directionY;
    const py = this.directionX;
    const lateral = Phaser.Math.FloatBetween(-this.wingOffset(source), this.wingOffset(source));
    const color = Math.random() > 0.35 ? this.colorAt(now) : 0xff84df;
    const bubble = this.obtainParticle({ x: source.x + px * lateral, y: source.y + py * lateral, radius: Phaser.Math.FloatBetween(4.5, 9), color, alpha: 0.035, depth: 7, strokeWidth: 1.7, strokeColor: color, strokeAlpha: 0.88 });
    if (!bubble) return;
    bubble.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: bubble, x: bubble.x - this.directionX * Phaser.Math.Between(90, 145) + px * Phaser.Math.Between(-24, 24), y: bubble.y - this.directionY * Phaser.Math.Between(90, 145) + py * Phaser.Math.Between(-24, 24), radius: bubble.radius * 1.45, alpha: 0, duration: Phaser.Math.Between(900, 1_250), ease: 'Sine.easeOut', onComplete: () => this.releaseParticle(bubble) });
  }

  private emitSmokeVortex(source: BoostVisualSource, now: number, side: -1 | 1, phase: number): void {
    const color = this.colorAt(now);
    const dx = this.directionX;
    const dy = this.directionY;
    const px = -dy;
    const py = dx;
    const wingOffset = this.wingOffset(source);
    const startX = source.x + px * wingOffset * side - dx * 8;
    const startY = source.y + py * wingOffset * side - dy * 8;
    const smokeColor = this.currentEffect === 'fire-smoke' ? 0x4e4244 : this.currentEffect === 'jet-plume' ? 0x60717d : 0x7592a0;
    const smoke = this.obtainParticle({ x: startX, y: startY, radius: this.particlesEnabled ? Phaser.Math.FloatBetween(4.8, 7.5) : 5.4, color: smokeColor, alpha: this.currentEffect === 'fire-smoke' ? 0.42 : 0.34, depth: 6, strokeWidth: 1.2, strokeColor: this.currentEffect === 'fire-smoke' ? 0xff6a28 : color, strokeAlpha: 0.55 });
    if (!smoke) return;
    const travel = Phaser.Math.FloatBetween(112, 158) * (this.currentEffect === 'jet-plume' ? 1.22 : 1);
    const swirlRadius = Phaser.Math.FloatBetween(7, 13);
    const duration = BOOST_VISUAL_CONFIG.smokeLifetimeMs + Phaser.Math.Between(-90, 180);
    let vortexTween: Phaser.Tweens.Tween | null = null;
    vortexTween = this.scene.tweens.addCounter({
      from: 0, to: 1, duration, ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        if (!smoke.active) return;
        const progress = tween.getValue() ?? 0;
        const curl = Math.sin(progress * Math.PI * 3.2 + phase) * swirlRadius * (1 - progress * 0.35);
        const separation = side * wingOffset * progress * 0.5;
        smoke.setPosition(startX - dx * travel * progress + px * (curl + separation), startY - dy * travel * progress + py * (curl + separation));
        smoke.setScale(0.72 + progress * 2.15).setAlpha(Math.max(0, (this.currentEffect === 'fire-smoke' ? 0.44 : 0.37) * (1 - progress)));
      },
      onComplete: () => { if (vortexTween) this.vortexTweens.delete(vortexTween); this.releaseParticle(smoke); }
    });
    this.vortexTweens.add(vortexTween);
  }

  private emitEmber(source: BoostVisualSource, now: number): void {
    const color = this.currentEffect === 'fire-smoke' ? (Math.random() > 0.5 ? 0xff5a1f : 0xffd55c) : this.colorAt(now);
    const px = -this.directionY;
    const py = this.directionX;
    const lateral = Phaser.Math.FloatBetween(-8, 8);
    const ember = this.obtainParticle({ x: source.x + px * lateral - this.directionX * 10, y: source.y + py * lateral - this.directionY * 10, radius: Phaser.Math.FloatBetween(2, 3.8), color, alpha: 0.96, depth: 7 });
    if (!ember) return;
    ember.setBlendMode(Phaser.BlendModes.ADD).setScale(2.1, 0.62).setRotation(Math.atan2(this.directionY, this.directionX));
    this.scene.tweens.add({ targets: ember, x: ember.x - this.directionX * Phaser.Math.Between(52, 82), y: ember.y - this.directionY * Phaser.Math.Between(52, 82), alpha: 0, scaleX: 0.4, scaleY: 0.2, duration: Phaser.Math.Between(360, 520), ease: 'Quad.Out', onComplete: () => this.releaseParticle(ember) });
  }

  private emitSpark(x: number, y: number, color: number, index: number, total: number): void {
    const spread = total <= 1 ? 0 : index / Math.max(1, total - 1);
    const angle = Math.atan2(-this.directionY, -this.directionX) + spread * 1.25 + Phaser.Math.FloatBetween(-0.45, 0.45);
    const distance = Phaser.Math.Between(36, 76);
    const spark = this.obtainParticle({ x, y, radius: Phaser.Math.FloatBetween(1.2, 2.8), color, alpha: 0.98, depth: 7 });
    if (!spark) return;
    spark.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: spark, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.2, duration: Phaser.Math.Between(240, 430), ease: 'Quad.Out', onComplete: () => this.releaseParticle(spark) });
  }

  private wingOffset(source: BoostVisualSource): number {
    const wideFrame = source.texture.key === 'player-airplane' || source.texture.key === 'player-spaceship';
    return Math.max(7, source.displayWidth * (wideFrame ? 0.43 : 0.3));
  }

  private obtainParticle(state: BoostFxCircleSpawn): Phaser.GameObjects.Arc | null {
    if (this.particles.size >= BOOST_VISUAL_CONFIG.maximumTrackedParticles) return null;
    const particle = this.pool.obtain(state);
    this.particles.add(particle);
    return particle;
  }

  private releaseParticle(particle: Phaser.GameObjects.Arc): void {
    if (!this.particles.delete(particle)) return;
    this.scene.tweens.killTweensOf(particle);
    this.pool.release(particle);
  }
}
