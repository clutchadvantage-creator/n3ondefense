import Phaser from 'phaser';
import { COLORS } from '../config/constants';

export const createButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  onClick: () => void,
  width = 220
): Phaser.GameObjects.Container => {
  const bg = scene.add.rectangle(0, 0, width, 40, 0x121a2b, 0.95).setStrokeStyle(2, COLORS.cyan, 0.9);
  const label = scene.add.text(0, 0, text, {
    color: '#d6f7ff',
    fontSize: '16px',
    fontFamily: 'Rajdhani, sans-serif'
  }).setOrigin(0.5);

  const hit = scene.add.rectangle(0, 0, width, 40, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
  hit.setName('button-hit');
  hit.on('pointerover', () => bg.setStrokeStyle(2, COLORS.pink, 1));
  hit.on('pointerout', () => bg.setStrokeStyle(2, COLORS.cyan, 0.9));
  hit.on('pointerdown', onClick);

  return scene.add.container(x, y, [bg, label, hit]);
};

export const disableButton = (button: Phaser.GameObjects.Container): void => {
  for (const child of button.list) {
    if ('disableInteractive' in child && typeof child.disableInteractive === 'function') {
      child.disableInteractive();
    }
  }
  button.alpha = 0.7;
};

export const enableButton = (button: Phaser.GameObjects.Container): void => {
  for (const child of button.list) {
    if (child.name === 'button-hit' && 'setInteractive' in child && typeof child.setInteractive === 'function') {
      child.setInteractive({ useHandCursor: true });
    }
  }
  button.alpha = 1;
};
