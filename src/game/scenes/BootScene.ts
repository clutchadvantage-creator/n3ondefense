import Phaser from 'phaser';
import { COLORS } from '../config/constants';
import { SceneKeys } from '../flow/SceneKeys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    this.load.audio('sfx-boost', 'assets/audio/soundeffects/boost.mp3');
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

    createPlayerTexture('enemy-star', (graphics) => {
      const points: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < 10; i += 1) {
        const outer = i % 2 === 0;
        const radius = outer ? 13.5 : 6;
        const angle = -Math.PI / 2 + (Math.PI / 5) * i;
        points.push({ x: 16 + Math.cos(angle) * radius, y: 16 + Math.sin(angle) * radius });
      }
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    });

    const createEnemyPolygon = (key: string, points: Phaser.Types.Math.Vector2Like[]): void => {
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.fillPoints(points, true);
      g.lineStyle(2, 0x172033, 1);
      g.strokePoints(points, true);
      g.generateTexture(key, 32, 32);
    };
    createEnemyPolygon('enemy-grunt', [{ x: 16, y: 4 }, { x: 29, y: 27 }, { x: 3, y: 27 }]);
    createEnemyPolygon('enemy-shooter', [{ x: 16, y: 2 }, { x: 30, y: 16 }, { x: 16, y: 30 }, { x: 2, y: 16 }]);
    createEnemyPolygon('enemy-defuser', [{ x: 9, y: 3 }, { x: 23, y: 3 }, { x: 30, y: 16 }, { x: 23, y: 29 }, { x: 9, y: 29 }, { x: 2, y: 16 }]);
    createEnemyPolygon('enemy-tank', [{ x: 7, y: 2 }, { x: 25, y: 2 }, { x: 30, y: 7 }, { x: 30, y: 25 }, { x: 25, y: 30 }, { x: 7, y: 30 }, { x: 2, y: 25 }, { x: 2, y: 7 }]);
    createEnemyPolygon('enemy-disruptor', [{ x: 16, y: 2 }, { x: 30, y: 12 }, { x: 25, y: 29 }, { x: 7, y: 29 }, { x: 2, y: 12 }]);

    const [splashModule, leaderboardModule, onlineLeaderboardModule, profileModule, menuModule, arenaModule, upgradeModule, cosmeticModule, resultModule, optionsModule, roundFinishedModule, loadingModule] = await Promise.all([
      import('./SplashScene'),
      import('./LeaderboardsScene'),
      import('./OnlineLeaderboardsScene'),
      import('./LocalProfileScene'),
      import('./MainMenuScene'),
      import('./ArenaScene'),
      import('./UpgradeStoreScene'),
      import('./CosmeticsStoreScene'),
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
    this.scene.add(SceneKeys.Upgrades, upgradeModule.UpgradeStoreScene, false);
    this.scene.add(SceneKeys.Cosmetics, cosmeticModule.CosmeticsStoreScene, false);
    this.scene.add(SceneKeys.Results, resultModule.ResultScene, false);
    this.scene.add(SceneKeys.Options, optionsModule.OptionsScene, false);
    this.scene.add(SceneKeys.RoundFinished, roundFinishedModule.RoundFinishedScene, false);
    this.scene.add(SceneKeys.Loading, loadingModule.LoadingScene, false);

    this.scene.start(SceneKeys.Splash);
  }
}
