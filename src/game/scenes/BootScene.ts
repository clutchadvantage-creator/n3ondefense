import Phaser from 'phaser';
import { COLORS } from '../config/constants';
import { SceneKeys } from '../flow/SceneKeys';
import { publicAssetUrl } from '../utils/assetUrl';
import { ENEMY_ROBOT_FRAMES } from '../enemies/EnemyRobotFrames.ts';
import type { EnemyType } from '../types';
import { createPremiumOperativeFrameTextures } from '../cosmetics/PremiumOperativeFrameTextures.ts';
import { COSMETICS } from '../../data/cosmetics.ts';
import { createPremiumOperativeFrameSvgDataUri } from '../../ui/stores/PremiumOperativeFrameSvg.ts';
import { createDetailedEnemyRobotTextures } from '../enemies/EnemyArtTextures.ts';
import { createDetailedBossTextures } from '../bosses/BossArtTextures.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    this.load.audio('sfx-boost', publicAssetUrl('assets/audio/soundeffects/boostsound.mp3'));
    for (const frame of COSMETICS) {
      if (frame.category !== 'playerShape' || !frame.nativeTextureKey) continue;
      const source = createPremiumOperativeFrameSvgDataUri(frame.visualShape, frame.color, frame.accentColor ?? frame.color);
      if (source) this.load.svg(frame.nativeTextureKey, source, { width: 62, height: 50 });
    }
  }

  async create(): Promise<void> {
    const g = this.add.graphics();

    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('circle', 16, 16);

    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture('pixel', 8, 8);

    g.clear();
    g.fillStyle(COLORS.panel, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(2, 0x1f2840, 1);
    g.strokeRect(2, 2, 60, 60);
    g.generateTexture('panel', 64, 64);

    const createPlayerTexture = (key: string, drawShape: (graphics: Phaser.GameObjects.Graphics) => void): void => {
      g.clear();
      g.fillStyle(0x04070d, 0);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0xffffff, 1);
      drawShape(g);
      g.lineStyle(2, 0x121a2b, 1);
      drawShape(g);
      g.generateTexture(key, 32, 32);
    };

    createPlayerTexture('player-circle', (graphics) => {
      graphics.fillCircle(16, 16, 11);
      graphics.strokeCircle(16, 16, 11);
    });

    createPlayerTexture('player-square', (graphics) => {
      graphics.fillRect(6, 6, 20, 20);
      graphics.strokeRect(6, 6, 20, 20);
    });

    createPlayerTexture('player-triangle', (graphics) => {
      graphics.fillPoints([{ x: 16, y: 5 }, { x: 5, y: 26 }, { x: 27, y: 26 }], true);
      graphics.strokePoints([{ x: 16, y: 5 }, { x: 5, y: 26 }, { x: 27, y: 26 }], true);
    });

    createPlayerTexture('player-star', (graphics) => {
      const points: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < 10; i += 1) {
        const outer = i % 2 === 0;
        const radius = outer ? 12 : 5.5;
        const angle = -Math.PI / 2 + (Math.PI / 5) * i;
        points.push({ x: 16 + Math.cos(angle) * radius, y: 16 + Math.sin(angle) * radius });
      }
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    });

    createPlayerTexture('player-hexagon', (graphics) => {
      const points = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI / 6 + index * Math.PI / 3;
        return { x: 16 + Math.cos(angle) * 12, y: 16 + Math.sin(angle) * 12 };
      });
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    });

    createPlayerTexture('player-diamond', (graphics) => {
      const points = [{ x: 16, y: 3 }, { x: 29, y: 16 }, { x: 16, y: 29 }, { x: 3, y: 16 }];
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    });

    createPlayerTexture('player-cross', (graphics) => {
      const points = [
        { x: 11, y: 3 }, { x: 21, y: 3 }, { x: 21, y: 11 }, { x: 29, y: 11 },
        { x: 29, y: 21 }, { x: 21, y: 21 }, { x: 21, y: 29 }, { x: 11, y: 29 },
        { x: 11, y: 21 }, { x: 3, y: 21 }, { x: 3, y: 11 }, { x: 11, y: 11 }
      ];
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    });

    g.clear();
    g.fillStyle(0x04070d, 0);
    g.fillRect(0, 0, 44, 30);
    g.lineStyle(2, 0x121a2b, 1);
    const shipHull = [
      { x: 4, y: 15 }, { x: 10, y: 8 }, { x: 28, y: 8 }, { x: 42, y: 15 },
      { x: 28, y: 22 }, { x: 10, y: 22 }
    ];
    g.fillStyle(0xffffff, 1);
    g.fillPoints(shipHull, true);
    g.strokePoints(shipHull, true);
    const topFin = [{ x: 12, y: 9 }, { x: 18, y: 2 }, { x: 24, y: 9 }];
    const lowerWing = [{ x: 15, y: 20 }, { x: 27, y: 28 }, { x: 33, y: 20 }];
    g.fillStyle(0xc4cad6, 1);
    g.fillPoints(topFin, true);
    g.strokePoints(topFin, true);
    g.fillPoints(lowerWing, true);
    g.strokePoints(lowerWing, true);
    g.fillStyle(0x7c8799, 1);
    g.fillRoundedRect(2, 10, 8, 10, 2);
    g.strokeRoundedRect(2, 10, 8, 10, 2);
    g.fillStyle(0xe9faff, 1);
    g.fillEllipse(27, 10, 10, 7);
    g.strokeEllipse(27, 10, 10, 7);
    g.generateTexture('player-spaceship', 44, 30);

    g.clear();
    g.fillStyle(0x04070d, 0);
    g.fillRect(0, 0, 38, 38);
    g.lineStyle(7, 0x121a2b, 1);
    g.lineBetween(20, 22, 31, 35);
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(20, 22, 31, 35);
    g.fillStyle(0xffffff, 1);
    g.lineStyle(2, 0x121a2b, 1);
    for (const leaf of [{ x: 13, y: 13 }, { x: 25, y: 13 }, { x: 13, y: 25 }, { x: 25, y: 25 }]) {
      g.fillCircle(leaf.x, leaf.y, 8);
      g.strokeCircle(leaf.x, leaf.y, 8);
    }
    g.fillCircle(19, 19, 5);
    g.generateTexture('player-clover', 38, 38);

    g.clear();
    g.fillStyle(0x04070d, 0);
    g.fillRect(0, 0, 36, 44);
    g.fillStyle(0xc4cad6, 1);
    g.lineStyle(2, 0x121a2b, 1);
    const cone = [{ x: 7, y: 18 }, { x: 29, y: 18 }, { x: 18, y: 42 }];
    g.fillPoints(cone, true);
    g.strokePoints(cone, true);
    g.lineBetween(11, 20, 22, 36);
    g.lineBetween(25, 20, 15, 36);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(18, 14, 11);
    g.strokeCircle(18, 14, 11);
    g.fillCircle(10, 17, 6);
    g.strokeCircle(10, 17, 6);
    g.fillCircle(26, 17, 6);
    g.strokeCircle(26, 17, 6);
    g.fillStyle(0xe9faff, 1);
    g.fillCircle(14, 10, 3);
    g.generateTexture('player-ice-cream', 36, 44);

    g.clear();
    g.fillStyle(0x04070d, 0);
    g.fillRect(0, 0, 46, 34);
    g.lineStyle(2, 0x121a2b, 1);
    g.fillStyle(0xc4cad6, 1);
    const airplaneWings = [
      { x: 17, y: 14 }, { x: 25, y: 2 }, { x: 31, y: 3 }, { x: 28, y: 14 },
      { x: 28, y: 20 }, { x: 31, y: 31 }, { x: 25, y: 32 }, { x: 17, y: 20 }
    ];
    g.fillPoints(airplaneWings, true);
    g.strokePoints(airplaneWings, true);
    const airplaneTail = [
      { x: 9, y: 14 }, { x: 4, y: 8 }, { x: 10, y: 8 }, { x: 15, y: 14 },
      { x: 15, y: 20 }, { x: 10, y: 26 }, { x: 4, y: 26 }, { x: 9, y: 20 }
    ];
    g.fillPoints(airplaneTail, true);
    g.strokePoints(airplaneTail, true);
    g.fillStyle(0xffffff, 1);
    const airplaneBody = [
      { x: 3, y: 14 }, { x: 31, y: 13 }, { x: 43, y: 17 }, { x: 31, y: 21 }, { x: 3, y: 20 }, { x: 8, y: 17 }
    ];
    g.fillPoints(airplaneBody, true);
    g.strokePoints(airplaneBody, true);
    g.fillStyle(0xe9faff, 1);
    g.fillEllipse(32, 17, 7, 5);
    g.strokeEllipse(32, 17, 7, 5);
    g.generateTexture('player-airplane', 46, 34);

    g.clear();
    g.fillStyle(0x04070d, 0);
    g.fillRect(0, 0, 42, 42);
    g.lineStyle(2, 0x121a2b, 1);
    g.fillStyle(0xc4cad6, 1);
    g.fillCircle(21, 21, 18);
    g.strokeCircle(21, 21, 18);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(21, 21, 12);
    g.strokeCircle(21, 21, 12);
    g.fillStyle(0xe9faff, 1);
    g.fillCircle(21, 21, 6);
    g.strokeCircle(21, 21, 6);
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      g.fillCircle(21 + Math.cos(angle) * 15, 21 + Math.sin(angle) * 15, 2);
    }
    g.fillStyle(0x7c8799, 1);
    g.fillTriangle(19, 3, 23, 3, 21, 8);
    g.generateTexture('player-ufo', 42, 42);

    createPremiumOperativeFrameTextures(g);

    const createProjectileTexture = (key: string, width: number, height: number, draw: (graphics: Phaser.GameObjects.Graphics) => void): void => {
      g.clear();
      g.fillStyle(0xffffff, 1);
      draw(g);
      g.generateTexture(key, width, height);
    };
    createProjectileTexture('projectile-pulse', 16, 16, (graphics) => {
      graphics.fillStyle(0x202a36, 1).fillCircle(9, 9, 7);
      graphics.fillStyle(0xa9bac8, 1).fillCircle(8, 8, 6);
      graphics.lineStyle(1.5, 0xffffff, 0.9).strokeCircle(8, 8, 5);
      graphics.fillStyle(0xffffff, 0.95).fillCircle(6, 6, 2);
    });
    createProjectileTexture('projectile-missile', 24, 12, (graphics) => {
      graphics.fillStyle(0x27313c, 1).fillPoints([{ x: 2, y: 4 }, { x: 15, y: 4 }, { x: 23, y: 7 }, { x: 15, y: 11 }, { x: 2, y: 10 }, { x: 6, y: 7 }], true);
      graphics.fillStyle(0xb8c5d0, 1).fillPoints([{ x: 2, y: 2 }, { x: 15, y: 2 }, { x: 23, y: 6 }, { x: 15, y: 8 }, { x: 2, y: 8 }, { x: 6, y: 5 }], true);
      graphics.fillStyle(0xffffff, 0.86).fillRect(7, 3, 9, 2);
      graphics.fillStyle(0x4b5966, 1).fillRect(2, 3, 3, 5);
    });
    createProjectileTexture('projectile-lightning', 24, 16, (graphics) => {
      graphics.fillStyle(0x34404c, 1).fillPoints([{ x: 2, y: 12 }, { x: 10, y: 3 }, { x: 9, y: 8 }, { x: 23, y: 6 }, { x: 14, y: 15 }, { x: 16, y: 10 }], true);
      graphics.fillStyle(0xffffff, 1).fillPoints([{ x: 1, y: 9 }, { x: 9, y: 1 }, { x: 8, y: 6 }, { x: 22, y: 4 }, { x: 13, y: 13 }, { x: 15, y: 8 }], true);
    });
    createProjectileTexture('projectile-orb', 16, 16, (graphics) => {
      graphics.fillStyle(0x26313d, 1).fillCircle(9, 9, 7);
      graphics.fillStyle(0x8d9daa, 1).fillCircle(8, 8, 6);
      graphics.lineStyle(1.5, 0xffffff, 0.9).strokeCircle(8, 8, 5);
      graphics.fillStyle(0xffffff, 0.85).fillCircle(6, 6, 2);
    });
    createProjectileTexture('projectile-boss-cannon', 30, 10, (graphics) => {
      graphics.fillStyle(0x25303d, 1).fillRoundedRect(2, 3, 23, 7, 3);
      graphics.fillStyle(0x9aaab8, 1).fillRoundedRect(2, 1, 23, 6, 3);
      graphics.fillStyle(0xdce7ee, 1).fillTriangle(24, 1, 30, 5, 24, 9);
      graphics.fillStyle(0xffffff, 0.8).fillRect(5, 2, 15, 2);
      graphics.fillStyle(0x43505c, 1).fillRect(9, 6, 4, 3).fillRect(18, 6, 4, 3);
    });
    createProjectileTexture('projectile-boss-arcane', 28, 28, (graphics) => {
      graphics.lineStyle(3, 0xffffff, 0.94).strokeCircle(14, 14, 10);
      graphics.lineStyle(2, 0xffffff, 0.72).strokeTriangle(14, 2, 25, 20, 3, 20);
      graphics.fillStyle(0xffffff, 0.96).fillCircle(14, 14, 5);
      graphics.fillStyle(0xffffff, 0.45).fillCircle(12, 12, 2);
    });
    createProjectileTexture('ammo-grenade-round', 22, 14, (graphics) => {
      graphics.fillStyle(0x26323e, 1).fillCircle(10, 8, 6);
      graphics.fillStyle(0xa9b7c2, 1).fillCircle(9, 7, 5.5);
      graphics.lineStyle(1.3, 0xffffff, 0.78).strokeCircle(9, 7, 4.2);
      graphics.fillStyle(0x586672, 1).fillRect(13, 5, 5, 4);
      graphics.fillTriangle(17, 3, 21, 5, 17, 6);
      graphics.fillTriangle(17, 8, 21, 9, 17, 11);
      graphics.fillStyle(0xffffff, 0.75);
      graphics.fillCircle(7, 5, 1.5);
    });
    createProjectileTexture('ammo-scatter-pellet', 12, 6, (graphics) => {
      graphics.fillStyle(0x2a3540, 1).fillRoundedRect(1, 2, 10, 4, 2);
      graphics.fillStyle(0xc6d1d9, 1).fillRoundedRect(1, 0, 10, 4, 2);
      graphics.fillStyle(0xffffff, 0.72).fillRect(7, 1, 2, 3);
    });
    createProjectileTexture('projectile-sword', 30, 14, (graphics) => {
      graphics.fillPoints([
        { x: 8, y: 4 }, { x: 24, y: 4 }, { x: 29, y: 7 }, { x: 24, y: 10 }, { x: 8, y: 10 }
      ], true);
      graphics.fillStyle(0xc4cad6, 1);
      graphics.fillRect(6, 2, 3, 10);
      graphics.fillPoints([{ x: 1, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 9 }, { x: 1, y: 8 }], true);
    });
    createProjectileTexture('projectile-bubbles', 24, 20, (graphics) => {
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.strokeCircle(7, 12, 5);
      graphics.strokeCircle(15, 7, 6);
      graphics.strokeCircle(18, 15, 4);
      graphics.fillStyle(0xffffff, 0.65);
      graphics.fillCircle(13, 5, 1.5);
      graphics.fillCircle(5, 10, 1);
    });
    createProjectileTexture('projectile-balloons', 26, 24, (graphics) => {
      graphics.lineStyle(1, 0xffffff, 0.85);
      graphics.lineBetween(7, 10, 3, 22);
      graphics.lineBetween(13, 9, 3, 22);
      graphics.lineBetween(20, 11, 3, 22);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillEllipse(7, 8, 8, 11);
      graphics.fillEllipse(14, 6, 9, 12);
      graphics.fillEllipse(20, 9, 8, 11);
      graphics.fillPoints([{ x: 6, y: 13 }, { x: 8, y: 13 }, { x: 7, y: 16 }], true);
      graphics.fillPoints([{ x: 13, y: 12 }, { x: 15, y: 12 }, { x: 14, y: 15 }], true);
      graphics.fillPoints([{ x: 19, y: 14 }, { x: 21, y: 14 }, { x: 20, y: 17 }], true);
    });
    createProjectileTexture('projectile-carrot', 30, 16, (graphics) => {
      graphics.fillPoints([{ x: 8, y: 2 }, { x: 29, y: 8 }, { x: 8, y: 14 }, { x: 12, y: 8 }], true);
      graphics.fillStyle(0xc4cad6, 1);
      graphics.fillPoints([{ x: 9, y: 8 }, { x: 1, y: 2 }, { x: 4, y: 8 }, { x: 1, y: 14 }], true);
      graphics.fillPoints([{ x: 10, y: 8 }, { x: 4, y: 4 }, { x: 6, y: 8 }, { x: 4, y: 12 }], true);
    });

    // Combatant art is cached once at boot. The legacy builders below retain
    // their keys as a safe fallback, but skip generation when detailed art is
    // already registered.
    createDetailedBossTextures(g);
    createDetailedEnemyRobotTextures(g);

    const createBossTexture = (key: string, draw: (graphics: Phaser.GameObjects.Graphics) => void): void => {
      if (this.textures.exists(key)) return;
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.lineStyle(4, 0x080b14, 1);
      draw(g);
      g.generateTexture(key, 112, 112);
    };
    createBossTexture('boss-artillery', (graphics) => {
      const gear = Array.from({ length: 20 }, (_, index) => {
        const radius = index % 2 === 0 ? 48 : 39;
        const angle = -Math.PI / 2 + index * Math.PI / 10;
        return { x: 56 + Math.cos(angle) * radius, y: 56 + Math.sin(angle) * radius };
      });
      graphics.fillPoints(gear, true);
      graphics.strokePoints(gear, true);
      graphics.fillStyle(0xbfc8d8, 1).fillRoundedRect(24, 38, 64, 36, 9).strokeRoundedRect(24, 38, 64, 36, 9);
      graphics.fillStyle(0x111827, 1).fillCircle(56, 56, 24);
      graphics.fillStyle(0xffffff, 1).fillCircle(56, 56, 12).strokeCircle(56, 56, 12);
      graphics.fillStyle(0xc8d0de, 1).fillRect(8, 47, 35, 9).strokeRect(8, 47, 35, 9);
      graphics.fillRect(69, 47, 35, 9).strokeRect(69, 47, 35, 9);
      graphics.fillStyle(0x101726, 1).fillRect(4, 50, 18, 3).fillRect(90, 50, 18, 3);
      graphics.fillStyle(0xffffff, 1).fillTriangle(42, 33, 56, 9, 70, 33);
      graphics.lineStyle(3, 0x080b14, 1).strokeTriangle(42, 33, 56, 9, 70, 33);
    });
    createBossTexture('boss-storm-mage', (graphics) => {
      const crown = [{ x: 56, y: 3 }, { x: 72, y: 29 }, { x: 105, y: 22 }, { x: 83, y: 56 }, { x: 105, y: 90 }, { x: 72, y: 83 }, { x: 56, y: 109 }, { x: 40, y: 83 }, { x: 7, y: 90 }, { x: 29, y: 56 }, { x: 7, y: 22 }, { x: 40, y: 29 }];
      graphics.fillPoints(crown, true);
      graphics.strokePoints(crown, true);
      graphics.fillStyle(0x151325, 1).fillCircle(56, 56, 35).strokeCircle(56, 56, 35);
      graphics.fillStyle(0xffffff, 1).fillPoints([{ x: 56, y: 20 }, { x: 91, y: 56 }, { x: 56, y: 92 }, { x: 21, y: 56 }], true);
      graphics.strokePoints([{ x: 56, y: 20 }, { x: 91, y: 56 }, { x: 56, y: 92 }, { x: 21, y: 56 }], true);
      graphics.fillStyle(0x171020, 1).fillCircle(56, 56, 18);
      graphics.fillStyle(0xffffff, 1).fillCircle(56, 56, 8);
    });
    createBossTexture('boss-void-brawler', (graphics) => {
      const frame = [{ x: 5, y: 12 }, { x: 38, y: 26 }, { x: 56, y: 2 }, { x: 74, y: 26 }, { x: 107, y: 12 }, { x: 91, y: 45 }, { x: 110, y: 56 }, { x: 88, y: 69 }, { x: 101, y: 105 }, { x: 69, y: 88 }, { x: 56, y: 110 }, { x: 43, y: 88 }, { x: 11, y: 105 }, { x: 24, y: 69 }, { x: 2, y: 56 }, { x: 21, y: 45 }];
      graphics.fillPoints(frame, true);
      graphics.strokePoints(frame, true);
      graphics.fillStyle(0x17111d, 1).fillRoundedRect(30, 28, 52, 56, 13).strokeRoundedRect(30, 28, 52, 56, 13);
      graphics.fillStyle(0xffffff, 1).fillPoints([{ x: 56, y: 21 }, { x: 81, y: 56 }, { x: 56, y: 91 }, { x: 31, y: 56 }], true);
      graphics.strokePoints([{ x: 56, y: 21 }, { x: 81, y: 56 }, { x: 56, y: 91 }, { x: 31, y: 56 }], true);
      graphics.fillStyle(0x17111d, 1).fillCircle(56, 56, 15);
      graphics.fillStyle(0xffffff, 1).fillRect(11, 45, 24, 22).strokeRect(11, 45, 24, 22);
      graphics.fillRect(77, 45, 24, 22).strokeRect(77, 45, 24, 22);
    });

    const createEnemyRobot = (type: EnemyType, draw: (graphics: Phaser.GameObjects.Graphics) => void): void => {
      if (this.textures.exists(ENEMY_ROBOT_FRAMES[type].textureKey)) return;
      g.clear();
      g.fillStyle(0x04070d, 0);
      g.fillRect(0, 0, 48, 48);
      draw(g);
      g.generateTexture(ENEMY_ROBOT_FRAMES[type].textureKey, 48, 48);
    };

    const armor = 0xffffff;
    const secondaryArmor = 0xc4cad6;
    const recess = 0x121a2b;
    const lens = 0xe9faff;
    const outline = 0x070b13;

    createEnemyRobot('grunt', (graphics) => {
      graphics.lineStyle(2, outline, 1);
      graphics.fillStyle(secondaryArmor, 1);
      graphics.fillRoundedRect(4, 17, 10, 15, 3).strokeRoundedRect(4, 17, 10, 15, 3);
      graphics.fillRoundedRect(34, 17, 10, 15, 3).strokeRoundedRect(34, 17, 10, 15, 3);
      graphics.fillStyle(armor, 1);
      graphics.fillPoints([{ x: 14, y: 15 }, { x: 24, y: 8 }, { x: 34, y: 15 }, { x: 32, y: 39 }, { x: 24, y: 44 }, { x: 16, y: 39 }], true);
      graphics.strokePoints([{ x: 14, y: 15 }, { x: 24, y: 8 }, { x: 34, y: 15 }, { x: 32, y: 39 }, { x: 24, y: 44 }, { x: 16, y: 39 }], true);
      graphics.fillStyle(recess, 1).fillRoundedRect(17, 15, 14, 8, 3);
      graphics.fillStyle(lens, 1).fillRect(19, 18, 4, 2).fillRect(25, 18, 4, 2);
      graphics.fillStyle(recess, 1).fillTriangle(19, 29, 29, 29, 24, 37);
      graphics.fillStyle(lens, 0.9).fillCircle(24, 31, 2);
    });

    createEnemyRobot('shooter', (graphics) => {
      graphics.lineStyle(2, outline, 1);
      graphics.fillStyle(secondaryArmor, 1);
      graphics.fillRoundedRect(31, 5, 8, 24, 3).strokeRoundedRect(31, 5, 8, 24, 3);
      graphics.fillRect(34, 1, 3, 11);
      graphics.fillStyle(armor, 1);
      const chassis = [{ x: 7, y: 23 }, { x: 18, y: 9 }, { x: 33, y: 16 }, { x: 40, y: 33 }, { x: 24, y: 43 }, { x: 8, y: 35 }];
      graphics.fillPoints(chassis, true).strokePoints(chassis, true);
      graphics.fillStyle(recess, 1).fillCircle(23, 26, 10);
      graphics.fillStyle(lens, 1).fillCircle(23, 26, 5).fillCircle(23, 26, 2);
      graphics.fillStyle(secondaryArmor, 1);
      graphics.fillTriangle(7, 23, 2, 14, 15, 18).fillTriangle(8, 35, 3, 42, 18, 39);
      graphics.lineStyle(1, recess, 1).strokeTriangle(7, 23, 2, 14, 15, 18).strokeTriangle(8, 35, 3, 42, 18, 39);
    });

    createEnemyRobot('defuser', (graphics) => {
      graphics.lineStyle(2, outline, 1);
      graphics.fillStyle(secondaryArmor, 1);
      graphics.fillTriangle(13, 17, 3, 12, 6, 23).strokeTriangle(13, 17, 3, 12, 6, 23);
      graphics.fillTriangle(35, 17, 45, 12, 42, 23).strokeTriangle(35, 17, 45, 12, 42, 23);
      graphics.fillTriangle(13, 32, 3, 37, 6, 26).strokeTriangle(13, 32, 3, 37, 6, 26);
      graphics.fillTriangle(35, 32, 45, 37, 42, 26).strokeTriangle(35, 32, 45, 37, 42, 26);
      graphics.fillStyle(armor, 1);
      const body = [{ x: 13, y: 7 }, { x: 35, y: 7 }, { x: 42, y: 24 }, { x: 35, y: 41 }, { x: 13, y: 41 }, { x: 6, y: 24 }];
      graphics.fillPoints(body, true).strokePoints(body, true);
      graphics.fillStyle(recess, 1).fillRoundedRect(13, 13, 22, 20, 4);
      graphics.fillStyle(lens, 1).fillRect(17, 17, 14, 4);
      graphics.fillStyle(secondaryArmor, 1).fillRect(18, 25, 12, 3).fillRect(22, 21, 4, 12);
      graphics.fillStyle(lens, 0.9).fillCircle(24, 35, 2);
    });

    createEnemyRobot('tank', (graphics) => {
      graphics.lineStyle(2, outline, 1);
      graphics.fillStyle(secondaryArmor, 1);
      graphics.fillRoundedRect(2, 8, 11, 32, 4).strokeRoundedRect(2, 8, 11, 32, 4);
      graphics.fillRoundedRect(35, 8, 11, 32, 4).strokeRoundedRect(35, 8, 11, 32, 4);
      graphics.lineStyle(2, recess, 1);
      for (const y of [13, 20, 27, 34]) {
        graphics.lineBetween(4, y, 11, y);
        graphics.lineBetween(37, y, 44, y);
      }
      graphics.lineStyle(3, outline, 1);
      graphics.fillStyle(armor, 1).fillRoundedRect(10, 5, 28, 38, 7).strokeRoundedRect(10, 5, 28, 38, 7);
      graphics.fillStyle(recess, 1).fillRoundedRect(15, 11, 18, 12, 4);
      graphics.fillStyle(lens, 1).fillRect(18, 15, 12, 4);
      graphics.fillStyle(secondaryArmor, 1).fillRoundedRect(15, 27, 18, 10, 3);
      graphics.fillStyle(recess, 1).fillCircle(24, 32, 4);
      graphics.fillStyle(lens, 1).fillCircle(24, 32, 2);
      graphics.fillStyle(secondaryArmor, 1).fillCircle(11, 8, 4).fillCircle(37, 8, 4);
    });

    createEnemyRobot('disruptor', (graphics) => {
      graphics.lineStyle(2, outline, 1);
      graphics.fillStyle(secondaryArmor, 1);
      for (let index = 0; index < 5; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
        const tangentX = -Math.sin(angle) * 5;
        const tangentY = Math.cos(angle) * 5;
        const innerX = 24 + Math.cos(angle) * 15;
        const innerY = 24 + Math.sin(angle) * 15;
        const outerX = 24 + Math.cos(angle) * 23;
        const outerY = 24 + Math.sin(angle) * 23;
        const prong = [
          { x: innerX + tangentX, y: innerY + tangentY },
          { x: outerX, y: outerY },
          { x: innerX - tangentX, y: innerY - tangentY }
        ];
        graphics.fillPoints(prong, true).strokePoints(prong, true);
      }
      graphics.fillStyle(armor, 1).fillCircle(24, 24, 16).strokeCircle(24, 24, 16);
      graphics.fillStyle(recess, 1).fillCircle(24, 24, 10);
      graphics.lineStyle(2, lens, 1).strokeCircle(24, 24, 7);
      graphics.fillStyle(lens, 1).fillCircle(24, 24, 3);
      graphics.lineStyle(1, recess, 1);
      graphics.lineBetween(24, 8, 24, 16).lineBetween(10, 32, 17, 28).lineBetween(38, 32, 31, 28);
    });

    createEnemyRobot('star', (graphics) => {
      graphics.lineStyle(2, outline, 1);
      graphics.fillStyle(secondaryArmor, 1);
      for (let index = 0; index < 8; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI / 4;
        const tangentX = -Math.sin(angle) * 4.5;
        const tangentY = Math.cos(angle) * 4.5;
        const innerX = 24 + Math.cos(angle) * 13;
        const innerY = 24 + Math.sin(angle) * 13;
        const outerX = 24 + Math.cos(angle) * (index % 2 === 0 ? 23 : 19);
        const outerY = 24 + Math.sin(angle) * (index % 2 === 0 ? 23 : 19);
        const arm = [
          { x: innerX + tangentX, y: innerY + tangentY },
          { x: outerX, y: outerY },
          { x: innerX - tangentX, y: innerY - tangentY }
        ];
        graphics.fillPoints(arm, true).strokePoints(arm, true);
      }
      graphics.fillStyle(armor, 1).fillCircle(24, 24, 14).strokeCircle(24, 24, 14);
      graphics.fillStyle(recess, 1).fillPoints([{ x: 24, y: 12 }, { x: 36, y: 24 }, { x: 24, y: 36 }, { x: 12, y: 24 }], true);
      graphics.fillStyle(lens, 1).fillCircle(24, 24, 6);
      graphics.fillStyle(recess, 1).fillCircle(24, 24, 2);
    });

    const [splashModule, leaderboardModule, onlineLeaderboardModule, profileModule, menuModule, arenaModule, heistModule, legendaryRevealModule, supremeMilestoneModule, upgradeModule, cosmeticModule, modModule, garageModule, resultModule, optionsModule, roundFinishedModule, loadingModule] = await Promise.all([
      import('./SplashScene'),
      import('./LeaderboardsScene'),
      import('./OnlineLeaderboardsScene'),
      import('./LocalProfileScene'),
      import('./MainMenuScene'),
      import('./ArenaScene'),
      import('../anomalies/heist/HeistScene'),
      import('./LegendaryModRevealScene'),
      import('./SupremeMilestoneScene'),
      import('./UpgradeStoreScene'),
      import('./CosmeticsStoreScene'),
      import('./ModCollectionScene'),
      import('./OperatorGarageScene'),
      import('./ResultScene'),
      import('./OptionsScene'),
      import('./RoundFinishedScene'),
      import('./LoadingScene')
    ]);

    this.scene.add(SceneKeys.Splash, splashModule.SplashScene, false);
    this.scene.add(SceneKeys.Leaderboards, leaderboardModule.LeaderboardsScene, false);
    this.scene.add(SceneKeys.OnlineLeaderboards, onlineLeaderboardModule.OnlineLeaderboardsScene, false);
    this.scene.add(SceneKeys.LocalProfiles, profileModule.LocalProfileScene, false);
    this.scene.add(SceneKeys.MainMenu, menuModule.MainMenuScene, false);
    this.scene.add(SceneKeys.Arena, arenaModule.ArenaScene, false);
    this.scene.add(SceneKeys.Heist, heistModule.HeistScene, false);
    this.scene.add(SceneKeys.LegendaryModReveal, legendaryRevealModule.LegendaryModRevealScene, false);
    this.scene.add(SceneKeys.SupremeMilestone, supremeMilestoneModule.SupremeMilestoneScene, false);
    this.scene.add(SceneKeys.Upgrades, upgradeModule.UpgradeStoreScene, false);
    this.scene.add(SceneKeys.Cosmetics, cosmeticModule.CosmeticsStoreScene, false);
    this.scene.add(SceneKeys.Mods, modModule.ModCollectionScene, false);
    this.scene.add(SceneKeys.Garage, garageModule.OperatorGarageScene, false);
    this.scene.add(SceneKeys.Results, resultModule.ResultScene, false);
    this.scene.add(SceneKeys.Options, optionsModule.OptionsScene, false);
    this.scene.add(SceneKeys.RoundFinished, roundFinishedModule.RoundFinishedScene, false);
    this.scene.add(SceneKeys.Loading, loadingModule.LoadingScene, false);

    this.scene.start(SceneKeys.Splash);
  }
}
