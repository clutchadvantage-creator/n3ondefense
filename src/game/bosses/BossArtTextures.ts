import Phaser from 'phaser';
import { BOSS_ARCHETYPES, type BossArchetype } from '../config/bossBalance.ts';
import { drawBakedShadow, drawLayeredPanel, drawMechanicalRivets } from '../rendering/LayeredArtPrimitives.ts';

const SIZE = 144;
const OUTLINE = 0x04070d;
const DEEP = 0x101725;
const RECESS = 0x1b2433;
const SIDE = 0x5a6675;
const ARMOR = 0xd5dee7;
const TOP = 0xfbfdff;
const LIGHT = 0xffffff;
type Point = Phaser.Types.Math.Vector2Like;

interface BossArtPalette {
  primary: number;
  secondary: number;
  accent: number;
  energy: number;
}

export const BOSS_ART_PALETTES: Record<BossArchetype, BossArtPalette> = {
  artillery: { primary: 0xff7a32, secondary: 0xb52e5f, accent: 0xffd34f, energy: 0x62efff },
  'storm-mage': { primary: 0xa64dff, secondary: 0x3d58cf, accent: 0xff55c8, energy: 0x70f5ff },
  'void-brawler': { primary: 0xff3f87, secondary: 0x7f39d8, accent: 0xff8e42, energy: 0x58edff }
};

const polygon = (
  g: Phaser.GameObjects.Graphics,
  points: Point[],
  fill: number,
  lineWidth = 3,
  alpha = 1
): void => {
  drawLayeredPanel(g, points, fill, OUTLINE, lineWidth, alpha);
};

const start = (g: Phaser.GameObjects.Graphics): void => {
  g.clear();
  g.fillStyle(0x000000, 0).fillRect(0, 0, SIZE, SIZE);
  drawBakedShadow(g, 77, 119, 104, 26, 0.42);
};

const finish = (g: Phaser.GameObjects.Graphics, archetype: BossArchetype): void => {
  g.generateTexture(BOSS_ARCHETYPES[archetype].texture, SIZE, SIZE);
};

const rivets = (g: Phaser.GameObjects.Graphics, points: Point[], radius = 2): void => {
  drawMechanicalRivets(g, points, LIGHT, DEEP, radius);
};

const applyColorPass = (g: Phaser.GameObjects.Graphics, archetype: BossArchetype): void => {
  const palette = BOSS_ART_PALETTES[archetype];
  if (archetype === 'artillery') {
    polygon(g, [{ x: 38, y: 36 }, { x: 67, y: 20 }, { x: 101, y: 33 }, { x: 72, y: 51 }], palette.primary, 2, 0.94);
    polygon(g, [{ x: 34, y: 76 }, { x: 70, y: 89 }, { x: 103, y: 75 }, { x: 99, y: 106 }, { x: 71, y: 122 }, { x: 39, y: 106 }], palette.secondary, 2, 0.88);
    g.fillStyle(palette.accent, 0.95).fillRect(48, 37, 7, 33).fillRect(81, 37, 7, 33);
  } else if (archetype === 'storm-mage') {
    polygon(g, [{ x: 32, y: 37 }, { x: 68, y: 14 }, { x: 101, y: 41 }, { x: 67, y: 59 }], palette.primary, 2, 0.94);
    polygon(g, [{ x: 31, y: 76 }, { x: 65, y: 91 }, { x: 96, y: 76 }, { x: 93, y: 101 }, { x: 65, y: 119 }, { x: 34, y: 100 }], palette.secondary, 2, 0.88);
    g.lineStyle(4, palette.accent, 0.9).beginPath().moveTo(40, 93).lineTo(64, 105).lineTo(90, 92).strokePath();
  } else {
    polygon(g, [{ x: 44, y: 28 }, { x: 69, y: 15 }, { x: 94, y: 29 }, { x: 69, y: 49 }], palette.primary, 2, 0.95);
    polygon(g, [{ x: 37, y: 75 }, { x: 69, y: 91 }, { x: 102, y: 75 }, { x: 89, y: 111 }, { x: 69, y: 126 }, { x: 45, y: 109 }], palette.secondary, 2, 0.9);
    g.fillStyle(palette.accent, 0.88).fillRoundedRect(12, 62, 23, 18, 5).fillRoundedRect(104, 62, 23, 18, 5);
  }
  const coreX = archetype === 'artillery' ? 68 : archetype === 'storm-mage' ? 67 : 69;
  const coreY = archetype === 'artillery' ? 62 : archetype === 'storm-mage' ? 56 : 63;
  g.fillStyle(DEEP, 1).fillCircle(coreX, coreY, 13);
  g.lineStyle(3, palette.accent, 0.95).strokeCircle(coreX, coreY, 11);
  g.fillStyle(palette.energy, 1).fillCircle(coreX, coreY, 6);
  g.fillStyle(0xffffff, 0.75).fillCircle(coreX - 3, coreY - 3, 2);
};

const core = (g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number): void => {
  g.fillStyle(OUTLINE, 1).fillCircle(x + 3, y + 4, radius + 7);
  g.lineStyle(3, TOP, 0.9).strokeCircle(x, y, radius + 4);
  g.fillStyle(RECESS, 1).fillCircle(x, y, radius + 1);
  g.lineStyle(2, 0xaebdca, 0.9).strokeCircle(x, y, radius - 3);
  g.fillStyle(LIGHT, 1).fillCircle(x, y, radius - 7);
  g.fillStyle(TOP, 0.65).fillCircle(x - 4, y - 5, 3);
};

const drawArtillery = (g: Phaser.GameObjects.Graphics): void => {
  // Layered crawler treads sit behind a three-quarter armored siege body.
  polygon(g, [{ x: 5, y: 48 }, { x: 31, y: 36 }, { x: 35, y: 112 }, { x: 8, y: 105 }], 0x667382, 3.5);
  polygon(g, [{ x: 109, y: 36 }, { x: 137, y: 48 }, { x: 134, y: 105 }, { x: 107, y: 112 }], 0x46515f, 3.5);
  g.lineStyle(3, DEEP, 1);
  for (const y of [52, 65, 78, 91, 103]) {
    g.lineBetween(10, y, 29, y - 5);
    g.lineBetween(114, y - 5, 132, y);
  }

  polygon(g, [
    { x: 35, y: 34 }, { x: 66, y: 16 }, { x: 106, y: 30 }, { x: 118, y: 67 },
    { x: 104, y: 111 }, { x: 72, y: 128 }, { x: 34, y: 109 }, { x: 24, y: 66 }
  ], ARMOR, 4);
  polygon(g, [{ x: 35, y: 34 }, { x: 66, y: 16 }, { x: 106, y: 30 }, { x: 72, y: 53 }, { x: 24, y: 66 }], TOP, 2.2);
  polygon(g, [{ x: 72, y: 53 }, { x: 106, y: 30 }, { x: 118, y: 67 }, { x: 104, y: 111 }, { x: 72, y: 128 }], SIDE, 2.2);

  // Elevated turret cupola and paired long cannon rails.
  polygon(g, [{ x: 45, y: 39 }, { x: 68, y: 26 }, { x: 94, y: 39 }, { x: 91, y: 75 }, { x: 68, y: 87 }, { x: 45, y: 73 }], 0xaab5c0, 3);
  polygon(g, [{ x: 45, y: 39 }, { x: 68, y: 26 }, { x: 94, y: 39 }, { x: 68, y: 52 }], TOP, 1.8);
  polygon(g, [{ x: 68, y: 52 }, { x: 94, y: 39 }, { x: 91, y: 75 }, { x: 68, y: 87 }], 0x4a5665, 1.8);
  for (const offset of [-12, 12]) {
    polygon(g, [
      { x: 68 + offset - 5, y: 32 }, { x: 68 + offset + 5, y: 32 },
      { x: 68 + offset + 7, y: 4 }, { x: 68 + offset - 6, y: 4 }
    ], offset < 0 ? 0xc7d1da : 0x8d99a6, 2);
    g.fillStyle(DEEP, 1).fillRect(64 + offset, 2, 9, 6);
    g.lineStyle(2, OUTLINE, 1).strokeRect(64 + offset, 2, 9, 6);
  }
  core(g, 68, 62, 14);
  g.lineStyle(2, 0x83909c, 1).lineBetween(42, 91, 95, 95).lineBetween(46, 101, 91, 105);
  rivets(g, [{ x: 35, y: 54 }, { x: 103, y: 48 }, { x: 38, y: 99 }, { x: 98, y: 101 }, { x: 53, y: 42 }, { x: 84, y: 40 }]);
};

const drawStormMage = (g: Phaser.GameObjects.Graphics): void => {
  // Rear cloak extrusion makes the hovering caster read as a volume, not a glyph.
  polygon(g, [{ x: 43, y: 43 }, { x: 78, y: 19 }, { x: 115, y: 48 }, { x: 109, y: 111 }, { x: 74, y: 132 }, { x: 35, y: 108 }], 0x4c5666, 3.5);
  polygon(g, [{ x: 31, y: 36 }, { x: 68, y: 10 }, { x: 105, y: 39 }, { x: 99, y: 103 }, { x: 65, y: 124 }, { x: 25, y: 101 }], ARMOR, 4);
  polygon(g, [{ x: 31, y: 36 }, { x: 68, y: 10 }, { x: 105, y: 39 }, { x: 67, y: 60 }], TOP, 2);
  polygon(g, [{ x: 67, y: 60 }, { x: 105, y: 39 }, { x: 99, y: 103 }, { x: 65, y: 124 }], SIDE, 2);

  // Crown horns preserve the mage silhouette while adding mechanical layering.
  for (const side of [-1, 1]) {
    const x = side < 0 ? 34 : 102;
    polygon(g, [
      { x: x - 7, y: 42 }, { x: x + 2, y: 27 }, { x: x + side * 7, y: 5 },
      { x: x + side * 14, y: 35 }, { x: x + 7, y: 53 }
    ], side < 0 ? 0xb9c4ce : 0x737f8d, 2.2);
  }
  polygon(g, [{ x: 41, y: 50 }, { x: 67, y: 27 }, { x: 94, y: 51 }, { x: 67, y: 83 }], RECESS, 3);
  polygon(g, [{ x: 41, y: 50 }, { x: 67, y: 27 }, { x: 94, y: 51 }, { x: 67, y: 59 }], 0xbfc9d2, 1.7);
  polygon(g, [{ x: 67, y: 59 }, { x: 94, y: 51 }, { x: 67, y: 83 }], 0x454f5e, 1.7);
  core(g, 67, 56, 14);

  g.lineStyle(2, TOP, 0.8).beginPath().moveTo(39, 92).lineTo(64, 104).lineTo(91, 91).strokePath();
  g.lineStyle(2, 0x8d99a5, 0.8).beginPath().moveTo(44, 102).lineTo(64, 113).lineTo(86, 102).strokePath();
  rivets(g, [{ x: 33, y: 48 }, { x: 99, y: 49 }, { x: 32, y: 96 }, { x: 92, y: 98 }, { x: 67, y: 18 }]);
};

const fist = (g: Phaser.GameObjects.Graphics, x: number, y: number, mirror: number): void => {
  const front = [
    { x: x - 17 * mirror, y: y - 12 }, { x: x + 10 * mirror, y: y - 18 },
    { x: x + 20 * mirror, y: y }, { x: x + 10 * mirror, y: y + 21 },
    { x: x - 18 * mirror, y: y + 13 }, { x: x - 24 * mirror, y: y - 1 }
  ];
  polygon(g, front, mirror < 0 ? 0x7c8895 : 0xb8c3cc, 3);
  g.lineStyle(2, DEEP, 1).lineBetween(x - 7 * mirror, y - 11, x - 5 * mirror, y + 14);
  g.lineBetween(x + 3 * mirror, y - 14, x + 6 * mirror, y + 15);
};

const drawVoidBrawler = (g: Phaser.GameObjects.Graphics): void => {
  fist(g, 22, 72, -1);
  fist(g, 120, 72, 1);
  polygon(g, [{ x: 24, y: 47 }, { x: 45, y: 27 }, { x: 68, y: 34 }, { x: 52, y: 69 }], 0x7b8794, 3);
  polygon(g, [{ x: 116, y: 47 }, { x: 94, y: 27 }, { x: 68, y: 34 }, { x: 86, y: 69 }], 0x596573, 3);
  polygon(g, [
    { x: 43, y: 25 }, { x: 69, y: 11 }, { x: 97, y: 27 }, { x: 108, y: 72 },
    { x: 91, y: 116 }, { x: 69, y: 132 }, { x: 42, y: 114 }, { x: 31, y: 70 }
  ], ARMOR, 4.2);
  polygon(g, [{ x: 43, y: 25 }, { x: 69, y: 11 }, { x: 97, y: 27 }, { x: 69, y: 51 }, { x: 31, y: 70 }], TOP, 2.2);
  polygon(g, [{ x: 69, y: 51 }, { x: 97, y: 27 }, { x: 108, y: 72 }, { x: 91, y: 116 }, { x: 69, y: 132 }], SIDE, 2.2);

  polygon(g, [{ x: 45, y: 60 }, { x: 69, y: 38 }, { x: 94, y: 61 }, { x: 69, y: 94 }], RECESS, 3);
  polygon(g, [{ x: 45, y: 60 }, { x: 69, y: 38 }, { x: 94, y: 61 }, { x: 69, y: 66 }], 0xb6c1ca, 1.8);
  polygon(g, [{ x: 69, y: 66 }, { x: 94, y: 61 }, { x: 69, y: 94 }], 0x424d5b, 1.8);
  core(g, 69, 63, 15);
  polygon(g, [{ x: 45, y: 98 }, { x: 67, y: 105 }, { x: 67, y: 122 }, { x: 42, y: 112 }], 0x8995a1, 2);
  polygon(g, [{ x: 70, y: 105 }, { x: 94, y: 98 }, { x: 94, y: 112 }, { x: 70, y: 122 }], 0x515d6b, 2);
  rivets(g, [{ x: 42, y: 48 }, { x: 95, y: 46 }, { x: 38, y: 83 }, { x: 99, y: 83 }, { x: 53, y: 108 }, { x: 84, y: 108 }], 2.2);
};

/** Cached 2.5D boss art: all detail is generated once during Boot. */
export const createDetailedBossTextures = (graphics: Phaser.GameObjects.Graphics): void => {
  const drawers: Record<BossArchetype, (graphics: Phaser.GameObjects.Graphics) => void> = {
    artillery: drawArtillery,
    'storm-mage': drawStormMage,
    'void-brawler': drawVoidBrawler
  };
  (Object.keys(drawers) as BossArchetype[]).forEach((archetype) => {
    start(graphics);
    drawers[archetype](graphics);
    applyColorPass(graphics, archetype);
    finish(graphics, archetype);
  });
};
