import Phaser from 'phaser';
import { COLORS } from '../config/constants.ts';

interface ShieldSource { x: number; y: number }

/** Shared gameplay shield presentation used in every combat location. */
export class OperativeShieldEffect {
  readonly root: Phaser.GameObjects.Container;
  private readonly shell: Phaser.GameObjects.Arc;
  private readonly innerField: Phaser.GameObjects.Arc;
  private readonly orbitArcs: Phaser.GameObjects.Graphics;
  private readonly crackleA: Phaser.GameObjects.Graphics;
  private readonly crackleB: Phaser.GameObjects.Graphics;
  private readonly tweens: Phaser.Tweens.Tween[] = [];

  constructor(scene: Phaser.Scene, source: ShieldSource) {
    this.root = scene.add.container(source.x, source.y).setDepth(12).setAlpha(0).setScale(0.18);
    const rearGlow = scene.add.ellipse(0, 5, 84, 69, COLORS.purple, 0.035)
      .setStrokeStyle(1, COLORS.purple, 0.24).setBlendMode(Phaser.BlendModes.ADD);
    this.innerField = scene.add.circle(0, 0, 36, COLORS.cyan, 0.065)
      .setStrokeStyle(1, 0xffffff, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    this.shell = scene.add.circle(0, 0, 41, COLORS.cyan, 0.045)
      .setStrokeStyle(3, COLORS.cyan, 0.78).setBlendMode(Phaser.BlendModes.ADD);
    const lensGlow = scene.add.ellipse(-11, -13, 34, 15, 0xffffff, 0.095)
      .setRotation(-0.45).setBlendMode(Phaser.BlendModes.ADD);

    this.orbitArcs = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.orbitArcs.lineStyle(2, 0xffffff, 0.72);
    for (let index = 0; index < 6; index += 1) {
      const start = index * Math.PI / 3 + 0.08;
      this.orbitArcs.beginPath().arc(0, 0, 42, start, start + 0.48, false).strokePath();
    }
    this.orbitArcs.lineStyle(1, COLORS.purple, 0.48);
    for (let index = 0; index < 3; index += 1) {
      const start = index * Math.PI * 2 / 3 + 0.35;
      this.orbitArcs.beginPath().arc(0, 0, 45, start, start + 0.7, false).strokePath();
    }

    const drawCrackle = (graphics: Phaser.GameObjects.Graphics, offset: number, color: number): void => {
      graphics.setBlendMode(Phaser.BlendModes.ADD).lineStyle(2, color, 0.9);
      for (let index = 0; index < 7; index += 1) {
        const angle = offset + index * Math.PI * 2 / 7;
        const tangentX = -Math.sin(angle);
        const tangentY = Math.cos(angle);
        graphics.beginPath()
          .moveTo(Math.cos(angle) * 36, Math.sin(angle) * 36)
          .lineTo(
            Math.cos(angle) * 40 + tangentX * (index % 2 === 0 ? 5 : -5),
            Math.sin(angle) * 40 + tangentY * (index % 2 === 0 ? 5 : -5)
          )
          .lineTo(Math.cos(angle) * 45, Math.sin(angle) * 45)
          .strokePath();
      }
    };
    this.crackleA = scene.add.graphics();
    this.crackleB = scene.add.graphics();
    drawCrackle(this.crackleA, 0.12, 0xffffff);
    drawCrackle(this.crackleB, 0.48, COLORS.cyan);
    this.root.add([rearGlow, this.innerField, this.shell, lensGlow, this.orbitArcs, this.crackleA, this.crackleB]);

    this.tweens.push(
      scene.tweens.add({ targets: this.root, alpha: 1, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' }),
      scene.tweens.add({ targets: this.shell, scaleX: { from: 0.97, to: 1.04 }, scaleY: { from: 0.97, to: 1.04 },
        alpha: { from: 0.58, to: 0.94 }, duration: 310, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
      scene.tweens.add({ targets: this.innerField, alpha: { from: 0.42, to: 0.75 }, duration: 430,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    );
  }

  update(source: ShieldSource, now: number): void {
    this.root.setPosition(source.x, source.y);
    this.orbitArcs.setRotation(now * 0.0011);
    this.crackleA.setRotation(-now * 0.0018).setAlpha(0.42 + Math.sin(now * 0.031) * 0.24);
    this.crackleB.setRotation(now * 0.0023).setAlpha(0.36 + Math.sin(now * 0.043 + 1.7) * 0.2);
  }

  destroy(): void {
    for (const tween of this.tweens) tween.remove();
    this.tweens.length = 0;
    this.root.destroy(true);
  }
}
