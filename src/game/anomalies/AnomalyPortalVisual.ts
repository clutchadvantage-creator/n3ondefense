import Phaser from 'phaser';

interface FeedParticle {
  shape: Phaser.GameObjects.Arc;
  fromX: number;
  fromY: number;
  startedAt: number;
  durationMs: number;
}

export class AnomalyPortalVisual {
  readonly root: Phaser.GameObjects.Container;
  private readonly aura: Phaser.GameObjects.Arc;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly glyphs: Phaser.GameObjects.Graphics;
  private readonly feedPool: Phaser.GameObjects.Arc[] = [];
  private readonly activeFeed: FeedParticle[] = [];
  private portalReady = false;
  private chargeRatio = 0;

  constructor(private readonly scene: Phaser.Scene, readonly x: number, readonly y: number, particlesEnabled: boolean) {
    this.aura = scene.add.circle(0, 0, 54, 0x8b2cff, 0.13).setBlendMode(Phaser.BlendModes.ADD);
    this.ring = scene.add.circle(0, 0, 37, 0x071526, 0.8).setStrokeStyle(3, 0x58f5ff, 0.92);
    this.core = scene.add.circle(0, 0, 15, 0xff4fd8, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    this.glyphs = scene.add.graphics();
    this.root = scene.add.container(x, y, [this.aura, this.ring, this.core, this.glyphs]).setDepth(24);
    const count = particlesEnabled ? 24 : 10;
    for (let index = 0; index < count; index += 1) {
      this.feedPool.push(scene.add.circle(-10_000, -10_000, 3, index % 2 ? 0xff4fd8 : 0x58f5ff, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(25).setVisible(false));
    }
    this.redrawGlyphs(0);
  }

  setCharge(ratio: number): void {
    this.chargeRatio = Phaser.Math.Clamp(ratio, 0, 1);
    this.redrawGlyphs(this.chargeRatio);
  }

  transformToPortal(): void {
    this.portalReady = true;
    this.core.setRadius(25).setFillStyle(0x020711, 1).setStrokeStyle(3, 0xff65de, 1);
    this.ring.setRadius(49).setStrokeStyle(4, 0x58f5ff, 1);
    this.aura.setRadius(72).setAlpha(0.24);
    this.redrawGlyphs(1);
  }

  emitFeed(fromX: number, fromY: number, count = 3): void {
    for (let index = 0; index < count; index += 1) {
      const shape = this.feedPool.find((candidate) => !candidate.visible);
      if (!shape) return;
      shape.setVisible(true).setActive(true).setPosition(fromX, fromY).setScale(0.7 + index * 0.15).setAlpha(0.9);
      this.activeFeed.push({ shape, fromX, fromY, startedAt: this.scene.time.now - index * 35, durationMs: 420 + index * 60 });
    }
  }

  update(now: number): void {
    const pulse = 1 + Math.sin(now * (this.portalReady ? 0.007 : 0.004)) * (this.portalReady ? 0.08 : 0.04);
    this.aura.setScale(pulse);
    this.core.setScale(1 + Math.sin(now * 0.009) * 0.07);
    this.ring.setRotation(now * (this.portalReady ? 0.0015 : 0.00065));
    this.glyphs.setRotation(-now * 0.0009);
    for (let index = this.activeFeed.length - 1; index >= 0; index -= 1) {
      const particle = this.activeFeed[index];
      const t = Phaser.Math.Clamp((now - particle.startedAt) / particle.durationMs, 0, 1);
      const curvedX = Phaser.Math.Linear(particle.fromX, this.x, t) + Math.sin(t * Math.PI) * 18;
      const curvedY = Phaser.Math.Linear(particle.fromY, this.y, t) - Math.sin(t * Math.PI) * 24;
      particle.shape.setPosition(curvedX, curvedY).setAlpha(1 - t * 0.8).setScale(0.8 + t * 0.5);
      if (t >= 1) {
        particle.shape.setVisible(false).setActive(false).setPosition(-10_000, -10_000);
        this.activeFeed.splice(index, 1);
      }
    }
  }

  setTransitionProgress(progress: number): void {
    const t = Phaser.Math.Clamp(progress, 0, 1);
    this.root.setScale(1 + t * 0.6).setAlpha(1 - t * 0.25);
    this.aura.setAlpha(0.25 + t * 0.35);
  }

  destroy(): void {
    this.root.destroy(true);
    for (const shape of this.feedPool) shape.destroy();
    this.activeFeed.length = 0;
  }

  private redrawGlyphs(ratio: number): void {
    this.glyphs.clear();
    const segments = 10;
    for (let index = 0; index < segments; index += 1) {
      const active = (index + 1) / segments <= ratio + 0.001;
      const start = index / segments * Math.PI * 2 - Math.PI / 2;
      this.glyphs.lineStyle(active ? 4 : 2, active ? (index % 2 ? 0xff4fd8 : 0x58f5ff) : 0x24465d, active ? 0.95 : 0.45);
      this.glyphs.beginPath();
      this.glyphs.arc(0, 0, this.portalReady ? 60 : 47, start, start + 0.42, false);
      this.glyphs.strokePath();
    }
  }
}

