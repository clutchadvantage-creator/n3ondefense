import Phaser from 'phaser';

export class Turret {
  readonly sprite: Phaser.GameObjects.Container;
  private readonly head: Phaser.GameObjects.Container;
  private readonly healthTrack: Phaser.GameObjects.Rectangle;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private readonly maxHp: number;
  hp: number;
  damage: number;
  range: number;
  fireRate: number;
  lastShotMs = 0;
  disabledUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, color: number, hp: number, damage: number, fireRate: number, range: number) {
    const glow = scene.add.circle(0, 1, 15, color, 0.12).setStrokeStyle(1, color, 0.32);
    const base = scene.add.circle(0, 4, 10, 0x07131d, 0.98).setStrokeStyle(2, color, 0.95);
    const housing = scene.add.rectangle(0, 0, 15, 12, 0x102838, 1).setStrokeStyle(2, color, 1);
    const barrel = scene.add.rectangle(0, -11, 6, 18, color, 0.92).setStrokeStyle(1, 0xffffff, 0.72);
    const muzzle = scene.add.rectangle(0, -21, 10, 5, 0x07131d, 1).setStrokeStyle(2, color, 1);
    const core = scene.add.circle(0, 1, 3, 0xffffff, 0.95);
    this.head = scene.add.container(0, 0, [housing, barrel, muzzle, core]);
    this.healthTrack = scene.add.rectangle(0, 21, 28, 4, 0x130b12, 0.92).setStrokeStyle(1, color, 0.7);
    this.healthFill = scene.add.rectangle(-13, 21, 26, 2, 0x53ff8a, 1).setOrigin(0, 0.5);
    this.sprite = scene.add.container(x, y, [glow, base, this.head, this.healthTrack, this.healthFill]);
    this.sprite.setSize(30, 46).setDepth(7);
    this.hp = hp;
    this.maxHp = hp;
    this.damage = damage;
    this.fireRate = fireRate;
    this.range = range;
    this.updateVisual();
  }

  aimAt(angle: number): void {
    this.head.rotation = angle + Math.PI / 2;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    this.updateVisual();
  }

  updateVisual(): void {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.healthFill.displayWidth = 26 * ratio;
    const color = ratio > 0.55 ? 0x53ff8a : ratio > 0.25 ? 0xffc34d : 0xff4e63;
    this.healthFill.setFillStyle(color, 1);
    this.healthTrack.setVisible(ratio < 0.999);
    this.healthFill.setVisible(ratio < 0.999);
  }

  canFire(now: number): boolean {
    return now >= this.disabledUntil && now - this.lastShotMs >= 1000 / this.fireRate;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
