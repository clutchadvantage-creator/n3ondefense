import Phaser from 'phaser';

export interface MineLaunchOptions {
  fromX: number;
  fromY: number;
  durationMs: number;
  delayMs?: number;
}

export class Mine {
  readonly sprite: Phaser.GameObjects.Container;
  readonly armAt: number;
  readonly damage: number;
  readonly radius: number;
  armed = false;
  detonateAt = 0;
  lastMagneticPulseAt = 0;
  private readonly glow: Phaser.GameObjects.Arc;
  private readonly shell: Phaser.GameObjects.Arc;
  private readonly innerRing: Phaser.GameObjects.Arc;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly spikeRing: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    color: number,
    armMs: number,
    damage: number,
    radius: number,
    launch?: MineLaunchOptions
  ) {
    this.glow = scene.add.circle(0, 0, 18, color, 0.14).setBlendMode(Phaser.BlendModes.ADD);
    this.spikeRing = scene.add.container(0, 0);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI * 2 / 12;
      const spikeColor = index % 2 === 0 ? color : 0xff4e3d;
      const spike = scene.add.triangle(0, 0, -2.8, 3, 0, -10, 2.8, 3, spikeColor, 0.96)
        .setPosition(Math.cos(angle) * 12, Math.sin(angle) * 12)
        .setRotation(angle + Math.PI / 2)
        .setStrokeStyle(1, 0xffd2a1, 0.55);
      this.spikeRing.add(spike);
    }
    this.shell = scene.add.circle(0, 0, 11, 0x21080b, 0.98).setStrokeStyle(2.5, color, 1);
    this.innerRing = scene.add.circle(0, 0, 7, 0x09070b, 0.98).setStrokeStyle(2, 0xff4e3d, 0.92);
    this.core = scene.add.circle(0, 0, 3.4, color, 0.92).setStrokeStyle(1, 0xffffff, 0.92);
    const startX = launch?.fromX ?? x;
    const startY = launch?.fromY ?? y;
    this.sprite = scene.add.container(startX, startY, [this.glow, this.spikeRing, this.shell, this.innerRing, this.core])
      .setDepth(6);
    const launchDelay = Math.max(0, launch?.delayMs ?? 0);
    const launchDuration = Math.max(0, launch?.durationMs ?? 0);
    this.armAt = scene.time.now + launchDelay + launchDuration + armMs;
    this.damage = damage;
    this.radius = radius;

    if (launch) {
      this.sprite.setScale(0.62).setAlpha(0.72);
      scene.tweens.add({
        targets: this.sprite,
        x,
        y,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        angle: 540,
        delay: launchDelay,
        duration: launchDuration,
        ease: 'Cubic.Out'
      });
    }
  }

  update(now: number): void {
    if (!this.armed && now >= this.armAt) {
      this.armed = true;
      this.shell.setFillStyle(0x32070a, 1).setStrokeStyle(3, 0xff7a28, 1);
      this.innerRing.setStrokeStyle(2, 0xff334e, 1);
      this.core.setFillStyle(0xffd36a, 1);
    }
    const urgency = this.detonateAt > 0 ? 0.022 : this.armed ? 0.011 : 0.006;
    const pulse = 0.5 + Math.sin(now * urgency) * 0.5;
    this.glow.setAlpha((this.armed ? 0.18 : 0.08) + pulse * (this.detonateAt > 0 ? 0.42 : 0.18));
    this.glow.setScale(0.82 + pulse * (this.detonateAt > 0 ? 0.58 : 0.28));
    this.core.setScale(0.84 + pulse * 0.34);
    this.spikeRing.setRotation(now * (this.armed ? 0.00105 : 0.00042));
  }

  beginDetonation(now: number, delayMs: number): void {
    if (this.detonateAt === 0) this.detonateAt = now + Math.max(0, delayMs);
  }

  readyToDetonate(now: number): boolean {
    return this.detonateAt > 0 && now >= this.detonateAt;
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
