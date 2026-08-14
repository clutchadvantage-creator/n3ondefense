import Phaser from 'phaser';
import { RETICLE_COLORS, glowMultiplier, type ReticleSettings, type ReticleStyle } from '../config/interfaceSettings';

function drawReticleShape(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  style: ReticleStyle,
  size: number,
  color: number,
  width: number,
  alpha: number,
  radiusOffset: number
): void {
  graphics.lineStyle(width, color, alpha);
  if (style === 'original') {
    graphics.strokeCircle(x, y, (10 + radiusOffset) * size);
    graphics.lineBetween(x - 16 * size, y, x - 5 * size, y);
    graphics.lineBetween(x + 5 * size, y, x + 16 * size, y);
    graphics.lineBetween(x, y - 16 * size, x, y - 5 * size);
    graphics.lineBetween(x, y + 5 * size, x, y + 16 * size);
  } else if (style === 'split-cross') {
    const inner = (5 + radiusOffset) * size;
    const outer = (19 + radiusOffset) * size;
    graphics.lineBetween(x - outer, y, x - inner, y);
    graphics.lineBetween(x + inner, y, x + outer, y);
    graphics.lineBetween(x, y - outer, x, y - inner);
    graphics.lineBetween(x, y + inner, x, y + outer);
  } else if (style === 'triad') {
    const inner = (8 + radiusOffset) * size;
    const outer = (18 + radiusOffset) * size;
    for (let index = 0; index < 3; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 3;
      graphics.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    }
  } else {
    const radius = (13 + radiusOffset) * size;
    for (let index = 0; index < 4; index += 1) {
      const start = -Math.PI / 2 + index * Math.PI / 2 + 0.18;
      graphics.beginPath().arc(x, y, radius, start, start + Math.PI / 2 - 0.36, false).strokePath();
    }
    graphics.lineBetween(x - 22 * size, y, x - 16 * size, y);
    graphics.lineBetween(x + 16 * size, y, x + 22 * size, y);
  }
}

/** Shared by live gameplay and the Options preview so both render identically. */
export function drawReticle(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  rawSettings: ReticleSettings,
  overrideColor?: number
): void {
  const settings = rawSettings;
  const color = overrideColor ?? RETICLE_COLORS[settings.color];
  const size = settings.size;
  const alpha = settings.opacity;
  const glow = glowMultiplier(settings.glow);
  graphics.clear();

  if (glow > 0) {
    drawReticleShape(graphics, x, y, settings.style, size, color, 7 * size, Math.min(0.18, 0.07 * glow * alpha), 1.4);
    drawReticleShape(graphics, x, y, settings.style, size, color, 4 * size, Math.min(0.3, 0.13 * glow * alpha), 0.5);
  }
  drawReticleShape(graphics, x, y, settings.style, size, color, Math.max(1, 2 * size), alpha, 0);
  if (settings.style === 'original') graphics.fillStyle(color, alpha).fillCircle(x, y, Math.max(1.2, 1.8 * size));
}
