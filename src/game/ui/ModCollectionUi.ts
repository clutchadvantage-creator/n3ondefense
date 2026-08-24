import Phaser from 'phaser';
import { createButton, type ButtonPresentationOptions } from '../utils/ui.ts';
import type { ModArchiveTerminalLayout, ModArchiveRect } from './ModArchiveTerminalLayout.ts';

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

export const getModCollectionFrameHeaderHeight = (frameHeight: number): number =>
  frameHeight < 80
    ? MOD_COLLECTION_SPACING.frameHeaderHeight.compact
    : MOD_COLLECTION_SPACING.frameHeaderHeight.regular;

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
  const headerHeight = getModCollectionFrameHeaderHeight(rect.height);
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

/** Static, layered equipment housing for the collection's two-row card bay. */
export const createModArchiveTerminal = (
  scene: Phaser.Scene,
  layout: ModArchiveTerminalLayout,
  matchingCards: number
): Phaser.GameObjects.Container => {
  const { frame, bay, pagination, diagnostics, lowerConsole } = layout;
  const root = scene.add.container(frame.x, frame.y);
  const hardware: Phaser.GameObjects.GameObject[] = [];
  const cut = Math.min(18, frame.height * 0.04);
  const points = chamferedPoints(frame.width, frame.height, cut);
  const shadow = scene.add.polygon(frame.width / 2 + 7, frame.height / 2 + 9, points, 0x000000, 0.58);
  const chassis = scene.add.polygon(frame.width / 2, frame.height / 2, points, 0x06101a, 0.98).setStrokeStyle(2, 0x1f6f82, 0.82);
  const inset = scene.add.polygon(
    frame.width / 2,
    frame.height / 2,
    chamferedPoints(frame.width - 12, frame.height - 12, Math.max(5, cut - 5)),
    0x081722,
    0.82
  ).setStrokeStyle(1, 0x5ceeff, 0.28);
  const headerHeight = bay.y - frame.y;
  const header = scene.add.rectangle(8, 7, frame.width - 16, headerHeight - 7, 0x0b202d, 0.97)
    .setOrigin(0, 0).setStrokeStyle(1, 0x59efff, 0.26);
  const headerRail = scene.add.rectangle(20, 8, frame.width - 40, 3, 0x59efff, 0.68).setOrigin(0, 0);
  const headerAccent = scene.add.rectangle(20, headerHeight - 4, frame.width - 40, 1, 0xff5bcf, 0.35).setOrigin(0, 0);

  const bayLocal = { x: bay.x - frame.x, y: bay.y - frame.y, width: bay.width, height: bay.height };
  const bayShadow = scene.add.rectangle(bayLocal.x + 3, bayLocal.y + 5, bayLocal.width, bayLocal.height, 0x000000, 0.7).setOrigin(0, 0);
  const bayPanel = scene.add.rectangle(bayLocal.x, bayLocal.y, bayLocal.width, bayLocal.height, 0x020811, 0.96)
    .setOrigin(0, 0).setStrokeStyle(2, 0x184b5c, 0.82);
  const bayInner = scene.add.rectangle(bayLocal.x + 6, bayLocal.y + 6, bayLocal.width - 12, bayLocal.height - 12, 0x06121d, 0.52)
    .setOrigin(0, 0).setStrokeStyle(1, 0x55eaff, 0.15);

  if (diagnostics) {
    const diagnosticLocal = {
      x: diagnostics.x - frame.x,
      y: diagnostics.y - frame.y,
      width: diagnostics.width,
      height: diagnostics.height
    };
    const diagnosticShadow = scene.add.rectangle(diagnosticLocal.x + 3, diagnosticLocal.y + 4, diagnosticLocal.width, diagnosticLocal.height, 0x000000, 0.58).setOrigin(0, 0);
    const diagnosticPanel = scene.add.rectangle(diagnosticLocal.x, diagnosticLocal.y, diagnosticLocal.width, diagnosticLocal.height, 0x07131d, 0.94)
      .setOrigin(0, 0).setStrokeStyle(1, 0x3ab9cb, 0.36);
    const diagnosticTech = scene.add.graphics();
    diagnosticTech.lineStyle(1, 0x55eaff, 0.22);
    diagnosticTech.lineBetween(diagnosticLocal.x + 6, diagnosticLocal.y + 8, diagnosticLocal.x + diagnosticLocal.width - 6, diagnosticLocal.y + 8);
    diagnosticTech.lineStyle(2, 0x2f6471, 0.42);
    for (let y = diagnosticLocal.y + 36; y < diagnosticLocal.y + diagnosticLocal.height - 22; y += 18) {
      diagnosticTech.lineBetween(diagnosticLocal.x + 11, y, diagnosticLocal.x + diagnosticLocal.width - 11, y);
    }
    diagnosticTech.lineStyle(1, 0xff5bcf, 0.28);
    diagnosticTech.strokeRect(diagnosticLocal.x + 9, diagnosticLocal.y + diagnosticLocal.height * 0.57, diagnosticLocal.width - 18, diagnosticLocal.height * 0.25);
    const diagnosticLabel = scene.add.text(diagnosticLocal.x + diagnosticLocal.width / 2, diagnosticLocal.y + 20, diagnosticLocal.width >= 100 ? 'INDEX BUFFER' : 'BUS', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${diagnosticLocal.width >= 100 ? 10 : 8}px`, color: '#6fbdca', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5);
    const diagnosticStatus = scene.add.text(diagnosticLocal.x + diagnosticLocal.width / 2, diagnosticLocal.y + diagnosticLocal.height - 13, diagnosticLocal.width >= 100 ? 'CARD MATRIX // READY' : 'READY', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${diagnosticLocal.width >= 100 ? 9 : 7}px`, color: '#72ffaf', fontStyle: 'bold'
    }).setOrigin(0.5);
    const diagnosticLeds = [0.3, 0.5, 0.7].map((fraction, index) => scene.add.circle(
      diagnosticLocal.x + diagnosticLocal.width * fraction,
      diagnosticLocal.y + diagnosticLocal.height * 0.52,
      2.2,
      index === 1 ? 0xff5bcf : 0x55eaff,
      0.78
    ));
    hardware.push(diagnosticShadow, diagnosticPanel, diagnosticTech, diagnosticLabel, diagnosticStatus, ...diagnosticLeds);
  }

  const paginationLocal = {
    x: pagination.x - frame.x,
    y: pagination.y - frame.y,
    width: pagination.width,
    height: pagination.height
  };
  const pageShadow = scene.add.rectangle(paginationLocal.x + 3, paginationLocal.y + 4, paginationLocal.width, paginationLocal.height, 0x000000, 0.54).setOrigin(0, 0);
  const pageConsole = scene.add.rectangle(paginationLocal.x, paginationLocal.y, paginationLocal.width, paginationLocal.height, 0x081721, 0.98)
    .setOrigin(0, 0).setStrokeStyle(1, 0x4eeeff, 0.42);
  const pageInner = scene.add.rectangle(paginationLocal.x + 7, paginationLocal.y + 7, paginationLocal.width - 14, paginationLocal.height - 14, 0x030c14, 0.74)
    .setOrigin(0, 0).setStrokeStyle(1, 0x267d8e, 0.34);
  const pageRail = scene.add.rectangle(paginationLocal.x + 14, paginationLocal.y + 4, paginationLocal.width - 28, 2, 0xff5bcf, 0.42).setOrigin(0, 0);
  const pageLowerRail = scene.add.rectangle(paginationLocal.x + 30, paginationLocal.y + paginationLocal.height - 5, paginationLocal.width - 60, 2, 0x55eaff, 0.22).setOrigin(0, 0);
  const pageDeckTech = scene.add.graphics();
  pageDeckTech.lineStyle(1, 0x55eaff, 0.25);
  const pageSection = paginationLocal.width * 0.24;
  pageDeckTech.lineBetween(paginationLocal.x + pageSection, paginationLocal.y + 12, paginationLocal.x + pageSection, paginationLocal.y + paginationLocal.height - 12);
  pageDeckTech.lineBetween(paginationLocal.x + paginationLocal.width - pageSection, paginationLocal.y + 12, paginationLocal.x + paginationLocal.width - pageSection, paginationLocal.y + paginationLocal.height - 12);
  pageDeckTech.lineStyle(1, 0xff5bcf, 0.2);
  pageDeckTech.lineBetween(paginationLocal.x + pageSection + 10, paginationLocal.y + 10, paginationLocal.x + paginationLocal.width - pageSection - 10, paginationLocal.y + 10);

  if (lowerConsole.height > 2) {
    const lowerLocal = {
      x: lowerConsole.x - frame.x,
      y: lowerConsole.y - frame.y,
      width: lowerConsole.width,
      height: lowerConsole.height
    };
    const lowerShadow = scene.add.rectangle(lowerLocal.x + 3, lowerLocal.y + 4, lowerLocal.width, lowerLocal.height, 0x000000, 0.54).setOrigin(0, 0);
    const lowerPanel = scene.add.rectangle(lowerLocal.x, lowerLocal.y, lowerLocal.width, lowerLocal.height, 0x06121b, 0.96)
      .setOrigin(0, 0).setStrokeStyle(1, 0x2b8191, 0.4);
    const lowerInner = scene.add.rectangle(lowerLocal.x + 7, lowerLocal.y + Math.min(7, lowerLocal.height * 0.2), lowerLocal.width - 14, Math.max(1, lowerLocal.height - Math.min(14, lowerLocal.height * 0.4)), 0x020910, 0.64)
      .setOrigin(0, 0).setStrokeStyle(1, 0x55eaff, 0.13);
    const lowerTech = scene.add.graphics();
    const lowerLabels: Phaser.GameObjects.Text[] = [];
    lowerTech.lineStyle(2, 0x55eaff, 0.34);
    lowerTech.lineBetween(lowerLocal.x + 16, lowerLocal.y + 5, lowerLocal.x + lowerLocal.width - 16, lowerLocal.y + 5);
    const sectionFractions = [0.2, 0.46, 0.73];
    lowerTech.lineStyle(1, 0x225967, 0.5);
    for (const fraction of sectionFractions) {
      const dividerX = lowerLocal.x + lowerLocal.width * fraction;
      lowerTech.lineBetween(dividerX, lowerLocal.y + 12, dividerX, lowerLocal.y + lowerLocal.height - 10);
    }
    if (lowerLocal.height >= 42) {
      const labels = ['ARCHIVE CORE', 'INDEX BUFFER', 'DATA BUS', 'SYSTEM READY'];
      const centers = [0.1, 0.33, 0.595, 0.865];
      for (let index = 0; index < centers.length; index += 1) {
        const centerX = lowerLocal.x + lowerLocal.width * centers[index];
        lowerLabels.push(scene.add.text(centerX, lowerLocal.y + 17, labels[index], {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${lowerLocal.height >= 90 ? 11 : 9}px`, color: index === 3 ? '#71ffad' : '#6ca8b5', fontStyle: 'bold', letterSpacing: 1
        }).setOrigin(0.5));
      }
    }
    if (lowerLocal.height >= 64) {
      lowerTech.lineStyle(2, 0x284d58, 0.62);
      for (let index = 0; index < 9; index += 1) {
        const y = lowerLocal.y + 38 + index * Math.min(12, Math.max(5, (lowerLocal.height - 54) / 9));
        if (y >= lowerLocal.y + lowerLocal.height - 10) break;
        lowerTech.lineBetween(lowerLocal.x + 22, y, lowerLocal.x + lowerLocal.width * 0.18, y);
        lowerTech.lineBetween(lowerLocal.x + lowerLocal.width * 0.48, y, lowerLocal.x + lowerLocal.width * 0.7, y);
      }
      lowerTech.lineStyle(1, 0x55eaff, 0.18);
      const busTop = lowerLocal.y + 36;
      const busBottom = lowerLocal.y + lowerLocal.height - 14;
      for (let x = lowerLocal.x + lowerLocal.width * 0.23; x < lowerLocal.x + lowerLocal.width * 0.44; x += 14) {
        lowerTech.lineBetween(x, busTop, x, busBottom);
      }
      lowerTech.lineStyle(1, 0xff5bcf, 0.2);
      lowerTech.strokeRect(lowerLocal.x + lowerLocal.width * 0.75, busTop, lowerLocal.width * 0.22, Math.max(12, busBottom - busTop));
    }
    const lowerLeds = [0.77, 0.81, 0.85, 0.89, 0.93].map((fraction, index) => scene.add.circle(
      lowerLocal.x + lowerLocal.width * fraction,
      lowerLocal.y + Math.min(lowerLocal.height - 8, Math.max(8, lowerLocal.height * 0.5)),
      2.2,
      index === 2 ? 0xff5bcf : 0x69ffad,
      0.72
    ));
    // Keep the chassis behind its labels and status lamps even though all of
    // these static pieces share the terminal's single parent container.
    hardware.push(lowerShadow, lowerPanel, lowerInner, lowerTech, ...lowerLabels, ...lowerLeds);
  }

  const tech = scene.add.graphics();
  tech.lineStyle(1, 0x1d7182, 0.18);
  const gridSize = 28;
  for (let x = bayLocal.x + gridSize; x < bayLocal.x + bayLocal.width; x += gridSize) {
    tech.lineBetween(x, bayLocal.y + 7, x, bayLocal.y + bayLocal.height - 7);
  }
  for (let y = bayLocal.y + 18; y < bayLocal.y + bayLocal.height; y += 18) {
    tech.lineBetween(bayLocal.x + 7, y, bayLocal.x + bayLocal.width - 7, y);
  }
  tech.lineStyle(2, 0x55eaff, 0.3);
  tech.lineBetween(8, 28, 15, 28); tech.lineBetween(15, 28, 15, 16); tech.lineBetween(15, 16, 52, 16);
  tech.lineBetween(frame.width - 8, 28, frame.width - 15, 28); tech.lineBetween(frame.width - 15, 28, frame.width - 15, 16); tech.lineBetween(frame.width - 15, 16, frame.width - 52, 16);
  tech.lineStyle(1, 0xff5bcf, 0.24);
  tech.lineBetween(12, paginationLocal.y - 4, 38, paginationLocal.y - 4);
  tech.lineBetween(frame.width - 12, paginationLocal.y - 4, frame.width - 38, paginationLocal.y - 4);

  const narrowTerminal = frame.width < 720;
  const headerTitle = scene.add.text(22, 16, narrowTerminal
    ? `MOD ARCHIVE TERMINAL // ${matchingCards} CARDS`
    : `MOD ARCHIVE TERMINAL // OWNED INDEX: ${matchingCards} MATCHING CARDS`, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${frame.width < 720 ? 11 : 14}px`, color: '#71f3ff', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  const headerStatus = scene.add.text(frame.width - 22, 17, narrowTerminal ? 'ONLINE' : 'ARCHIVE ONLINE // LOCAL VAULT', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${frame.width < 720 ? 9 : 11}px`, color: '#79ffaf', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(1, 0);
  const ledA = scene.add.circle(12, headerHeight / 2, 2.5, 0x69ff9c, 0.95);
  const ledB = scene.add.circle(frame.width - 12, headerHeight / 2, 2.5, 0xff5bcf, 0.9);
  const bolts = [
    scene.add.circle(12, bayLocal.y + 11, 2, 0x7aa9b7, 0.58),
    scene.add.circle(frame.width - 12, bayLocal.y + 11, 2, 0x7aa9b7, 0.58),
    scene.add.circle(12, bayLocal.y + bayLocal.height - 11, 2, 0x7aa9b7, 0.58),
    scene.add.circle(frame.width - 12, bayLocal.y + bayLocal.height - 11, 2, 0x7aa9b7, 0.58)
  ];
  root.add([
    shadow, chassis, inset, header, headerRail, headerAccent,
    bayShadow, bayPanel, bayInner, tech, ...hardware,
    pageShadow, pageConsole, pageInner, pageRail, pageLowerRail, pageDeckTech,
    headerTitle, headerStatus, ledA, ledB, ...bolts
  ]);
  scene.tweens.add({ targets: [ledA, ledB], alpha: { from: 0.28, to: 1 }, duration: 920, yoyo: true, repeat: -1 });
  return root;
};

export const createModArchivePageReadout = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  page: number,
  pageCount: number
): Phaser.GameObjects.Container => {
  const root = scene.add.container(x, y);
  const height = width >= 260 ? 48 : 42;
  const shadow = scene.add.rectangle(3, 4, width, height, 0x000000, 0.5).setStrokeStyle(1, 0x000000, 0.2);
  const panel = scene.add.rectangle(0, 0, width, height, 0x020b12, 0.98).setStrokeStyle(1, 0x55eaff, 0.5);
  const rail = scene.add.rectangle(0, -height / 2 + 3, width - 18, 2, 0xff5bcf, 0.48);
  const label = scene.add.text(0, height >= 48 ? -12 : -10, 'MOD ARCHIVE', {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${height >= 48 ? 10 : 9}px`, color: '#77bdc9', fontStyle: 'bold', letterSpacing: 2
  }).setOrigin(0.5);
  const readout = scene.add.text(0, 3, `PAGE ${String(page + 1).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}`, {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${height >= 48 ? 17 : 15}px`, color: '#dcfaff', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0.5);
  root.add([shadow, panel, rail, label, readout]);
  if (pageCount <= 10) {
    const gap = 8;
    const startX = -((pageCount - 1) * gap) / 2;
    for (let index = 0; index < pageCount; index += 1) {
      root.add(scene.add.circle(startX + index * gap, height / 2 - 6, index === page ? 2.2 : 1.5, index === page ? 0x69ffb2 : 0x3b6f7c, index === page ? 0.95 : 0.55));
    }
  }
  return root;
};

export const createModArchivePageButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  direction: 'previous' | 'next',
  onClick: () => unknown,
  width: number,
  height: number
): Phaser.GameObjects.Container => {
  const label = direction === 'previous' ? '<<' : '>>';
  const button = createModCollectionButton(scene, x, y, label, onClick, width, 'standard', {
    height,
    fontSize: Math.max(18, Math.floor(height * 0.52)),
    focusShortcut: direction === 'previous' ? 'page-left' : 'page-right',
    focusLabel: direction === 'previous' ? 'Previous archive page' : 'Next archive page'
  });
  const brackets = scene.add.graphics();
  const halfW = width / 2 + 4;
  const halfH = height / 2 + 3;
  brackets.lineStyle(2, 0x55eaff, 0.42);
  brackets.lineBetween(-halfW, -halfH + 9, -halfW, -halfH); brackets.lineBetween(-halfW, -halfH, -halfW + 12, -halfH);
  brackets.lineBetween(halfW, halfH - 9, halfW, halfH); brackets.lineBetween(halfW, halfH, halfW - 12, halfH);
  button.add(brackets);
  return button;
};

export const playModArchiveRefresh = (scene: Phaser.Scene, bay: ModArchiveRect): void => {
  const sweep = scene.add.rectangle(bay.x + 6, bay.y + bay.height / 2, 3, bay.height - 12, 0x75f5ff, 0.2)
    .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: sweep,
    x: bay.x + bay.width - 6,
    alpha: { from: 0.22, to: 0 },
    duration: 150,
    ease: 'Quad.easeOut',
    onComplete: () => sweep.destroy()
  });
};
