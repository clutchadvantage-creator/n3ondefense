import Phaser from 'phaser';
import type { RectSpec } from '../../types.ts';
import { HEIST_WORLD } from './HeistConfig.ts';

export interface HeistFacilityRuntime {
  walls: Phaser.Physics.Arcade.StaticGroup;
  wallRects: RectSpec[];
  vaultDoor: Phaser.Physics.Arcade.Image;
  setVaultDoorOpen(open: boolean): void;
  destroy(): void;
}

const STATIC_WALLS: readonly RectSpec[] = [
  { x: 0, y: 0, w: HEIST_WORLD.width, h: 250 },
  { x: 0, y: 950, w: HEIST_WORLD.width, h: 250 },
  { x: 0, y: 0, w: 72, h: HEIST_WORLD.height },
  { x: HEIST_WORLD.width - 72, y: 0, w: 72, h: HEIST_WORLD.height },
  { x: 470, y: 250, w: 74, h: 205 },
  { x: 470, y: 745, w: 74, h: 205 },
  { x: 890, y: 250, w: 86, h: 170 },
  { x: 890, y: 780, w: 86, h: 170 },
  { x: 1290, y: 250, w: 76, h: 225 },
  { x: 1290, y: 725, w: 76, h: 225 },
  { x: 1760, y: 250, w: 84, h: 215 },
  { x: 1760, y: 735, w: 84, h: 215 }
];

export const createHeistFacility = (scene: Phaser.Scene): HeistFacilityRuntime => {
  const graphics = scene.add.graphics().setDepth(0);
  graphics.fillStyle(0x03070e, 1).fillRect(0, 0, HEIST_WORLD.width, HEIST_WORLD.height);
  graphics.fillStyle(0x071321, 1).fillRect(72, 250, HEIST_WORLD.width - 144, 700);
  graphics.lineStyle(1, 0x16354b, 0.48);
  for (let x = 80; x < HEIST_WORLD.width - 80; x += 80) graphics.lineBetween(x, 250, x, 950);
  for (let y = 270; y < 950; y += 80) graphics.lineBetween(72, y, HEIST_WORLD.width - 72, y);
  graphics.lineStyle(4, 0x37ecff, 0.42).strokeRect(74, 252, HEIST_WORLD.width - 148, 696);
  graphics.lineStyle(2, 0xff3fc7, 0.55).lineBetween(96, 600, HEIST_WORLD.width - 96, 600);
  graphics.fillStyle(0x0a1724, 1).fillRect(1844, 250, 484, 700);
  graphics.lineStyle(4, 0xff4fd8, 0.7).strokeRect(1848, 258, 470, 684);
  graphics.fillStyle(0x112a38, 0.75).fillRect(106, 312, 255, 72);
  graphics.lineStyle(2, 0x5df7ff, 0.65).strokeRect(106, 312, 255, 72);

  for (let index = 0; index < 22; index += 1) {
    const x = 110 + index * 101;
    graphics.fillStyle(index % 3 === 0 ? 0xff4fd8 : 0x49eaff, 0.38).fillRect(x, index % 2 ? 268 : 920, 42, 5);
  }

  const wallRects = STATIC_WALLS.map((rect) => ({ ...rect }));
  const walls = scene.physics.add.staticGroup();
  for (const rect of wallRects) {
    const body = walls.create(rect.x + rect.w / 2, rect.y + rect.h / 2, 'pixel') as Phaser.Physics.Arcade.Image;
    body.setVisible(false).setDisplaySize(rect.w, rect.h).refreshBody();
  }

  const door = scene.physics.add.staticImage(1802, 600, 'pixel').setDisplaySize(40, 270).setVisible(false);
  door.refreshBody();
  const doorVisual = scene.add.container(1802, 600).setDepth(5);
  const leftRail = scene.add.rectangle(-15, 0, 12, 276, 0x0d2330, 1).setStrokeStyle(2, 0x58f5ff, 0.9);
  const rightRail = scene.add.rectangle(15, 0, 12, 276, 0x0d2330, 1).setStrokeStyle(2, 0xff4fd8, 0.9);
  const field = scene.add.rectangle(0, 0, 22, 260, 0x73f9ff, 0.28).setStrokeStyle(2, 0xffffff, 0.65);
  const label = scene.add.text(0, -166, 'VAULT // LOCKED', {
    fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#ff66dc', backgroundColor: '#07111ddd', padding: { x: 10, y: 5 }
  }).setOrigin(0.5);
  doorVisual.add([leftRail, rightRail, field, label]);

  let open = false;
  return {
    walls,
    wallRects,
    vaultDoor: door,
    setVaultDoorOpen(nextOpen: boolean): void {
      if (open === nextOpen) return;
      open = nextOpen;
      door.body.enable = !open;
      field.setVisible(!open);
      label.setText(open ? 'VAULT // OPEN' : 'VAULT // SEALED').setColor(open ? '#79ffb2' : '#ff66dc');
      scene.tweens.killTweensOf([leftRail, rightRail]);
      scene.tweens.add({
        targets: leftRail, x: open ? -44 : -15,
        duration: 360, ease: 'Cubic.Out'
      });
      scene.tweens.add({
        targets: rightRail, x: open ? 44 : 15,
        duration: 360, ease: 'Cubic.Out'
      });
    },
    destroy(): void {
      walls.clear(true, true);
      door.destroy();
      doorVisual.destroy(true);
      graphics.destroy();
    }
  };
};

