import Phaser from 'phaser';
import { COLORS } from '../config/constants.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { playButtonJiggle } from '../utils/ui.ts';
import { PAUSE_MENU_BASE_HEIGHT, PAUSE_MENU_BASE_WIDTH, calculatePauseMenuLayout } from './PauseMenuLayout.ts';
import { registerUiFocusable } from '../input/UiNavigationController.ts';

export type PauseMenuActionTone = 'primary' | 'standard' | 'utility' | 'warning';

export interface PauseMenuAction {
  label: string;
  onClick: () => unknown;
  tone?: PauseMenuActionTone;
}

export interface PauseMenuSnapshot {
  encounter: string;
  seed: number;
  layout: string;
}

export interface PauseMenuView {
  resize: (width: number, height: number) => void;
  destroy: () => void;
}

const chamferedPoints = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0,
  width, cut, width, height - cut,
  width - cut, height, cut, height,
  0, height - cut, 0, cut
];

const toneAccent = (tone: PauseMenuActionTone): number => {
  if (tone === 'primary') return COLORS.green;
  if (tone === 'utility') return COLORS.orange;
  if (tone === 'warning') return COLORS.red;
  return COLORS.cyan;
};

const toneFill = (tone: PauseMenuActionTone): number => {
  if (tone === 'primary') return 0x0b2a29;
  if (tone === 'utility') return 0x241d15;
  if (tone === 'warning') return 0x25131e;
  return 0x091925;
};

const createActionControl = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  action: PauseMenuAction,
  animatedTargets: Phaser.GameObjects.GameObject[]
): Phaser.GameObjects.Container => {
  const tone = action.tone ?? 'standard';
  const accent = toneAccent(tone);
  const outerWidth = width + (tone === 'primary' ? 16 : 10);
  const outerHeight = height + (tone === 'primary' ? 12 : 8);
  const points = chamferedPoints(outerWidth, outerHeight, Math.min(11, outerHeight * 0.22));
  // InputManager reads the interactive child's scroll factor even when its
  // visual parent is screen-fixed. Keep both sides in screen space so Arena
  // camera scroll cannot offset hover/click coordinates from the rendered UI.
  const root = scene.add.container(x, y).setScrollFactor(0);
  const shadow = scene.add.polygon(4, 5, points, 0x000000, 0.54);
  const chassis = scene.add.polygon(0, 0, points, toneFill(tone), 0.98)
    .setStrokeStyle(tone === 'primary' ? 2 : 1, accent, tone === 'primary' ? 0.82 : 0.54);
  const label = scene.add.text(0, 0, action.label.toUpperCase(), {
    color: '#d6f7ff',
    fontSize: `${action.label.length > 25 ? 15 : 17}px`,
    fontFamily: 'Rajdhani, sans-serif',
    fontStyle: 'bold',
    align: 'center',
    wordWrap: { width: Math.max(40, width - 30), useAdvancedWrap: true }
  }).setOrigin(0.5).setMaxLines(2);
  const edge = scene.add.rectangle(0, -height * 0.5 + 2, width - 22, 2, accent, tone === 'primary' ? 0.72 : 0.38);
  const led = scene.add.circle(-width * 0.5 + 13, 0, 2.7, accent, 0.95);
  root.add([shadow, chassis, label, edge, led]);

  // Keep the command itself as the hit target. This avoids relying on a hit
  // rectangle buried inside multiple scaled Containers, which Phaser can sort
  // behind a fullscreen overlay during pointer hit testing. Phaser normalizes
  // Container input by adding displayOriginX/Y, so this custom hit area must
  // use positive local geometry rather than centered negative coordinates.
  root.setSize(width, height).setInteractive(
    new Phaser.Geom.Rectangle(0, 0, width, height),
    Phaser.Geom.Rectangle.Contains
  );
  if (root.input) root.input.cursor = 'pointer';
  root.on('pointerover', () => {
    chassis.setStrokeStyle(2, COLORS.pink, 1);
    label.setColor('#ffffff');
    edge.setAlpha(1);
    AudioManager.get().playSfx('menuHover');
    playButtonJiggle(scene, root);
  });
  root.on('pointerout', () => {
    chassis.setStrokeStyle(tone === 'primary' ? 2 : 1, accent, tone === 'primary' ? 0.82 : 0.54);
    label.setColor('#d6f7ff');
    edge.setAlpha(tone === 'primary' ? 0.72 : 0.38);
  });
  const activate = (): unknown => {
    const accepted = action.onClick();
    AudioManager.get().playSfx(accepted === false ? 'itemLocked' : 'menu');
    return accepted;
  };
  root.on('pointerdown', activate);
  registerUiFocusable(scene, root, {
    label: action.label,
    activate,
    modalDepth: 20,
    defaultPriority: tone === 'primary' ? 40 : 0,
    destructive: tone === 'warning'
  });

  scene.tweens.add({ targets: led, alpha: { from: 0.24, to: 1 }, duration: 760, yoyo: true, repeat: -1 });
  animatedTargets.push(led);
  if (tone === 'primary') {
    scene.tweens.add({
      targets: [chassis, edge],
      alpha: { from: 0.72, to: 1 },
      duration: 1250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    animatedTargets.push(chassis, edge);
  }
  return root;
};

const createSafeguardCell = (
  scene: Phaser.Scene,
  x: number,
  label: string,
  value: string,
  accent: number
): Phaser.GameObjects.Container => {
  const root = scene.add.container(x, 8);
  const background = scene.add.rectangle(0, 0, 202, 66, 0x06131d, 0.88).setStrokeStyle(1, accent, 0.26);
  const rail = scene.add.rectangle(-97, 0, 3, 48, accent, 0.56);
  const heading = scene.add.text(-84, -18, label, {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#79afbd', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  const readout = scene.add.text(-84, 3, value, {
    fontFamily: 'Orbitron, sans-serif', fontSize: '15px', color: Phaser.Display.Color.IntegerToColor(accent).rgba, fontStyle: 'bold'
  }).setOrigin(0, 0);
  root.add([background, rail, heading, readout]);
  return root;
};

/**
 * Presentation-only pause console. ArenaScene continues to own pause state,
 * routing, pointer-lock restoration, and every action callback.
 */
export const createPauseMenuView = (
  scene: Phaser.Scene,
  snapshot: PauseMenuSnapshot,
  actions: PauseMenuAction[]
): PauseMenuView => {
  const animatedTargets: Phaser.GameObjects.GameObject[] = [];
  const backdropRoot = scene.add.container(0, 0).setScrollFactor(0).setDepth(1185);
  // Decorative only: making this fullscreen object interactive prevents the
  // command hit areas from receiving hover/click events on some Phaser builds.
  const backdrop = scene.add.rectangle(0, 0, 1, 1, 0x02050b, 0.82);
  const grid = scene.add.graphics();
  const leftRing = scene.add.circle(0, 0, 132, COLORS.cyan, 0.018).setStrokeStyle(2, COLORS.cyan, 0.14);
  const rightRing = scene.add.circle(0, 0, 104, COLORS.pink, 0.018).setStrokeStyle(2, COLORS.pink, 0.14);
  backdropRoot.add([backdrop, grid, leftRing, rightRing]);

  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1190).setAlpha(0);
  const panelPoints = chamferedPoints(PAUSE_MENU_BASE_WIDTH, PAUSE_MENU_BASE_HEIGHT, 22);
  const shadow = scene.add.polygon(7, 9, panelPoints, 0x000000, 0.68);
  const chassis = scene.add.polygon(0, 0, panelPoints, 0x06101a, 0.99).setStrokeStyle(2, 0x3fc6da, 0.76);
  const glass = scene.add.rectangle(0, 0, PAUSE_MENU_BASE_WIDTH - 24, PAUSE_MENU_BASE_HEIGHT - 24, 0x081722, 0.83)
    .setStrokeStyle(1, COLORS.cyan, 0.17);
  const topRail = scene.add.rectangle(0, -PAUSE_MENU_BASE_HEIGHT * 0.5 + 6, PAUSE_MENU_BASE_WIDTH - 48, 4, COLORS.cyan, 0.68);
  const leftRail = scene.add.rectangle(-PAUSE_MENU_BASE_WIDTH * 0.5 + 8, 0, 3, PAUSE_MENU_BASE_HEIGHT - 58, COLORS.pink, 0.5);
  const rightRail = scene.add.rectangle(PAUSE_MENU_BASE_WIDTH * 0.5 - 8, 0, 3, PAUSE_MENU_BASE_HEIGHT - 58, COLORS.cyan, 0.42);
  const headerPlate = scene.add.rectangle(0, -252, PAUSE_MENU_BASE_WIDTH - 46, 104, 0x0a1e2b, 0.95)
    .setStrokeStyle(1, COLORS.cyan, 0.3);
  const headerAccent = scene.add.rectangle(0, -299, PAUSE_MENU_BASE_WIDTH - 70, 3, COLORS.pink, 0.62);
  root.add([shadow, chassis, glass, topRail, leftRail, rightRail, headerPlate, headerAccent]);

  for (const x of [-PAUSE_MENU_BASE_WIDTH * 0.5 + 17, PAUSE_MENU_BASE_WIDTH * 0.5 - 17]) {
    for (const y of [-PAUSE_MENU_BASE_HEIGHT * 0.5 + 17, PAUSE_MENU_BASE_HEIGHT * 0.5 - 17]) {
      root.add(scene.add.circle(x, y, 3, x < 0 ? COLORS.pink : COLORS.cyan, 0.82));
    }
  }

  const eyebrow = scene.add.text(-PAUSE_MENU_BASE_WIDTH * 0.5 + 38, -289, 'TACTICAL SUSPENSION // OPERATIVE LINK', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#71c9d6', fontStyle: 'bold', letterSpacing: 2
  }).setOrigin(0, 0);
  const sync = scene.add.text(PAUSE_MENU_BASE_WIDTH * 0.5 - 38, -289, 'LOCAL TIME FREEZE // ACTIVE', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: '#70ffad', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(1, 0);
  const titleGhost = scene.add.text(2, -270, 'OPERATION PAUSED', {
    fontFamily: 'Orbitron, sans-serif', fontSize: '40px', color: '#ff47c8', fontStyle: 'bold'
  }).setOrigin(0.5, 0).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD);
  const title = scene.add.text(0, -272, 'OPERATION PAUSED', {
    fontFamily: 'Orbitron, sans-serif', fontSize: '40px', color: '#74f5ff', fontStyle: 'bold',
    shadow: { color: '#39eeff', blur: 9, fill: true }, letterSpacing: 1
  }).setOrigin(0.5, 0);
  const subtitle = scene.add.text(0, -216, `${snapshot.encounter.toUpperCase()}  //  SEED ${snapshot.seed}  //  LAYOUT ${snapshot.layout.toUpperCase()}`, {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#c9e8f2', fontStyle: 'bold', letterSpacing: 1, align: 'center'
  }).setOrigin(0.5, 0).setWordWrapWidth(PAUSE_MENU_BASE_WIDTH - 100, true).setMaxLines(1);
  root.add([eyebrow, sync, titleGhost, title, subtitle]);

  const suspensionBand = scene.add.rectangle(0, -174, PAUSE_MENU_BASE_WIDTH - 68, 34, 0x07141f, 0.92)
    .setStrokeStyle(1, COLORS.green, 0.24);
  const suspensionLed = scene.add.circle(-PAUSE_MENU_BASE_WIDTH * 0.5 + 52, -174, 4, COLORS.green, 0.95);
  const suspensionText = scene.add.text(-PAUSE_MENU_BASE_WIDTH * 0.5 + 66, -174, 'COMBAT SIMULATION SUSPENDED', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#91ffc0', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0.5);
  const inputText = scene.add.text(PAUSE_MENU_BASE_WIDTH * 0.5 - 46, -174, 'INPUT LINK // STANDBY', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#8fcbd7', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(1, 0.5);
  const commandLabel = scene.add.text(-PAUSE_MENU_BASE_WIDTH * 0.5 + 38, -153, 'COMMAND ROUTES', {
    fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#69eefe', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  root.add([suspensionBand, suspensionLed, suspensionText, inputText, commandLabel]);

  const primaryAction = actions[0];
  if (primaryAction) root.add(createActionControl(scene, 0, -103, 656, 52, { ...primaryAction, tone: primaryAction.tone ?? 'primary' }, animatedTargets));
  actions.slice(1, 7).forEach((action, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? -168 : 168;
    const y = -38 + row * 62;
    root.add(createActionControl(scene, x, y, 320, 48, action, animatedTargets));
  });

  const safeguards = scene.add.container(0, 172);
  const safeguardsFrame = scene.add.rectangle(0, 0, PAUSE_MENU_BASE_WIDTH - 68, 96, 0x07131d, 0.7)
    .setStrokeStyle(1, COLORS.cyan, 0.22);
  const safeguardsTitle = scene.add.text(-PAUSE_MENU_BASE_WIDTH * 0.5 + 48, -43, 'SESSION SAFEGUARDS', {
    fontFamily: 'Orbitron, sans-serif', fontSize: '10px', color: '#6cc7d3', fontStyle: 'bold', letterSpacing: 1
  }).setOrigin(0, 0);
  safeguards.add([safeguardsFrame, safeguardsTitle]);
  safeguards.add(createSafeguardCell(scene, -214, 'WORLD CLOCK', 'HELD', COLORS.cyan));
  safeguards.add(createSafeguardCell(scene, 0, 'OBJECTIVE STATE', 'SUSPENDED', COLORS.pink));
  safeguards.add(createSafeguardCell(scene, 214, 'COMBAT INPUT', 'LOCKED', COLORS.green));
  root.add(safeguards);

  const footerRail = scene.add.rectangle(0, 274, PAUSE_MENU_BASE_WIDTH - 84, 2, COLORS.cyan, 0.28);
  const footer = scene.add.text(0, 284, 'SELECT RESUME TO RE-ESTABLISH OPERATIVE LINK', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#789eac', fontStyle: 'bold', letterSpacing: 2
  }).setOrigin(0.5, 0);
  const sweep = scene.add.rectangle(-PAUSE_MENU_BASE_WIDTH * 0.5 + 22, 0, 2, PAUSE_MENU_BASE_HEIGHT - 42, COLORS.cyan, 0.05);
  root.add([footerRail, footer, sweep]);

  scene.tweens.add({ targets: root, alpha: 1, duration: 280, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: [title, topRail], alpha: { from: 0.76, to: 1 }, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: [sync, suspensionLed], alpha: { from: 0.28, to: 1 }, duration: 820, yoyo: true, repeat: -1 });
  scene.tweens.add({ targets: sweep, x: PAUSE_MENU_BASE_WIDTH * 0.5 - 22, alpha: { from: 0.015, to: 0.11 }, duration: 3800, repeat: -1, repeatDelay: 2100, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: [leftRing, rightRing], scale: { from: 0.95, to: 1.05 }, alpha: { from: 0.3, to: 0.72 }, duration: 3400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  animatedTargets.push(root, title, topRail, sync, suspensionLed, sweep, leftRing, rightRing);

  const resize = (width: number, height: number): void => {
    const layout = calculatePauseMenuLayout(width, height);
    backdrop.setPosition(layout.centerX, layout.centerY).setDisplaySize(width, height);
    grid.clear();
    grid.lineStyle(1, 0x174257, 0.11);
    const spacing = height < 650 ? 42 : 54;
    for (let x = 0; x <= width; x += spacing) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += spacing) grid.lineBetween(0, y, width, y);
    leftRing.setPosition(width * 0.12, height * 0.74);
    rightRing.setPosition(width * 0.9, height * 0.22);
    root.setPosition(layout.centerX, layout.centerY).setScale(layout.scale);
  };

  const destroy = (): void => {
    scene.tweens.killTweensOf(animatedTargets);
    root.destroy(true);
    backdropRoot.destroy(true);
  };

  resize(scene.scale.width, scene.scale.height);
  return { resize, destroy };
};
