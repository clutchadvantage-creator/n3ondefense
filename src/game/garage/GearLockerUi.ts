import Phaser from 'phaser';
import type { CosmeticOption } from '../types.ts';
import type { GearLockerRect } from './gearLockerLayout.ts';

export interface GearLockerPanelOptions {
  title: string;
  accent?: number;
  titleAccent?: number;
  reinforced?: boolean;
}

export const GEAR_LOCKER_CATEGORY_LABELS: Record<CosmeticOption['category'], string> = {
  playerColor: 'OPERATIVE COLOR',
  playerShape: 'OPERATIVE FRAME',
  projectileColor: 'PROJECTILE COLOR',
  projectileShape: 'PROJECTILE SHAPE',
  trailColor: 'MOVEMENT TRAIL',
  bombColor: 'BOMBSITE EXPLOSION',
  turretSkin: 'TURRET SKIN',
  fenceStyle: 'FENCE STYLE',
  dashTrail: 'DASH TRAIL'
};

const chamferedPoints = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0,
  width, cut, width, height - cut,
  width - cut, height, cut, height,
  0, height - cut, 0, cut
];

/** Creates a recessed, layered console housing without adding interaction. */
export const createGearLockerPanel = (
  scene: Phaser.Scene,
  rect: GearLockerRect,
  options: GearLockerPanelOptions
): Phaser.GameObjects.Container => {
  const accent = options.accent ?? 0x55efff;
  const titleAccent = options.titleAccent ?? accent;
  const headerHeight = rect.height < 340 ? 34 : 42;
  const cut = options.reinforced ? 18 : 12;
  const root = scene.add.container(rect.x, rect.y);
  const points = chamferedPoints(rect.width, rect.height, cut);
  const shadow = scene.add.polygon(rect.width / 2 + 6, rect.height / 2 + 8, points, 0x000000, 0.58);
  const chassis = scene.add.polygon(rect.width / 2, rect.height / 2, points, 0x07111a, 0.985)
    .setStrokeStyle(options.reinforced ? 2 : 1, accent, options.reinforced ? 0.68 : 0.48);
  const inset = scene.add.rectangle(10, headerHeight + 7, rect.width - 20, rect.height - headerHeight - 17, 0x06131d, 0.86)
    .setOrigin(0, 0).setStrokeStyle(1, accent, 0.16);
  const header = scene.add.rectangle(8, 7, rect.width - 16, headerHeight - 5, options.reinforced ? 0x160d1d : 0x09202a, 0.94)
    .setOrigin(0, 0).setStrokeStyle(1, titleAccent, options.reinforced ? 0.48 : 0.3);
  const topRail = scene.add.rectangle(20, 6, rect.width - 40, 3, accent, options.reinforced ? 0.74 : 0.48).setOrigin(0, 0);
  const headerRail = scene.add.rectangle(18, headerHeight + 3, rect.width - 36, 1, titleAccent, 0.34).setOrigin(0, 0);
  const sideRail = scene.add.rectangle(options.reinforced ? rect.width - 7 : 7, headerHeight + 18, 2, rect.height - headerHeight - 38, titleAccent, 0.35).setOrigin(0, 0);
  const title = scene.add.text(20, 16, options.title, {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: `${Phaser.Math.Clamp(rect.width / 38, 12, options.reinforced ? 18 : 16)}px`,
    color: Phaser.Display.Color.IntegerToColor(titleAccent).rgba,
    fontStyle: 'bold',
    letterSpacing: 1
  }).setOrigin(0, 0).setMaxLines(1);
  const led = scene.add.circle(rect.width - 24, 24, options.reinforced ? 4 : 3, 0x70ffac, 0.92);
  const anchorA = scene.add.circle(13, 13, 2, accent, 0.55);
  const anchorB = scene.add.circle(rect.width - 13, rect.height - 13, 2, titleAccent, 0.55);
  root.add([shadow, chassis, inset, header, topRail, headerRail, sideRail, title, led, anchorA, anchorB]);
  scene.tweens.add({ targets: led, alpha: { from: 0.22, to: 1 }, duration: 940, yoyo: true, repeat: -1 });
  root.setData('animatedTargets', [led]);
  return root;
};

/** Small procedural glyphs keep category navigation data-driven and asset-free. */
export const createGearLockerCategoryIcon = (
  scene: Phaser.Scene,
  category: CosmeticOption['category'],
  x: number,
  y: number,
  color: number,
  scale = 1
): Phaser.GameObjects.Container => {
  const root = scene.add.container(x, y).setScale(scale);
  const line = (x1: number, y1: number, x2: number, y2: number, width = 2): Phaser.GameObjects.Line => {
    const object = scene.add.line(0, 0, x1, y1, x2, y2, color, 0.94).setOrigin(0).setLineWidth(width);
    root.add(object);
    return object;
  };
  const circle = (px: number, py: number, radius: number, alpha = 0.16): Phaser.GameObjects.Arc => {
    const object = scene.add.circle(px, py, radius, color, alpha).setStrokeStyle(2, color, 0.95);
    root.add(object);
    return object;
  };

  switch (category) {
    case 'playerColor':
      circle(-7, -3, 4, 0.85); circle(7, -3, 4, 0.85); circle(0, 5, 4, 0.85);
      line(-5, 9, 0, 15); line(5, 9, 0, 15);
      break;
    case 'playerShape':
      root.add(scene.add.polygon(0, 0, [6, 0, 16, 5, 16, 15, 6, 20, -4, 15, -4, 5], color, 0.12).setStrokeStyle(2, color, 0.95));
      circle(6, 10, 3, 0.55);
      break;
    case 'projectileColor':
      line(-12, 7, 7, 7, 4); line(-9, 1, 2, 1, 2); line(-9, 13, 2, 13, 2);
      root.add(scene.add.triangle(8, 7, 0, -6, 12, 0, 0, 6, color, 0.9));
      break;
    case 'projectileShape':
      root.add(scene.add.polygon(0, 0, [0, 8, 8, 0, 16, 8, 8, 16], color, 0.16).setStrokeStyle(2, color, 0.95));
      break;
    case 'trailColor':
      line(-12, 0, 8, 0, 2); line(-8, 7, 12, 7, 2); line(-12, 14, 5, 14, 2);
      break;
    case 'bombColor':
      circle(0, 7, 9, 0.08); circle(0, 7, 3, 0.8); line(5, -1, 9, -6, 2);
      break;
    case 'turretSkin':
      line(-11, 12, 11, 12, 3); line(-7, 12, -4, 2, 3); line(7, 12, 4, 2, 3);
      root.add(scene.add.rectangle(0, 0, 15, 8, color, 0.18).setStrokeStyle(2, color, 0.95));
      line(4, -4, 13, -9, 3);
      break;
    case 'fenceStyle':
      line(-10, -5, -10, 16, 3); line(10, -5, 10, 16, 3);
      line(-10, 0, 10, 0, 2); line(-10, 6, 10, 6, 2); line(-10, 12, 10, 12, 2);
      break;
    case 'dashTrail':
      line(-12, 2, 2, 2, 2); line(-8, 8, 6, 8, 2); line(-12, 14, 2, 14, 2);
      root.add(scene.add.triangle(7, 8, 0, -7, 13, 0, 0, 7, color, 0.9));
      break;
  }
  return root;
};

export const formatCosmeticColorCode = (color: number): string =>
  `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6).toUpperCase()}`;
