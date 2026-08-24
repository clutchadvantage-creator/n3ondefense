import Phaser from 'phaser';
import type { TurretSkinCosmeticEffectId } from '../types.ts';

export interface PremiumTurretVisualHandle {
  root: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Container;
  setColor(color: number): void;
  update(timeMs: number): void;
  markFired(timeMs: number): void;
}

/**
 * One bounded procedural renderer shared by live turrets and Garage previews.
 * It only changes display objects: the authoritative Turret container/body is
 * still owned by Turret.ts and remains 30 x 46.
 */
export const createPremiumTurretVisual = (
  scene: Phaser.Scene,
  effect: TurretSkinCosmeticEffectId,
  initialColor: number,
  accentColor: number,
  scale = 1
): PremiumTurretVisualHandle => {
  const root = scene.add.container(0, 0).setScale(scale);
  const head = scene.add.container(0, 0);
  const shadow = scene.add.ellipse(3, 10, 35, 15, 0x000000, 0.5);
  const baseArt = scene.add.graphics();
  const headArt = scene.add.graphics();
  const energyArt = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  const orbitA = scene.add.circle(0, 0, 12, 0x000000, 0).setStrokeStyle(1.5, initialColor, 0.68);
  const orbitB = scene.add.circle(0, 0, 16, 0x000000, 0).setStrokeStyle(1, accentColor, 0.48);
  const pulse = scene.add.circle(0, 0, 4, initialColor, 0.72).setBlendMode(Phaser.BlendModes.ADD);
  const muzzleFlash = scene.add.circle(0, -24, 5, accentColor, 0).setBlendMode(Phaser.BlendModes.ADD);
  head.add([headArt, energyArt, pulse, muzzleFlash]);
  root.add([shadow, baseArt, orbitA, orbitB, head]);

  let primary = initialColor;
  let accent = accentColor;
  let lastFiredAt = -10_000;

  const panel = (g: Phaser.GameObjects.Graphics, points: number[], fill: number, stroke: number, alpha = 1): void => {
    g.fillStyle(fill, alpha).fillPoints(points, true);
    g.lineStyle(1.3, stroke, 0.9).strokePoints(points, true);
  };

  const draw = (): void => {
    baseArt.clear(); headArt.clear(); energyArt.clear();
    orbitA.setStrokeStyle(1.5, primary, 0.7);
    orbitB.setStrokeStyle(1, accent, 0.5);
    pulse.setFillStyle(primary, 0.75);
    muzzleFlash.setFillStyle(accent, 1);

    // Every chassis gets a low-cost, non-colliding 2.5D floor mount.
    baseArt.fillStyle(0x07111b, 0.98).fillEllipse(0, 7, 29, 13);
    baseArt.lineStyle(1.5, primary, 0.82).strokeEllipse(0, 7, 29, 13);
    baseArt.lineStyle(1, accent, 0.45).lineBetween(-10, 4, 8, 10);

    switch (effect) {
      case 'void-reactor':
        panel(headArt, [-14, 4, -10, -8, -4, -13, 8, -10, 14, 0, 9, 9, -8, 11], 0x0b0715, primary);
        panel(headArt, [-12, 3, -16, -2, -12, -10, -7, -7, -8, 8], 0x161027, accent, 0.92);
        headArt.lineStyle(2, primary, 0.72).strokeCircle(0, -1, 9);
        headArt.lineStyle(1, accent, 0.6).strokeCircle(0, -1, 13);
        headArt.fillStyle(0x020207, 1).fillCircle(0, -1, 6);
        headArt.fillStyle(primary, 0.92).fillCircle(0, -1, 3.5);
        headArt.fillStyle(0x12091d, 1).fillRect(-3, -24, 6, 14);
        headArt.lineStyle(1.3, accent, 0.85).strokeRect(-3, -24, 6, 14);
        energyArt.lineStyle(1.2, accent, 0.8).lineBetween(-11, -3, -5, -1).lineBetween(5, -1, 13, -6).lineBetween(-8, 6, -3, 1);
        break;
      case 'arc-tesla':
        panel(headArt, [-13, 8, -12, -6, -6, -11, 7, -11, 13, -5, 12, 8], 0x08202b, primary);
        headArt.fillStyle(0x102d38, 1).fillRoundedRect(-7, -9, 14, 16, 3);
        headArt.lineStyle(1.4, accent, 0.85).strokeRoundedRect(-7, -9, 14, 16, 3);
        for (const side of [-1, 1]) {
          headArt.lineStyle(2, primary, 0.92);
          for (let y = -6; y <= 5; y += 4) headArt.lineBetween(side * 8, y, side * 14, y + 1);
          headArt.lineStyle(2, 0xffffff, 0.76).lineBetween(side * 10, -10, side * 8, -23).lineBetween(side * 8, -23, side * 3, -19);
        }
        headArt.lineStyle(2.2, primary, 0.8).lineBetween(0, -9, 0, -24);
        energyArt.lineStyle(1.2, 0xffffff, 0.88).lineBetween(-10, -12, -4, -16).lineBetween(-4, -16, 2, -12).lineBetween(2, -12, 8, -18);
        break;
      case 'cyber-shark':
        panel(headArt, [-17, 4, -12, -8, -3, -13, 11, -9, 17, -2, 10, 8, -9, 10], 0x09202a, primary);
        panel(headArt, [-7, -11, -1, -19, 4, -10], 0x0d3340, accent);
        headArt.lineStyle(2, accent, 0.8).lineBetween(-12, 3, 11, 3);
        for (let x = -8; x <= 8; x += 4) headArt.fillStyle(0xdffeff, 0.9).fillTriangle(x, 3, x + 2, 7, x + 4, 3);
        headArt.fillStyle(0xff3b83, 0.95).fillRect(-8, -6, 6, 2);
        headArt.fillStyle(0x07131b, 1).fillRoundedRect(-3, -26, 7, 18, 2);
        headArt.lineStyle(1.3, primary, 0.9).strokeRoundedRect(-3, -26, 7, 18, 2);
        energyArt.lineStyle(1.3, 0x7ffff2, 0.65).lineBetween(-7, -22, -13, -28).lineBetween(7, -21, 14, -26);
        break;
      case 'glitch-phantom':
        panel(headArt, [-15, 8, -13, -8, -4, -13, 11, -8, 14, 5, 6, 10, -7, 8], 0x15071e, primary, 0.92);
        panel(headArt, [-9, 4, -8, -10, 5, -15, 16, -5, 10, 7], 0x08151f, accent, 0.45);
        headArt.fillStyle(primary, 0.9).fillRect(-2, -25, 5, 16);
        headArt.fillStyle(accent, 0.55).fillRect(3, -23, 3, 13);
        energyArt.fillStyle(primary, 0.6).fillRect(-19, -8, 7, 2).fillRect(10, 1, 9, 2).fillRect(-7, 12, 6, 2);
        energyArt.fillStyle(accent, 0.68).fillRect(-13, -3, 4, 2).fillRect(7, -12, 8, 2).fillRect(2, 8, 4, 2);
        break;
      case 'hellfire-core':
        panel(headArt, [-16, 8, -15, -8, -9, -14, 10, -13, 16, -5, 14, 8], 0x20100b, primary);
        headArt.fillStyle(0x35150c, 1).fillRoundedRect(-9, -10, 18, 17, 2);
        headArt.lineStyle(1.5, primary, 0.9).strokeRoundedRect(-9, -10, 18, 17, 2);
        for (const side of [-1, 1]) for (let y = -7; y <= 4; y += 4) headArt.fillStyle(accent, 0.72).fillRect(side * 10, y, 5 * side, 2);
        headArt.fillStyle(0x17100d, 1).fillRoundedRect(-5, -28, 10, 19, 2);
        headArt.lineStyle(2.2, primary, 0.92).strokeRoundedRect(-5, -28, 10, 19, 2);
        headArt.lineStyle(1, accent, 0.7).lineBetween(-4, -21, 4, -21);
        energyArt.fillStyle(primary, 0.5).fillCircle(-11, -15, 2).fillCircle(10, -18, 1.5).fillCircle(-7, -23, 1.2);
        break;
      case 'arctic-zero':
        panel(headArt, [-15, 7, -12, -8, -5, -15, 7, -13, 15, -5, 12, 8], 0xd8fbff, primary, 0.92);
        panel(headArt, [-13, -4, -19, -10, -15, 4], 0x6fd7ef, accent, 0.62);
        panel(headArt, [11, -5, 18, -12, 15, 4], 0xefffff, primary, 0.68);
        headArt.fillStyle(0x153142, 1).fillRoundedRect(-5, -26, 10, 17, 3);
        headArt.lineStyle(2, primary, 0.95).strokeRoundedRect(-5, -26, 10, 17, 3);
        headArt.lineStyle(1.2, 0xffffff, 0.92).strokeCircle(0, -18, 6);
        energyArt.fillStyle(0xffffff, 0.8).fillCircle(-13, -19, 1.2).fillCircle(9, -14, 1.5).fillCircle(14, 3, 1);
        break;
      case 'mini-orbital':
        baseArt.lineStyle(2, accent, 0.65).lineBetween(-13, 7, -8, -4).lineBetween(13, 7, 8, -4);
        headArt.fillStyle(0x071923, 1).fillCircle(0, -4, 11);
        headArt.lineStyle(1.8, primary, 0.95).strokeCircle(0, -4, 11);
        headArt.fillStyle(accent, 0.9).fillCircle(0, -4, 4);
        headArt.lineStyle(1.4, primary, 0.82).strokeEllipse(0, -4, 31, 12);
        headArt.lineStyle(1, accent, 0.66).strokeEllipse(0, -4, 16, 31);
        headArt.fillStyle(0x0b1d28, 1).fillRect(-3, -27, 6, 13);
        headArt.lineStyle(1.2, accent, 0.88).strokeRect(-3, -27, 6, 13);
        break;
      case 'bomb-buddy':
        panel(headArt, [-16, 8, -16, -9, -9, -14, 11, -14, 16, -7, 16, 8], 0x17202a, primary);
        headArt.fillStyle(0x26303b, 1).fillRoundedRect(-11, -11, 22, 17, 2);
        headArt.lineStyle(1.5, accent, 0.72).strokeRoundedRect(-11, -11, 22, 17, 2);
        for (let x = -10; x < 9; x += 6) headArt.fillStyle((x / 6) % 2 ? 0x121820 : primary, 0.9).fillRect(x, 1, 6, 4);
        headArt.fillStyle(0x70ff9b, 0.95).fillCircle(-7, -7, 1.8);
        headArt.fillStyle(0xff526d, 0.95).fillCircle(7, -7, 1.8);
        headArt.fillStyle(0x101820, 1).fillRoundedRect(-5, -27, 10, 16, 2);
        headArt.lineStyle(1.5, primary, 0.94).strokeRoundedRect(-5, -27, 10, 16, 2);
        headArt.lineStyle(1, accent, 0.65).lineBetween(-10, -3, 10, -3);
        break;
    }
  };

  draw();
  orbitA.setVisible(effect === 'void-reactor' || effect === 'mini-orbital' || effect === 'arc-tesla');
  orbitB.setVisible(effect === 'void-reactor' || effect === 'mini-orbital');
  return {
    root,
    head,
    setColor: (color: number) => { primary = color; draw(); },
    markFired: (timeMs: number) => { lastFiredAt = timeMs; },
    update: (timeMs: number) => {
      const phase = timeMs * 0.001;
      const breathe = 0.5 + Math.sin(phase * 3.2) * 0.5;
      pulse.setScale(0.78 + breathe * 0.34).setAlpha(0.42 + breathe * 0.5);
      orbitA.rotation = phase * (effect === 'mini-orbital' ? 1.8 : 0.45);
      orbitB.rotation = -phase * (effect === 'void-reactor' ? 1.2 : 0.3);
      orbitA.setScale(1, effect === 'mini-orbital' ? 0.42 : 1);
      orbitB.setScale(effect === 'mini-orbital' ? 0.68 : 1, 1);
      orbitA.setVisible(effect === 'void-reactor' || effect === 'mini-orbital' || effect === 'arc-tesla');
      orbitB.setVisible(effect === 'void-reactor' || effect === 'mini-orbital');
      energyArt.setAlpha(effect === 'glitch-phantom' ? 0.42 + Math.abs(Math.sin(phase * 17)) * 0.58 : 0.55 + breathe * 0.4);
      energyArt.x = effect === 'glitch-phantom' ? Math.round(Math.sin(phase * 19) * 2) : 0;
      head.y = effect === 'mini-orbital' ? Math.sin(phase * 2.4) * 1.7 : 0;
      const firedAge = timeMs - lastFiredAt;
      muzzleFlash.setAlpha(firedAge >= 0 && firedAge < 110 ? 1 - firedAge / 110 : 0);
      muzzleFlash.setScale(1 + Math.max(0, 1 - firedAge / 110) * 0.9);
    }
  };
};
