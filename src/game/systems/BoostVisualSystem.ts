import Phaser from 'phaser';

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

interface BoostVisualSource {
  x: number;
  y: number;
  displayWidth: number;
  texture: { key: string };
}

interface BoostVisualPool {
  obtain(state: BoostFxCircleSpawn): Phaser.GameObjects.Arc;
  release(circle: Phaser.GameObjects.Arc): void;
}

export const BOOST_VISUAL_CONFIG = Object.freeze({
  emissionIntervalMs: 28,
  reducedEmissionIntervalMs: 58,
  smokeLifetimeMs: 680,
  ignitionSparkCount: 10,
  reducedIgnitionSparkCount: 5,
  maximumTrackedParticles: 72
});

/**
 * Presentation-only dash exhaust. The controller reads the existing dash
 * window and position but never changes movement, timing, energy, or physics.
 */
export class BoostVisualSystem {
  private readonly flame: Phaser.GameObjects.Graphics;
  private readonly particles = new Set<Phaser.GameObjects.Arc>();
  private readonly vortexTweens = new Set<Phaser.Tweens.Tween>();
  private activeUntil = 0;
  private nextEmissionAt = 0;
  private directionX = 1;
  private directionY = 0;
  private active = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particlesEnabled: boolean,
    private readonly pool: BoostVisualPool,
    private readonly colorAt: (time: number) => number
  ) {
    this.flame = scene.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  start(source: BoostVisualSource, angle: number, now: number, activeUntil: number): void {
    this.directionX = Math.cos(angle);
    this.directionY = Math.sin(angle);
    this.activeUntil = activeUntil;
    this.nextEmissionAt = now;
    this.active = true;
    this.flame.setVisible(true);
    this.emitIgnition(source, now);
  }

  update(source: BoostVisualSource, now: number): void {
    if (!this.active) return;
    if (now >= this.activeUntil) {
      this.finish(source, now);
      return;
    }

    this.drawFlame(source, now);
    if (now < this.nextEmissionAt) return;
    this.nextEmissionAt = now + (this.particlesEnabled
      ? BOOST_VISUAL_CONFIG.emissionIntervalMs
      : BOOST_VISUAL_CONFIG.reducedEmissionIntervalMs);
    this.emitTrail(source, now);
  }

  reset(): void {
    this.active = false;
    this.activeUntil = 0;
    this.nextEmissionAt = 0;
    this.flame.clear().setVisible(false);
    for (const tween of this.vortexTweens) tween.stop();
    this.vortexTweens.clear();
    for (const particle of [...this.particles]) this.releaseParticle(particle);
  }

  destroy(): void {
    this.reset();
    this.flame.destroy();
  }

  private finish(source: BoostVisualSource, now: number): void {
    this.active = false;
    this.flame.clear().setVisible(false);
    const wakePairs = this.particlesEnabled ? 3 : 1;
    for (let index = 0; index < wakePairs; index += 1) {
      this.emitSmokeVortex(source, now + index * 23, -1, index * 0.7);
      this.emitSmokeVortex(source, now + index * 23, 1, index * 0.7 + Math.PI);
    }
  }

  private drawFlame(source: BoostVisualSource, now: number): void {
    const color = this.colorAt(now);
    const dx = this.directionX;
    const dy = this.directionY;
    const px = -dy;
    const py = dx;
    const bodyRear = Math.max(9, source.displayWidth * 0.25);
    const nozzleX = source.x - dx * bodyRear;
    const nozzleY = source.y - dy * bodyRear;
    const flicker = 0.5 + 0.5 * Math.sin(now * 0.09);
    const outerLength = 31 + flicker * 13;
    const innerLength = outerLength * 0.62;
    const wingOffset = this.wingOffset(source);

    this.flame.clear();
    this.drawFlameCone(nozzleX, nozzleY, dx, dy, px, py, outerLength, 7.5, color, 0.54);
    this.drawFlameCone(nozzleX, nozzleY, dx, dy, px, py, innerLength, 4.1, 0xbffcff, 0.9);
    this.flame.fillStyle(0xffffff, 0.96).fillCircle(nozzleX, nozzleY, 2.4);

    for (const side of [-1, 1]) {
      const jetX = source.x + px * wingOffset * side - dx * (bodyRear * 0.72);
      const jetY = source.y + py * wingOffset * side - dy * (bodyRear * 0.72);
      this.drawFlameCone(jetX, jetY, dx, dy, px, py, outerLength * 0.58, 3.2, side < 0 ? color : 0xff65c8, 0.48);
      this.drawFlameCone(jetX, jetY, dx, dy, px, py, innerLength * 0.48, 1.5, 0xe8ffff, 0.82);
    }
  }

  private drawFlameCone(
    x: number,
    y: number,
    dx: number,
    dy: number,
    px: number,
    py: number,
    length: number,
    halfWidth: number,
    color: number,
    alpha: number
  ): void {
    this.flame.fillStyle(color, alpha);
    this.flame.fillTriangle(
      x + px * halfWidth,
      y + py * halfWidth,
      x - px * halfWidth,
      y - py * halfWidth,
      x - dx * length,
      y - dy * length
    );
  }

  private emitIgnition(source: BoostVisualSource, now: number): void {
    const color = this.colorAt(now);
    for (let index = 0; index < 2; index += 1) {
      const ring = this.obtainParticle({
        x: source.x,
        y: source.y,
        radius: 8 + index * 4,
        color,
        alpha: 0.08,
        depth: 7,
        strokeWidth: 2,
        strokeColor: index === 0 ? 0xffffff : color,
        strokeAlpha: 0.88 - index * 0.2
      });
      if (!ring) continue;
      ring.setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: ring,
        radius: 34 + index * 12,
        alpha: 0,
        duration: 240 + index * 80,
        ease: 'Quad.Out',
        onComplete: () => this.releaseParticle(ring)
      });
    }

    const sparkCount = this.particlesEnabled
      ? BOOST_VISUAL_CONFIG.ignitionSparkCount
      : BOOST_VISUAL_CONFIG.reducedIgnitionSparkCount;
    for (let index = 0; index < sparkCount; index += 1) {
      this.emitSpark(source.x, source.y, color, index - sparkCount / 2, sparkCount);
    }
  }

  private emitTrail(source: BoostVisualSource, now: number): void {
    this.emitSmokeVortex(source, now, -1, now * 0.017);
    this.emitSmokeVortex(source, now, 1, now * 0.017 + Math.PI);
    this.emitEmber(source, now);
    if (!this.particlesEnabled) return;

    const color = this.colorAt(now);
    this.emitSpark(source.x, source.y, color, -1, 2);
    this.emitSpark(source.x, source.y, 0xff65c8, 1, 2);
  }

  private emitSmokeVortex(source: BoostVisualSource, now: number, side: -1 | 1, phase: number): void {
    const color = this.colorAt(now);
    const dx = this.directionX;
    const dy = this.directionY;
    const px = -dy;
    const py = dx;
    const wingOffset = this.wingOffset(source);
    const startX = source.x + px * wingOffset * side - dx * 6;
    const startY = source.y + py * wingOffset * side - dy * 6;
    const smoke = this.obtainParticle({
      x: startX,
      y: startY,
      radius: this.particlesEnabled ? Phaser.Math.FloatBetween(3.8, 5.8) : 4.4,
      color: 0x7592a0,
      alpha: 0.28,
      depth: 6,
      strokeWidth: 1,
      strokeColor: color,
      strokeAlpha: 0.48
    });
    if (!smoke) return;

    const travel = Phaser.Math.FloatBetween(58, 82);
    const swirlRadius = Phaser.Math.FloatBetween(5, 9);
    const duration = BOOST_VISUAL_CONFIG.smokeLifetimeMs + Phaser.Math.Between(-80, 120);
    let vortexTween: Phaser.Tweens.Tween | null = null;
    vortexTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        if (!smoke.active) return;
        const progress = tween.getValue() ?? 0;
        const curl = Math.sin(progress * Math.PI * 3.2 + phase) * swirlRadius * (1 - progress * 0.35);
        const expandingSeparation = side * wingOffset * progress * 0.34;
        smoke.setPosition(
          startX - dx * travel * progress + px * (curl + expandingSeparation),
          startY - dy * travel * progress + py * (curl + expandingSeparation)
        );
        smoke.setScale(0.68 + progress * 1.8);
        smoke.setAlpha(Math.max(0, 0.34 * (1 - progress)));
      },
      onComplete: () => {
        if (vortexTween) this.vortexTweens.delete(vortexTween);
        this.releaseParticle(smoke);
      }
    });
    this.vortexTweens.add(vortexTween);
  }

  private emitEmber(source: BoostVisualSource, now: number): void {
    const color = this.colorAt(now);
    const px = -this.directionY;
    const py = this.directionX;
    const lateral = Phaser.Math.FloatBetween(-6, 6);
    const ember = this.obtainParticle({
      x: source.x + px * lateral - this.directionX * 10,
      y: source.y + py * lateral - this.directionY * 10,
      radius: Phaser.Math.FloatBetween(1.8, 3.4),
      color,
      alpha: 0.92,
      depth: 7
    });
    if (!ember) return;
    ember.setBlendMode(Phaser.BlendModes.ADD).setScale(1.8, 0.55).setRotation(Math.atan2(this.directionY, this.directionX));
    this.scene.tweens.add({
      targets: ember,
      x: ember.x - this.directionX * Phaser.Math.Between(28, 48),
      y: ember.y - this.directionY * Phaser.Math.Between(28, 48),
      alpha: 0,
      scaleX: 0.4,
      scaleY: 0.2,
      duration: Phaser.Math.Between(220, 320),
      ease: 'Quad.Out',
      onComplete: () => this.releaseParticle(ember)
    });
  }

  private emitSpark(x: number, y: number, color: number, index: number, total: number): void {
    const spread = total <= 1 ? 0 : index / Math.max(1, total - 1);
    const angle = Math.atan2(-this.directionY, -this.directionX) + spread * 1.25 + Phaser.Math.FloatBetween(-0.45, 0.45);
    const distance = Phaser.Math.Between(25, 58);
    const spark = this.obtainParticle({
      x,
      y,
      radius: Phaser.Math.FloatBetween(1.2, 2.6),
      color,
      alpha: 0.96,
      depth: 7
    });
    if (!spark) return;
    spark.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      scale: 0.2,
      duration: Phaser.Math.Between(190, 340),
      ease: 'Quad.Out',
      onComplete: () => this.releaseParticle(spark)
    });
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
