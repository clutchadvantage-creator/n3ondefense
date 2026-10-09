import Phaser from 'phaser';

export const TERMINAL_COLORS = { cyan: 0x55eaff, magenta: 0xff65c8, green: 0x74ffb2, amber: 0xffb45f, muted: 0x577383 } as const;
export interface TerminalRect { x: number; y: number; width: number; height: number }

/** Static structural detail derived from the Mod Collection's rails and inset glass.
 * One graphics object, no input surface, timers or continuously animated layers. */
export const addTerminalDetail = (scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  rect: TerminalRect, accent: number = TERMINAL_COLORS.cyan, compact = false): Phaser.GameObjects.Graphics => {
  const { x, y, width, height } = rect;
  const detail = scene.add.graphics().setName('terminal-detail');
  const inset = compact ? 4 : 8;
  const bracket = Math.min(compact ? 9 : 18, width / 5, height / 4);
  detail.lineStyle(1, accent, 0.2).strokeRect(x + inset, y + inset, width - inset * 2, height - inset * 2);
  detail.lineStyle(compact ? 1 : 2, accent, 0.85);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = x + (sx < 0 ? 1 : width - 1), cy = y + (sy < 0 ? 1 : height - 1);
    detail.lineBetween(cx, cy - sy * bracket, cx, cy);
    detail.lineBetween(cx, cy, cx - sx * bracket, cy);
  }
  detail.fillStyle(accent, 0.55).fillRect(x + width * 0.18, y + 2, width * 0.38, 2);
  if (!compact) {
    detail.lineStyle(1, accent, 0.24).lineBetween(x + width * 0.55, y + height - 5, x + width - 24, y + height - 5);
    for (let i = 0; i < 3; i++) detail.fillStyle(accent, 0.25 + i * 0.13).fillRect(x + width - 22 + i * 5, y + height - 7, 3, 3);
  }
  parent.add(detail);
  return detail;
};

export const createTerminalPanel = (scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  rect: TerminalRect, accent: number = TERMINAL_COLORS.cyan): Phaser.GameObjects.Container => {
  const root = scene.add.container(rect.x, rect.y);
  root.add(scene.add.rectangle(5, 6, rect.width, rect.height, 0x000000, 0.45).setOrigin(0));
  root.add(scene.add.rectangle(0, 0, rect.width, rect.height, 0x071621, 0.97).setOrigin(0).setStrokeStyle(1, accent, 0.6));
  root.add(scene.add.rectangle(9, 9, rect.width - 18, 40, accent, 0.07).setOrigin(0));
  addTerminalDetail(scene, root, { x: 0, y: 0, width: rect.width, height: rect.height }, accent);
  parent.add(root);
  return root;
};
