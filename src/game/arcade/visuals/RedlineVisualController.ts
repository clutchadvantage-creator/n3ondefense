import Phaser from 'phaser';
import {
  ARCADE_TAU,
  clamp01,
  drawCornerBrackets,
  drawDirectionalChevron,
  drawLayeredArcadeSocket,
  drawSegmentedRing,
  seededUnit
} from './ArcadeVisualPrimitives.ts';

interface RedlineVisualOptions {
  x: number;
  y: number;
  radius: number;
  particlesEnabled: boolean;
}

/** Render-only unstable override reactor. RedlineEvent owns all hold/decay rules. */
export class RedlineVisualController {
  private readonly root: Phaser.GameObjects.Container;
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly dynamic: Phaser.GameObjects.Graphics;
  private readonly coreRig: Phaser.GameObjects.Container;
  private readonly core: Phaser.GameObjects.Polygon;
  private readonly coreGlow: Phaser.GameObjects.Arc;
  private readonly pylons: Phaser.GameObjects.Rectangle[] = [];
  private readonly label: Phaser.GameObjects.Text;
  private wasInside = false;
  private contactAt = -10_000;
  private lastStage = 0;
  private stageAt = -10_000;
  private terminal: 'none' | 'success' | 'failure' = 'none';
  private terminalAt = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly options: RedlineVisualOptions) {
    this.base = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.drawBase();
    this.dynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const reactorBase = scene.add.graphics();
    this.drawReactorBase(reactorBase);
    this.coreGlow = scene.add.circle(0, -8, 27, 0x48efff, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    this.core = scene.add.polygon(0, -8, [0, -25, 18, -8, 13, 19, -13, 19, -18, -8], 0x48efff, 0.48)
      .setStrokeStyle(2, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    this.coreRig = scene.add.container(0, 0, [reactorBase, this.coreGlow, this.core]);
    this.createPylons();
    this.label = scene.add.text(0, 62, 'REDLINE // OVERRIDE NODE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#8cf8ff',
      stroke: '#02050b', strokeThickness: 4
    }).setOrigin(0.5);
    this.root = scene.add.container(options.x, options.y, [this.base, this.dynamic, ...this.pylons, this.coreRig, this.label])
      .setDepth(12).setAlpha(0);
  }

  update(now: number, startedAt: number, progress: number, stage: number, inside: boolean, remainingMs: number): void {
    const elapsed = Math.max(0, now - startedAt);
    const activation = clamp01(elapsed / 980);
    const urgency = clamp01((8_000 - remainingMs) / 8_000);
    if (inside && !this.wasInside) this.contactAt = now;
    this.wasInside = inside;
    if (stage > this.lastStage) {
      this.lastStage = stage;
      this.stageAt = now;
    }
    const pulse = 0.5 + Math.sin(now * (0.008 + progress * 0.018)) * 0.5;
    const color = urgency > 0.45 && Math.floor(now / 130) % 2 === 0
      ? 0xff405f
      : progress > 0.66 ? 0xff4cbe : progress > 0.33 ? 0xaa65ff : 0x48efff;
    this.root.setAlpha(activation).setScale(0.72 + activation * 0.28);
    this.core.setFillStyle(color, 0.3 + pulse * 0.62).setScale(0.82 + pulse * (0.18 + progress * 0.14));
    this.coreGlow.setFillStyle(color, 0.12 + progress * 0.18).setAlpha(0.28 + pulse * 0.55).setScale(0.8 + pulse * 0.5 + progress * 0.3);
    this.coreRig.setRotation(Math.sin(now * 0.0026) * 0.045);
    this.label.setColor(urgency > 0.45 ? '#ff7890' : '#8cf8ff');
    this.dynamic.clear();
    this.drawField(now, progress, stage, inside, urgency, pulse, color);
    this.drawStageFeedback(now, color);
    if (this.terminal !== 'none') this.drawTerminal(now);
  }

  beginSuccess(now: number): void {
    if (this.terminal !== 'none') return;
    this.terminal = 'success';
    this.terminalAt = now;
    this.label.setText('REDLINE // CORE RUPTURE');
  }

  beginFailure(now: number): void {
    if (this.terminal !== 'none') return;
    this.terminal = 'failure';
    this.terminalAt = now;
    this.label.setText('REDLINE // OVERRIDE LOST').setColor('#ff6681');
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private drawBase(): void {
    const radius = this.options.radius;
    drawLayeredArcadeSocket(this.base, radius, 0x48efff, 0xff4cbe);
    this.base.fillStyle(0x48efff, 0.025).fillCircle(0, 0, radius);
    this.base.lineStyle(1, 0x48efff, 0.2).strokeCircle(0, 0, radius);
    this.base.lineStyle(1, 0xaa65ff, 0.15).strokeCircle(0, 0, radius - 22);
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * ARCADE_TAU;
      const inner = 42;
      const outer = radius - 10;
      this.base.lineStyle(1, index % 2 ? 0xff4cbe : 0x48efff, 0.14)
        .lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    drawCornerBrackets(this.base, 79, 19, 0x48efff, 0.35, 2);
  }

  private drawReactorBase(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(0x06131d, 0.98).fillPoints([
      new Phaser.Geom.Point(-38, 3), new Phaser.Geom.Point(-25, -28),
      new Phaser.Geom.Point(25, -28), new Phaser.Geom.Point(38, 3),
      new Phaser.Geom.Point(28, 31), new Phaser.Geom.Point(-28, 31)
    ], true, true);
    graphics.lineStyle(3, 0xff4cbe, 0.88).strokePoints([
      new Phaser.Geom.Point(-38, 3), new Phaser.Geom.Point(-25, -28),
      new Phaser.Geom.Point(25, -28), new Phaser.Geom.Point(38, 3),
      new Phaser.Geom.Point(28, 31), new Phaser.Geom.Point(-28, 31)
    ], true, true);
    graphics.lineStyle(2, 0x48efff, 0.76).strokeCircle(0, -8, 30);
    graphics.fillStyle(0xffffff, 0.74).fillCircle(-24, 15, 2.5).fillCircle(24, 15, 2.5);
  }

  private createPylons(): void {
    const radius = 75;
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI * 0.5 + Math.PI * 0.25;
      const pylon = this.scene.add.rectangle(Math.cos(angle) * radius, Math.sin(angle) * radius, 13, 28, 0x081823, 1)
        .setStrokeStyle(2, index % 2 ? 0xff4cbe : 0x48efff, 0.82)
        .setRotation(angle + Math.PI * 0.5);
      this.pylons.push(pylon);
    }
  }

  private drawField(
    now: number,
    progress: number,
    stage: number,
    inside: boolean,
    urgency: number,
    pulse: number,
    color: number
  ): void {
    drawSegmentedRing(this.dynamic, this.options.radius - 5, 30, progress, color, 0.94, 4, now * 0.00032);
    drawSegmentedRing(this.dynamic, this.options.radius - 28, 12, Math.max(0.08, progress), 0xff4cbe, 0.48 + pulse * 0.36, 2, -now * 0.00054);
    const arcCount = 4 + stage * 2;
    for (let index = 0; index < arcCount; index += 1) {
      const angle = now * 0.0026 * (index % 2 ? -1 : 1) + index / arcCount * ARCADE_TAU;
      const inner = 20 + (index % 2) * 7;
      const outer = 51 + (index % 3) * 12 + progress * 18;
      this.dynamic.lineStyle(1.5 + stage * 0.45, index % 3 === 0 ? 0xffffff : color, 0.3 + progress * 0.55)
        .lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner - 8, Math.cos(angle + 0.16) * outer, Math.sin(angle + 0.16) * outer);
    }
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * ARCADE_TAU + Math.PI / 6;
      drawDirectionalChevron(
        this.dynamic,
        Math.cos(angle) * (93 + pulse * 5),
        Math.sin(angle) * (93 + pulse * 5),
        angle + (inside ? Math.PI : 0),
        9 + stage,
        urgency > 0.4 ? 0xff405f : color,
        inside ? 0.82 : 0.3 + urgency * 0.45
      );
    }
    const contactProgress = clamp01((now - this.contactAt) / 360);
    if (contactProgress < 1) {
      this.dynamic.lineStyle(4, 0xffffff, (1 - contactProgress) * 0.9)
        .strokeCircle(0, 0, 28 + contactProgress * (this.options.radius - 20));
    }
    for (let index = 0; index < this.pylons.length; index += 1) {
      const powered = index < Math.max(1, stage + (progress > 0 ? 1 : 0));
      this.pylons[index].setFillStyle(powered ? color : 0x081823, powered ? 0.45 + pulse * 0.35 : 1)
        .setStrokeStyle(powered ? 3 : 1, powered ? color : 0x345160, powered ? 0.94 : 0.38)
        .setScale(powered ? 1 + pulse * 0.08 : 1);
    }
  }

  private drawStageFeedback(now: number, color: number): void {
    const progress = clamp01((now - this.stageAt) / 420);
    if (progress >= 1) return;
    this.dynamic.lineStyle(4, color, (1 - progress) * 0.9).strokeCircle(0, 0, 38 + progress * 92);
    drawCornerBrackets(this.dynamic, 45 + progress * 52, 13, 0xffffff, (1 - progress) * 0.72, 3);
  }

  private drawTerminal(now: number): void {
    const progress = clamp01((now - this.terminalAt) / 680);
    if (this.terminal === 'success') {
      this.dynamic.lineStyle(5, 0xffffff, (1 - progress) * 0.92).strokeCircle(0, 0, 25 + progress * 155);
      this.dynamic.lineStyle(3, 0xff4cbe, (1 - progress) * 0.8).strokeCircle(0, 0, 18 + progress * 115);
      const count = this.options.particlesEnabled ? 18 : 9;
      for (let index = 0; index < count; index += 1) {
        const angle = index / count * ARCADE_TAU + seededUnit(index, 91) * 0.3;
        const distance = progress * (60 + seededUnit(index, 92) * 105);
        this.dynamic.fillStyle(index % 2 ? 0xff4cbe : 0x48efff, (1 - progress) * 0.9)
          .fillTriangle(
            Math.cos(angle) * distance, Math.sin(angle) * distance,
            Math.cos(angle + 0.08) * (distance + 10), Math.sin(angle + 0.08) * (distance + 10),
            Math.cos(angle - 0.08) * (distance + 10), Math.sin(angle - 0.08) * (distance + 10)
          );
      }
      this.coreRig.setScale(1 + progress * 0.8).setAlpha(1 - progress);
    } else {
      const flicker = Math.floor(now / 70) % 2 === 0 ? 1 : 0.25;
      this.dynamic.lineStyle(4, 0xff405f, flicker * (1 - progress));
      this.dynamic.lineBetween(-72, -72, 72, 72);
      this.dynamic.lineBetween(72, -72, -72, 72);
      this.coreRig.setScale(1 - progress * 0.6).setAlpha(1 - progress * 0.8);
      this.root.setAlpha(0.45 + flicker * 0.4);
    }
  }
}
