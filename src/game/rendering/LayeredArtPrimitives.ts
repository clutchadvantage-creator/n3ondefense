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

/**
 * Setup-time pseudo-3D plate used by environment renderers. The small offset
 * side face and inset highlight give flat world geometry readable thickness
 * without introducing another display object or a runtime effect.
 */
export const drawBeveledTechPlate = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    face: number;
    inset: number;
    edge: number;
    side?: number;
    highlight?: number;
    depth?: number;
    alpha?: number;
  }
): void => {
  const depth = Math.max(2, Math.min(options.depth ?? 7, width * 0.12, height * 0.22));
  const alpha = options.alpha ?? 1;
  graphics.fillStyle(0x000000, 0.32 * alpha).fillRoundedRect(x + depth, y + depth + 2, width, height, 4);
  graphics.fillStyle(options.side ?? 0x02060b, alpha).fillPoints([
    { x: x + width - depth, y: y + depth },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x: x + width - depth, y: y + height - depth }
  ], true);
  graphics.fillStyle(options.face, alpha).fillRoundedRect(x, y, width - depth, height - depth, 4);
  graphics.fillStyle(options.inset, 0.92 * alpha).fillRoundedRect(
    x + depth, y + depth, Math.max(2, width - depth * 3), Math.max(2, height - depth * 3), 3
  );
  graphics.lineStyle(2, options.edge, 0.72 * alpha).strokeRoundedRect(x + 1, y + 1, width - depth - 2, height - depth - 2, 4);
  graphics.lineStyle(1, options.highlight ?? 0xa9f8ff, 0.2 * alpha).lineBetween(
    x + depth + 3, y + depth + 2, x + width - depth * 2 - 3, y + depth + 2
  );
};

export const drawPanelBolts = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color = 0x7f9aaa,
  inset = 8
): void => {
  drawMechanicalRivets(graphics, [
    { x: x + inset, y: y + inset },
    { x: x + width - inset, y: y + inset },
    { x: x + inset, y: y + height - inset },
    { x: x + width - inset, y: y + height - inset }
  ], color, 0x010306, 1.2);
};

export const drawHazardStripes = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color = 0xffc857,
  alpha = 0.55,
  stripeWidth = 12
): void => {
  graphics.fillStyle(0x05070a, Math.min(0.9, alpha + 0.18)).fillRect(x, y, width, height);
  graphics.fillStyle(color, alpha);
  for (let offset = -height; offset < width; offset += stripeWidth * 2) {
    graphics.fillPoints([
      { x: x + offset, y: y + height },
      { x: x + offset + stripeWidth, y: y + height },
      { x: x + offset + stripeWidth + height, y },
      { x: x + offset + height, y }
    ], true);
  }
};

export const drawVentSlats = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  horizontal: boolean,
  accent = 0x48efff
): void => {
  graphics.fillStyle(0x010409, 0.86).fillRoundedRect(x, y, width, height, 2);
  graphics.lineStyle(1, accent, 0.2).strokeRoundedRect(x, y, width, height, 2);
  graphics.lineStyle(2, 0x314958, 0.62);
  if (horizontal) {
    for (let sy = y + 5; sy < y + height - 3; sy += 6) graphics.lineBetween(x + 4, sy, x + width - 4, sy);
  } else {
    for (let sx = x + 5; sx < x + width - 3; sx += 6) graphics.lineBetween(sx, y + 4, sx, y + height - 4);
  }
};
