import Phaser from 'phaser';

export type LayeredArtPoint = Phaser.Types.Math.Vector2Like;

/**
 * Small boot-time drawing primitives shared by cached world-art generators.
 * These helpers deliberately create no runtime display objects.
 */
export const drawLayeredPanel = (
  graphics: Phaser.GameObjects.Graphics,
  points: LayeredArtPoint[],
  fill: number,
  outline: number,
  lineWidth = 2,
  alpha = 1
): void => {
  graphics.fillStyle(fill, alpha).fillPoints(points, true);
  graphics.lineStyle(lineWidth, outline, 1).strokePoints(points, true);
};

export const drawBakedShadow = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 0.38
): void => {
  graphics.fillStyle(0x000000, alpha).fillEllipse(x, y, width, height);
  graphics.fillStyle(0x000000, alpha * 0.45).fillEllipse(x, y - 1, width * 0.78, height * 0.68);
};

export const drawMechanicalRivets = (
  graphics: Phaser.GameObjects.Graphics,
  points: LayeredArtPoint[],
  highlight: number,
  recess: number,
  radius = 1.35
): void => {
  for (const point of points) {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    graphics.fillStyle(recess, 0.82).fillCircle(x + radius * 0.28, y + radius * 0.32, radius * 1.08);
    graphics.fillStyle(highlight, 0.96).fillCircle(x, y, radius);
  }
};
