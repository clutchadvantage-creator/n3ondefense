import Phaser from 'phaser';
import { createButton } from './ui';

export interface LocalModalHandle {
  destroy(): void;
}

export const pickJsonFile = async (): Promise<string | null> => {
  return await new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
};

const createModalRoot = (scene: Phaser.Scene, title: string, body: string, width = 760, height = 420): Phaser.GameObjects.Container => {
  const { width: sw, height: sh } = scene.scale;
  const root = scene.add.container(0, 0).setDepth(4000).setScrollFactor(0);
  const backdrop = scene.add.rectangle(sw / 2, sh / 2, sw, sh, 0x010409, 0.82).setScrollFactor(0);
  const panel = scene.add.rectangle(sw / 2, sh / 2, width, height, 0x0b1320, 0.98).setStrokeStyle(2, 0x55e9ff, 0.95).setScrollFactor(0);
  const titleText = scene.add.text(sw / 2, sh / 2 - height / 2 + 32, title, {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: '30px',
    color: '#64f4ff'
  }).setOrigin(0.5).setScrollFactor(0);
  const bodyText = scene.add.text(sw / 2, sh / 2 - 36, body, {
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '22px',
    color: '#ddf7ff',
    align: 'center',
    wordWrap: { width: width - 80 }
  }).setOrigin(0.5).setScrollFactor(0);
  root.add([backdrop, panel, titleText, bodyText]);
  return root;
};

export const showConfirmDialog = (
  scene: Phaser.Scene,
  title: string,
  body: string,
  confirmLabel: string,
  onConfirm: () => void,
  cancelLabel = 'Cancel',
  onClose?: () => void
): LocalModalHandle => {
  const root = createModalRoot(scene, title, body, 780, 360);
  const { width, height } = scene.scale;
  const confirm = createButton(scene, width / 2 - 120, height / 2 + 118, confirmLabel, () => {
    root.destroy(true);
    onClose?.();
    onConfirm();
  }, 200);
  const cancel = createButton(scene, width / 2 + 120, height / 2 + 118, cancelLabel, () => {
    root.destroy(true);
    onClose?.();
  }, 200);
  confirm.setDepth(4001).setScrollFactor(0);
  cancel.setDepth(4001).setScrollFactor(0);
  root.add([confirm, cancel]);
  return {
    destroy: () => root.destroy(true)
  };
};

export const showInfoModal = (
  scene: Phaser.Scene,
  title: string,
  body: string,
  actions: Array<{ label: string; onClick: () => void; width?: number }>,
  onClose?: () => void
): LocalModalHandle => {
  const root = createModalRoot(scene, title, body, 820, 420);
  const { width, height } = scene.scale;
  const totalWidth = actions.reduce((sum, action) => sum + (action.width ?? 210) + 12, 0) - 12;
  let cursorX = width / 2 - totalWidth / 2;
  const buttons: Phaser.GameObjects.Container[] = [];
  for (const action of actions) {
    const buttonWidth = action.width ?? 210;
    const button = createButton(scene, cursorX + buttonWidth / 2, height / 2 + 132, action.label, () => {
      root.destroy(true);
      onClose?.();
      action.onClick();
    }, buttonWidth);
    button.setDepth(4001).setScrollFactor(0);
    buttons.push(button);
    cursorX += buttonWidth + 12;
  }
  root.add(buttons);
  return {
    destroy: () => root.destroy(true)
  };
};
