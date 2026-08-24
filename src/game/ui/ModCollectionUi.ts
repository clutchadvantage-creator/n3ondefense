import Phaser from 'phaser';
import { createButton, type ButtonPresentationOptions } from '../utils/ui.ts';
import type { ModArchiveAnalytics } from '../mods/ModArchiveAnalytics.ts';
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

export interface ModSelectedInspectorData {
  rarity: string;
  rarityColor: number;
  category: string;
  rank: number;
  duplicates: number;
  equipped: boolean;
  infused: boolean;
  acquiredAt: string;
  cardIndex: number;
  totalCards: number;
  signalTrace: readonly number[];
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

/** Real collection state embedded into the control-band header. */
export const createModArchiveCommandTelemetry = (
  scene: Phaser.Scene,
  rect: CollectionFrameRect,
  analytics: ModArchiveAnalytics
): Phaser.GameObjects.Container => {
  const root = scene.add.container(rect.x, rect.y);
  const compact = rect.width < 1040;
  const discovery = `${analytics.discoveredDefinitions}/${analytics.totalDefinitions}`;
  const text = compact
    ? `DISC ${discovery}  //  EQ ${analytics.equippedCards}  //  SALV ${analytics.salvagePlasma}◆  //  SYNC`
    : `DISCOVERED ${discovery}  //  EQUIPPED ${analytics.equippedCards}  //  INFUSED ${analytics.infusedCards}  //  SALVAGE ${analytics.recyclableCards} → ${analytics.salvagePlasma}◆  //  SYNC 100%`;
  const status = scene.add.text(rect.width - 48, 20, text, {
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: `${compact ? 9 : 11}px`,
    color: '#75d3df',
    fontStyle: 'bold',
    letterSpacing: compact ? 0 : 1
  }).setOrigin(1, 0.5).setMaxLines(1);
  const live = scene.add.circle(rect.width - 36, 20, 2.5, 0x70ffad, 0.92);
  root.add([status, live]);
  scene.tweens.add({ targets: live, alpha: { from: 0.25, to: 1 }, duration: 980, yoyo: true, repeat: -1 });
  return root;
};

const formatArchiveTimestamp = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'TIMESTAMP UNKNOWN';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};

/** Selection-linked scanner chamber behind the existing full Mod card. */
export const createModSelectedInspector = (
  scene: Phaser.Scene,
  rect: CollectionFrameRect,
  cardRect: CollectionFrameRect | null,
  data: ModSelectedInspectorData | null,
  analytics: ModArchiveAnalytics
): Phaser.GameObjects.Container => {
  const root = scene.add.container(rect.x, rect.y);
  if (!data || !cardRect) {
    const overviewTop = 58;
    const overviewHeight = Math.min(255, rect.height - 96);
    const panel = scene.add.rectangle(16, overviewTop, rect.width - 32, overviewHeight, 0x030c14, 0.82)
      .setOrigin(0, 0).setStrokeStyle(1, 0x55eaff, 0.28);
    const title = scene.add.text(rect.width / 2, overviewTop + 25, 'ARCHIVE OVERVIEW // AWAITING SELECTION', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#75eaff', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5);
    const rows = [
      ['DISCOVERED', `${analytics.discoveredDefinitions} / ${analytics.totalDefinitions}`],
      ['CARD INDEX', analytics.totalCards.toLocaleString()],
      ['LOADOUT LINKS', String(analytics.equippedCards)],
      ['SALVAGE BUFFER', `${analytics.recyclableCards} // ${analytics.salvagePlasma}◆`]
    ];
    const graphics = scene.add.graphics();
    rows.forEach(([label, value], index) => {
      const rowY = overviewTop + 58 + index * 40;
      graphics.lineStyle(1, 0x2c7180, 0.3);
      graphics.lineBetween(30, rowY + 15, rect.width - 30, rowY + 15);
      root.add(scene.add.text(30, rowY, label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: '#7095a4', fontStyle: 'bold'
      }).setOrigin(0, 0.5));
      root.add(scene.add.text(rect.width - 30, rowY, value, {
        fontFamily: 'Orbitron, sans-serif', fontSize: '13px', color: '#d7faff', fontStyle: 'bold'
      }).setOrigin(1, 0.5));
    });
    root.addAt([panel, graphics, title], 0);
    return root;
  }

  const localCard = {
    x: cardRect.x - rect.x,
    y: cardRect.y - rect.y,
    width: cardRect.width,
    height: cardRect.height
  };
  const accent = data.rarityColor;
  const chamberX = Math.max(12, localCard.x - 12);
  const chamberY = Math.max(42, localCard.y - 10);
  const chamberWidth = Math.min(rect.width - chamberX - 12, localCard.width + 24);
  const chamberHeight = localCard.height + 20;
  const chamber = scene.add.rectangle(chamberX, chamberY, chamberWidth, chamberHeight, 0x020910, 0.7)
    .setOrigin(0, 0).setStrokeStyle(1, accent, 0.32);
  const scanGrid = scene.add.graphics();
  scanGrid.lineStyle(1, accent, 0.09);
  for (let y = chamberY + 12; y < chamberY + chamberHeight - 8; y += 15) {
    scanGrid.lineBetween(chamberX + 5, y, chamberX + chamberWidth - 5, y);
  }
  scanGrid.lineStyle(1, 0x55eaff, 0.12);
  for (let x = chamberX + 12; x < chamberX + chamberWidth - 8; x += 22) {
    scanGrid.lineBetween(x, chamberY + 5, x, chamberY + chamberHeight - 5);
  }

  const sideSpace = Math.max(0, (rect.width - localCard.width) / 2 - 16);
  const sideObjects: Phaser.GameObjects.GameObject[] = [];
  if (sideSpace >= 42) {
    const leftX = Math.max(14, localCard.x - sideSpace + 4);
    const rightX = Math.min(rect.width - 14, localCard.x + localCard.width + sideSpace - 4);
    const rows = [
      { y: localCard.y + localCard.height * 0.24, label: 'RANK', value: `${data.rank}/3`, x: leftX, origin: 0 as const },
      { y: localCard.y + localCard.height * 0.52, label: 'COPIES', value: String(data.duplicates + 1), x: leftX, origin: 0 as const },
      { y: localCard.y + localCard.height * 0.80, label: 'INDEX', value: `${data.cardIndex}/${data.totalCards}`, x: leftX, origin: 0 as const },
      { y: localCard.y + localCard.height * 0.24, label: 'CLASS', value: data.rarity.slice(0, 6).toUpperCase(), x: rightX, origin: 1 as const },
      { y: localCard.y + localCard.height * 0.52, label: 'LINK', value: data.equipped ? 'ACTIVE' : 'STORED', x: rightX, origin: 1 as const },
      { y: localCard.y + localCard.height * 0.80, label: 'ACQ', value: formatArchiveTimestamp(data.acquiredAt).slice(2), x: rightX, origin: 1 as const }
    ];
    for (const row of rows) {
      sideObjects.push(
        scene.add.text(row.x, row.y, row.label, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: '8px', color: '#668c99', fontStyle: 'bold'
        }).setOrigin(row.origin, 0.5),
        scene.add.text(row.x, row.y + 12, row.value, {
          fontFamily: 'Orbitron, sans-serif', fontSize: '9px', color: row.label === 'LINK' && data.equipped ? '#70ffad' : '#bdeff5', fontStyle: 'bold'
        }).setOrigin(row.origin, 0.5)
      );
    }
    const pulse = scene.add.rectangle(rightX - 2, localCard.y + 24, 2, Math.max(18, localCard.height * 0.18), accent, 0.5).setOrigin(0.5);
    sideObjects.push(pulse);
    scene.tweens.add({
      targets: pulse,
      y: localCard.y + localCard.height - 24,
      alpha: { from: 0.18, to: 0.7 },
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  root.add([chamber, scanGrid, ...sideObjects]);
  return root;
};

/** Optional full-height inspection trace; compact screens keep the action area. */
export const createModSelectedTracePanel = (
  scene: Phaser.Scene,
  rect: CollectionFrameRect,
  data: ModSelectedInspectorData
): Phaser.GameObjects.Container => {
  const root = scene.add.container(rect.x, rect.y);
  const panel = scene.add.rectangle(0, 0, rect.width, rect.height, 0x030c14, 0.88)
    .setOrigin(0, 0).setStrokeStyle(1, data.rarityColor, 0.3);
  const label = scene.add.text(12, 8, 'SIGNAL TRACE // MODULE INSPECTION', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '9px', color: '#74bfca', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  const state = scene.add.text(rect.width - 12, 8, `${formatArchiveTimestamp(data.acquiredAt)} // ${data.infused ? 'INFUSED' : 'BASE'} // ${data.equipped ? 'LINKED' : 'STORED'}`, {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '9px', color: data.equipped ? '#72ffad' : '#a4ccd3', fontStyle: 'bold'
  }).setOrigin(1, 0);
  const graph = scene.add.graphics();
  const left = 12;
  const right = rect.width - 12;
  const top = 27;
  const bottom = rect.height - 9;
  graph.lineStyle(1, 0x55eaff, 0.11);
  for (let index = 0; index <= 4; index += 1) {
    const y = top + ((bottom - top) * index) / 4;
    graph.lineBetween(left, y, right, y);
  }
  graph.lineStyle(2, data.rarityColor, 0.72);
  graph.beginPath();
  data.signalTrace.forEach((value, index) => {
    const px = left + ((right - left) * index) / Math.max(1, data.signalTrace.length - 1);
    const py = bottom - (bottom - top) * value;
    if (index === 0) graph.moveTo(px, py); else graph.lineTo(px, py);
  });
  graph.strokePath();
  const sweep = scene.add.rectangle(left, top, 2, Math.max(3, bottom - top), 0x83f6ff, 0.16).setOrigin(0, 0);
  root.add([panel, graph, label, state, sweep]);
  scene.tweens.add({ targets: sweep, x: right - 2, alpha: { from: 0.08, to: 0.3 }, duration: 1800, repeat: -1, repeatDelay: 700 });
  return root;
};

/** Static, layered equipment housing for the collection's two-row card bay. */
export const createModArchiveTerminal = (
  scene: Phaser.Scene,
  layout: ModArchiveTerminalLayout,
  analytics: ModArchiveAnalytics
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
    const roomyDiagnostics = diagnosticLocal.width >= 100;
    const diagnosticLabel = scene.add.text(diagnosticLocal.x + diagnosticLocal.width / 2, diagnosticLocal.y + 20, roomyDiagnostics ? 'LIVE INDEX' : 'INDEX', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${diagnosticLocal.width >= 100 ? 10 : 8}px`, color: '#6fbdca', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5);
    const diagnosticRows = [
      [roomyDiagnostics ? 'MATCHING' : 'MATCH', String(analytics.matchingCards)],
      ['PAGE', `${analytics.page + 1}/${analytics.pageCount}`],
      [roomyDiagnostics ? 'LOADOUT' : 'LINK', String(analytics.equippedCards)],
      [roomyDiagnostics ? 'SALVAGE' : 'SALV', String(analytics.recyclableCards)]
    ];
    const diagnosticText: Phaser.GameObjects.Text[] = [];
    diagnosticRows.forEach(([label, value], index) => {
      const rowY = diagnosticLocal.y + 48 + index * 35;
      diagnosticTech.lineStyle(1, 0x2f6471, 0.38);
      diagnosticTech.lineBetween(diagnosticLocal.x + 9, rowY + 13, diagnosticLocal.x + diagnosticLocal.width - 9, rowY + 13);
      diagnosticText.push(
        scene.add.text(diagnosticLocal.x + 10, rowY, label, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${roomyDiagnostics ? 9 : 7}px`, color: '#617f8a', fontStyle: 'bold'
        }).setOrigin(0, 0.5),
        scene.add.text(diagnosticLocal.x + diagnosticLocal.width - 10, rowY, value, {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${roomyDiagnostics ? 11 : 8}px`, color: '#bceff6', fontStyle: 'bold'
        }).setOrigin(1, 0.5)
      );
    });
    const rarityValues = [
      analytics.rarityCounts.common,
      analytics.rarityCounts.uncommon,
      analytics.rarityCounts.rare,
      analytics.rarityCounts.epic,
      analytics.rarityCounts.legendary,
      analytics.rarityCounts.supreme
    ];
    const rarityColors = [0xf1f5ff, 0x53ff91, 0x2fb8ff, 0xc55cff, 0xff9c27, 0xff426e];
    const rarityMaximum = Math.max(1, ...rarityValues);
    const chartTop = diagnosticLocal.y + diagnosticLocal.height * 0.58;
    const chartBottom = diagnosticLocal.y + diagnosticLocal.height - 34;
    const chartWidth = Math.max(8, (diagnosticLocal.width - 22) / rarityValues.length - 3);
    rarityValues.forEach((value, index) => {
      const barHeight = value > 0 ? Math.max(2, (chartBottom - chartTop) * (value / rarityMaximum)) : 0;
      diagnosticTech.fillStyle(rarityColors[index], 0.58);
      diagnosticTech.fillRect(diagnosticLocal.x + 11 + index * (chartWidth + 3), chartBottom - barHeight, chartWidth, barHeight);
    });
    const diagnosticStatus = scene.add.text(diagnosticLocal.x + diagnosticLocal.width / 2, diagnosticLocal.y + diagnosticLocal.height - 13, roomyDiagnostics ? 'ARCHIVE BUS // READY' : 'READY', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${diagnosticLocal.width >= 100 ? 9 : 7}px`, color: '#72ffaf', fontStyle: 'bold'
    }).setOrigin(0.5);
    const diagnosticLeds = [0.3, 0.5, 0.7].map((fraction, index) => scene.add.circle(
      diagnosticLocal.x + diagnosticLocal.width * fraction,
      diagnosticLocal.y + diagnosticLocal.height * 0.52,
      2.2,
      index === 1 ? 0xff5bcf : 0x55eaff,
      0.78
    ));
    hardware.push(diagnosticShadow, diagnosticPanel, diagnosticTech, diagnosticLabel, ...diagnosticText, diagnosticStatus, ...diagnosticLeds);
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
    const moduleObjects: Phaser.GameObjects.GameObject[] = [];
    lowerTech.lineStyle(2, 0x55eaff, 0.34);
    lowerTech.lineBetween(lowerLocal.x + 16, lowerLocal.y + 5, lowerLocal.x + lowerLocal.width - 16, lowerLocal.y + 5);

    if (lowerLocal.height >= 42) {
      const moduleGap = 8;
      const moduleInset = 8;
      const moduleWidth = (lowerLocal.width - moduleInset * 2 - moduleGap * 3) / 4;
      const moduleTop = lowerLocal.y + 9;
      const moduleHeight = lowerLocal.height - 18;
      const titles = ['ARCHIVE CORE', 'INDEX BUFFER', 'DATA BUS', 'SYSTEM READY'];
      const moduleLeft = (index: number): number => lowerLocal.x + moduleInset + index * (moduleWidth + moduleGap);
      for (let index = 0; index < titles.length; index += 1) {
        const left = moduleLeft(index);
        moduleObjects.push(
          scene.add.rectangle(left, moduleTop, moduleWidth, moduleHeight, index === 3 ? 0x071914 : 0x030b12, 0.88)
            .setOrigin(0, 0).setStrokeStyle(1, index === 3 ? 0x69ffad : index === 2 ? 0xff5bcf : 0x3c9cab, 0.28),
          scene.add.text(left + 10, moduleTop + 10, titles[index], {
            fontFamily: 'Rajdhani, sans-serif', fontSize: `${moduleHeight >= 90 ? 11 : 9}px`,
            color: index === 3 ? '#71ffad' : '#70b6c2', fontStyle: 'bold', letterSpacing: 1
          }).setOrigin(0, 0)
        );
      }

      const graphTop = moduleTop + Math.min(40, Math.max(25, moduleHeight * 0.25));
      const graphBottom = moduleTop + moduleHeight - 12;
      const coreLeft = moduleLeft(0);
      const discoveryRatio = analytics.totalDefinitions > 0
        ? analytics.discoveredDefinitions / analytics.totalDefinitions
        : 0;
      moduleObjects.push(
        scene.add.text(coreLeft + 10, graphTop, `${analytics.discoveredDefinitions} / ${analytics.totalDefinitions}`, {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${moduleHeight >= 120 ? 18 : 12}px`, color: '#d8faff', fontStyle: 'bold'
        }).setOrigin(0, 0),
        scene.add.text(coreLeft + moduleWidth - 10, graphTop + 2, `${analytics.totalCards} CARDS`, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${moduleHeight >= 90 ? 10 : 8}px`, color: '#749ba7', fontStyle: 'bold'
        }).setOrigin(1, 0)
      );
      const coreBarY = Math.min(graphBottom - 8, graphTop + (moduleHeight >= 120 ? 42 : 25));
      lowerTech.fillStyle(0x102932, 0.9);
      lowerTech.fillRect(coreLeft + 10, coreBarY, moduleWidth - 20, 7);
      lowerTech.fillStyle(0x55eaff, 0.82);
      lowerTech.fillRect(coreLeft + 10, coreBarY, (moduleWidth - 20) * discoveryRatio, 7);
      if (moduleHeight >= 120) {
        moduleObjects.push(scene.add.text(coreLeft + 10, coreBarY + 17,
          `INFUSED ${analytics.infusedCards}  //  LOADOUT ${analytics.equippedCards}\nSALVAGE ${analytics.recyclableCards} → ${analytics.salvagePlasma}◆`, {
            fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', color: '#82b4bf', fontStyle: 'bold', lineSpacing: 5
          }).setOrigin(0, 0));
      }

      const categoryValues = [
        analytics.categoryCounts.weapon,
        analytics.categoryCounts.player,
        analytics.categoryCounts.defense,
        analytics.categoryCounts.bombSite,
        analytics.categoryCounts.utility
      ];
      const categoryLabels = ['W', 'P', 'D', 'B', 'U'];
      const categoryColors = [0x55eaff, 0xff67ca, 0x75ffab, 0xffb75e, 0xb875ff];
      const categoryMaximum = Math.max(1, ...categoryValues);
      const indexLeft = moduleLeft(1);
      const categorySlot = (moduleWidth - 20) / categoryValues.length;
      categoryValues.forEach((value, index) => {
        const barHeight = value > 0 ? Math.max(2, (graphBottom - graphTop - 14) * (value / categoryMaximum)) : 0;
        const barWidth = Math.max(4, categorySlot - 7);
        const x = indexLeft + 10 + index * categorySlot + (categorySlot - barWidth) / 2;
        lowerTech.fillStyle(categoryColors[index], 0.58);
        lowerTech.fillRect(x, graphBottom - 12 - barHeight, barWidth, barHeight);
        moduleObjects.push(scene.add.text(x + barWidth / 2, graphBottom - 5, categoryLabels[index], {
          fontFamily: 'Rajdhani, sans-serif', fontSize: '8px', color: '#7ca7b1', fontStyle: 'bold'
        }).setOrigin(0.5));
      });

      const dataLeft = moduleLeft(2);
      lowerTech.lineStyle(1, 0x55eaff, 0.1);
      for (let index = 0; index <= 4; index += 1) {
        const y = graphTop + ((graphBottom - graphTop) * index) / 4;
        lowerTech.lineBetween(dataLeft + 10, y, dataLeft + moduleWidth - 10, y);
      }
      lowerTech.lineStyle(2, 0xff5bcf, 0.72);
      lowerTech.beginPath();
      analytics.signalTrace.forEach((value, index) => {
        const x = dataLeft + 10 + ((moduleWidth - 20) * index) / Math.max(1, analytics.signalTrace.length - 1);
        const y = graphBottom - (graphBottom - graphTop) * value;
        if (index === 0) lowerTech.moveTo(x, y); else lowerTech.lineTo(x, y);
      });
      lowerTech.strokePath();
      const dataSweep = scene.add.rectangle(dataLeft + 10, graphTop, 2, Math.max(3, graphBottom - graphTop), 0x70efff, 0.14).setOrigin(0, 0);
      moduleObjects.push(dataSweep);
      scene.tweens.add({ targets: dataSweep, x: dataLeft + moduleWidth - 12, alpha: { from: 0.06, to: 0.28 }, duration: 2100, repeat: -1, repeatDelay: 900 });

      const systemLeft = moduleLeft(3);
      const systemRows = [
        ['ARCHIVE LINK', 'ONLINE'],
        ['CARD MATRIX', `${analytics.matchingCards} ACTIVE`],
        ['PAGE BUFFER', `${analytics.page + 1} / ${analytics.pageCount}`],
        ['SALVAGE BUS', analytics.recyclableCards ? 'STANDBY' : 'CLEAR']
      ];
      systemRows.slice(0, moduleHeight >= 125 ? 4 : 2).forEach(([label, value], index) => {
        const y = graphTop + index * Math.min(31, Math.max(19, (graphBottom - graphTop) / 4));
        moduleObjects.push(
          scene.add.circle(systemLeft + 13, y + 5, 2.2, index === 0 ? 0x69ffad : 0x55eaff, 0.85),
          scene.add.text(systemLeft + 22, y, label, {
            fontFamily: 'Rajdhani, sans-serif', fontSize: '8px', color: '#6e929c', fontStyle: 'bold'
          }).setOrigin(0, 0),
          scene.add.text(systemLeft + moduleWidth - 10, y, value, {
            fontFamily: 'Rajdhani, sans-serif', fontSize: '9px', color: index === 0 ? '#70ffad' : '#bee8ed', fontStyle: 'bold'
          }).setOrigin(1, 0)
        );
      });
      if (moduleHeight >= 170) {
        const rankMaximum = Math.max(1, ...analytics.rankCounts);
        const rankBottom = moduleTop + moduleHeight - 13;
        const rankHeight = Math.min(44, moduleHeight * 0.19);
        const rankSlot = (moduleWidth - 28) / analytics.rankCounts.length;
        analytics.rankCounts.forEach((value, index) => {
          const height = value > 0 ? Math.max(2, rankHeight * (value / rankMaximum)) : 0;
          const x = systemLeft + 14 + index * rankSlot;
          lowerTech.fillStyle(index === 3 ? 0xff5bcf : 0x55eaff, 0.52 + index * 0.08);
          lowerTech.fillRect(x, rankBottom - height, Math.max(4, rankSlot - 7), height);
          moduleObjects.push(scene.add.text(x + Math.max(4, rankSlot - 7) / 2, rankBottom + 6, `R${index}`, {
            fontFamily: 'Rajdhani, sans-serif', fontSize: '8px', color: '#7298a2', fontStyle: 'bold'
          }).setOrigin(0.5, 0));
        });
      }
      const liveLed = scene.add.circle(systemLeft + moduleWidth - 12, moduleTop + 13, 2.5, 0x69ffad, 0.92);
      moduleObjects.push(liveLed);
      scene.tweens.add({ targets: liveLed, alpha: { from: 0.2, to: 1 }, duration: 760, yoyo: true, repeat: -1 });
    }
    hardware.push(lowerShadow, lowerPanel, lowerInner, lowerTech, ...moduleObjects);
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
    ? `MOD ARCHIVE TERMINAL // ${analytics.matchingCards} CARDS`
    : `MOD ARCHIVE TERMINAL // OWNED INDEX: ${analytics.matchingCards} MATCHING CARDS`, {
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
