import Phaser from 'phaser';

interface ImpactSlot { x: number; y: number; angle: number; color: number; bornAt: number; scale: number; }
interface SmokeSlot { x: number; y: number; angle: number; bornAt: number; size: number; }

/** Same batched, preallocated approach as PlayerMuzzleFlashVfx. Overload only
 * replaces the oldest cosmetic sample; it never changes combat capacity. */
export class ProjectileImpactVfx {
  private readonly sparks: Phaser.GameObjects.Graphics;
  private readonly smoke: Phaser.GameObjects.Graphics;
  private readonly impacts: ImpactSlot[];
  private readonly trails: SmokeSlot[];
  private impactCursor = 0;
  private smokeCursor = 0;

  constructor(scene: Phaser.Scene, particlesEnabled = true) {
    this.sparks = scene.add.graphics().setDepth(9.2).setBlendMode(Phaser.BlendModes.ADD);
    this.smoke = scene.add.graphics().setDepth(7.8);
    this.impacts = Array.from({ length: particlesEnabled ? 48 : 24 }, () =>
      ({ x: 0, y: 0, angle: 0, color: 0, bornAt: -Infinity, scale: 1 }));
    this.trails = Array.from({ length: particlesEnabled ? 192 : 96 }, () =>
      ({ x: 0, y: 0, angle: 0, bornAt: -Infinity, size: 1 }));
  }

  emit(x: number, y: number, angle: number, color: number, now: number, scale = 1): void {
    const slot = this.impacts[this.impactCursor++ % this.impacts.length];
    slot.x = x; slot.y = y; slot.angle = angle; slot.color = color; slot.bornAt = now; slot.scale = scale;
  }

  emitMissileTrail(x: number, y: number, angle: number, now: number, size = 1): void {
    const slot = this.trails[this.smokeCursor++ % this.trails.length];
    slot.x = x; slot.y = y; slot.angle = angle; slot.bornAt = now; slot.size = size;
  }

  emitMissileImpact(x: number, y: number, angle: number, now: number): void {
    this.emit(x, y, angle, 0xffaf57, now, 3);
    for (let i = 0; i < 6; i++) this.emitMissileTrail(x, y, i * Math.PI / 3, now, 2.5);
  }

  update(now: number): void {
    this.sparks.clear();
    this.smoke.clear();
    for (const slot of this.trails) {
      const age = (now - slot.bornAt) / 650;
      if (age < 0 || age >= 1) continue;
      const x = slot.x - Math.cos(slot.angle) * age * 12 * slot.size;
      const y = slot.y - Math.sin(slot.angle) * age * 12 * slot.size - age * 6;
      this.smoke.fillStyle(0x63717c, 0.28 * (1 - age))
        .fillCircle(x, y, (2 + age * 6) * slot.size);
      if (age < 0.16 && slot.size === 1) {
        const length = 7 + Math.sin(now * 0.06) * 2;
        this.sparks.lineStyle(2.5 * (1 - age / 0.16), 0xffa547, 0.8)
          .lineBetween(slot.x, slot.y, slot.x - Math.cos(slot.angle) * length, slot.y - Math.sin(slot.angle) * length);
        this.sparks.fillStyle(0xfff5c9, 0.9).fillCircle(slot.x, slot.y, 1.4);
      }
    }
    for (const slot of this.impacts) {
      const age = (now - slot.bornAt) / (slot.scale > 1 ? 300 : 140);
      if (age < 0 || age >= 1) continue;
      const fade = (1 - age) ** 2;
      if (age < 0.35) {
        this.sparks.fillStyle(0xffffff, (1 - age / 0.35) * 0.95)
          .fillCircle(slot.x, slot.y, (2.8 + age * 5) * slot.scale);
      }
      for (let i = 0; i < 5; i++) {
        // Backscatter follows the incoming projectile, never camera motion.
        const angle = slot.angle + Math.PI + (i - 2) * 0.55;
        const distance = (3 + age * (13 + i % 2 * 8)) * slot.scale;
        const x = slot.x + Math.cos(angle) * distance;
        const y = slot.y + Math.sin(angle) * distance;
        this.sparks.lineStyle(i % 2 ? 1 : 1.5, slot.color, fade * 0.85)
          .lineBetween(x, y, x + Math.cos(angle) * 4 * slot.scale, y + Math.sin(angle) * 4 * slot.scale);
        if (i % 2 === 0) this.smoke.fillStyle(0xdce9f0, fade).fillRect(x, y, 1.5 * slot.scale, 1.5 * slot.scale);
      }
    }
  }

  reset(): void {
    for (const slot of this.impacts) slot.bornAt = -Infinity;
    for (const slot of this.trails) slot.bornAt = -Infinity;
    this.sparks.clear(); this.smoke.clear();
  }

  stats(now: number): { impacts: number; smoke: number; impactCapacity: number; smokeCapacity: number } {
    let impacts = 0, smoke = 0;
    for (const slot of this.impacts) if (now - slot.bornAt < (slot.scale > 1 ? 300 : 140)) impacts++;
    for (const slot of this.trails) if (now - slot.bornAt < 650) smoke++;
    return { impacts, smoke, impactCapacity: this.impacts.length, smokeCapacity: this.trails.length };
  }

  destroy(): void { this.reset(); this.sparks.destroy(); this.smoke.destroy(); }
}
