import Phaser from 'phaser';

export class Mine {
  readonly sprite: Phaser.GameObjects.Arc;
  readonly armAt: number;
  readonly damage: number;
  readonly radius: number;
  armed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, color: number, armMs: number, damage: number, radius: number) {
    this.sprite = scene.add.circle(x, y, 8, color, 0.7);
    this.sprite.setStrokeStyle(2, color, 1);
    this.sprite.setDepth(6);
    this.armAt = scene.time.now + armMs;
    this.damage = damage;
    this.radius = radius;

    scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 0.3, to: 0.8 },
      duration: 280,
      yoyo: true,
      repeat: -1
    });
  }

  update(now: number): void {
    if (!this.armed && now >= this.armAt) {
      this.armed = true;
      this.sprite.setFillStyle(0xffa44d, 1);
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
