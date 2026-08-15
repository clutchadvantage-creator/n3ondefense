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
  delta?: number;
}

export type CollectionButtonTone = 'standard' | 'utility' | 'warning' | 'return';

export interface ModCollectionChromeLayout {
  compact: boolean;
  shellMargin: number;
  statusY: number;
  statusSideInset: number;
  titleSize: number;
  titleY: number;
  subtitleY: number;
  resourceRailY: number;
  resourceRailHeight: number;
  toolbarTop: number;
  toolbarHeight: number;
  toolbarButtonY: number;
  toolbarButtonHeight: number;
  contentTop: number;
  returnInset: number;
}

const MOD_COLLECTION_SPACING = {
  shellMargin: { compact: 10, regular: 14 },
  statusTopInset: 13,
  statusSideInset: { compact: 32, regular: 40 },
  titleTop: { compact: 16, regular: 18, stackedCompact: 32, stackedRegular: 38 },
  titleSubtitleGap: { compact: 4, regular: 5 },
  subtitleRailGap: { compact: 27, regular: 32 },
  resourceRailHeight: { compact: 30, regular: 34 },
  resourceToolbarGap: { compact: 10, regular: 12 },
  toolbarHeight: { compact: 76, regular: 84 },
  toolbarContentGap: 10,
  toolbarButtonHeight: { compact: 34, regular: 40 },
  frameHeaderHeight: { compact: 34, regular: 38 },
  returnInset: { narrow: 26, regular: 34 }
} as const;

/**
 * Keeps the collection's top chrome and scene-owned controls on one responsive
 * spacing model so header polish does not turn into scattered per-scene offsets.
 */
export const getModCollectionChromeLayout = (width: number, height: number): ModCollectionChromeLayout => {
  const compact = width < 920 || height < 690;
  const stackedStatus = width < 1050;
  const shellMargin = compact ? MOD_COLLECTION_SPACING.shellMargin.compact : MOD_COLLECTION_SPACING.shellMargin.regular;
  const titleSize = compact ? 25 : Phaser.Math.Clamp(width * 0.021, 30, 40);
  const titleY = stackedStatus
    ? (compact ? MOD_COLLECTION_SPACING.titleTop.stackedCompact : MOD_COLLECTION_SPACING.titleTop.stackedRegular)
    : (compact ? MOD_COLLECTION_SPACING.titleTop.compact : MOD_COLLECTION_SPACING.titleTop.regular);
  const subtitleY = titleY + titleSize + (compact ? MOD_COLLECTION_SPACING.titleSubtitleGap.compact : MOD_COLLECTION_SPACING.titleSubtitleGap.regular);
  const resourceRailHeight = compact ? MOD_COLLECTION_SPACING.resourceRailHeight.compact : MOD_COLLECTION_SPACING.resourceRailHeight.regular;
  const resourceRailY = subtitleY + (compact ? MOD_COLLECTION_SPACING.subtitleRailGap.compact : MOD_COLLECTION_SPACING.subtitleRailGap.regular);
  const toolbarTop = resourceRailY + resourceRailHeight / 2
    + (compact ? MOD_COLLECTION_SPACING.resourceToolbarGap.compact : MOD_COLLECTION_SPACING.resourceToolbarGap.regular);
  const toolbarHeight = compact ? MOD_COLLECTION_SPACING.toolbarHeight.compact : MOD_COLLECTION_SPACING.toolbarHeight.regular;
  const frameHeaderHeight = compact ? MOD_COLLECTION_SPACING.frameHeaderHeight.compact : MOD_COLLECTION_SPACING.frameHeaderHeight.regular;
  const toolbarButtonHeight = compact ? MOD_COLLECTION_SPACING.toolbarButtonHeight.compact : MOD_COLLECTION_SPACING.toolbarButtonHeight.regular;
  const toolbarButtonY = toolbarTop + frameHeaderHeight + (toolbarHeight - frameHeaderHeight) / 2;

  return {
    compact,
    shellMargin,
    statusY: shellMargin + MOD_COLLECTION_SPACING.statusTopInset,
    statusSideInset: compact ? MOD_COLLECTION_SPACING.statusSideInset.compact : MOD_COLLECTION_SPACING.statusSideInset.regular,
    titleSize,
    titleY,
    subtitleY,
    resourceRailY,
    resourceRailHeight,
    toolbarTop,
    toolbarHeight,
    toolbarButtonY,
    toolbarButtonHeight,
    contentTop: toolbarTop + toolbarHeight + MOD_COLLECTION_SPACING.toolbarContentGap,
    returnInset: width < 800 ? MOD_COLLECTION_SPACING.returnInset.narrow : MOD_COLLECTION_SPACING.returnInset.regular
  };
};

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
  const layout = getModCollectionChromeLayout(width, height);
  const { compact } = layout;
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

  const margin = layout.shellMargin;
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

  const titleSize = layout.titleSize;
  const titleY = layout.titleY;
  const ghost = scene.add.text(width / 2 + 2, titleY + 2, 'MOD CARD COLLECTION', {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#ff48ca', fontStyle: 'bold'
  }).setOrigin(0.5, 0).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD);
  const title = scene.add.text(width / 2, titleY, 'MOD CARD COLLECTION', {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#75f4ff', fontStyle: 'bold',
    shadow: { color: '#39eeff', blur: 9, fill: true }, letterSpacing: 1
  }).setOrigin(0.5, 0);
  const subtitle = scene.add.text(width / 2, layout.subtitleY, 'OPERATIVE ARCHIVE // MODULAR INVENTORY CONTROL', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 11 : 13}px`, color: '#d28abb', fontStyle: 'bold', letterSpacing: 2
  }).setOrigin(0.5, 0);
  const leftStatus = scene.add.text(margin + layout.statusSideInset, layout.statusY, 'N3ON ARMORY // LOCAL VAULT', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: '#73c7d4', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  const rightStatus = scene.add.text(width - margin - layout.statusSideInset, layout.statusY, 'COLLECTION LINK // SYNCED', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: '#76ffb0', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(1, 0);
  shell.add([ghost, title, subtitle, leftStatus, rightStatus]);

  const railWidth = Math.min(width - (compact ? 38 : 100), 1160);
  const railHeight = layout.resourceRailHeight;
  const railY = layout.resourceRailY;
  const railLeft = width / 2 - railWidth / 2;
  const cellGap = compact ? 4 : 7;
  const cellWidth = (railWidth - cellGap * (readouts.length - 1)) / readouts.length;
  readouts.forEach((readout, index) => {
    const x = railLeft + index * (cellWidth + cellGap);
    const cell = scene.add.rectangle(x, railY - railHeight / 2, cellWidth, railHeight, 0x07141f, 0.94)
      .setOrigin(0, 0).setStrokeStyle(1, readout.color, 0.31);
    const edge = scene.add.rectangle(x + 4, railY, 3, railHeight - 12, readout.color, 0.7);
    const label = scene.add.text(x + 15, railY, readout.label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 8 : 10}px`, color: '#7faebb', fontStyle: 'bold', letterSpacing: compact ? 0 : 1
    }).setOrigin(0, 0.5);
    const value = scene.add.text(x + cellWidth - 12, railY, readout.value, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 11 : 14}px`, color: Phaser.Display.Color.IntegerToColor(readout.color).rgba, fontStyle: 'bold'
    }).setOrigin(1, 0.5).setMaxLines(1);
    shell.add([cell, edge, label, value]);
    if (readout.delta) {
      const gained = readout.delta > 0;
      const delta = scene.add.text(
        value.x - value.displayWidth - (compact ? 4 : 7),
        railY,
        `${gained ? '+' : '−'}${Math.abs(readout.delta).toLocaleString()}`,
        {
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: `${compact ? 9 : 12}px`,
          color: gained ? '#69ff9c' : '#ff647d',
          fontStyle: 'bold'
        }
      ).setOrigin(1, 0.5);
      shell.add(delta);
      scene.tweens.add({ targets: delta, y: railY - 4, alpha: 0, delay: 1150, duration: 420, ease: 'Sine.easeIn' });
    }
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
  const compactHeader = rect.height < 80;
  const headerHeight = compactHeader
    ? MOD_COLLECTION_SPACING.frameHeaderHeight.compact
    : MOD_COLLECTION_SPACING.frameHeaderHeight.regular;
  const header = scene.add.rectangle(0, 0, rect.width, headerHeight, 0x0c2330, 0.94).setOrigin(0, 0);
  const rail = scene.add.rectangle(12, 5, rect.width - 24, 3, accent, 0.6).setOrigin(0, 0);
  const headerDivider = scene.add.rectangle(12, headerHeight - 3, rect.width - 24, 1, accent, 0.28).setOrigin(0, 0);
  const leftEdge = scene.add.rectangle(4, headerHeight + 8, 2, Math.max(0, rect.height - headerHeight - 16), 0xff5bcf, 0.28).setOrigin(0, 0);
  const label = scene.add.text(18, 14, title, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(rect.width / 62, 10, 14)}px`,
    color: Phaser.Display.Color.IntegerToColor(accent).rgba, fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0).setMaxLines(1);
  const led = scene.add.circle(rect.width - 18, 21, 3, accent, 0.92);
  root.add([shadow, frame, header, rail, headerDivider, leftEdge, label, led]);
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
