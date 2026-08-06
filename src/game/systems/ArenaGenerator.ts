import Phaser from 'phaser';
import type { ArenaLayout, ArenaTemplate, RectSpec } from '../types';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { ArenaThemeManager } from './ArenaThemeManager';
import { ObstacleFactory } from './ObstacleFactory';
import { SeededRandom } from './SeededRandom';
import { WallFactory } from './WallFactory';
import { ArenaValidator } from './ArenaValidator';

const clampRect = (r: RectSpec): RectSpec => ({
  x: Phaser.Math.Clamp(r.x, 34, WORLD_WIDTH - 34),
  y: Phaser.Math.Clamp(r.y, 34, WORLD_HEIGHT - 34),
  w: Phaser.Math.Clamp(r.w, 16, WORLD_WIDTH - r.x - 34),
  h: Phaser.Math.Clamp(r.h, 16, WORLD_HEIGHT - r.y - 34)
});

export class ArenaGenerator {
  static generate(seed: number, template: ArenaTemplate, round: number, siteCount: number): ArenaLayout {
    let attempts = 0;
    let currentSeed = seed;

    while (attempts < 10) {
      attempts += 1;
      const random = new SeededRandom(currentSeed);
      const theme = ArenaThemeManager.pick(random);
      const wallFactory = new WallFactory(random);
      const obstacleFactory = new ObstacleFactory(random);

      const walls: RectSpec[] = [];
      walls.push({ x: 0, y: 0, w: WORLD_WIDTH, h: 30 });
      walls.push({ x: 0, y: WORLD_HEIGHT - 30, w: WORLD_WIDTH, h: 30 });
      walls.push({ x: 0, y: 0, w: 30, h: WORLD_HEIGHT });
      walls.push({ x: WORLD_WIDTH - 30, y: 0, w: 30, h: WORLD_HEIGHT });

      const density = Phaser.Math.Clamp(6 + Math.floor(round * 0.7) + random.int(-2, 5), 5, 18);
      for (let i = 0; i < density; i += 1) {
        const x = random.int(140, WORLD_WIDTH - 260);
        const y = random.int(140, WORLD_HEIGHT - 260);
        const len = random.int(130, 360);
        const thick = random.int(20, 36);

        let pieces: RectSpec[] = [];
        if (template === 'open-grid') {
          pieces = random.bool(0.6) ? wallFactory.horizontal(x, y, len, thick) : wallFactory.vertical(x, y, len, thick);
        } else if (template === 'corridor-network') {
          pieces = random.pick([
            wallFactory.lShape(x, y, random.int(120, 240), random.int(100, 220), thick),
            wallFactory.uShape(x, y, random.int(140, 240), random.int(120, 210), thick),
            wallFactory.room(x, y, random.int(160, 260), random.int(130, 220), thick, true)
          ]);
        } else if (template === 'central-fortress') {
          pieces = i < 3
            ? wallFactory.cross(WORLD_WIDTH * 0.5 - 170 + i * 24, WORLD_HEIGHT * 0.5 - 170 + i * 24, 260, thick)
            : wallFactory.connectedSegments(x, y, 170, random.int(2, 4), thick);
        } else if (template === 'split-arena') {
          pieces = random.pick([
            wallFactory.vertical(WORLD_WIDTH * 0.5 + random.int(-80, 80), 120, WORLD_HEIGHT - 240, thick),
            wallFactory.tShape(x, y, random.int(160, 280), random.int(120, 240), thick),
            wallFactory.room(x, y, random.int(140, 240), random.int(120, 220), thick, true)
          ]);
        } else {
          pieces = random.pick([
            wallFactory.zigzag(x, y, random.int(60, 90), random.int(3, 6), thick),
            wallFactory.angled(x, y, random.int(120, 260), thick),
            wallFactory.barrierCluster(x, y, random.int(3, 6), random.int(46, 90))
          ]);
        }

        walls.push(...pieces.map(clampRect));
      }

      const obstacleCount = Phaser.Math.Clamp(8 + Math.floor(round * 1.25) + random.int(-4, 7), 7, 28);
      const obstacles = obstacleFactory.batch(150, 150, WORLD_WIDTH - 300, WORLD_HEIGHT - 300, obstacleCount);

      const spawnMargin = random.int(110, 210);
      const spawnSide = random.int(0, 3);
      const playerSpawn = spawnSide === 0
        ? new Phaser.Math.Vector2(spawnMargin, random.int(180, WORLD_HEIGHT - 180))
        : spawnSide === 1
          ? new Phaser.Math.Vector2(WORLD_WIDTH - spawnMargin, random.int(180, WORLD_HEIGHT - 180))
          : spawnSide === 2
            ? new Phaser.Math.Vector2(random.int(180, WORLD_WIDTH - 180), spawnMargin)
            : new Phaser.Math.Vector2(random.int(180, WORLD_WIDTH - 180), WORLD_HEIGHT - spawnMargin);

      const enemySpawns = random.shuffle([
        new Phaser.Math.Vector2(120, 120),
        new Phaser.Math.Vector2(WORLD_WIDTH - 120, 120),
        new Phaser.Math.Vector2(120, WORLD_HEIGHT - 120),
        new Phaser.Math.Vector2(WORLD_WIDTH - 120, WORLD_HEIGHT - 120),
        new Phaser.Math.Vector2(WORLD_WIDTH - 160, WORLD_HEIGHT * 0.5),
        new Phaser.Math.Vector2(160, WORLD_HEIGHT * 0.5),
        new Phaser.Math.Vector2(WORLD_WIDTH * 0.5, 110),
        new Phaser.Math.Vector2(WORLD_WIDTH * 0.5, WORLD_HEIGHT - 110)
      ]).slice(0, random.int(5, 8));

      const bombSites: Phaser.Math.Vector2[] = [];
      let guard = 0;
      while (bombSites.length < siteCount && guard < 400) {
        guard += 1;
        const pos = new Phaser.Math.Vector2(random.int(220, WORLD_WIDTH - 220), random.int(220, WORLD_HEIGHT - 220));
        const tooClose = bombSites.some((s) => Phaser.Math.Distance.Between(s.x, s.y, pos.x, pos.y) < 220);
        if (!tooClose) bombSites.push(pos);
      }

      const decorations: RectSpec[] = [];
      for (let i = 0; i < 30; i += 1) {
        decorations.push({ x: random.int(40, WORLD_WIDTH - 80), y: random.int(40, WORLD_HEIGHT - 80), w: random.int(20, 80), h: random.int(6, 16) });
      }

      const layout: ArenaLayout = {
        seed: currentSeed,
        template,
        theme,
        walls,
        obstacles,
        playerSpawn,
        enemySpawns,
        bombSites,
        decorativeNeon: decorations
      };

      if (ArenaValidator.validate(layout, WORLD_WIDTH, WORLD_HEIGHT)) {
        return layout;
      }
      currentSeed += 1;
    }

    return ArenaGenerator.buildFallbackLayout(seed, template, siteCount);
  }

  private static buildFallbackLayout(seed: number, template: ArenaTemplate, siteCount: number): ArenaLayout {
    const random = new SeededRandom(seed + 9_999);
    const theme = ArenaThemeManager.pick(random);

    const walls: RectSpec[] = [
      { x: 0, y: 0, w: WORLD_WIDTH, h: 30 },
      { x: 0, y: WORLD_HEIGHT - 30, w: WORLD_WIDTH, h: 30 },
      { x: 0, y: 0, w: 30, h: WORLD_HEIGHT },
      { x: WORLD_WIDTH - 30, y: 0, w: 30, h: WORLD_HEIGHT }
    ];

    // Keep fallback sparse but seed its silhouette so validation recovery does not repeat one arena.
    const vertical = random.bool();
    const offset = random.int(-260, 260);
    if (vertical) {
      walls.push({ x: WORLD_WIDTH * 0.5 + offset, y: 170, w: random.int(48, 86), h: random.int(190, 340) });
      walls.push({ x: WORLD_WIDTH * 0.5 - offset - 60, y: WORLD_HEIGHT - random.int(390, 520), w: random.int(48, 86), h: random.int(190, 340) });
    } else {
      walls.push({ x: 210, y: WORLD_HEIGHT * 0.5 + offset, w: random.int(210, 390), h: random.int(48, 82) });
      walls.push({ x: WORLD_WIDTH - random.int(520, 660), y: WORLD_HEIGHT * 0.5 - offset - 60, w: random.int(210, 390), h: random.int(48, 82) });
    }

    const playerSpawn = new Phaser.Math.Vector2(180, WORLD_HEIGHT * 0.5);
    const enemySpawns = [
      new Phaser.Math.Vector2(120, 120),
      new Phaser.Math.Vector2(WORLD_WIDTH - 120, 120),
      new Phaser.Math.Vector2(120, WORLD_HEIGHT - 120),
      new Phaser.Math.Vector2(WORLD_WIDTH - 120, WORLD_HEIGHT - 120)
    ];

    const bombSites: Phaser.Math.Vector2[] = [];
    const candidates = [
      new Phaser.Math.Vector2(WORLD_WIDTH - 240, 200),
      new Phaser.Math.Vector2(WORLD_WIDTH - 260, WORLD_HEIGHT * 0.5),
      new Phaser.Math.Vector2(WORLD_WIDTH - 240, WORLD_HEIGHT - 200),
      new Phaser.Math.Vector2(WORLD_WIDTH * 0.5 + 130, WORLD_HEIGHT * 0.5 - 170),
      new Phaser.Math.Vector2(WORLD_WIDTH * 0.5 + 130, WORLD_HEIGHT * 0.5 + 170)
    ];
    random.shuffle(candidates);
    for (const c of candidates) {
      if (bombSites.length >= siteCount) break;
      bombSites.push(c);
    }

    const decorativeNeon: RectSpec[] = [];
    for (let i = 0; i < 18; i += 1) {
      decorativeNeon.push({
        x: random.int(40, WORLD_WIDTH - 80),
        y: random.int(40, WORLD_HEIGHT - 80),
        w: random.int(24, 84),
        h: random.int(6, 16)
      });
    }

    return {
      seed,
      template,
      theme,
      walls,
      obstacles: [],
      playerSpawn,
      enemySpawns,
      bombSites,
      decorativeNeon
    };
  }
}
