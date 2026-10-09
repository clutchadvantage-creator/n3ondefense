import Phaser from 'phaser';
import { BRAWLER_MACE, type BrawlerMaceMotion } from './BrawlerMaceMotion.ts';

/** One reusable code-native layer: articulated arms, reeled chain and a faceted spiked head. */
export class BrawlerMaceRig {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, root: Phaser.GameObjects.Container) {
    this.graphics = scene.add.graphics();
    root.add(this.graphics);
  }

  draw(motion: BrawlerMaceMotion, charge: number, flash: boolean, defeated = false): void {
    const g = this.graphics.clear();
    const neon = defeated ? 0x727582 : flash ? 0xffffff : 0xff448f;
    const steel = defeated ? 0x545763 : 0x637f91;
    const angle = motion.angle, c = Math.cos(angle), s = Math.sin(angle);
    const px = BRAWLER_MACE.pivotX, py = BRAWLER_MACE.pivotY;
    const hx = px + c * motion.reach, hy = py + s * motion.reach;

    // Substantial shoulder / elbow / wrist assemblies on both sides of the chassis.
    const arm = (side: number, endX: number, endY: number) => {
      const elbowX = -5 + Math.cos(angle) * (side < 0 ? 5 : 0), elbowY = side * 37;
      g.lineStyle(18, 0x111c28).lineBetween(-7, side * 18, elbowX, elbowY);
      g.lineStyle(12, steel).lineBetween(-7, side * 18, elbowX, elbowY);
      g.lineStyle(15, 0x111c28).lineBetween(elbowX, elbowY, endX, endY);
      g.lineStyle(9, 0x3a5063).lineBetween(elbowX, elbowY, endX, endY);
      g.lineStyle(2, neon, .85).lineBetween(elbowX, elbowY - 3, endX, endY - 3);
      for (const [x, y, r] of [[-7, side * 18, 10], [elbowX, elbowY, 8], [endX, endY, 8]]) {
        g.fillStyle(0x172534).fillCircle(x, y, r);
        g.lineStyle(2, steel).strokeCircle(x, y, r);
        g.fillStyle(neon).fillCircle(x, y, 3);
      }
    };
    arm(-1, px, py);
    arm(1, 22 + charge * 8, 38);

    // A short swept glow makes the rotation readable without covering the arena.
    if (motion.swinging && !defeated) {
      g.lineStyle(10, neon, .07 + motion.extension * .05);
      g.beginPath().arc(px, py, motion.reach, angle - .75, angle, false).strokePath();
      g.lineStyle(2, neon, .36);
      g.beginPath().arc(px, py, motion.reach, angle - .45, angle, false).strokePath();
    }
    g.lineStyle(8, 0x070c14, .6).lineBetween(px + 3, py + 5, hx + 3, hy + 5);
    g.lineStyle(6, 0x172231).lineBetween(px, py, hx, hy);
    // The extra length is actual exposed links, not a stretched handle texture.
    const links = Math.ceil((motion.reach - 21) / 9);
    for (let i = 0; i < links; i++) {
      const d = 10 + i * 9, x = px + c * d, y = py + s * d;
      g.lineStyle(i % 2 ? 3 : 2, i % 2 ? 0xa7bac7 : steel);
      g.lineBetween(x - c * 3 - s * 2, y - s * 3 + c * 2, x + c * 3 + s * 2, y + s * 3 - c * 2);
    }
    g.fillStyle(0x060b13, .5).fillCircle(hx + 4, hy + 6, 24);
    // Eight metal spikes, with lit bevels and a layered armored core.
    for (let i = 0; i < 8; i++) {
      const a = angle + i * Math.PI / 4, ac = Math.cos(a), as = Math.sin(a);
      const bx = hx + ac * 18, by = hy + as * 18;
      g.fillStyle(i < 4 ? 0xa8bccb : steel);
      g.fillTriangle(bx - as * 6, by + ac * 6, hx + ac * BRAWLER_MACE.headRadius, hy + as * BRAWLER_MACE.headRadius, bx + as * 6, by - ac * 6);
      g.lineStyle(1, 0xd4e2e9, .7).lineBetween(bx - as * 6, by + ac * 6, hx + ac * BRAWLER_MACE.headRadius, hy + as * BRAWLER_MACE.headRadius);
    }
    g.fillStyle(0x131f2f).fillCircle(hx, hy, 21);
    g.lineStyle(3, steel).strokeCircle(hx, hy, 21);
    g.fillStyle(0x5c244a).fillCircle(hx - 2, hy - 2, 16);
    g.lineStyle(2, neon).strokeCircle(hx - 2, hy - 2, 16);
    g.lineStyle(5, 0x283d51).lineBetween(hx - c * 17, hy - s * 17, hx + c * 17, hy + s * 17);
    g.lineStyle(2, neon).lineBetween(hx - s * 16, hy + c * 16, hx + s * 16, hy - c * 16);
    g.fillStyle(0x182432).fillCircle(hx, hy, 8);
    g.lineStyle(2, 0x9db5c8).strokeCircle(hx, hy, 8);
    g.fillStyle(neon).fillCircle(hx, hy, 4);
    // Three reel indicators fill as the chain pays out.
    for (let i = 0; i < 3; i++) g.fillStyle(neon, motion.extension > i / 3 ? 1 : .25).fillRect(px - 6 + i * 5, py - 12, 3, 4);
  }
}
