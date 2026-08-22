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
