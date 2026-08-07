import Phaser from 'phaser';
import { MOD_BY_ID } from './definitions.ts';
import type { ModCardInstance, ModRank } from './types.ts';

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
  container.add([shadow, body, inner]);

  for (let dot = 0; dot < 3; dot += 1) {
    container.add(scene.add.circle(-width / 2 + 15 + dot * 12, -height / 2 + 15, 4, dot < rank ? rarityColor : 0x172331, dot < rank ? 1 : 0.7)
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
  const name = scene.add.text(0, height * 0.19, definition.name.toUpperCase(), {
    fontFamily: 'Orbitron, sans-serif', fontSize: options.compact ? '10px' : '12px', color: '#eafcff', align: 'center'
  }).setOrigin(0.5).setWordWrapWidth(width - 18);
  const stat = scene.add.text(0, height * 0.34, definition.rankDescriptions[rank], {
    fontFamily: 'Rajdhani, sans-serif', fontSize: options.compact ? '9px' : '11px', color: '#a9cfe0', align: 'center'
  }).setOrigin(0.5).setWordWrapWidth(width - 18);
  const infusion = scene.add.text(0, height / 2 - 10, card.infusionId ? `◆ ${card.infusionId.replace(/-/g, ' ').toUpperCase()}` : '', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '9px', color: '#8dffec', align: 'center'
  }).setOrigin(0.5, 1);
  container.add([rarity, iconRing, icon, name, stat, infusion]);

  if (corrupted) {
    const glitch = scene.add.rectangle(0, 0, width - 8, 2, 0xff28cc, 0.7);
    container.add(glitch);
    scene.tweens.add({ targets: [glitch, iconRing], x: { from: -width * 0.35, to: width * 0.35 }, alpha: { from: 0.2, to: 0.8 }, duration: 720, yoyo: true, repeat: -1 });
  }
  if (options.interactive !== false) container.setSize(width, height).setInteractive({ useHandCursor: true });
  return container;
};
