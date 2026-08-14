import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants.ts';
import type { ArenaLayout, GeneratedObstacle, RectSpec } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import {
  NEON_CITY_VISUAL_THEME,
  createArenaDressingPlan,
  type ArenaDressingPlan
} from './ArenaVisualTheme.ts';

const colorCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
const centerX = (rect: RectSpec): number => rect.x + rect.w * 0.5;
const centerY = (rect: RectSpec): number => rect.y + rect.h * 0.5;

/** Static/setup-time renderer for the visual theme. It owns no physics bodies. */
export class ArenaVisualRenderer {
  readonly plan: ArenaDressingPlan;
  private readonly roots: Phaser.GameObjects.GameObject[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly layout: ArenaLayout) {
    this.plan = createArenaDressingPlan(layout);
    this.drawBackdropAndSkyline();
    this.drawFloor();
    this.drawArchetypeMotif();
    this.drawContainmentPerimeter();
    this.drawWalls();
    this.drawObstacles();
    this.drawDistrictDressing();
  }

  destroy(): void {
    for (const tween of this.tweens) tween.remove();
    this.tweens.length = 0;
    for (const root of this.roots) root.destroy();
    this.roots.length = 0;
  }

  private keep<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.roots.push(object);
    return object;
  }

  private drawBackdropAndSkyline(): void {
    const { palette } = NEON_CITY_VISUAL_THEME;
    const bounds = this.layout.generation.bounds;
    const random = new SeededRandom(this.plan.skylineSeed);
    const graphics = this.keep(this.scene.add.graphics().setDepth(-4));

    graphics.fillStyle(palette.void, 1);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    graphics.fillStyle(0x050a12, 1);
    graphics.fillRect(bounds.x - 34, bounds.y - 34, bounds.w + 68, bounds.h + 68);

    const drawTower = (x: number, y: number, w: number, h: number, horizontal: boolean): void => {
      graphics.fillStyle(random.bool() ? 0x07111b : 0x0a0e19, 0.98);
      graphics.fillRect(x, y, w, h);
      const accent = random.bool() ? this.layout.theme.primary : this.layout.theme.secondary;
      graphics.lineStyle(1, accent, 0.32);
      graphics.strokeRect(x + 1, y + 1, w - 2, h - 2);
      graphics.fillStyle(accent, 0.25);
      if (horizontal) {
        for (let windowX = x + 8; windowX < x + w - 5; windowX += 13) graphics.fillRect(windowX, y + h * 0.35, 5, 2);
      } else {
        for (let windowY = y + 8; windowY < y + h - 5; windowY += 13) graphics.fillRect(x + w * 0.35, windowY, 2, 5);
      }
    };

    for (let x = 12; x < WORLD_WIDTH - 30; x += random.int(70, 112)) {
      const w = random.int(42, 82);
      const topHeight = Math.max(24, bounds.y - random.int(34, 80));
      drawTower(x, 4, w, topHeight, true);
      const lowerY = bounds.y + bounds.h + random.int(42, 72);
      drawTower(x, lowerY, w, Math.max(20, WORLD_HEIGHT - lowerY - 4), true);
    }
    for (let y = bounds.y + 24; y < bounds.y + bounds.h - 40; y += random.int(82, 128)) {
      const h = random.int(48, 92);
      const leftWidth = Math.max(20, bounds.x - random.int(38, 86));
      drawTower(4, y, leftWidth, h, false);
      const rightX = bounds.x + bounds.w + random.int(38, 70);
      drawTower(rightX, y, Math.max(20, WORLD_WIDTH - rightX - 4), h, false);
    }
  }

  private drawFloor(): void {
    const { palette } = NEON_CITY_VISUAL_THEME;
    const bounds = this.layout.generation.bounds;
    const graphics = this.keep(this.scene.add.graphics().setDepth(-2));
    graphics.fillStyle(palette.floor, 1);
    graphics.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

    const panelW = this.plan.panelWidth;
    const panelH = this.plan.panelHeight;
    let row = 0;
    for (let y = bounds.y; y < bounds.y + bounds.h; y += panelH) {
      let column = 0;
      for (let x = bounds.x; x < bounds.x + bounds.w; x += panelW) {
        const w = Math.min(panelW, bounds.x + bounds.w - x);
        const h = Math.min(panelH, bounds.y + bounds.h - y);
        graphics.fillStyle((row + column) % 3 === 0 ? palette.floorPanel : palette.floor, 0.72);
        graphics.fillRect(x + 2, y + 2, Math.max(0, w - 4), Math.max(0, h - 4));
        graphics.lineStyle(1, palette.floorSeam, 0.42);
        graphics.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        if ((row + column) % this.plan.circuitStride === 0) {
          const accent = (row + column) % 2 ? this.layout.theme.primary : this.layout.theme.secondary;
          graphics.lineStyle(1, accent, 0.13);
          graphics.lineBetween(x + 18, y + h * 0.5, x + Math.min(w - 12, 70), y + h * 0.5);
          graphics.fillStyle(accent, 0.22);
          graphics.fillCircle(x + 14, y + h * 0.5, 2);
        }
        column += 1;
      }
      row += 1;
    }

    // Reuse the generator's seeded, non-colliding neon marks as embedded floor
    // conduits. They remain dressing only and never become physics objects.
    for (let index = 0; index < this.layout.decorativeNeon.length; index += 1) {
      const deco = this.layout.decorativeNeon[index];
      const accent = index % 2 === 0 ? this.layout.theme.primary : this.layout.theme.secondary;
      graphics.fillStyle(accent, 0.1);
      graphics.fillRoundedRect(deco.x, deco.y, deco.w, deco.h, Math.min(4, deco.h * 0.5));
      graphics.fillStyle(accent, 0.24);
      graphics.fillCircle(deco.x + 3, deco.y + deco.h * 0.5, 2);
    }
  }

  private drawArchetypeMotif(): void {
    const bounds = this.layout.generation.bounds;
    const cx = bounds.x + bounds.w * 0.5;
    const cy = bounds.y + bounds.h * 0.5;
    const g = this.keep(this.scene.add.graphics().setDepth(-1));
    const primary = this.layout.theme.primary;
    const secondary = this.layout.theme.secondary;
    const motif = this.plan.profile.floorMotif;
    g.lineStyle(2, primary, 0.13);

    if (motif === 'concentric' || motif === 'radial') {
      for (const radius of [150, 290, 430]) g.strokeCircle(cx, cy, radius);
      if (motif === 'radial') {
        for (let index = 0; index < 8; index += 1) {
          const angle = index * Math.PI / 4;
          g.lineBetween(cx + Math.cos(angle) * 80, cy + Math.sin(angle) * 80, cx + Math.cos(angle) * 500, cy + Math.sin(angle) * 500);
        }
      }
    } else if (motif === 'split-lanes' || motif === 'transit-lanes') {
      const vertical = this.layout.generation.orientationBias.vertical >= this.layout.generation.orientationBias.horizontal;
      for (const offset of [-54, -26, 26, 54]) {
        if (vertical) g.lineBetween(cx + offset, bounds.y + 50, cx + offset, bounds.y + bounds.h - 50);
        else g.lineBetween(bounds.x + 50, cy + offset, bounds.x + bounds.w - 50, cy + offset);
      }
      g.lineStyle(8, secondary, 0.045);
      if (vertical) g.lineBetween(cx, bounds.y + 50, cx, bounds.y + bounds.h - 50);
      else g.lineBetween(bounds.x + 50, cy, bounds.x + bounds.w - 50, cy);
    } else if (motif === 'cross-junction') {
      g.lineStyle(3, primary, 0.14);
      g.strokeRect(cx - 190, cy - 190, 380, 380);
      g.lineBetween(bounds.x + 60, cy, bounds.x + bounds.w - 60, cy);
      g.lineBetween(cx, bounds.y + 60, cx, bounds.y + bounds.h - 60);
      g.lineStyle(2, secondary, 0.15);
      g.strokeCircle(cx, cy, 112);
    } else if (motif === 'fortress-bays' || motif === 'containment') {
      for (const inset of [68, 104]) {
        g.lineStyle(2, inset === 68 ? primary : secondary, 0.1);
        g.strokeRect(bounds.x + inset, bounds.y + inset, bounds.w - inset * 2, bounds.h - inset * 2);
      }
    } else if (motif === 'island-cells' || motif === 'cluster-zones' || motif === 'room-nodes') {
      const random = new SeededRandom(this.plan.landmarkSeed ^ 0x91a7);
      for (let index = 0; index < 8; index += 1) {
        const x = random.int(bounds.x + 170, bounds.x + bounds.w - 170);
        const y = random.int(bounds.y + 150, bounds.y + bounds.h - 150);
        const radius = random.int(45, 88);
        g.lineStyle(1, index % 2 ? primary : secondary, 0.12);
        g.strokeCircle(x, y, radius);
        g.fillStyle(index % 2 ? primary : secondary, 0.16);
        g.fillCircle(x, y, 3);
      }
    } else if (motif === 'circuit-maze') {
      g.lineStyle(1, primary, 0.12);
      for (let y = bounds.y + 100; y < bounds.y + bounds.h - 80; y += 150) {
        g.beginPath();
        g.moveTo(bounds.x + 80, y);
        g.lineTo(cx - 70, y);
        g.lineTo(cx - 70, y + 54);
        g.lineTo(bounds.x + bounds.w - 80, y + 54);
        g.strokePath();
      }
    } else {
      g.lineStyle(1, primary, 0.12);
      g.strokeRect(cx - 300, cy - 210, 600, 420);
      g.lineStyle(1, secondary, 0.1);
      g.strokeRect(cx - 460, cy - 320, 920, 640);
    }

    // Small tactical chevrons bind objective sockets to the environment without
    // competing with the live BombSiteManager telegraphs drawn above them.
    for (let siteIndex = 0; siteIndex < this.layout.bombSites.length; siteIndex += 1) {
      const site = this.layout.bombSites[siteIndex];
      const accent = siteIndex % 2 === 0 ? primary : secondary;
      g.lineStyle(2, accent, 0.2);
      for (let chevron = 0; chevron < 3; chevron += 1) {
        const radius = 106 + chevron * 12;
        g.beginPath();
        g.moveTo(site.x - 10, site.y - radius - 7);
        g.lineTo(site.x, site.y - radius);
        g.lineTo(site.x + 10, site.y - radius - 7);
        g.strokePath();
      }
    }
  }

  private drawContainmentPerimeter(): void {
    const bounds = this.layout.generation.bounds;
    const g = this.keep(this.scene.add.graphics().setDepth(1));
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.shadow, 0.75);
    g.fillRect(bounds.x - 22, bounds.y - 22, bounds.w + 44, 18);
    g.fillRect(bounds.x - 22, bounds.y + bounds.h + 4, bounds.w + 44, 18);
    g.fillRect(bounds.x - 22, bounds.y - 4, 18, bounds.h + 8);
    g.fillRect(bounds.x + bounds.w + 4, bounds.y - 4, 18, bounds.h + 8);
    g.lineStyle(2, this.layout.theme.primary, 0.42);
    g.strokeRect(bounds.x - 9, bounds.y - 9, bounds.w + 18, bounds.h + 18);
    g.lineStyle(1, this.layout.theme.secondary, 0.3);
    g.strokeRect(bounds.x - 16, bounds.y - 16, bounds.w + 32, bounds.h + 32);

    const nodeSpacing = 180;
    for (let x = bounds.x + 80; x < bounds.x + bounds.w - 50; x += nodeSpacing) {
      this.drawPerimeterNode(g, x, bounds.y - 11);
      this.drawPerimeterNode(g, x, bounds.y + bounds.h + 11);
    }
    for (let y = bounds.y + 80; y < bounds.y + bounds.h - 50; y += nodeSpacing) {
      this.drawPerimeterNode(g, bounds.x - 11, y);
      this.drawPerimeterNode(g, bounds.x + bounds.w + 11, y);
    }
  }

  private drawPerimeterNode(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x06111b, 1);
    g.fillCircle(x, y, 7);
    g.lineStyle(2, this.layout.theme.primary, 0.72);
    g.strokeCircle(x, y, 7);
    g.fillStyle(this.layout.theme.secondary, 0.72);
    g.fillCircle(x, y, 2);
  }

  private drawWalls(): void {
    const g = this.keep(this.scene.add.graphics().setDepth(2));
    const nodeSet = new Set(this.plan.animatedNodeIndices);
    for (let index = 0; index < this.layout.walls.length; index += 1) {
      const wall = this.layout.walls[index];
      this.drawWallModule(g, wall, index);
      if (nodeSet.has(index)) this.createWallNode(wall, index);
    }
  }

  private drawWallModule(g: Phaser.GameObjects.Graphics, wall: RectSpec, index: number): void {
    const horizontal = wall.w >= wall.h;
    const accent = index % 3 === 0 ? this.layout.theme.secondary : this.layout.theme.primary;
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.shadow, 0.82);
    g.fillRect(wall.x + 7, wall.y + 8, wall.w, wall.h);
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.wall, 1);
    g.fillRect(wall.x, wall.y, wall.w, wall.h);
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.wallInset, 0.96);
    g.fillRect(wall.x + 5, wall.y + 5, Math.max(1, wall.w - 10), Math.max(1, wall.h - 10));
    g.lineStyle(2, accent, 0.75);
    g.strokeRect(wall.x + 1, wall.y + 1, Math.max(1, wall.w - 2), Math.max(1, wall.h - 2));
    g.lineStyle(1, 0x8bdbe5, 0.18);
    g.strokeRect(wall.x + 6, wall.y + 6, Math.max(1, wall.w - 12), Math.max(1, wall.h - 12));

    const stride = this.plan.wallPanelStride;
    g.lineStyle(1, accent, 0.24 + this.plan.profile.wallDensity * 0.12);
    if (horizontal) {
      const railY = wall.y + Math.min(wall.h - 4, Math.max(4, wall.h * 0.28));
      g.lineBetween(wall.x + 8, railY, wall.x + wall.w - 8, railY);
      for (let x = wall.x + stride; x < wall.x + wall.w - 8; x += stride) g.lineBetween(x, wall.y + 5, x, wall.y + wall.h - 5);
    } else {
      const railX = wall.x + Math.min(wall.w - 4, Math.max(4, wall.w * 0.28));
      g.lineBetween(railX, wall.y + 8, railX, wall.y + wall.h - 8);
      for (let y = wall.y + stride; y < wall.y + wall.h - 8; y += stride) g.lineBetween(wall.x + 5, y, wall.x + wall.w - 5, y);
    }

    if ((index * 17 + this.layout.seed) % 7 === 0) {
      g.fillStyle(NEON_CITY_VISUAL_THEME.palette.warning, 0.38);
      if (horizontal) g.fillRect(wall.x + 12, wall.y + wall.h - 5, Math.min(54, wall.w - 24), 2);
      else g.fillRect(wall.x + wall.w - 5, wall.y + 12, 2, Math.min(54, wall.h - 24));
    }
  }

  private createWallNode(wall: RectSpec, index: number): void {
    const color = index % 2 === 0 ? this.layout.theme.primary : this.layout.theme.secondary;
    const node = this.keep(this.scene.add.circle(centerX(wall), centerY(wall), 4, color, 0.56)
      .setStrokeStyle(1, 0xffffff, 0.42)
      .setDepth(2.2));
    const tween = this.scene.tweens.add({
      targets: node,
      alpha: { from: 0.32, to: 0.9 },
      scale: { from: 0.8, to: 1.25 },
      duration: 1100 + (index % 5) * 170,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.push(tween);
  }

  private drawObstacles(): void {
    const g = this.keep(this.scene.add.graphics().setDepth(3));
    for (let index = 0; index < this.layout.obstacles.length; index += 1) {
      this.drawObstacleModule(g, this.layout.obstacles[index], index);
    }
  }

  private drawObstacleModule(g: Phaser.GameObjects.Graphics, obstacle: GeneratedObstacle, index: number): void {
    const x = obstacle.x;
    const y = obstacle.y;
    const rx = obstacle.w * 0.5;
    const ry = obstacle.h * 0.5;
    const radius = Math.min(rx, ry);
    const accent = index % 2 === 0 ? this.layout.theme.primary : this.layout.theme.secondary;
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.shadow, 0.82);
    this.traceObstacle(g, obstacle, x + 6, y + 7, rx, ry, true, false);
    g.fillStyle(NEON_CITY_VISUAL_THEME.palette.wall, 0.98);
    g.lineStyle(2, accent, 0.9);
    this.traceObstacle(g, obstacle, x, y, rx, ry, true, true);
    g.lineStyle(1, 0xa9f8ff, 0.22);
    if (obstacle.kind === 'circle' || obstacle.kind === 'energy-column') {
      g.strokeCircle(x, y, Math.max(3, radius - 7));
      g.fillStyle(accent, obstacle.kind === 'energy-column' ? 0.18 : 0.08);
      g.fillCircle(x, y, Math.max(3, radius * 0.38));
    } else {
      g.strokeRect(x - rx + 7, y - ry + 7, Math.max(1, obstacle.w - 14), Math.max(1, obstacle.h - 14));
      g.lineBetween(x - rx + 10, y, x + rx - 10, y);
    }
  }

  private traceObstacle(g: Phaser.GameObjects.Graphics, obstacle: GeneratedObstacle, x: number, y: number, rx: number, ry: number, fill: boolean, stroke: boolean): void {
    if (obstacle.kind === 'circle' || obstacle.kind === 'energy-column') {
      const radius = Math.min(rx, ry);
      if (fill) g.fillCircle(x, y, radius);
      if (stroke) g.strokeCircle(x, y, radius);
      return;
    }
    if (obstacle.kind === 'triangle') {
      const points = [{ x, y: y - ry }, { x: x - rx, y: y + ry }, { x: x + rx, y: y + ry }];
      if (fill) g.fillPoints(points, true);
      if (stroke) g.strokePoints(points, true);
      return;
    }
    if (obstacle.kind === 'hexagon' || obstacle.kind === 'octagon') {
      const sides = obstacle.kind === 'hexagon' ? 6 : 8;
      const points = Array.from({ length: sides }, (_, side) => {
        const angle = side * Math.PI * 2 / sides;
        return { x: x + Math.cos(angle) * rx, y: y + Math.sin(angle) * ry };
      });
      if (fill) g.fillPoints(points, true);
      if (stroke) g.strokePoints(points, true);
      return;
    }
    if (fill) g.fillRect(x - rx, y - ry, obstacle.w, obstacle.h);
    if (stroke) g.strokeRect(x - rx, y - ry, obstacle.w, obstacle.h);
  }

  private drawDistrictDressing(): void {
    const bounds = this.layout.generation.bounds;
    const random = new SeededRandom(this.plan.landmarkSeed);
    const labelRoot = this.keep(this.scene.add.container(0, 0).setDepth(1.6));
    const title = this.scene.add.text(bounds.x + 56, bounds.y + 52, `N3ON // ${this.plan.districtLabel}`, {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '16px',
      color: colorCss(this.layout.theme.primary),
      stroke: '#02060b',
      strokeThickness: 4
    }).setAlpha(0.52);
    const sector = this.scene.add.text(bounds.x + 56, bounds.y + 76, `${this.plan.profile.landmark} // ${this.layout.template.toUpperCase()}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '12px',
      color: '#91a9b6',
      stroke: '#02060b',
      strokeThickness: 3
    }).setAlpha(0.62);
    labelRoot.add([title, sector]);

    const wallSigns = this.plan.signWallIndices.slice(0, NEON_CITY_VISUAL_THEME.maximumSigns);
    for (let index = 0; index < wallSigns.length; index += 1) {
      const wall = this.layout.walls[wallSigns[index]];
      if (!wall || Math.min(wall.w, wall.h) < 22 || Math.max(wall.w, wall.h) < 90) continue;
      const horizontal = wall.w >= wall.h;
      const sign = this.scene.add.text(centerX(wall), centerY(wall), random.pick(['N3ON', 'GRID', 'LINK', 'VOID', `S-${(this.layout.seed + index) % 99}`]), {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '9px',
        color: colorCss(index % 2 ? this.layout.theme.primary : this.layout.theme.secondary),
        backgroundColor: '#030810',
        padding: { x: 5, y: 2 }
      }).setOrigin(0.5).setAlpha(0.72).setRotation(horizontal ? 0 : Math.PI * 0.5);
      labelRoot.add(sign);
    }
  }
}
