import Phaser from 'phaser';

export interface MineLaunchOptions {
  fromX: number;
  fromY: number;
  durationMs: number;
  delayMs?: number;
}

export interface MineVisualTheme {
  secondaryColor: number;
  spikeStrokeColor: number;
  shellFillColor: number;
  innerFillColor: number;
  armedShellFillColor: number;
  armedShellStrokeColor: number;
  armedInnerStrokeColor: number;
  armedCoreColor: number;
  explosionPalette: MineExplosionPalette;
}

export type MineExplosionPalette = readonly [core: number, primary: number, secondary: number, outer: number];

const PLAYER_MINE_VISUAL_THEME: MineVisualTheme = {
  secondaryColor: 0xff4e3d,
  spikeStrokeColor: 0xffd2a1,
  shellFillColor: 0x21080b,
  innerFillColor: 0x09070b,
  armedShellFillColor: 0x32070a,
  armedShellStrokeColor: 0xff7a28,
  armedInnerStrokeColor: 0xff334e,
  armedCoreColor: 0xffd36a,
  explosionPalette: [0xffffff, 0xffa340, 0xff4e27, 0xff174f]
};

export const STAR_DEATH_MINE_VISUAL_THEME: MineVisualTheme = {
  secondaryColor: 0x39eeff,
  spikeStrokeColor: 0xbdf9ff,
  shellFillColor: 0x21051d,
  innerFillColor: 0x03151b,
  armedShellFillColor: 0x310628,
  armedShellStrokeColor: 0xff4ed3,
  armedInnerStrokeColor: 0x39eeff,
  armedCoreColor: 0x9af7ff,
  explosionPalette: [0xf4ffff, 0xff4ed3, 0x39eeff, 0xff24d4]
};

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
    launch?: MineLaunchOptions,
    private readonly visualTheme: MineVisualTheme = PLAYER_MINE_VISUAL_THEME
  ) {
    this.glow = scene.add.circle(0, 0, 18, color, 0.14).setBlendMode(Phaser.BlendModes.ADD);
    this.spikeRing = scene.add.container(0, 0);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI * 2 / 12;
      const spikeColor = index % 2 === 0 ? color : this.visualTheme.secondaryColor;
      const spike = scene.add.triangle(0, 0, -2.8, 3, 0, -10, 2.8, 3, spikeColor, 0.96)
        .setPosition(Math.cos(angle) * 12, Math.sin(angle) * 12)
        .setRotation(angle + Math.PI / 2)
        .setStrokeStyle(1, this.visualTheme.spikeStrokeColor, 0.55);
      this.spikeRing.add(spike);
    }
    this.shell = scene.add.circle(0, 0, 11, this.visualTheme.shellFillColor, 0.98).setStrokeStyle(2.5, color, 1);
    this.innerRing = scene.add.circle(0, 0, 7, this.visualTheme.innerFillColor, 0.98).setStrokeStyle(2, this.visualTheme.secondaryColor, 0.92);
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
      this.shell.setFillStyle(this.visualTheme.armedShellFillColor, 1).setStrokeStyle(3, this.visualTheme.armedShellStrokeColor, 1);
      this.innerRing.setStrokeStyle(2, this.visualTheme.armedInnerStrokeColor, 1);
      this.core.setFillStyle(this.visualTheme.armedCoreColor, 1);
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

  get explosionPalette(): MineExplosionPalette {
    return this.visualTheme.explosionPalette;
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
