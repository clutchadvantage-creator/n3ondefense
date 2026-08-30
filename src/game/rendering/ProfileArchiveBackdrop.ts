import Phaser from 'phaser';
import { ENEMY_ROBOT_FRAMES } from '../enemies/EnemyRobotFrames.ts';
import type { EnemyType, RectSpec } from '../types.ts';
import { NEON_CITY_VISUAL_THEME } from '../arena/ArenaVisualTheme.ts';
import {
  createEnvironmentDecalPlan,
  createEnvironmentGraffitiArt
} from './EnvironmentDecalLibrary.ts';
import {
  drawBeveledTechPlate,
  drawHazardStripes,
  drawPanelBolts,
  drawVentSlats
} from './LayeredArtPrimitives.ts';

const MAX_COMPOSITE_WIDTH = 1920;
const MAX_COMPOSITE_HEIGHT = 1080;
const ARCHIVE_SEED = 0x4e334f4e;

export interface ProfileArchiveBackdropDiagnostics {
  staticLayers: 1;
  gameplayEntities: 0;
  physicsBodies: 0;
  animationLoops: 0;
  maximumCompositePixels: number;
  enemyTextureKeys: readonly string[];
  environmentArtSource: 'arena-graffiti-and-layered-art-primitives';
}

/**
 * One setup-time, presentation-only menu composition. Existing Arena art
 * primitives, graffiti plans, and cached enemy textures are baked into one
 * RenderTexture; no Arena scene, Enemy instances, physics, AI, or VFX systems
 * are created for the profile menu.
 */
export class ProfileArchiveBackdrop {
  readonly diagnostics: ProfileArchiveBackdropDiagnostics = {
    staticLayers: 1,
    gameplayEntities: 0,
    physicsBodies: 0,
    animationLoops: 0,
    maximumCompositePixels: MAX_COMPOSITE_WIDTH * MAX_COMPOSITE_HEIGHT,
    enemyTextureKeys: [
      ENEMY_ROBOT_FRAMES.grunt.textureKey,
      ENEMY_ROBOT_FRAMES.shooter.textureKey,
      ENEMY_ROBOT_FRAMES.tank.textureKey,
      ENEMY_ROBOT_FRAMES.star.textureKey
    ],
    environmentArtSource: 'arena-graffiti-and-layered-art-primitives'
  };

  private renderTexture: Phaser.GameObjects.RenderTexture | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.resize(scene.scale.width, scene.scale.height);
  }

  resize(viewportWidth: number, viewportHeight: number): void {
    const width = Math.max(1, viewportWidth);
    const height = Math.max(1, viewportHeight);
    const resolutionScale = Math.min(1, MAX_COMPOSITE_WIDTH / width, MAX_COMPOSITE_HEIGHT / height);
    const compositeWidth = Math.max(1, Math.round(width * resolutionScale));
    const compositeHeight = Math.max(1, Math.round(height * resolutionScale));
    this.renderTexture?.destroy();
    this.renderTexture = this.compose(compositeWidth, compositeHeight)
      .setDisplaySize(width, height);
  }

  destroy(): void {
    if (this.renderTexture?.active) this.renderTexture.destroy();
    this.renderTexture = null;
  }

  private compose(width: number, height: number): Phaser.GameObjects.RenderTexture {
    const { palette } = NEON_CITY_VISUAL_THEME;
    const sources: Phaser.GameObjects.GameObject[] = [];
    const floor = this.scene.make.graphics({ x: 0, y: 0 }, false);
    sources.push(floor);

    floor.fillStyle(palette.void, 1).fillRect(0, 0, width, height);
    floor.fillStyle(0x06101b, 1).fillRect(0, 0, width, height);

    // Oversized floor panels read as a deliberately zoomed-in Arena surface,
    // not as a screenshot of an active gameplay layout.
    const columnWidth = width * 0.36;
    const rowHeight = height * 0.44;
    for (let row = -1; row < 3; row += 1) {
      for (let column = -1; column < 4; column += 1) {
        const x = column * columnWidth + (row % 2 === 0 ? -columnWidth * 0.14 : columnWidth * 0.05);
        const y = row * rowHeight;
        const edge = (row + column) % 2 === 0 ? palette.cyan : palette.magenta;
        drawBeveledTechPlate(floor, x, y, columnWidth - 12, rowHeight - 12, {
          face: 0x091522,
          inset: (row + column) % 3 === 0 ? 0x0b1d2a : 0x081722,
          edge,
          side: 0x02070e,
          highlight: 0xa9f8ff,
          depth: Math.max(5, Math.min(11, width * 0.006)),
          alpha: 0.86
        });
        drawPanelBolts(floor, x + 12, y + 12, columnWidth - 36, rowHeight - 36, 0x62859a, 10);
      }
    }

    // Actual Arena maintenance language: vents, illuminated service channels,
    // and caution paint remain concentrated around the outside of the UI.
    drawVentSlats(floor, width * 0.035, height * 0.17, width * 0.115, height * 0.12, true, palette.cyan);
    drawVentSlats(floor, width * 0.855, height * 0.68, width * 0.11, height * 0.13, false, palette.magenta);
    drawHazardStripes(floor, 0, height * 0.08, width * 0.18, Math.max(14, height * 0.026), palette.warning, 0.34, 15);
    drawHazardStripes(floor, width * 0.82, height * 0.9, width * 0.18, Math.max(14, height * 0.026), palette.warning, 0.3, 15);

    floor.lineStyle(Math.max(6, width * 0.005), 0x01050a, 0.9);
    floor.lineBetween(width * 0.03, height * 0.84, width * 0.97, height * 0.84);
    floor.lineStyle(Math.max(2, width * 0.0015), palette.cyan, 0.5);
    floor.lineBetween(0, height * 0.865, width * 0.42, height * 0.865);
    floor.lineStyle(Math.max(2, width * 0.0015), palette.magenta, 0.46);
    floor.lineBetween(width * 0.58, height * 0.865, width, height * 0.865);
    floor.lineStyle(Math.max(2, width * 0.0013), palette.cyan, 0.34);
    floor.lineBetween(width * 0.105, 0, width * 0.105, height * 0.58);
    floor.lineStyle(Math.max(2, width * 0.0013), palette.magenta, 0.32);
    floor.lineBetween(width * 0.895, height * 0.27, width * 0.895, height);

    const combatLayer = this.scene.make.graphics({ x: 0, y: 0 }, false);
    sources.push(combatLayer);
    this.drawArchiveFrame(combatLayer, width * 0.025, height * 0.27, width * 0.225, height * 0.38, palette.cyan, false);
    this.drawArchiveFrame(combatLayer, width * 0.75, height * 0.19, width * 0.225, height * 0.43, palette.magenta, true);

    this.addEnemyArchiveImage(sources, 'grunt', width * 0.055, height * 0.5, Math.min(width, height) * 0.13, palette.cyan, -14, 0.13);
    this.addEnemyArchiveImage(sources, 'shooter', width * 0.13, height * 0.42, Math.min(width, height) * 0.24, palette.cyan, 8, 0.32);
    this.addEnemyArchiveImage(sources, 'star', width * 0.86, height * 0.29, Math.min(width, height) * 0.15, palette.magenta, -11, 0.15);
    this.addEnemyArchiveImage(sources, 'tank', width * 0.89, height * 0.45, Math.min(width, height) * 0.27, palette.magenta, -7, 0.3);

    // A restrained baked muzzle streak makes the left image read as archived
    // combat art while remaining entirely non-interactive and simulation-free.
    combatLayer.fillStyle(0xffffff, 0.34).fillTriangle(
      width * 0.205, height * 0.4,
      width * 0.205, height * 0.42,
      width * 0.29, height * 0.39
    );
    combatLayer.lineStyle(Math.max(1, width * 0.0012), palette.cyan, 0.32);
    combatLayer.lineBetween(width * 0.2, height * 0.41, width * 0.31, height * 0.37);
    combatLayer.lineBetween(width * 0.2, height * 0.41, width * 0.285, height * 0.445);

    const decalSurfaces: RectSpec[] = [
      { x: width * 0.015, y: height * 0.7, w: width * 0.22, h: Math.max(30, height * 0.08) },
      { x: width * 0.77, y: height * 0.07, w: width * 0.21, h: Math.max(30, height * 0.075) },
      { x: width * 0.025, y: height * 0.055, w: width * 0.2, h: Math.max(30, height * 0.07) },
      { x: width * 0.73, y: height * 0.73, w: width * 0.25, h: Math.max(30, height * 0.08) },
      { x: width * 0.04, y: height * 0.89, w: width * 0.28, h: Math.max(30, height * 0.07) }
    ];
    const decalPlan = createEnvironmentDecalPlan('arena', ARCHIVE_SEED, decalSurfaces, 5);
    for (const decal of decalPlan.decals) {
      const graffiti = createEnvironmentGraffitiArt(this.scene, decal)
        .setScale(Math.max(0.9, Math.min(1.7, width / 1280)))
        .setAlpha(Math.min(0.48, decal.alpha + 0.05));
      sources.push(graffiti);
    }

    this.addArchiveLabel(sources, width * 0.04, height * 0.245, 'ARCHIVE FRAME // GUNNER', palette.cyan, width);
    this.addArchiveLabel(sources, width * 0.76, height * 0.165, 'THREAT RECORD // JUGGERNAUT', palette.magenta, width);

    // The UI occupies the middle. A baked central calm zone keeps every card,
    // button, and description readable without flattening the outer artwork.
    const readability = this.scene.make.graphics({ x: 0, y: 0 }, false);
    sources.push(readability);
    readability.fillStyle(0x02070d, 0.34)
      .fillRoundedRect(width * 0.145, height * 0.035, width * 0.71, height * 0.9, Math.max(18, width * 0.018));
    readability.fillStyle(0x02070d, 0.18)
      .fillRoundedRect(width * 0.235, 0, width * 0.53, height, Math.max(18, width * 0.018));
    for (let y = 0; y < height; y += 5) {
      readability.fillStyle(0x8befff, 0.012).fillRect(0, y, width, 1);
    }

    const renderTexture = this.scene.add.renderTexture(0, 0, width, height)
      .setOrigin(0)
      .setDepth(-20);
    renderTexture.draw(sources);
    for (const source of sources) source.destroy();
    return renderTexture;
  }

  private addEnemyArchiveImage(
    sources: Phaser.GameObjects.GameObject[],
    type: EnemyType,
    x: number,
    y: number,
    size: number,
    tint: number,
    angle: number,
    alpha: number
  ): void {
    const image = this.scene.make.image({
      x,
      y,
      key: ENEMY_ROBOT_FRAMES[type].textureKey,
      add: false
    }).setDisplaySize(size, size)
      .setAngle(angle)
      .setTint(tint)
      .setAlpha(alpha);
    sources.push(image);
  }

  private drawArchiveFrame(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    rightAligned: boolean
  ): void {
    graphics.fillStyle(color, 0.025).fillRoundedRect(x, y, width, height, 9);
    graphics.lineStyle(2, color, 0.2).strokeRoundedRect(x, y, width, height, 9);
    const corner = Math.min(width, height) * 0.11;
    const outerX = rightAligned ? x + width : x;
    const direction = rightAligned ? -1 : 1;
    graphics.lineStyle(3, color, 0.46);
    graphics.lineBetween(outerX, y, outerX + direction * corner, y);
    graphics.lineBetween(outerX, y, outerX, y + corner);
    graphics.lineBetween(outerX, y + height, outerX + direction * corner, y + height);
    graphics.lineBetween(outerX, y + height, outerX, y + height - corner);
    for (let line = 1; line < 8; line += 1) {
      const scanY = y + height * line / 8;
      graphics.lineStyle(1, color, line % 2 ? 0.04 : 0.075);
      graphics.lineBetween(x + 4, scanY, x + width - 4, scanY);
    }
  }

  private addArchiveLabel(
    sources: Phaser.GameObjects.GameObject[],
    x: number,
    y: number,
    label: string,
    color: number,
    width: number
  ): void {
    sources.push(this.scene.make.text({
      x,
      y,
      text: label,
      style: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: `${Math.max(9, Math.min(14, width * 0.008))}px`,
        color: `#${color.toString(16).padStart(6, '0')}`,
        letterSpacing: 1
      },
      add: false
    }).setAlpha(0.34));
  }
}
