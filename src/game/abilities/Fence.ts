import Phaser from 'phaser';

export class Fence {
  readonly sprite: Phaser.GameObjects.Rectangle;
  readonly width: number;
  hp: number;
  dps: number;
  slowFactor: number;
  expiresAt: number;

  constructor(scene: Phaser.Scene, x: number, y: number, angle: number, color: number, width: number, durationMs: number, hp: number, dps: number, slowFactor: number) {
    this.width = width;
    this.sprite = scene.add.rectangle(x, y, width, 8, color, 0.7);
    this.sprite.setStrokeStyle(2, color, 1);
    this.sprite.setRotation(angle);
    this.sprite.setDepth(4);

    scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 0.35, to: 0.95 },
      yoyo: true,
      duration: 180,
      repeat: -1
    });

    this.hp = hp;
    this.dps = dps;
    this.slowFactor = slowFactor;
    this.expiresAt = scene.time.now + durationMs;
  }

  isExpired(now: number): boolean {
    return now >= this.expiresAt || this.hp <= 0;
  }

  setColor(color: number): void {
    this.sprite.setFillStyle(color, 0.7);
    this.sprite.setStrokeStyle(2, color, 1);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
