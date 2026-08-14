import Phaser from 'phaser';
import { createButton, type ButtonPresentationOptions } from '../utils/ui.ts';

export interface CollectionFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollectionReadout {
  label: string;
  value: string;
  color: number;
}

export type CollectionButtonTone = 'standard' | 'utility' | 'warning' | 'return';

const chamferedPoints = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0,
  width, cut, width, height - cut,
  width - cut, height, cut, height,
  0, height - cut, 0, cut
];

const toneColor = (tone: CollectionButtonTone): number => {
  if (tone === 'utility') return 0xff65c8;
  if (tone === 'warning') return 0xffb45f;
  if (tone === 'return') return 0x74ffb2;
  return 0x55eaff;
};

const toneFill = (tone: CollectionButtonTone): number => {
  if (tone === 'utility') return 0x211427;
  if (tone === 'warning') return 0x241b14;
  if (tone === 'return') return 0x0b2421;
  return 0x091925;
};

/**
 * Visual-only collection shell. Inventory state and interaction remain owned by
 * ModCollectionScene; this mirrors the established command-console language.
 */
export const createModCollectionShell = (
  scene: Phaser.Scene,
  width: number,
  height: number,
  readouts: readonly CollectionReadout[]
): void => {
  const compact = width < 920 || height < 690;
  scene.add.rectangle(width / 2, height / 2, width, height, 0x03070d, 1);
  scene.add.grid(width / 2, height / 2, width, height, compact ? 42 : 54, compact ? 42 : 54, 0x040a12, 0.14, 0x174257, 0.12);

  const leftRing = scene.add.circle(width * 0.09, height * 0.72, compact ? 78 : 132, 0x56efff, 0.018).setStrokeStyle(2, 0x56efff, 0.15);
  const rightRing = scene.add.circle(width * 0.92, height * 0.24, compact ? 66 : 108, 0xff5bd2, 0.018).setStrokeStyle(2, 0xff5bd2, 0.15);
  scene.tweens.add({
    targets: [leftRing, rightRing],
    scale: { from: 0.96, to: 1.04 },
    alpha: { from: 0.3, to: 0.7 },
    duration: 3400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  const margin = compact ? 8 : 12;
  const shellWidth = width - margin * 2;
  const shellHeight = height - margin * 2;
  const shell = scene.add.container(0, 0).setAlpha(0);
  const points = chamferedPoints(shellWidth, shellHeight, compact ? 12 : 20);
  const shadow = scene.add.polygon(width / 2 + 6, height / 2 + 8, points, 0x000000, 0.62);
  const chassis = scene.add.polygon(width / 2, height / 2, points, 0x07111b, 0.96).setStrokeStyle(2, 0x3fbed0, 0.72);
  const glass = scene.add.rectangle(margin + 10, margin + 10, shellWidth - 20, shellHeight - 20, 0x081925, 0.56)
    .setOrigin(0, 0).setStrokeStyle(1, 0x55efff, 0.14);
  const topRail = scene.add.rectangle(width / 2, margin + 5, shellWidth - 42, 4, 0x55efff, 0.62);
  const leftRail = scene.add.rectangle(margin + 7, height / 2, 3, shellHeight - 42, 0xff5bcf, 0.48);
  const rightRail = scene.add.rectangle(width - margin - 7, height / 2, 3, shellHeight - 42, 0x55efff, 0.4);
  shell.add([shadow, chassis, glass, topRail, leftRail, rightRail]);

  const titleSize = compact ? 25 : Phaser.Math.Clamp(width * 0.021, 30, 40);
  const titleY = compact ? 10 : 12;
  const ghost = scene.add.text(width / 2 + 2, titleY + 2, 'MOD CARD COLLECTION', {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#ff48ca', fontStyle: 'bold'
  }).setOrigin(0.5, 0).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD);
  const title = scene.add.text(width / 2, titleY, 'MOD CARD COLLECTION', {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#75f4ff', fontStyle: 'bold',
    shadow: { color: '#39eeff', blur: 9, fill: true }, letterSpacing: 1
  }).setOrigin(0.5, 0);
  const subtitle = scene.add.text(width / 2, compact ? 43 : 51, 'OPERATIVE ARCHIVE // MODULAR INVENTORY CONTROL', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 11 : 13}px`, color: '#d28abb', fontStyle: 'bold', letterSpacing: 2
  }).setOrigin(0.5, 0);
  const leftStatus = scene.add.text(margin + 24, compact ? 20 : 24, 'N3ON ARMORY // LOCAL VAULT', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: '#73c7d4', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  const rightStatus = scene.add.text(width - margin - 24, compact ? 20 : 24, 'COLLECTION LINK // SYNCED', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: '#76ffb0', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(1, 0);
  shell.add([ghost, title, subtitle, leftStatus, rightStatus]);

  const railWidth = Math.min(width - (compact ? 38 : 100), 1160);
  const railHeight = compact ? 26 : 31;
  const railY = compact ? 75 : 82;
  const railLeft = width / 2 - railWidth / 2;
  const cellGap = compact ? 4 : 7;
  const cellWidth = (railWidth - cellGap * (readouts.length - 1)) / readouts.length;
  readouts.forEach((readout, index) => {
    const x = railLeft + index * (cellWidth + cellGap);
    const cell = scene.add.rectangle(x, railY - railHeight / 2, cellWidth, railHeight, 0x07141f, 0.94)
      .setOrigin(0, 0).setStrokeStyle(1, readout.color, 0.31);
    const edge = scene.add.rectangle(x + 3, railY, 3, railHeight - 8, readout.color, 0.7);
    const label = scene.add.text(x + 12, railY, readout.label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 8 : 10}px`, color: '#7faebb', fontStyle: 'bold', letterSpacing: compact ? 0 : 1
    }).setOrigin(0, 0.5);
    const value = scene.add.text(x + cellWidth - 9, railY, readout.value, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 11 : 14}px`, color: Phaser.Display.Color.IntegerToColor(readout.color).rgba, fontStyle: 'bold'
    }).setOrigin(1, 0.5).setMaxLines(1);
    shell.add([cell, edge, label, value]);
  });

  const sweep = scene.add.rectangle(margin + 18, height / 2, 2, shellHeight - 38, 0x55efff, 0.05);
  shell.add(sweep);
  scene.tweens.add({ targets: sweep, x: width - margin - 18, alpha: { from: 0.015, to: 0.11 }, duration: 4200, repeat: -1, repeatDelay: 2800, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: [title, topRail], alpha: { from: 0.75, to: 1 }, duration: 1750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: rightStatus, alpha: { from: 0.3, to: 1 }, duration: 860, yoyo: true, repeat: -1 });
  scene.tweens.add({ targets: shell, alpha: 1, duration: 330, ease: 'Sine.easeOut' });
};

export const createModCollectionFrame = (
  scene: Phaser.Scene,
  rect: CollectionFrameRect,
  title: string,
  accent = 0x55eaff
): Phaser.GameObjects.Container => {
  const root = scene.add.container(rect.x, rect.y);
  const shadow = scene.add.rectangle(5, 6, rect.width, rect.height, 0x000000, 0.4).setOrigin(0, 0);
  const frame = scene.add.rectangle(0, 0, rect.width, rect.height, 0x071621, 0.89).setOrigin(0, 0).setStrokeStyle(1, accent, 0.46);
  const headerHeight = Math.min(34, Math.max(26, rect.height * 0.22));
  const header = scene.add.rectangle(0, 0, rect.width, headerHeight, 0x0c2330, 0.94).setOrigin(0, 0);
  const rail = scene.add.rectangle(8, 5, rect.width - 16, 3, accent, 0.6).setOrigin(0, 0);
  const leftEdge = scene.add.rectangle(4, headerHeight + 8, 2, Math.max(0, rect.height - headerHeight - 16), 0xff5bcf, 0.28).setOrigin(0, 0);
  const label = scene.add.text(14, 11, title, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(rect.width / 62, 10, 14)}px`,
    color: Phaser.Display.Color.IntegerToColor(accent).rgba, fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0).setMaxLines(1);
  const led = scene.add.circle(rect.width - 16, 17, 3, accent, 0.92);
  root.add([shadow, frame, header, rail, leftEdge, label, led]);
  scene.tweens.add({ targets: led, alpha: { from: 0.24, to: 1 }, duration: 780, yoyo: true, repeat: -1 });
  return root;
};

export const createModCollectionButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  onClick: () => unknown,
  width: number,
  tone: CollectionButtonTone = 'standard',
  presentation: ButtonPresentationOptions = {}
): Phaser.GameObjects.Container => {
  const height = presentation.height ?? 40;
  const accent = toneColor(tone);
  const button = createButton(scene, x, y, text.toUpperCase(), onClick, width, 'menu', presentation);
  const background = button.list[0] as Phaser.GameObjects.Rectangle;
  background.setDisplaySize(Math.max(20, width - 8), Math.max(18, height - 8));
  background.setFillStyle(toneFill(tone), 0.92).setStrokeStyle(1, accent, 0.62);
  const points = chamferedPoints(width + 8, height + 6, Math.min(9, height * 0.22));
  const shadow = scene.add.polygon(4, 5, points, 0x000000, 0.46);
  const chassis = scene.add.polygon(0, 0, points, toneFill(tone), 0.98).setStrokeStyle(1, accent, 0.48);
  const edge = scene.add.rectangle(0, -height / 2 + 4, width - 22, 2, accent, tone === 'return' ? 0.72 : 0.38);
  const led = scene.add.circle(-width / 2 + 13, 0, 2.5, accent, 0.92);
  button.addAt(shadow, 0);
  button.addAt(chassis, 1);
  button.add([edge, led]);
  scene.tweens.add({ targets: led, alpha: { from: 0.24, to: 1 }, duration: 760, yoyo: true, repeat: -1 });
  return button;
};
