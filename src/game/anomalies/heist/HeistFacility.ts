import Phaser from 'phaser';
import type { RectSpec } from '../../types.ts';
import { HEIST_BALANCE, HEIST_ROUTE, HEIST_WALL_RECTS, HEIST_WORLD } from './HeistConfig.ts';

export interface HeistFacilityRuntime {
  walls: Phaser.Physics.Arcade.StaticGroup;
  wallRects: RectSpec[];
  vaultDoor: Phaser.Physics.Arcade.Image;
  route: readonly { x: number; y: number }[];
  extractionPoint: { x: number; y: number };
  containerPoints: readonly { x: number; y: number }[];
  supportPoints: readonly { kind: 'health' | 'energy'; x: number; y: number }[];
  ambushPoints: readonly { x: number; y: number }[];
  setVaultDoorOpen(open: boolean): void;
  setEscapeRoute(active: boolean): void;
  update(now: number, playerX: number, playerY: number): void;
  destroy(): void;
}

const CONTAINER_POINTS = [
  { x: 3440, y: 1370 }, { x: 3640, y: 1370 }, { x: 3830, y: 1480 }, { x: 3830, y: 1710 },
  { x: 3790, y: 1940 }, { x: 3580, y: 1970 }, { x: 3420, y: 1870 }, { x: 3620, y: 1660 }
] as const;

const SUPPORT_POINTS = [
  { kind: 'health', x: 610, y: 1120 },
  { kind: 'energy', x: 1160, y: 1590 },
  { kind: 'health', x: 1380, y: 620 },
  { kind: 'energy', x: 2050, y: 700 },
  { kind: 'health', x: 2200, y: 1430 },
  { kind: 'energy', x: 2830, y: 1580 }
] as const;

const AMBUSH_POINTS = [
  { x: 3000, y: 1510 }, { x: 2820, y: 1740 }, { x: 2200, y: 1420 }, { x: 2200, y: 780 },
  { x: 1920, y: 680 }, { x: 1380, y: 820 }, { x: 1380, y: 1480 }, { x: 1120, y: 1560 },
  { x: 650, y: 1450 }, { x: 590, y: 760 }
] as const;

const drawWallPanel = (graphics: Phaser.GameObjects.Graphics, rect: RectSpec): void => {
  const horizontal = rect.w >= rect.h;
  const length = horizontal ? rect.w : rect.h;
  const depth = Math.min(12, Math.max(6, (horizontal ? rect.h : rect.w) * 0.16));

  // Drawn once at facility creation: dimensional shadow, side face and top cap
  // add readable wall volume without introducing any per-frame render work.
  graphics.fillStyle(0x000207, 0.78).fillRect(rect.x + 9, rect.y + 11, rect.w, rect.h);
  graphics.fillStyle(0x030913, 1).fillPoints([
    new Phaser.Geom.Point(rect.x + rect.w - depth, rect.y + depth),
    new Phaser.Geom.Point(rect.x + rect.w, rect.y),
    new Phaser.Geom.Point(rect.x + rect.w, rect.y + rect.h),
    new Phaser.Geom.Point(rect.x + rect.w - depth, rect.y + rect.h - depth)
  ], true);
  graphics.fillStyle(0x07101a, 1).fillRect(rect.x, rect.y, rect.w - depth, rect.h - depth);
  graphics.fillStyle(0x102a38, 1).fillPoints([
    new Phaser.Geom.Point(rect.x, rect.y),
    new Phaser.Geom.Point(rect.x + depth, rect.y + depth),
    new Phaser.Geom.Point(rect.x + rect.w - depth, rect.y + depth),
    new Phaser.Geom.Point(rect.x + rect.w, rect.y)
  ], true);
  graphics.lineStyle(3, 0x256276, 0.84).strokeRect(rect.x + 3, rect.y + 3, rect.w - depth - 6, rect.h - depth - 6);
  graphics.lineStyle(1, 0xff46c8, 0.27).strokeRect(rect.x + 11, rect.y + 11,
    Math.max(2, rect.w - depth - 22), Math.max(2, rect.h - depth - 22));

  for (let offset = 46, panelIndex = 0; offset < length - depth - 24; offset += 86, panelIndex += 1) {
    const cyanPanel = panelIndex % 3 !== 1;
    const seamColor = cyanPanel ? 0x25536a : 0x6a295e;
    graphics.lineStyle(2, seamColor, 0.42);
    if (horizontal) {
      graphics.lineBetween(rect.x + offset, rect.y + 8, rect.x + offset, rect.y + rect.h - depth - 8);
      graphics.fillStyle(cyanPanel ? 0x43edfa : 0xff4dcb, 0.58)
        .fillRect(rect.x + offset - 9, rect.y + 8, 18, 3);
      if (panelIndex % 2 === 0 && rect.h > 54) {
        graphics.fillStyle(0x020810, 0.88).fillRect(rect.x + offset - 18, rect.y + 20, 36, 13);
        graphics.lineStyle(1, cyanPanel ? 0x43edfa : 0xff4dcb, 0.34)
          .strokeRect(rect.x + offset - 18, rect.y + 20, 36, 13);
      }
    } else {
      graphics.lineBetween(rect.x + 8, rect.y + offset, rect.x + rect.w - depth - 8, rect.y + offset);
      graphics.fillStyle(cyanPanel ? 0x43edfa : 0xff4dcb, 0.58)
        .fillRect(rect.x + 8, rect.y + offset - 9, 3, 18);
      if (panelIndex % 2 === 0 && rect.w > 54) {
        graphics.fillStyle(0x020810, 0.88).fillRect(rect.x + 20, rect.y + offset - 18, 13, 36);
        graphics.lineStyle(1, cyanPanel ? 0x43edfa : 0xff4dcb, 0.34)
          .strokeRect(rect.x + 20, rect.y + offset - 18, 13, 36);
      }
    }
  }
};

export const createHeistFacility = (scene: Phaser.Scene): HeistFacilityRuntime => {
  const staticGraphics = scene.add.graphics().setDepth(0);
  staticGraphics.fillStyle(0x01040a, 1).fillRect(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
  staticGraphics.fillStyle(0x06111c, 1).fillRect(90, 90, HEIST_WORLD.width - 180, HEIST_WORLD.height - 180);

  // Large floor plates and restrained grid detail keep the floor readable.
  for (let x = 110; x < HEIST_WORLD.width - 90; x += 180) {
    for (let y = 110; y < HEIST_WORLD.height - 90; y += 180) {
      const alternate = ((x / 180 + y / 180) | 0) % 3 === 0;
      staticGraphics.fillStyle(alternate ? 0x081827 : 0x07131f, 0.74).fillRect(x, y, 166, 166);
      staticGraphics.lineStyle(1, alternate ? 0x1b4053 : 0x142f40, 0.34).strokeRect(x, y, 166, 166);
    }
  }

  const wallRects = HEIST_WALL_RECTS.map((rect) => ({ ...rect }));
  for (const rect of wallRects) drawWallPanel(staticGraphics, rect);

  // Room identities, containment machinery, cable bundles and warning strips.
  const roomLabels = [
    { x: 250, y: 180, text: 'TRANSIT RECEIVING // 07' },
    { x: 1060, y: 2060, text: 'SECURITY CHECKPOINT // A' },
    { x: 1800, y: 190, text: 'RESEARCH WING // NULL MATTER' },
    { x: 2620, y: 2080, text: 'CONTAINMENT SERVICE // B' },
    { x: 3450, y: 220, text: 'VAULT STORAGE // RESTRICTED' }
  ];
  const textObjects = roomLabels.map((entry) => scene.add.text(entry.x, entry.y, entry.text, {
    fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#4f91a7', letterSpacing: 2
  }).setDepth(2));

  for (let index = 0; index < 18; index += 1) {
    const point = HEIST_ROUTE[Math.min(HEIST_ROUTE.length - 1, Math.floor(index / 1.5))];
    const side = index % 2 ? -1 : 1;
    const x = point.x + side * (72 + index % 3 * 16);
    const y = point.y + (index % 4 - 1.5) * 42;
    staticGraphics.fillStyle(0x0b1e2a, 0.94).fillRect(x - 28, y - 18, 56, 36);
    staticGraphics.lineStyle(2, index % 3 ? 0x39dfee : 0xff42bf, 0.48).strokeRect(x - 28, y - 18, 56, 36);
    staticGraphics.fillStyle(index % 3 ? 0x42e9f7 : 0xff4fc9, 0.52).fillRect(x - 20, y - 8, 38, 4);
  }

  for (let index = 0; index < 7; index += 1) {
    const x = 1000 + index * 390;
    const y = index % 2 ? 310 : 2020;
    staticGraphics.lineStyle(5, index % 2 ? 0xff3fbd : 0x38e7f5, 0.25);
    staticGraphics.beginPath();
    staticGraphics.moveTo(x, y);
    staticGraphics.lineTo(x + 110, y + (index % 2 ? 45 : -45));
    staticGraphics.lineTo(x + 220, y);
    staticGraphics.strokePath();
  }

  const routeGraphics = scene.add.graphics().setDepth(1);
  let escapeRoute = false;
  const drawRoute = (): void => {
    routeGraphics.clear();
    const color = escapeRoute ? 0xff506f : 0x42eaff;
    routeGraphics.lineStyle(7, color, escapeRoute ? 0.34 : 0.22);
    routeGraphics.beginPath();
    routeGraphics.moveTo(HEIST_ROUTE[0].x, HEIST_ROUTE[0].y);
    for (let index = 1; index < HEIST_ROUTE.length; index += 1) routeGraphics.lineTo(HEIST_ROUTE[index].x, HEIST_ROUTE[index].y);
    routeGraphics.strokePath();
    for (let index = 1; index < HEIST_ROUTE.length - 1; index += 1) {
      const point = HEIST_ROUTE[index];
      const next = HEIST_ROUTE[escapeRoute ? index - 1 : index + 1];
      const angle = Math.atan2(next.y - point.y, next.x - point.x);
      routeGraphics.fillStyle(color, 0.58);
      routeGraphics.fillTriangle(
        point.x + Math.cos(angle) * 24, point.y + Math.sin(angle) * 24,
        point.x + Math.cos(angle + 2.35) * 16, point.y + Math.sin(angle + 2.35) * 16,
        point.x + Math.cos(angle - 2.35) * 16, point.y + Math.sin(angle - 2.35) * 16
      );
    }
  };
  drawRoute();

  const ambientGraphics = scene.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
  let lastAmbientDraw = -1;
  let entranceWake = 0;

  const walls = scene.physics.add.staticGroup();
  for (const rect of wallRects) {
    const body = walls.create(rect.x + rect.w / 2, rect.y + rect.h / 2, 'pixel') as Phaser.Physics.Arcade.Image;
    body.setVisible(false).setDisplaySize(rect.w, rect.h).refreshBody();
  }

  const door = scene.physics.add.staticImage(HEIST_BALANCE.vaultDoorX, HEIST_BALANCE.vaultDoorY, 'pixel')
    .setDisplaySize(64, 560).setVisible(false);
  door.refreshBody();
  const doorVisual = scene.add.container(HEIST_BALANCE.vaultDoorX, HEIST_BALANCE.vaultDoorY).setDepth(6);
  const outerFrame = scene.add.rectangle(0, 0, 142, 594, 0x050b12, 1).setStrokeStyle(5, 0x4deaff, 0.7);
  const innerFrame = scene.add.rectangle(0, 0, 94, 548, 0x07121d, 1).setStrokeStyle(2, 0xff4bc9, 0.62);
  const leftPanel = scene.add.rectangle(-24, 0, 43, 524, 0x102a38, 1).setStrokeStyle(3, 0x5af4ff, 0.9);
  const rightPanel = scene.add.rectangle(24, 0, 43, 524, 0x102231, 1).setStrokeStyle(3, 0xff55cf, 0.9);
  const seam = scene.add.rectangle(0, 0, 7, 510, 0xc9ffff, 0.7).setBlendMode(Phaser.BlendModes.ADD);
  const statusLight = scene.add.circle(0, -314, 8, 0xff4b76, 1).setStrokeStyle(3, 0xff9cb0, 0.7);
  const controlPanel = scene.add.rectangle(-96, 58, 54, 96, 0x071923, 1).setStrokeStyle(2, 0x46eaff, 0.8);
  const controlScreen = scene.add.rectangle(-96, 44, 35, 27, 0xff4fcb, 0.35).setStrokeStyle(1, 0xffffff, 0.5);
  const label = scene.add.text(0, -350, 'VAULT 07 // SEALED', {
    fontFamily: 'Orbitron, sans-serif', fontSize: '19px', color: '#ff6ed8',
    backgroundColor: '#030911e8', padding: { x: 12, y: 6 }
  }).setOrigin(0.5);
  const bolts = [-1, 1].flatMap((side) => [-190, -65, 65, 190].map((y) =>
    scene.add.rectangle(side * 54, y, 25, 14, 0x728998, 1).setStrokeStyle(1, 0xbffcff, 0.7)));
  doorVisual.add([outerFrame, innerFrame, leftPanel, rightPanel, seam, statusLight, controlPanel, controlScreen, ...bolts, label]);

  let open = false;
  const timers: Phaser.Time.TimerEvent[] = [];
  return {
    walls,
    wallRects,
    vaultDoor: door,
    route: HEIST_ROUTE,
    extractionPoint: { ...HEIST_ROUTE[0] },
    containerPoints: CONTAINER_POINTS,
    supportPoints: SUPPORT_POINTS,
    ambushPoints: AMBUSH_POINTS,
    setVaultDoorOpen(nextOpen: boolean): void {
      if (open === nextOpen) return;
      open = nextOpen;
      scene.tweens.killTweensOf([leftPanel, rightPanel, seam, statusLight, ...bolts]);
      label.setText(nextOpen ? 'VAULT 07 // ACCESS GRANTED' : 'VAULT 07 // SEALED')
        .setColor(nextOpen ? '#77ffbd' : '#ff6ed8');
      statusLight.setFillStyle(nextOpen ? 0x63ff9e : 0xff4b76, 1);
      for (const bolt of bolts) scene.tweens.add({ targets: bolt, scaleX: nextOpen ? 0.12 : 1, duration: 190, ease: 'Cubic.Out' });
      if (nextOpen) {
        timers.push(scene.time.delayedCall(210, () => {
          if (door.body) door.body.enable = false;
          seam.setAlpha(0);
          scene.tweens.add({ targets: leftPanel, x: -62, duration: 540, ease: 'Cubic.InOut' });
          scene.tweens.add({ targets: rightPanel, x: 62, duration: 540, ease: 'Cubic.InOut' });
        }));
      } else {
        scene.tweens.add({ targets: leftPanel, x: -24, duration: 520, ease: 'Cubic.InOut' });
        scene.tweens.add({ targets: rightPanel, x: 24, duration: 520, ease: 'Cubic.InOut' });
        timers.push(scene.time.delayedCall(500, () => {
          if (door.body) door.body.enable = true;
          seam.setAlpha(0.7);
        }));
      }
    },
    setEscapeRoute(active: boolean): void {
      if (escapeRoute === active) return;
      escapeRoute = active;
      drawRoute();
    },
    update(now: number, playerX: number, playerY: number): void {
      const dx = playerX - HEIST_BALANCE.vaultDoorX;
      const dy = playerY - HEIST_BALANCE.vaultDoorY;
      const targetWake = Phaser.Math.Clamp(1 - Math.hypot(dx, dy) / 760, 0, 1);
      entranceWake += (targetWake - entranceWake) * 0.06;
      controlScreen.setAlpha(0.18 + entranceWake * (0.48 + Math.sin(now * 0.01) * 0.2));
      statusLight.setScale(1 + Math.sin(now * 0.014) * (0.08 + entranceWake * 0.18));
      if (now - lastAmbientDraw < 70) return;
      lastAmbientDraw = now;
      ambientGraphics.clear();
      const routeColor = escapeRoute ? 0xff4f71 : 0x50f2ff;
      for (let index = 0; index < HEIST_ROUTE.length; index += 1) {
        const point = HEIST_ROUTE[index];
        const pulse = 0.14 + (Math.sin(now * 0.006 - index * 0.7) + 1) * 0.11;
        ambientGraphics.fillStyle(routeColor, pulse).fillCircle(point.x, point.y, 18 + pulse * 18);
      }
      for (let index = 0; index < 16; index += 1) {
        const x = 180 + index * 232;
        const y = index % 2 ? 118 : HEIST_WORLD.height - 118;
        const on = (Math.floor(now / 480) + index) % 4 !== 0;
        ambientGraphics.fillStyle(index % 3 ? 0x54f2ff : 0xff50c9, on ? 0.65 : 0.08).fillRect(x, y, 38, 6);
      }
      // Contained reactor energy and inexpensive ventilation flicker.
      for (let index = 0; index < 5; index += 1) {
        const x = 1830 + index * 150;
        const y = 340 + Math.sin(now * 0.002 + index) * 7;
        ambientGraphics.lineStyle(3, index % 2 ? 0xff51ce : 0x57efff, 0.28);
        ambientGraphics.strokeCircle(x, y, 28 + Math.sin(now * 0.005 + index) * 5);
      }
    },
    destroy(): void {
      for (const timer of timers) timer.remove(false);
      scene.tweens.killTweensOf([leftPanel, rightPanel, seam, statusLight, ...bolts]);
      walls.clear(true, true);
      door.destroy();
      doorVisual.destroy(true);
      staticGraphics.destroy();
      routeGraphics.destroy();
      ambientGraphics.destroy();
      textObjects.forEach((text) => text.destroy());
    }
  };
};
