import Phaser from 'phaser';
import type { ModStatPresentationState } from './PlasmaRecalibration.ts';

/** Cached-shape-friendly status art: no tweens, timers, or per-frame redraws. */
export const createModStatStatusIcon = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  state: ModStatPresentationState,
  compact = false
): Phaser.GameObjects.Container => {
  const root = scene.add.container(x, y);
  const size = compact ? 11 : 14;
  const glowColor = state === 'native' ? 0x77f6ff : 0xff75dc;
  const glow = scene.add.circle(0, 0, size * .72, glowColor, .12)
    .setStrokeStyle(1, glowColor, .36);
  root.add(glow);

  if (state === 'recalibrated') {
    const star = scene.add.star(0, 0, 4, size * .18, size * .52, 0xf5ffff, .98)
      .setStrokeStyle(1, glowColor, 1);
    const core = scene.add.circle(0, 0, Math.max(1.2, size * .1), glowColor, 1);
    root.add([star, core]);
    return root;
  }

  const feather = scene.add.graphics();
  feather.lineStyle(compact ? 1.2 : 1.5, 0xeaffff, 1);
  feather.beginPath();
  feather.moveTo(-size * .34, size * .43);
  feather.lineTo(size * .36, -size * .42);
  feather.lineTo(size * .18, -size * .43);
  feather.lineTo(-size * .42, size * .12);
  feather.lineTo(-size * .34, size * .43);
  feather.strokePath();
  feather.lineStyle(1, glowColor, .92);
  feather.lineBetween(-size * .3, size * .4, size * .3, -size * .35);
  feather.lineBetween(-size * .22, size * .2, -size * .36, -size * .02);
  feather.lineBetween(-size * .06, size * .02, -size * .2, -size * .2);
  feather.lineBetween(size * .08, -size * .13, size * .24, -size * .08);
  root.add(feather);
  return root;
};
