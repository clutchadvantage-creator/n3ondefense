import Phaser from 'phaser';
import { MOD_BY_ID } from './definitions.ts';
import type { ModCardInstance, ModRank } from './types.ts';
import { MOD_INFUSION_BY_ID } from './infusions.ts';

export const MOD_RARITY_COLORS = {
  common: 0xb9c9d4,
  uncommon: 0x73ff9d,
  rare: 0x62b7ff,
  prototype: 0xd286ff,
  legendary: 0xffc75c
} as const;

const ICONS: Record<string, string> = {
  'split-current': 'ϟ',
  'emergency-capacitor': '◒',
  'priority-targeting': '◎',
  'emergency-shield': '⬡',
  'magnetic-payload': '⌁',
  'fractured-current': 'ϟ!'
};

export interface ModCardViewOptions {
  width?: number;
  height?: number;
  selected?: boolean;
  compact?: boolean;
  interactive?: boolean;
  equipped?: boolean;
}

export const createModCardView = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  card: ModCardInstance,
  rank: ModRank,
  options: ModCardViewOptions = {}
): Phaser.GameObjects.Container => {
  const definition = MOD_BY_ID.get(card.modId);
  if (!definition) return scene.add.container(x, y);
  const width = options.width ?? 150;
  const height = options.height ?? 210;
  const corrupted = definition.variant === 'corrupted';
  const rarityColor = MOD_RARITY_COLORS[definition.rarity];
  const container = scene.add.container(x, y);
  const shadow = scene.add.rectangle(4, 6, width, height, 0x000000, 0.45).setOrigin(0.5);
  const body = scene.add.rectangle(0, 0, width, height, corrupted ? 0x190817 : 0x091521, 0.97)
    .setStrokeStyle(options.selected ? 4 : 2, options.selected ? 0xffffff : rarityColor, 1);
  const inner = scene.add.rectangle(0, 0, width - 12, height - 12, corrupted ? 0x4d0d42 : rarityColor, 0.05)
    .setStrokeStyle(1, corrupted ? 0xff3ed7 : rarityColor, 0.38);
  const sheen = scene.add.graphics();
  container.add([shadow, body, inner]);

  const illuminatedDots = rank;
  for (let dot = 0; dot < 3; dot += 1) {
    container.add(scene.add.circle(-width / 2 + 15 + dot * 12, -height / 2 + 15, 4, dot < illuminatedDots ? rarityColor : 0x172331, dot < illuminatedDots ? 1 : 0.7)
      .setStrokeStyle(1, rarityColor, 0.9));
  }
  const rarity = scene.add.text(width / 2 - 8, -height / 2 + 9, corrupted ? 'CORRUPTED' : definition.rarity.toUpperCase(), {
    fontFamily: 'Rajdhani, sans-serif', fontSize: options.compact ? '8px' : '10px', color: corrupted ? '#ff5bd9' : Phaser.Display.Color.IntegerToColor(rarityColor).rgba
  }).setOrigin(1, 0);
  const iconRing = scene.add.circle(0, -height * 0.12, width * 0.25, corrupted ? 0xff26cf : rarityColor, 0.08)
    .setStrokeStyle(2, corrupted ? 0xff4ddd : rarityColor, 0.8);
  const icon = scene.add.text(0, -height * 0.12, ICONS[definition.id] ?? '◇', {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.max(24, width * 0.25)}px`, color: corrupted ? '#ff74e6' : '#e7fbff'
  }).setOrigin(0.5);
  const name = scene.add.text(0, height * 0.075, definition.name.toUpperCase(), {
    fontFamily: 'Orbitron, sans-serif', fontSize: options.compact ? '10px' : '12px', color: '#eafcff', align: 'center', lineSpacing: -2
  }).setOrigin(0.5, 0).setWordWrapWidth(width - 18, true).setMaxLines(2);
  const stat = scene.add.text(0, height * 0.25, definition.rankDescriptions[rank], {
    fontFamily: 'Rajdhani, sans-serif', fontSize: options.compact ? '9px' : '11px', color: '#a9cfe0', align: 'center', lineSpacing: -2
  }).setOrigin(0.5, 0).setWordWrapWidth(width - 18, true).setMaxLines(options.compact ? 2 : 3);
  const infusion = scene.add.text(0, height / 2 - 10, card.infusionId ? `◆ ${MOD_INFUSION_BY_ID.get(card.infusionId)?.name.toUpperCase() ?? 'INFUSED'}` : '', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '9px', color: '#8dffec', align: 'center'
  }).setOrigin(0.5, 1);
  container.add([rarity, iconRing, icon, name, stat, infusion]);

  if (options.equipped) {
    const markerX = -width / 2 + 15;
    const markerY = height / 2 - 15;
    const equippedMarker = scene.add.container(markerX, markerY);
    const equippedGlow = scene.add.circle(0, 0, 10, 0x55ffe1, 0.14)
      .setStrokeStyle(1, 0x55ffe1, 0.55);
    const equippedSpinner = scene.add.graphics();
    equippedSpinner.lineStyle(2, 0x72ffe8, 1);
    equippedSpinner.arc(0, 0, 8, 0, Phaser.Math.PI2, false);
    equippedSpinner.strokePath();
    const equippedCore = scene.add.text(0, 0, 'E', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '8px', color: '#ffffff'
    }).setOrigin(0.5);
    equippedMarker.add([equippedGlow, equippedSpinner, equippedCore]);
    container.add(equippedMarker);
    scene.tweens.add({ targets: equippedMarker, scaleX: { from: 1, to: -1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: equippedGlow, alpha: { from: 0.3, to: 0.8 }, scale: { from: 0.85, to: 1.15 }, duration: 800, yoyo: true, repeat: -1 });
  }

  if (corrupted) {
    const glitch = scene.add.rectangle(0, 0, width - 8, 2, 0xff28cc, 0.7);
    container.add(glitch);
    scene.tweens.add({ targets: [glitch, iconRing], x: { from: -width * 0.35, to: width * 0.35 }, alpha: { from: 0.2, to: 0.8 }, duration: 720, yoyo: true, repeat: -1 });
  }
  container.add(sheen);
  if (options.interactive !== false) {
    const restingY = y;
    const sheenState = { progress: 0 };
    let sheenTween: Phaser.Tweens.Tween | null = null;
    const redrawSheen = (): void => {
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const scanX = -width * 0.78 + width * 1.56 * sheenState.progress;
      const slant = width * 0.18;
      const softHalfWidth = width * 0.16;
      const coreHalfWidth = Math.max(2, width * 0.025);
      const clampX = (value: number): number => Phaser.Math.Clamp(value, -halfWidth, halfWidth);
      const drawBand = (bandHalfWidth: number, alpha: number): void => {
        const points = [
          new Phaser.Geom.Point(clampX(scanX - bandHalfWidth - slant), -halfHeight),
          new Phaser.Geom.Point(clampX(scanX + bandHalfWidth - slant), -halfHeight),
          new Phaser.Geom.Point(clampX(scanX + bandHalfWidth + slant), halfHeight),
          new Phaser.Geom.Point(clampX(scanX - bandHalfWidth + slant), halfHeight)
        ];
        sheen.fillStyle(0xffffff, alpha);
        sheen.fillPoints(points, true);
      };
      sheen.clear();
      drawBand(softHalfWidth, 0.065);
      drawBand(coreHalfWidth, 0.13);
    };
    container.setSize(width, height).setInteractive({ useHandCursor: true });
    container.on('pointerover', () => {
      scene.tweens.killTweensOf(container);
      scene.tweens.killTweensOf(shadow);
      sheenTween?.stop();
      sheenState.progress = 0;
      redrawSheen();
      sheenTween = scene.tweens.add({
        targets: sheenState,
        progress: 1,
        duration: 450,
        ease: 'Cubic.Out',
        onUpdate: redrawSheen,
        onComplete: () => sheen.clear()
      });
      scene.tweens.add({ targets: container, y: restingY - 2, scale: 1.025, duration: 150, ease: 'Quad.Out' });
      scene.tweens.add({ targets: shadow, alpha: 0.72, duration: 150 });
      body.setStrokeStyle(options.selected ? 4 : 3, options.selected ? 0xffffff : rarityColor, 1);
    });
    container.on('pointerout', () => {
      scene.tweens.killTweensOf(container);
      scene.tweens.killTweensOf(shadow);
      sheenTween?.stop();
      sheenTween = null;
      sheen.clear();
      scene.tweens.add({ targets: container, y: restingY, scale: 1, duration: 150, ease: 'Quad.Out' });
      scene.tweens.add({ targets: shadow, alpha: 0.45, duration: 150 });
      body.setStrokeStyle(options.selected ? 4 : 2, options.selected ? 0xffffff : rarityColor, 1);
    });
  }
  return container;
};
