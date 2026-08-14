import Phaser from 'phaser';
import { createButton } from '../utils/ui.ts';
import type { DebriefLayout, DebriefRect } from './DebriefLayout.ts';

export type DebriefTone = 'complete' | 'failed' | 'success';
export type DebriefResourceKind = 'credits' | 'coreTokens' | 'plasmaChips' | 'fluxCores';

export interface DebriefRewardItem {
  kind: DebriefResourceKind;
  value: number;
}

export interface DebriefReadoutItem {
  label: string;
  value: string;
}

export interface DebriefHighlightContent {
  eyebrow: string;
  primary: string;
  details: string[];
  tone?: DebriefTone;
}

export interface DebriefAction {
  label: string;
  onClick: () => unknown;
  primary?: boolean;
  warning?: boolean;
}

const RESOURCE_STYLE: Record<DebriefResourceKind, { label: string; color: number; css: string }> = {
  credits: { label: 'CREDITS', color: 0xffed67, css: '#fff08a' },
  coreTokens: { label: 'CORE TOKENS', color: 0xffc86b, css: '#ffd889' },
  plasmaChips: { label: 'PLASMA CHIPS', color: 0xc877ff, css: '#df9cff' },
  fluxCores: { label: 'FLUX CORES', color: 0x69ff9c, css: '#8effb0' }
};

const chamferedPoints = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0,
  width, cut, width, height - cut,
  width - cut, height, cut, height,
  0, height - cut, 0, cut
];

const toneColor = (tone: DebriefTone): number => tone === 'failed' ? 0xff5678 : tone === 'success' ? 0x72ffac : 0x62efff;
const toneCss = (tone: DebriefTone): string => tone === 'failed' ? '#ff6e88' : tone === 'success' ? '#82ffb4' : '#75f4ff';

export const createDebriefShell = (
  scene: Phaser.Scene,
  layout: DebriefLayout,
  tone: DebriefTone,
  title: string,
  subtitle: string
): void => {
  const { viewportWidth: width, viewportHeight: height, panel, compact } = layout;
  const accent = toneColor(tone);
  scene.add.rectangle(width / 2, height / 2, width, height, 0x03070d, 1);
  scene.add.grid(width / 2, height / 2, width, height, compact ? 42 : 54, compact ? 42 : 54, 0x040a12, 0.14, 0x174257, 0.12);

  const leftRing = scene.add.circle(width * 0.1, height * 0.72, compact ? 86 : 140, 0x56efff, 0.018).setStrokeStyle(2, 0x56efff, 0.16);
  const rightRing = scene.add.circle(width * 0.91, height * 0.23, compact ? 74 : 116, tone === 'failed' ? 0xff4f78 : 0xff5bd2, 0.02)
    .setStrokeStyle(2, tone === 'failed' ? 0xff4f78 : 0xff5bd2, 0.16);
  scene.tweens.add({ targets: [leftRing, rightRing], scale: { from: 0.96, to: 1.04 }, alpha: { from: 0.3, to: 0.7 }, duration: 3400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  const root = scene.add.container(0, 0).setDepth(10).setAlpha(0);
  const cut = compact ? 12 : 20;
  const framePoints = chamferedPoints(panel.width, panel.height, cut);
  const centerX = panel.x + panel.width / 2;
  const centerY = panel.y + panel.height / 2;
  const shadow = scene.add.polygon(centerX + 7, centerY + 9, framePoints, 0x000000, 0.65);
  const chassis = scene.add.polygon(centerX, centerY, framePoints, 0x07111b, 0.99).setStrokeStyle(2, 0x3fbed0, 0.72);
  const glass = scene.add.rectangle(panel.x + 12, panel.y + 12, panel.width - 24, panel.height - 24, 0x081925, 0.78)
    .setOrigin(0, 0).setStrokeStyle(1, accent, 0.18);
  const topRail = scene.add.rectangle(centerX, panel.y + 5, panel.width - cut * 2, 4, accent, 0.58);
  const leftRail = scene.add.rectangle(panel.x + 7, centerY, 3, panel.height - cut * 2.5, 0xff5bcf, 0.52);
  const rightRail = scene.add.rectangle(panel.x + panel.width - 7, centerY, 3, panel.height - cut * 2.5, 0x55efff, 0.42);
  const headerPlate = scene.add.rectangle(layout.header.x, layout.header.y, layout.header.width, layout.header.height, 0x0a1d2b, 0.92)
    .setOrigin(0, 0).setStrokeStyle(1, accent, 0.32);
  const headerAccent = scene.add.rectangle(layout.header.x + 8, layout.header.y + 7, layout.header.width - 16, 3, tone === 'failed' ? 0xff5678 : 0xff5bcf, 0.58).setOrigin(0, 0);
  const divider = scene.add.rectangle(layout.actions.x - (compact ? 8 : 12), layout.primary.y + layout.primary.height / 2, 2, layout.primary.height - 8, accent, 0.15);
  root.add([shadow, chassis, glass, topRail, leftRail, rightRail, headerPlate, headerAccent, divider]);

  for (const x of [panel.x + 15, panel.x + panel.width - 15]) {
    for (const y of [panel.y + 15, panel.y + panel.height - 15]) root.add(scene.add.circle(x, y, compact ? 2 : 3, x < centerX ? 0xff5bcf : accent, 0.75));
  }

  const titleSize = compact ? Phaser.Math.Clamp(width * 0.042, 28, 38) : Phaser.Math.Clamp(width * 0.036, 42, 54);
  const ghost = scene.add.text(centerX + 2, layout.header.y + (compact ? 13 : 17), title, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: tone === 'failed' ? '#ff325f' : '#3cecff', fontStyle: 'bold'
  }).setOrigin(0.5, 0).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD);
  const heading = scene.add.text(centerX, layout.header.y + (compact ? 11 : 15), title, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: toneCss(tone), fontStyle: 'bold',
    shadow: { color: toneCss(tone), blur: 9, fill: true }, align: 'center'
  }).setOrigin(0.5, 0).setWordWrapWidth(layout.header.width - 100, true).setMaxLines(1);
  const subheading = scene.add.text(centerX, heading.y + heading.height + (compact ? 1 : 4), subtitle, {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 17 : 22}px`, color: '#c7e8f2', fontStyle: 'bold', letterSpacing: 2, align: 'center'
  }).setOrigin(0.5, 0);
  const sync = scene.add.text(layout.header.x + layout.header.width - 14, layout.header.y + layout.header.height - 18, 'DEBRIEF LINK // SYNCED', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: '#76cdd9', letterSpacing: 1
  }).setOrigin(1, 0);
  root.add([ghost, heading, subheading, sync]);

  const sweep = scene.add.rectangle(panel.x + 18, centerY, 2, panel.height - 36, accent, 0.06);
  root.add(sweep);
  scene.tweens.add({ targets: sweep, x: panel.x + panel.width - 18, alpha: { from: 0.015, to: 0.12 }, duration: 3900, repeat: -1, repeatDelay: 2600, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: [heading, topRail], alpha: { from: 0.74, to: 1 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: sync, alpha: { from: 0.25, to: 0.9 }, duration: 850, yoyo: true, repeat: -1 });
  scene.tweens.add({ targets: root, alpha: 1, duration: 360, ease: 'Sine.easeOut' });
};

const createSectionFrame = (scene: Phaser.Scene, rect: DebriefRect, title: string, accent: number): Phaser.GameObjects.Container => {
  const root = scene.add.container(rect.x, rect.y).setDepth(20);
  const shadow = scene.add.rectangle(4, 5, rect.width, rect.height, 0x000000, 0.38).setOrigin(0, 0);
  const frame = scene.add.rectangle(0, 0, rect.width, rect.height, 0x081722, 0.94).setOrigin(0, 0).setStrokeStyle(1, accent, 0.43);
  const header = scene.add.rectangle(0, 0, rect.width, Math.min(38, rect.height * 0.25), 0x0d2431, 0.92).setOrigin(0, 0);
  const rail = scene.add.rectangle(7, 4, rect.width - 14, 3, accent, 0.58).setOrigin(0, 0);
  const sectionFontSize = Math.max(11, Math.min(14, Math.round(rect.width / 50)));
  const label = scene.add.text(14, 10, title, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${sectionFontSize}px`, color: Phaser.Display.Color.IntegerToColor(accent).rgba, fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  const led = scene.add.circle(rect.width - 16, 17, 3, accent, 0.9);
  root.add([shadow, frame, header, rail, label, led]);
  scene.tweens.add({ targets: led, alpha: { from: 0.25, to: 1 }, duration: 800, yoyo: true, repeat: -1 });
  return root;
};

const createResourceIcon = (scene: Phaser.Scene, x: number, y: number, size: number, kind: DebriefResourceKind): Phaser.GameObjects.Container => {
  const style = RESOURCE_STYLE[kind];
  const root = scene.add.container(x, y);
  const glow = scene.add.circle(0, 0, size * 0.62, style.color, 0.09).setBlendMode(Phaser.BlendModes.ADD);
  const ring = scene.add.circle(0, 0, size * 0.5, 0x07131c, 0.96).setStrokeStyle(2, style.color, 0.75);
  root.add([glow, ring]);
  if (kind === 'credits') {
    root.add(scene.add.text(0, -1, '\u00a2', {
      fontFamily: 'Orbitron, Rajdhani, sans-serif', fontSize: `${Math.round(size * 0.82)}px`, color: '#ffffa8', fontStyle: 'bold', stroke: '#8e7300', strokeThickness: 2
    }).setOrigin(0.5).setShadow(0, 0, '#f5ff58', 6, true, true));
  } else if (kind === 'coreTokens') {
    const radius = size * 0.28;
    const points: number[] = [];
    for (let point = 0; point < 6; point += 1) {
      const angle = Math.PI / 3 * point - Math.PI / 2;
      points.push((Math.cos(angle) + 1) * radius, (Math.sin(angle) + 1) * radius);
    }
    root.add(scene.add.polygon(0, 0, points, style.color, 0.92).setStrokeStyle(1.5, 0xffffff, 0.9));
    root.add(scene.add.circle(0, 0, size * 0.1, 0xffffff, 0.96).setStrokeStyle(1, style.color, 1));
  } else if (kind === 'plasmaChips') {
    root.add(scene.add.rectangle(0, 0, size * 0.42, size * 0.42, style.color, 0.88).setRotation(Math.PI / 4).setStrokeStyle(2, 0xf2d7ff, 0.9));
    root.add(scene.add.circle(0, 0, size * 0.09, 0xffffff, 0.92));
  } else {
    root.add(scene.add.circle(0, 0, size * 0.27, style.color, 0.3).setStrokeStyle(2, 0xd8ffe4, 0.82));
    root.add(scene.add.circle(0, 0, size * 0.12, 0xd9ffe5, 0.95));
    root.add(scene.add.text(0, 0, '\u03df', { fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.round(size * 0.34)}px`, color: '#154d2c', fontStyle: 'bold' }).setOrigin(0.5));
  }
  scene.tweens.add({ targets: glow, scale: { from: 0.88, to: 1.14 }, alpha: { from: 0.04, to: 0.16 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return root;
};

export const createRewardSummary = (scene: Phaser.Scene, rect: DebriefRect, rewards: DebriefRewardItem[], compact: boolean, retained = false): void => {
  const root = createSectionFrame(scene, rect, retained ? 'REWARDS RETAINED' : 'REWARDS SUMMARY', 0xff68cf);
  const contentTop = compact ? 34 : 42;
  const gap = compact ? 7 : 11;
  const columns = 2;
  const rows = Math.ceil(rewards.length / columns);
  const chipWidth = (rect.width - gap * 3) / columns;
  const chipHeight = (rect.height - contentTop - gap * (rows + 1)) / rows;
  rewards.forEach((reward, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + column * (chipWidth + gap);
    const y = contentTop + gap + row * (chipHeight + gap);
    const style = RESOURCE_STYLE[reward.kind];
    const chip = scene.add.rectangle(x, y, chipWidth, chipHeight, 0x07131e, 0.94).setOrigin(0, 0).setStrokeStyle(1, style.color, 0.34);
    const edge = scene.add.rectangle(x + 3, y + chipHeight / 2, 3, chipHeight - 10, style.color, 0.62);
    const iconSize = Math.min(compact ? 34 : 46, chipHeight * 0.62);
    const iconX = x + iconSize * 0.8 + 6;
    const iconY = y + chipHeight / 2;
    const icon = createResourceIcon(scene, iconX, iconY, iconSize, reward.kind);
    const textX = x + iconSize * 1.65;
    const value = scene.add.text(textX, y + chipHeight * 0.22, Math.max(0, reward.value).toLocaleString(), {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 17 : 23}px`, color: style.css, fontStyle: 'bold'
    }).setOrigin(0, 0);
    const label = scene.add.text(textX, y + chipHeight * 0.62, style.label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 10 : 12}px`, color: '#9ec5d1', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0);
    root.add([chip, edge, icon, value, label]);
    icon.setScale(0.72).setAlpha(0);
    value.setAlpha(0).setX(textX + 10);
    scene.tweens.add({ targets: icon, scale: 1, alpha: 1, duration: 280, delay: 100 + index * 90, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: value, x: textX, alpha: 1, duration: 300, delay: 170 + index * 90, ease: 'Sine.easeOut' });
  });
};

export const createOperationReadout = (scene: Phaser.Scene, rect: DebriefRect, fields: DebriefReadoutItem[], compact: boolean): void => {
  const root = createSectionFrame(scene, rect, 'OPERATION DATA // TACTICAL READOUT', 0x55eaff);
  const contentTop = compact ? 35 : 43;
  const gap = compact ? 5 : 8;
  const columns = 2;
  const rows = Math.ceil(fields.length / columns);
  const cellWidth = (rect.width - gap * 3) / columns;
  const cellHeight = (rect.height - contentTop - gap * (rows + 1)) / rows;
  fields.forEach((field, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + column * (cellWidth + gap);
    const y = contentTop + gap + row * (cellHeight + gap);
    const cell = scene.add.rectangle(x, y, cellWidth, cellHeight, 0x06121c, 0.82).setOrigin(0, 0).setStrokeStyle(1, 0x387184, 0.28);
    const label = scene.add.text(x + 9, y + 5, field.label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: '#72b8c7', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0);
    const value = scene.add.text(x + 9, y + cellHeight - (compact ? 5 : 7), field.value, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 13 : 16}px`, color: '#d9f7ff', fontStyle: 'bold'
    }).setOrigin(0, 1).setWordWrapWidth(cellWidth - 18, true).setMaxLines(1);
    root.add([cell, label, value]);
  });
};

export const createDebriefHighlight = (scene: Phaser.Scene, rect: DebriefRect, content: DebriefHighlightContent, compact: boolean): void => {
  const tone = content.tone ?? 'complete';
  const accent = toneColor(tone);
  const root = createSectionFrame(scene, rect, content.eyebrow, accent);
  const primary = scene.add.text(16, compact ? 36 : 48, content.primary, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 19 : 28}px`, color: toneCss(tone), fontStyle: 'bold'
  }).setOrigin(0, 0).setWordWrapWidth(rect.width - 32, true).setMaxLines(1);
  root.add(primary);
  const detailY = compact ? rect.height - 13 : rect.height - 17;
  const detail = scene.add.text(rect.width - 16, detailY, content.details.join('   //   '), {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 11 : 14}px`, color: '#b5dbe5', fontStyle: 'bold', align: 'right', letterSpacing: compact ? 0 : 1
  }).setOrigin(1, 1).setWordWrapWidth(rect.width - 32, true).setMaxLines(compact ? 2 : 1);
  root.add(detail);
  const pulse = scene.add.rectangle(8, rect.height - 5, rect.width - 16, 2, accent, 0.35).setOrigin(0, 0.5);
  root.add(pulse);
  scene.tweens.add({ targets: pulse, alpha: { from: 0.18, to: 0.72 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
};

const createDebriefActionButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  action: DebriefAction,
  compact: boolean
): Phaser.GameObjects.Container => {
  const accent = action.warning ? 0xff6680 : action.primary ? 0x61f3ff : 0x42bdd2;
  const outerWidth = width + (action.primary ? 14 : 8);
  const outerHeight = height + (action.primary ? 12 : 8);
  const points = chamferedPoints(outerWidth, outerHeight, Math.min(11, outerHeight * 0.22));
  scene.add.polygon(x + 4, y + 5, points, 0x000000, 0.48).setDepth(30);
  const chassis = scene.add.polygon(x, y, points, action.primary ? 0x0d2836 : 0x091722, 0.98).setStrokeStyle(action.primary ? 2 : 1, accent, action.primary ? 0.72 : 0.46).setDepth(31);
  const button = createButton(scene, x, y, action.label, action.onClick, width, 'menu', {
    height,
    fontSize: compact ? (action.label.length > 22 ? 13 : 15) : (action.label.length > 22 ? 15 : 18),
    horizontalPadding: 28
  }).setDepth(32);
  const edge = scene.add.rectangle(x, y - height / 2 + 2, width - 20, 2, accent, action.primary ? 0.62 : 0.3).setDepth(33);
  const led = scene.add.circle(x - width / 2 + 12, y, 2.5, accent, 0.9).setDepth(33);
  scene.tweens.add({ targets: led, alpha: { from: 0.25, to: 1 }, duration: 720, yoyo: true, repeat: -1 });
  if (action.primary) scene.tweens.add({ targets: [chassis, edge], alpha: { from: 0.72, to: 1 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return button;
};

export const createDebriefActions = (
  scene: Phaser.Scene,
  rect: DebriefRect,
  actions: DebriefAction[],
  compact: boolean,
  footer: string
): Map<string, Phaser.GameObjects.Container> => {
  createSectionFrame(scene, rect, 'COMMAND ROUTES', 0x55eaff);
  const buttons = new Map<string, Phaser.GameObjects.Container>();
  const top = compact ? 46 : 60;
  const bottom = compact ? 34 : 46;
  const available = rect.height - top - bottom;
  const minimumGap = compact ? 10 : 14;
  const height = Math.min(compact ? 52 : 62, (available - minimumGap * Math.max(0, actions.length - 1)) / actions.length);
  const gap = Math.min(compact ? 18 : 26, Math.max(minimumGap, (available - height * actions.length) / Math.max(1, actions.length - 1)));
  const stackHeight = height * actions.length + gap * Math.max(0, actions.length - 1);
  const stackTop = top + Math.max(0, (available - stackHeight) / 2);
  const width = rect.width - (compact ? 20 : 28);
  actions.forEach((action, index) => {
    const y = rect.y + stackTop + height / 2 + index * (height + gap);
    buttons.set(action.label, createDebriefActionButton(scene, rect.x + rect.width / 2, y, width, height, action, compact));
  });
  scene.add.text(rect.x + rect.width / 2, rect.y + rect.height - (compact ? 10 : 14), footer, {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 10 : 12}px`, color: '#789eac', align: 'center', letterSpacing: 1,
    wordWrap: { width: rect.width - 24, useAdvancedWrap: true }
  }).setOrigin(0.5, 1).setDepth(34).setMaxLines(2);
  return buttons;
};
