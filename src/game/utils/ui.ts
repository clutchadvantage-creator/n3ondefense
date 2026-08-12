import Phaser from 'phaser';
import { COLORS } from '../config/constants';
import { AudioManager } from '../systems/AudioManager';

interface ButtonAudioState { enabled: boolean }
const buttonAudioStates = new WeakMap<Phaser.GameObjects.Container, ButtonAudioState>();

export const createButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  onClick: () => unknown,
  width = 220
): Phaser.GameObjects.Container => {
  const bg = scene.add.rectangle(0, 0, width, 40, 0x121a2b, 0.95).setStrokeStyle(2, COLORS.cyan, 0.9);
  const labelFontSize = text.length > 28 || (width < 190 && text.length > 20) ? 14 : 16;
  const label = scene.add.text(0, 0, text, {
    color: '#d6f7ff',
    fontSize: `${labelFontSize}px`,
    fontFamily: 'Rajdhani, sans-serif',
    align: 'center',
    lineSpacing: -2,
    wordWrap: { width: Math.max(40, width - 20), useAdvancedWrap: true }
  }).setOrigin(0.5).setMaxLines(2);

  const hit = scene.add.rectangle(0, 0, width, 40, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
  hit.setName('button-hit');
  const state: ButtonAudioState = { enabled: true };
  hit.on('pointerover', () => bg.setStrokeStyle(2, state.enabled ? COLORS.pink : 0xff7f9f, 1));
  hit.on('pointerout', () => bg.setStrokeStyle(2, COLORS.cyan, 0.9));
  hit.on('pointerdown', () => {
    if (!state.enabled) {
      AudioManager.get().playSfx('itemLocked');
      return;
    }
    const accepted = onClick();
    AudioManager.get().playSfx(accepted === false ? 'itemLocked' : 'menu');
  });

  const button = scene.add.container(x, y, [bg, label, hit]);
  buttonAudioStates.set(button, state);
  return button;
};

export const disableButton = (button: Phaser.GameObjects.Container): void => {
  const state = buttonAudioStates.get(button);
  if (state) state.enabled = false;
  button.alpha = 0.7;
};

export const enableButton = (button: Phaser.GameObjects.Container): void => {
  const state = buttonAudioStates.get(button);
  if (state) state.enabled = true;
  for (const child of button.list) {
    if (child.name === 'button-hit' && 'setInteractive' in child && typeof child.setInteractive === 'function') {
      child.setInteractive({ useHandCursor: true });
    }
  }
  button.alpha = 1;
};
