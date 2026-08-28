import Phaser from 'phaser';

export const ARCADE_TAU = Math.PI * 2;

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;
export const easeInCubic = (value: number): number => value ** 3;

export const drawSegmentedRing = (
  graphics: Phaser.GameObjects.Graphics,
  radius: number,
  segments: number,
  progress: number,
  color: number,
  alpha: number,
  lineWidth = 3,
  phase = -Math.PI * 0.5
): void => {
  const activeSegments = Math.round(clamp01(progress) * segments);
  const segmentAngle = ARCADE_TAU / segments;
  for (let index = 0; index < segments; index += 1) {
    const active = index < activeSegments;
    graphics.lineStyle(active ? lineWidth : 1, active ? color : 0x284556, active ? alpha : alpha * 0.24);
    graphics.beginPath();
    graphics.arc(0, 0, radius, phase + index * segmentAngle + 0.045, phase + (index + 1) * segmentAngle - 0.045);
    graphics.strokePath();
  }
};

export const drawCornerBrackets = (
  graphics: Phaser.GameObjects.Graphics,
  halfExtent: number,
  length: number,
  color: number,
  alpha: number,
  lineWidth = 2,
  centerX = 0,
  centerY = 0
): void => {
  graphics.lineStyle(lineWidth, color, alpha);
  for (let index = 0; index < 4; index += 1) {
    const x = centerX + (index % 2 === 0 ? -halfExtent : halfExtent);
    const y = centerY + (index < 2 ? -halfExtent : halfExtent);
    const xDirection = index % 2 === 0 ? 1 : -1;
    const yDirection = index < 2 ? 1 : -1;
    graphics.lineBetween(x, y, x + xDirection * length, y);
    graphics.lineBetween(x, y, x, y + yDirection * length);
  }
};

export const drawDirectionalChevron = (
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: number,
  alpha: number
): void => {
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const sideX = -forwardY;
  const sideY = forwardX;
  graphics.lineStyle(2, color, alpha);
  graphics.lineBetween(
    x - forwardX * size + sideX * size * 0.55,
    y - forwardY * size + sideY * size * 0.55,
    x,
    y
  );
  graphics.lineBetween(
    x,
    y,
    x - forwardX * size - sideX * size * 0.55,
    y - forwardY * size - sideY * size * 0.55
  );
};

export const seededUnit = (index: number, salt: number): number => {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
};

/** Static, non-colliding event socket that visually seats Arcade machinery in
 * the environment instead of leaving it floating over a plain circle. */
export const drawLayeredArcadeSocket = (
  graphics: Phaser.GameObjects.Graphics,
  radius: number,
  accent: number,
  secondary = 0xff4fcf
): void => {
  graphics.fillStyle(0x000000, 0.42).fillEllipse(7, 10, radius * 2.1, radius * 0.76);
  graphics.fillStyle(0x02060b, 0.94).fillCircle(0, 5, radius + 7);
  graphics.fillStyle(0x08141f, 0.92).fillCircle(0, 0, radius + 2);
  graphics.lineStyle(2, accent, 0.35).strokeCircle(0, 0, radius + 2);
  const segments = 12;
  for (let index = 0; index < segments; index += 1) {
    const start = index / segments * ARCADE_TAU + 0.035;
    const end = (index + 1) / segments * ARCADE_TAU - 0.035;
    graphics.lineStyle(index % 2 ? 3 : 2, index % 2 ? accent : secondary, index % 2 ? 0.26 : 0.2);
    graphics.beginPath();
    graphics.arc(0, 0, radius - 8, start, end, false);
    graphics.strokePath();
    graphics.fillStyle(0x88a9b7, 0.66).fillCircle(Math.cos(start) * (radius - 3), Math.sin(start) * (radius - 3), 1.4);
  }
  graphics.lineStyle(1, 0xc9fbff, 0.16).beginPath();
  graphics.arc(0, 0, radius - 15, Math.PI * 1.08, Math.PI * 1.86, false);
  graphics.strokePath();
};
