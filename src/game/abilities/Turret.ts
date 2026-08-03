import Phaser from 'phaser';

export class Turret {
  readonly sprite: Phaser.GameObjects.Triangle;
  hp: number;
  damage: number;
  range: number;
  fireRate: number;
  lastShotMs = 0;
  disabledUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, color: number, hp: number, damage: number, fireRate: number, range: number) {
    this.sprite = scene.add.triangle(x, y, 0, 22, 11, 0, 22, 22, color, 0.85);
    this.sprite.setStrokeStyle(2, color, 1);
    this.sprite.setDepth(7);
    this.hp = hp;
    this.damage = damage;
    this.fireRate = fireRate;
    this.range = range;
  }

  canFire(now: number): boolean {
    return now >= this.disabledUntil && now - this.lastShotMs >= 1000 / this.fireRate;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
