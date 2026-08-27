import Phaser from 'phaser';
import { ENEMY_ROBOT_FRAMES } from './EnemyRobotFrames.ts';
import type { EnemyType } from '../types.ts';

const SIZE = 72;
const OUTLINE = 0x05080e;
const DEEP = 0x111827;
const RECESS = 0x1c2635;
const SIDE = 0x667383;
const ARMOR = 0xdce5ed;
const TOP = 0xf8fcff;
const LIGHT = 0xffffff;

type Point = Phaser.Types.Math.Vector2Like;

const polygon = (
  graphics: Phaser.GameObjects.Graphics,
  points: Point[],
  fill: number,
  line = OUTLINE,
  lineWidth = 2,
  alpha = 1
): void => {
  graphics.fillStyle(fill, alpha).fillPoints(points, true);
  graphics.lineStyle(lineWidth, line, 1).strokePoints(points, true);
};

const rivets = (graphics: Phaser.GameObjects.Graphics, points: Point[]): void => {
  graphics.fillStyle(TOP, 0.95);
  for (const point of points) graphics.fillCircle(point.x ?? 0, point.y ?? 0, 1.35);
};

const lens = (graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number): void => {
  graphics.fillStyle(DEEP, 1).fillCircle(x + 1.5, y + 2, radius + 2.5);
  graphics.lineStyle(1.5, TOP, 0.95).strokeCircle(x, y, radius + 1);
  graphics.fillStyle(LIGHT, 1).fillCircle(x, y, radius);
  graphics.fillStyle(0xaab8c5, 0.85).fillCircle(x - radius * 0.28, y - radius * 0.3, Math.max(1, radius * 0.28));
};

const start = (graphics: Phaser.GameObjects.Graphics): void => {
  graphics.clear();
  graphics.fillStyle(0x000000, 0).fillRect(0, 0, SIZE, SIZE);
  // Baked shadow keeps depth inexpensive: one sprite remains one draw object.
  graphics.fillStyle(0x000000, 0.38).fillEllipse(38, 59, 48, 15);
  graphics.fillStyle(0x000000, 0.18).fillEllipse(38, 58, 38, 10);
};

const finish = (graphics: Phaser.GameObjects.Graphics, type: EnemyType): void => {
  graphics.generateTexture(ENEMY_ROBOT_FRAMES[type].textureKey, SIZE, SIZE);
};

const drawGrunt = (g: Phaser.GameObjects.Graphics): void => {
  polygon(g, [{ x: 17, y: 27 }, { x: 10, y: 32 }, { x: 13, y: 52 }, { x: 21, y: 55 }, { x: 24, y: 34 }], SIDE);
  polygon(g, [{ x: 51, y: 25 }, { x: 62, y: 31 }, { x: 58, y: 51 }, { x: 49, y: 55 }, { x: 46, y: 33 }], 0x4d5968);
  polygon(g, [{ x: 19, y: 22 }, { x: 34, y: 11 }, { x: 51, y: 20 }, { x: 49, y: 50 }, { x: 36, y: 61 }, { x: 20, y: 51 }], ARMOR, OUTLINE, 2.4);
  polygon(g, [{ x: 19, y: 22 }, { x: 34, y: 11 }, { x: 51, y: 20 }, { x: 35, y: 27 }], TOP, OUTLINE, 1.5);
  polygon(g, [{ x: 35, y: 27 }, { x: 51, y: 20 }, { x: 49, y: 50 }, { x: 42, y: 54 }], SIDE, OUTLINE, 1.5);
  g.fillStyle(RECESS, 1).fillRoundedRect(23, 28, 22, 12, 3);
  g.lineStyle(1.5, TOP, 0.8).strokeRoundedRect(23, 28, 22, 12, 3);
  g.fillStyle(LIGHT, 1).fillRect(27, 32, 6, 3).fillRect(36, 32, 6, 3);
  polygon(g, [{ x: 27, y: 45 }, { x: 43, y: 45 }, { x: 39, y: 55 }, { x: 31, y: 55 }], DEEP, OUTLINE, 1.2);
  lens(g, 35, 48, 2.5);
  rivets(g, [{ x: 21, y: 25 }, { x: 47, y: 23 }, { x: 22, y: 48 }, { x: 45, y: 48 }]);
};

const drawShooter = (g: Phaser.GameObjects.Graphics): void => {
  polygon(g, [{ x: 15, y: 31 }, { x: 27, y: 15 }, { x: 49, y: 21 }, { x: 60, y: 39 }, { x: 40, y: 58 }, { x: 15, y: 50 }], ARMOR, OUTLINE, 2.4);
  polygon(g, [{ x: 15, y: 31 }, { x: 27, y: 15 }, { x: 49, y: 21 }, { x: 34, y: 31 }], TOP, OUTLINE, 1.5);
  polygon(g, [{ x: 34, y: 31 }, { x: 49, y: 21 }, { x: 60, y: 39 }, { x: 40, y: 58 }], SIDE, OUTLINE, 1.5);
  // Raised cannon assembly and visible right-side housing.
  polygon(g, [{ x: 39, y: 8 }, { x: 52, y: 12 }, { x: 55, y: 34 }, { x: 42, y: 31 }], 0x8794a2, OUTLINE, 2);
  polygon(g, [{ x: 39, y: 8 }, { x: 47, y: 4 }, { x: 58, y: 8 }, { x: 52, y: 12 }], TOP, OUTLINE, 1.2);
  polygon(g, [{ x: 52, y: 12 }, { x: 58, y: 8 }, { x: 61, y: 30 }, { x: 55, y: 34 }], 0x4a5665, OUTLINE, 1.2);
  g.fillStyle(DEEP, 1).fillRoundedRect(18, 34, 26, 13, 5);
  lens(g, 30, 38, 6);
  polygon(g, [{ x: 14, y: 31 }, { x: 4, y: 21 }, { x: 19, y: 24 }], SIDE, OUTLINE, 1.5);
  polygon(g, [{ x: 15, y: 49 }, { x: 6, y: 58 }, { x: 23, y: 54 }], SIDE, OUTLINE, 1.5);
  rivets(g, [{ x: 20, y: 29 }, { x: 49, y: 25 }, { x: 20, y: 50 }, { x: 42, y: 51 }]);
};

const drawDefuser = (g: Phaser.GameObjects.Graphics): void => {
  for (const arm of [
    [{ x: 20, y: 25 }, { x: 5, y: 17 }, { x: 8, y: 30 }],
    [{ x: 52, y: 25 }, { x: 67, y: 17 }, { x: 64, y: 30 }],
    [{ x: 20, y: 45 }, { x: 5, y: 54 }, { x: 8, y: 40 }],
    [{ x: 52, y: 45 }, { x: 67, y: 54 }, { x: 64, y: 40 }]
  ]) polygon(g, arm, SIDE, OUTLINE, 1.7);
  polygon(g, [{ x: 22, y: 13 }, { x: 49, y: 13 }, { x: 59, y: 34 }, { x: 49, y: 56 }, { x: 22, y: 56 }, { x: 12, y: 34 }], ARMOR, OUTLINE, 2.5);
  polygon(g, [{ x: 22, y: 13 }, { x: 49, y: 13 }, { x: 55, y: 25 }, { x: 35, y: 30 }, { x: 15, y: 25 }], TOP, OUTLINE, 1.4);
  polygon(g, [{ x: 35, y: 30 }, { x: 55, y: 25 }, { x: 59, y: 34 }, { x: 49, y: 56 }, { x: 35, y: 52 }], SIDE, OUTLINE, 1.4);
  g.fillStyle(RECESS, 1).fillRoundedRect(21, 29, 28, 17, 4);
  g.lineStyle(1.4, TOP, 0.8).strokeRoundedRect(21, 29, 28, 17, 4);
  g.fillStyle(LIGHT, 1).fillRect(26, 33, 18, 4);
  g.fillStyle(0x8996a3, 1).fillRect(33, 38, 5, 12).fillRect(29, 42, 13, 4);
  lens(g, 35.5, 49, 2.4);
  rivets(g, [{ x: 23, y: 18 }, { x: 47, y: 18 }, { x: 18, y: 35 }, { x: 51, y: 35 }]);
};

const drawTank = (g: Phaser.GameObjects.Graphics): void => {
  polygon(g, [{ x: 5, y: 14 }, { x: 20, y: 10 }, { x: 20, y: 59 }, { x: 5, y: 55 }], 0x788492, OUTLINE, 2.3);
  polygon(g, [{ x: 52, y: 10 }, { x: 67, y: 14 }, { x: 67, y: 55 }, { x: 52, y: 59 }], 0x4c5866, OUTLINE, 2.3);
  g.lineStyle(2, DEEP, 1);
  for (const y of [19, 28, 37, 46, 54]) {
    g.lineBetween(8, y, 17, y - 2);
    g.lineBetween(55, y - 2, 64, y);
  }
  polygon(g, [{ x: 21, y: 10 }, { x: 45, y: 7 }, { x: 56, y: 20 }, { x: 53, y: 57 }, { x: 35, y: 64 }, { x: 18, y: 56 }, { x: 16, y: 20 }], ARMOR, OUTLINE, 2.8);
  polygon(g, [{ x: 21, y: 10 }, { x: 45, y: 7 }, { x: 56, y: 20 }, { x: 34, y: 26 }, { x: 16, y: 20 }], TOP, OUTLINE, 1.5);
  polygon(g, [{ x: 34, y: 26 }, { x: 56, y: 20 }, { x: 53, y: 57 }, { x: 35, y: 64 }], SIDE, OUTLINE, 1.5);
  g.fillStyle(RECESS, 1).fillRoundedRect(23, 28, 25, 15, 4);
  g.lineStyle(1.5, TOP, 0.85).strokeRoundedRect(23, 28, 25, 15, 4);
  g.fillStyle(LIGHT, 1).fillRect(28, 33, 15, 5);
  polygon(g, [{ x: 25, y: 48 }, { x: 46, y: 48 }, { x: 43, y: 57 }, { x: 29, y: 58 }], RECESS, OUTLINE, 1.4);
  lens(g, 36, 51, 3.2);
  rivets(g, [{ x: 21, y: 20 }, { x: 49, y: 18 }, { x: 22, y: 53 }, { x: 48, y: 52 }]);
};

const radialBlade = (g: Phaser.GameObjects.Graphics, angle: number, inner: number, outer: number, width: number): void => {
  const cx = 35;
  const cy = 35;
  const tx = -Math.sin(angle) * width;
  const ty = Math.cos(angle) * width;
  const ix = cx + Math.cos(angle) * inner;
  const iy = cy + Math.sin(angle) * inner;
  const ox = cx + Math.cos(angle) * outer;
  const oy = cy + Math.sin(angle) * outer;
  polygon(g, [
    { x: ix + tx, y: iy + ty }, { x: ox + tx * 0.35, y: oy + ty * 0.35 },
    { x: ox - tx * 0.35, y: oy - ty * 0.35 }, { x: ix - tx, y: iy - ty }
  ], SIDE, OUTLINE, 1.4);
};

const drawDisruptor = (g: Phaser.GameObjects.Graphics): void => {
  for (let index = 0; index < 6; index += 1) radialBlade(g, -Math.PI / 2 + index * Math.PI / 3, 17, 31, 5);
  g.fillStyle(0x44505e, 1).fillCircle(38, 39, 21);
  g.lineStyle(2.2, OUTLINE, 1).strokeCircle(38, 39, 21);
  g.fillStyle(ARMOR, 1).fillCircle(35, 35, 21);
  g.lineStyle(2.4, OUTLINE, 1).strokeCircle(35, 35, 21);
  polygon(g, [{ x: 20, y: 25 }, { x: 35, y: 14 }, { x: 50, y: 25 }, { x: 35, y: 30 }], TOP, OUTLINE, 1.2);
  g.fillStyle(RECESS, 1).fillCircle(35, 36, 13);
  g.lineStyle(2, TOP, 0.9).strokeCircle(35, 36, 10);
  lens(g, 35, 36, 4.5);
  rivets(g, [{ x: 22, y: 35 }, { x: 48, y: 35 }, { x: 35, y: 49 }]);
};

const drawStar = (g: Phaser.GameObjects.Graphics): void => {
  for (let index = 0; index < 8; index += 1) {
    radialBlade(g, -Math.PI / 2 + index * Math.PI / 4, 15, index % 2 === 0 ? 32 : 27, 4.2);
  }
  g.fillStyle(0x465260, 1).fillCircle(38, 39, 20);
  g.lineStyle(2.2, OUTLINE, 1).strokeCircle(38, 39, 20);
  polygon(g, [{ x: 35, y: 13 }, { x: 56, y: 34 }, { x: 35, y: 56 }, { x: 14, y: 34 }], ARMOR, OUTLINE, 2.3);
  polygon(g, [{ x: 35, y: 13 }, { x: 56, y: 34 }, { x: 35, y: 31 }, { x: 14, y: 34 }], TOP, OUTLINE, 1.2);
  polygon(g, [{ x: 35, y: 31 }, { x: 56, y: 34 }, { x: 35, y: 56 }], SIDE, OUTLINE, 1.2);
  g.fillStyle(RECESS, 1).fillCircle(35, 34, 12);
  lens(g, 35, 34, 6);
  rivets(g, [{ x: 35, y: 18 }, { x: 51, y: 34 }, { x: 35, y: 51 }, { x: 19, y: 34 }]);
};

/**
 * Generates one cached, high-resolution sprite per enemy family. The extra
 * facets, shadow, panel lines and hardware are baked into the texture, so the
 * visual pass adds no per-enemy display objects or update-loop work.
 */
export const createDetailedEnemyRobotTextures = (graphics: Phaser.GameObjects.Graphics): void => {
  const drawers: Record<EnemyType, (graphics: Phaser.GameObjects.Graphics) => void> = {
    grunt: drawGrunt,
    shooter: drawShooter,
    defuser: drawDefuser,
    tank: drawTank,
    disruptor: drawDisruptor,
    star: drawStar
  };
  (Object.keys(drawers) as EnemyType[]).forEach((type) => {
    start(graphics);
    drawers[type](graphics);
    finish(graphics, type);
  });
};
