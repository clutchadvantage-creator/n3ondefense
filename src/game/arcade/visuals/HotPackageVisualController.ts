import Phaser from 'phaser';
import {
  ARCADE_TAU,
  clamp01,
  drawCornerBrackets,
  drawDirectionalChevron,
  drawLayeredArcadeSocket,
  drawSegmentedRing,
  easeInCubic,
  seededUnit
} from './ArcadeVisualPrimitives.ts';

export type HotPackageQuality = 'standard' | 'enhanced' | 'jackpot';

interface HotPackageVisualOptions {
  x: number;
  y: number;
  radius: number;
  landingMs: number;
  quality: HotPackageQuality;
  color: number;
  particlesEnabled: boolean;
}

const DROP_HEIGHT = 330;
const TERMINAL_BURST_COUNT = 18;
const PARACHUTE_COLLAPSE_MS = 760;

/** Render-only orbital pod presentation. Capture timing remains in HotPackageEvent. */
export class HotPackageVisualController {
  private readonly root: Phaser.GameObjects.Container;
  private readonly floorStatic: Phaser.GameObjects.Graphics;
  private readonly floorDynamic: Phaser.GameObjects.Graphics;
  private readonly pod: Phaser.GameObjects.Container;
  private readonly parachute: Phaser.GameObjects.Container;
  private readonly podDynamic: Phaser.GameObjects.Graphics;
  private readonly leftDoor: Phaser.GameObjects.Rectangle;
  private readonly rightDoor: Phaser.GameObjects.Rectangle;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private terminal: 'none' | 'success' | 'failure' = 'none';
  private terminalAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: HotPackageVisualOptions,
    startedAt: number
  ) {
    this.floorStatic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.drawFloorBase();
    this.floorDynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

    this.shadow = scene.add.ellipse(0, 28, 98, 34, 0x000000, 0.62);
    const parachuteCanopy = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const parachuteLines = scene.add.graphics();
    this.drawParachute(parachuteCanopy, parachuteLines);
    this.parachute = scene.add.container(0, 0, [parachuteLines, parachuteCanopy]);
    const shell = scene.add.graphics();
    this.drawPodShell(shell);
    this.podDynamic = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.core = scene.add.circle(0, -8, 13, options.color, 0.8)
      .setStrokeStyle(2, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    this.leftDoor = scene.add.rectangle(-17, 20, 31, 25, 0x0c1c29, 1).setStrokeStyle(2, options.color, 0.9);
    this.rightDoor = scene.add.rectangle(17, 20, 31, 25, 0x0c1c29, 1).setStrokeStyle(2, options.color, 0.9);
    const tag = scene.add.text(0, -66, `${options.quality.toUpperCase()} // SUPPLY POD`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '12px', fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(options.color).rgba,
      stroke: '#02050b', strokeThickness: 4
    }).setOrigin(0.5);
    const brand = scene.add.text(-2, 4, 'N3ONDefense\nARMS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '8px', fontStyle: 'bold', align: 'center',
      color: '#e9feff', stroke: '#02050b', strokeThickness: 3, lineSpacing: -2
    }).setOrigin(0.5);
    this.pod = scene.add.container(0, -DROP_HEIGHT, [this.parachute, shell, this.podDynamic, this.core,
      this.leftDoor, this.rightDoor, brand, tag]);
    this.root = scene.add.container(options.x, options.y, [this.floorStatic, this.floorDynamic, this.shadow, this.pod])
      .setDepth(13).setAlpha(0);
    this.update(startedAt, startedAt, 0, false, options.landingMs + 1);
  }

  update(now: number, startedAt: number, captureProgress: number, inside: boolean, remainingMs: number): void {
    const elapsed = Math.max(0, now - startedAt);
    const landingProgress = clamp01(elapsed / this.options.landingMs);
    const urgency = clamp01((8_000 - remainingMs) / 8_000);
    const pulse = 0.5 + Math.sin(now * (0.008 + urgency * 0.008)) * 0.5;
    this.root.setAlpha(clamp01(elapsed / 180));

    if (landingProgress < 1) {
      const eased = easeInCubic(landingProgress);
      const drift = Math.sin(elapsed * 0.006) * (1 - landingProgress) * 18;
      this.pod.setPosition(drift, -DROP_HEIGHT * (1 - eased)).setScale(0.7 + eased * 0.3)
        .setRotation(Math.sin(elapsed * 0.0045) * (1 - landingProgress) * 0.055);
      this.parachute.setVisible(true).setAlpha(1).setScale(1 + Math.sin(elapsed * 0.004) * 0.025, 1);
      this.shadow.setScale(0.35 + eased * 0.75).setAlpha(0.12 + eased * 0.5);
    } else {
      const landedElapsed = elapsed - this.options.landingMs;
      const collapse = clamp01(landedElapsed / PARACHUTE_COLLAPSE_MS);
      const settle = Math.exp(-landedElapsed / 230) * Math.sin(landedElapsed * 0.035) * 7;
      this.pod.setPosition(0, settle + Math.sin(now * 0.0035) * 1.1).setScale(1 + pulse * 0.012).setRotation(0);
      this.parachute.setAlpha(1 - collapse).setScale(1 + collapse * 0.34, Math.max(0.12, 1 - collapse * 0.82))
        .setY(collapse * 28).setVisible(collapse < 1);
      this.shadow.setScale(1).setAlpha(0.58);
    }

    this.floorDynamic.clear();
    const activeColor = urgency > 0.35 && Math.floor(now / 180) % 2 === 0 ? 0xff5d75 : this.options.color;
    const activationScale = 0.72 + landingProgress * 0.28;
    this.floorDynamic.setScale(activationScale);
    drawSegmentedRing(this.floorDynamic, this.options.radius - 7, 24, captureProgress, activeColor, 0.92, 4, now * 0.00034);
    drawSegmentedRing(this.floorDynamic, this.options.radius - 23, 12, landingProgress, 0xff5bcf, 0.52, 2, -now * 0.00022);
    drawCornerBrackets(this.floorDynamic, 83, 18, activeColor, 0.5 + pulse * 0.36, inside ? 3 : 2);
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * ARCADE_TAU + now * 0.00035;
      drawDirectionalChevron(
        this.floorDynamic,
        Math.cos(angle) * 93,
        Math.sin(angle) * 93,
        angle + Math.PI,
        9 + pulse * 3,
        index % 2 ? 0xff5bcf : activeColor,
        inside ? 0.82 : 0.38
      );
    }
    const scanY = -72 + ((elapsed * 0.1) % 144);
    this.floorDynamic.lineStyle(2, activeColor, inside ? 0.35 : 0.14).lineBetween(-74, scanY, 74, scanY);
    if (landingProgress < 1) this.drawDescent(elapsed, landingProgress);
    else this.drawLandingImpact(elapsed - this.options.landingMs);
    if (this.terminal !== 'none') this.drawTerminal(now);

    this.podDynamic.clear();
    this.podDynamic.lineStyle(2, activeColor, 0.4 + pulse * 0.55);
    for (let index = 0; index < 4; index += 1) {
      const angle = now * 0.002 * (index % 2 ? -1 : 1) + index * Math.PI * 0.5;
      this.podDynamic.lineBetween(Math.cos(angle) * 17, Math.sin(angle) * 11 - 8, Math.cos(angle) * 29, Math.sin(angle) * 18 - 8);
    }
    this.core.setFillStyle(activeColor, 0.5 + pulse * 0.48).setScale(0.82 + pulse * 0.3);
  }

  beginSuccess(now: number): void {
    if (this.terminal !== 'none') return;
    this.terminal = 'success';
    this.terminalAt = now;
  }

  beginFailure(now: number): void {
    if (this.terminal !== 'none') return;
    this.terminal = 'failure';
    this.terminalAt = now;
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy(true);
  }

  private drawFloorBase(): void {
    const color = this.options.color;
    drawLayeredArcadeSocket(this.floorStatic, this.options.radius, color, 0xff5bcf);
    this.floorStatic.fillStyle(color, 0.025).fillCircle(0, 0, this.options.radius);
    this.floorStatic.lineStyle(1, color, 0.16).strokeCircle(0, 0, this.options.radius);
    this.floorStatic.lineStyle(1, 0x55efff, 0.12);
    for (let offset = -72; offset <= 72; offset += 24) {
      this.floorStatic.lineBetween(-72, offset, 72, offset);
      this.floorStatic.lineBetween(offset, -72, offset, 72);
    }
  }

  private drawPodShell(graphics: Phaser.GameObjects.Graphics): void {
    const color = this.options.color;
    // Thick front, top and side planes keep the pod readable as a physical
    // reinforced crate instead of a flat event marker.
    graphics.fillStyle(0x3a271b, 1).fillPoints([
      new Phaser.Geom.Point(-43, -36), new Phaser.Geom.Point(27, -36),
      new Phaser.Geom.Point(43, -19), new Phaser.Geom.Point(43, 35),
      new Phaser.Geom.Point(-43, 35), new Phaser.Geom.Point(-43, -19)
    ], true, true);
    graphics.lineStyle(3, color, 0.96).strokePoints([
      new Phaser.Geom.Point(-43, -36), new Phaser.Geom.Point(27, -36),
      new Phaser.Geom.Point(43, -19), new Phaser.Geom.Point(43, 35),
      new Phaser.Geom.Point(-43, 35), new Phaser.Geom.Point(-43, -19)
    ], true, true);
    graphics.fillStyle(0x6b4930, 0.96).fillPoints([
      new Phaser.Geom.Point(-43, -36), new Phaser.Geom.Point(-24, -51),
      new Phaser.Geom.Point(40, -47), new Phaser.Geom.Point(27, -36)
    ], true, true);
    graphics.lineStyle(2, 0xd9feff, 0.66).strokePoints([
      new Phaser.Geom.Point(-43, -36), new Phaser.Geom.Point(-24, -51),
      new Phaser.Geom.Point(40, -47), new Phaser.Geom.Point(27, -36)
    ], true, true);
    graphics.fillStyle(0x241821, 1).fillPoints([
      new Phaser.Geom.Point(27, -36), new Phaser.Geom.Point(43, -19),
      new Phaser.Geom.Point(43, 35), new Phaser.Geom.Point(28, 28)
    ], true, true);
    graphics.lineStyle(2, 0xff5bcf, 0.72).strokePoints([
      new Phaser.Geom.Point(27, -36), new Phaser.Geom.Point(43, -19),
      new Phaser.Geom.Point(43, 35), new Phaser.Geom.Point(28, 28)
    ], true, true);
    graphics.lineStyle(1, 0xd8a76a, 0.32);
    for (let y = -24; y <= 24; y += 12) graphics.lineBetween(-38, y, 37, y + 2);
    graphics.fillStyle(0x091723, 0.94).fillRect(-43, -12, 86, 8).fillRect(-43, 22, 86, 8);
    graphics.fillStyle(0x142a38, 0.98).fillRect(-34, -40, 8, 72).fillRect(25, -37, 8, 68);
    graphics.lineStyle(2, color, 0.78).strokeRect(-34, -40, 8, 72).strokeRect(25, -37, 8, 68);
    for (let x = -27; x <= 21; x += 12) {
      graphics.fillStyle(x % 24 === 0 ? 0xffd65a : 0x101820, 0.9).fillRect(x, 24, 8, 5);
    }
    graphics.fillStyle(0xc8e5ea, 0.82);
    for (const x of [-36, 35]) for (const y of [-29, 28]) graphics.fillCircle(x, y, 2.4);
    graphics.fillStyle(color, 0.88).fillCircle(-34, 29, 3).fillCircle(34, 29, 3);
  }

  private drawParachute(canopy: Phaser.GameObjects.Graphics, lines: Phaser.GameObjects.Graphics): void {
    const colors = [0x4deeff, 0xff54c9, 0xa766ff, 0xffd65a, 0x54ffa8];
    const left = -76;
    const segmentWidth = 152 / colors.length;
    for (let index = 0; index < colors.length; index += 1) {
      const x0 = left + index * segmentWidth;
      const x1 = x0 + segmentWidth;
      canopy.fillStyle(colors[index], 0.28 + (index % 2) * 0.1).fillPoints([
        new Phaser.Geom.Point(x0, -116), new Phaser.Geom.Point(x1, -116),
        new Phaser.Geom.Point(x1 - 7, -139 - (2 - Math.abs(2 - index)) * 7),
        new Phaser.Geom.Point(x0 + 7, -139 - (2 - Math.abs(2 - index)) * 7)
      ], true, true);
      canopy.lineStyle(2, colors[index], 0.88).lineBetween(x0, -116, x1, -116);
    }
    canopy.lineStyle(3, 0xe9ffff, 0.72).beginPath();
    canopy.arc(0, -112, 78, Math.PI, Math.PI * 2, false).strokePath();
    canopy.lineStyle(2, 0x6ff8ff, 0.5).strokeEllipse(0, -116, 155, 22);
    lines.lineStyle(1.5, 0xcafcff, 0.68);
    for (const x of [-70, -35, 35, 70]) {
      lines.lineBetween(x, -116, x < 0 ? -33 : 33, -45);
      lines.fillStyle(0xff5bcf, 0.9).fillCircle(x, -116, 2);
    }
  }

  private drawDescent(elapsed: number, progress: number): void {
    const streakCount = this.options.particlesEnabled ? 8 : 4;
    for (let index = 0; index < streakCount; index += 1) {
      const phase = seededUnit(index, 41) * ARCADE_TAU;
      const radius = 25 + seededUnit(index, 42) * 34;
      const x = Math.cos(phase) * radius;
      const y = Math.sin(phase) * radius;
      const length = 38 + seededUnit(index, 43) * 42;
      this.floorDynamic.lineStyle(index % 2 ? 2 : 3, index % 2 ? 0xff5bcf : this.options.color, (1 - progress) * 0.58);
      this.floorDynamic.lineBetween(x, y - length - (elapsed % 70), x, y);
    }
    this.floorDynamic.lineStyle(3, 0xffffff, (1 - progress) * 0.7).strokeCircle(0, 0, 20 + progress * 82);
  }

  private drawLandingImpact(elapsed: number): void {
    const t = clamp01(elapsed / 720);
    if (t >= 1) return;
    this.floorDynamic.lineStyle(4, 0xe9ffff, (1 - t) * 0.82).strokeEllipse(0, 16, 42 + t * 170, 14 + t * 54);
    const count = this.options.particlesEnabled ? 16 : 8;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI * (1.05 + seededUnit(index, 66) * 0.9);
      const distance = t * (42 + seededUnit(index, 67) * 92);
      const x = Math.cos(angle) * distance;
      const y = 26 + Math.sin(angle) * distance * 0.32;
      this.floorDynamic.fillStyle(index % 3 === 0 ? 0xffd65a : this.options.color, (1 - t) * 0.78)
        .fillRect(x - 2, y - 2, 3 + index % 3, 3 + index % 3);
    }
  }

  private drawTerminal(now: number): void {
    const progress = clamp01((now - this.terminalAt) / 620);
    if (this.terminal === 'success') {
      const doorProgress = clamp01(progress * 2.6);
      this.leftDoor.setX(-17 - doorProgress * 29).setRotation(-doorProgress * 0.25);
      this.rightDoor.setX(17 + doorProgress * 29).setRotation(doorProgress * 0.25);
      this.floorDynamic.lineStyle(4, this.options.color, (1 - progress) * 0.9).strokeCircle(0, 0, 25 + progress * 150);
      const burstCount = this.options.particlesEnabled ? TERMINAL_BURST_COUNT : 10;
      for (let index = 0; index < burstCount; index += 1) {
        const angle = index / burstCount * ARCADE_TAU + seededUnit(index, 58) * 0.28;
        const distance = progress * (70 + seededUnit(index, 59) * 90);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        this.floorDynamic.fillStyle(index % 3 === 0 ? 0xffd65a : this.options.color, (1 - progress) * 0.9)
          .fillRect(x - 2, y - 2, 4 + index % 3, 4 + index % 3);
      }
    } else {
      const flicker = Math.floor(now / 65) % 2 === 0 ? 0.9 : 0.28;
      this.floorDynamic.lineStyle(5, 0xff496f, flicker * (1 - progress));
      this.floorDynamic.lineBetween(-62, -62, 62, 62);
      this.floorDynamic.lineBetween(62, -62, -62, 62);
      this.root.setAlpha(0.55 + flicker * 0.25);
    }
  }
}
