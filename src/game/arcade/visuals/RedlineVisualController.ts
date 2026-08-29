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
  private readonly energyColumn: Phaser.GameObjects.Rectangle;
  private readonly hologramBands: Phaser.GameObjects.Ellipse[] = [];
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
    this.energyColumn = scene.add.rectangle(0, -38, 13, 92, 0x48efff, 0.12)
      .setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);
    this.coreGlow = scene.add.circle(0, -8, 27, 0x48efff, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    this.core = scene.add.polygon(0, -8, [0, -25, 18, -8, 13, 19, -13, 19, -18, -8], 0x48efff, 0.48)
      .setStrokeStyle(2, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    for (let index = 0; index < 3; index += 1) {
      this.hologramBands.push(scene.add.ellipse(0, -23 - index * 19, 56 - index * 9, 13,
        0x48efff, 0.025).setStrokeStyle(1.5, index % 2 ? 0xff4cbe : 0x48efff, 0.42)
        .setBlendMode(Phaser.BlendModes.ADD));
    }
    this.coreRig = scene.add.container(0, 0, [this.energyColumn, reactorBase, ...this.hologramBands,
      this.coreGlow, this.core]);
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
    const contactPower = inside ? 1 : 0.32;
    this.root.setAlpha(activation).setScale(0.72 + activation * 0.28);
    this.core.setFillStyle(color, 0.3 + pulse * 0.62).setScale(0.82 + pulse * (0.18 + progress * 0.14));
    this.coreGlow.setFillStyle(color, 0.12 + progress * 0.18).setAlpha(0.28 + pulse * 0.55).setScale(0.8 + pulse * 0.5 + progress * 0.3);
    this.coreRig.setRotation(Math.sin(now * 0.0026) * 0.045);
    this.energyColumn.setFillStyle(color, (0.08 + progress * 0.24) * contactPower)
      .setScale(0.85 + progress * 0.8, 0.55 + progress * 1.1 + pulse * 0.12)
      .setAlpha(this.terminal === 'failure' ? 0.15 : 1);
    for (let index = 0; index < this.hologramBands.length; index += 1) {
      this.hologramBands[index].setStrokeStyle(1.5 + progress * 1.2, index % 2 ? 0xff4cbe : color,
        (0.2 + progress * 0.48) * contactPower)
        .setScale(0.75 + progress * 0.45 + pulse * 0.05)
        .setRotation(now * 0.0012 * (index % 2 ? -1 : 1));
    }
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
    this.base.lineStyle(1, 0x48efff, 0.12);
    for (let offset = -72; offset <= 72; offset += 24) {
      this.base.lineBetween(-72, offset, 72, offset);
      this.base.lineBetween(offset, -72, offset, 72);
    }
    drawCornerBrackets(this.base, 79, 19, 0x48efff, 0.35, 2);
  }

  private drawReactorBase(graphics: Phaser.GameObjects.Graphics): void {
    // 2.5D plinth: shadow, side plane, armored face, top cap and exposed
    // conduits. All geometry is baked once; only small emissive layers animate.
    graphics.fillStyle(0x000000, 0.55).fillEllipse(7, 27, 94, 28);
    graphics.fillStyle(0x02070d, 1).fillPoints([
      new Phaser.Geom.Point(-38, 3), new Phaser.Geom.Point(38, 3),
      new Phaser.Geom.Point(31, 38), new Phaser.Geom.Point(-27, 38)
    ], true, true);
    graphics.lineStyle(2, 0x7b2f75, 0.72).strokePoints([
      new Phaser.Geom.Point(-38, 3), new Phaser.Geom.Point(38, 3),
      new Phaser.Geom.Point(31, 38), new Phaser.Geom.Point(-27, 38)
    ], true, true);
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
    graphics.fillStyle(0x173142, 0.96).fillEllipse(0, -28, 50, 17);
    graphics.lineStyle(2, 0xd8ffff, 0.58).strokeEllipse(0, -28, 50, 17);
    graphics.lineStyle(3, 0x48efff, 0.5)
      .lineBetween(-34, 12, -52, 24).lineBetween(34, 12, 52, 24);
    graphics.fillStyle(0x0a1d29, 1).fillRoundedRect(-57, 19, 18, 11, 3).fillRoundedRect(39, 19, 18, 11, 3);
    graphics.lineStyle(1.5, 0xff4cbe, 0.76).strokeRoundedRect(-57, 19, 18, 11, 3).strokeRoundedRect(39, 19, 18, 11, 3);
    graphics.fillStyle(0xffffff, 0.74).fillCircle(-24, 15, 2.5).fillCircle(24, 15, 2.5);
    graphics.fillStyle(0xffd65a, 0.74).fillTriangle(-13, 29, -5, 16, 3, 29);
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
    const contactPower = inside ? 1 : 0.34;
    const quarter = Math.min(4, Math.floor(progress * 4 + 0.0001));
    drawSegmentedRing(this.dynamic, this.options.radius - 5, 32, progress, color,
      (0.42 + progress * 0.52) * contactPower, 4, now * 0.00032);
    drawSegmentedRing(this.dynamic, this.options.radius - 28, 16, Math.max(0.08, progress), 0xff4cbe,
      (0.22 + pulse * 0.42) * contactPower, 2, -now * 0.00054);
    for (let index = 0; index < 4; index += 1) {
      const angle = -Math.PI * 0.5 + index * Math.PI * 0.5;
      const powered = index < quarter || progress >= 1;
      this.dynamic.lineStyle(powered ? 6 : 2, powered ? color : 0x274653, powered ? 0.88 : 0.28)
        .beginPath().arc(0, 0, this.options.radius - 15, angle + 0.08, angle + Math.PI * 0.5 - 0.08).strokePath();
    }
    const arcCount = 4 + stage * 2;
    for (let index = 0; index < arcCount; index += 1) {
      const angle = now * 0.0026 * (index % 2 ? -1 : 1) + index / arcCount * ARCADE_TAU;
      const inner = 20 + (index % 2) * 7;
      const outer = 51 + (index % 3) * 12 + progress * 18;
      this.dynamic.lineStyle(1.5 + stage * 0.45, index % 3 === 0 ? 0xffffff : color,
        (0.18 + progress * 0.6) * contactPower)
        .lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner - 8, Math.cos(angle + 0.16) * outer, Math.sin(angle + 0.16) * outer);
    }
    const moteCount = this.options.particlesEnabled ? 8 : 4;
    for (let index = 0; index < moteCount; index += 1) {
      const cycle = (now * (0.00032 + index * 0.000017) + seededUnit(index, 117)) % 1;
      const x = (seededUnit(index, 118) - 0.5) * (44 + progress * 34);
      const y = 20 - cycle * (82 + progress * 52);
      this.dynamic.fillStyle(index % 3 === 0 ? 0xffffff : color, (1 - cycle) * (0.25 + progress * 0.55) * contactPower)
        .fillCircle(x, y, 1.5 + index % 3);
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
      const powered = index < Math.max(inside && progress > 0 ? 1 : 0, quarter);
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
      this.dynamic.fillStyle(0xffffff, (1 - progress) * 0.34)
        .fillRect(-10 - progress * 8, -190, 20 + progress * 16, 215);
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
      this.energyColumn.setScale(1, Math.max(0.02, 1 - progress)).setAlpha(1 - progress);
      this.root.setAlpha(0.45 + flicker * 0.4);
    }
  }
}
