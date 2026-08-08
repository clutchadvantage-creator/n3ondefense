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

interface ModalLayout {
  root: Phaser.GameObjects.Container;
  buttonPositions: Array<{ x: number; y: number; width: number }>;
}

const createModalRoot = (
  scene: Phaser.Scene,
  title: string,
  body: string,
  requestedWidth: number,
  minimumHeight: number,
  requestedButtonWidths: number[]
): ModalLayout => {
  const { width: sw, height: sh } = scene.scale;
  const viewportPadding = Phaser.Math.Clamp(Math.min(sw, sh) * 0.05, 22, 46);
  const width = Math.max(260, Math.min(requestedWidth, sw - viewportPadding * 2));
  const horizontalPadding = Phaser.Math.Clamp(width * 0.07, 24, 52);
  const usableWidth = width - horizontalPadding * 2;
  const buttonGap = 16;
  const buttonRows: Array<Array<{ index: number; width: number }>> = [];
  requestedButtonWidths.forEach((requestedButtonWidth, index) => {
    const buttonWidth = Math.min(requestedButtonWidth, usableWidth);
    const currentRow = buttonRows.at(-1);
    const occupied = currentRow?.reduce((sum, item) => sum + item.width, 0) ?? 0;
    const required = occupied + (currentRow?.length ? buttonGap : 0) + buttonWidth;
    if (!currentRow || required > usableWidth) buttonRows.push([{ index, width: buttonWidth }]);
    else currentRow.push({ index, width: buttonWidth });
  });

  const root = scene.add.container(0, 0).setDepth(4000).setScrollFactor(0);
  const backdrop = scene.add.rectangle(sw / 2, sh / 2, sw, sh, 0x010409, 0.82).setScrollFactor(0).setInteractive();
  const titleText = scene.add.text(sw / 2, 0, title, {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: `${Phaser.Math.Clamp(sw * 0.027, 22, 30)}px`,
    color: '#64f4ff',
    align: 'center',
    wordWrap: { width: usableWidth, useAdvancedWrap: true }
  }).setOrigin(0.5, 0).setScrollFactor(0);
  const bodyText = scene.add.text(sw / 2, 0, body, {
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: `${Phaser.Math.Clamp(sw * 0.019, 17, 22)}px`,
    color: '#ddf7ff',
    align: 'center',
    lineSpacing: 5,
    wordWrap: { width: usableWidth, useAdvancedWrap: true }
  }).setOrigin(0.5, 0).setScrollFactor(0);

  const buttonAreaHeight = Math.max(1, buttonRows.length) * 56;
  const contentHeight = 30 + titleText.height + 24 + bodyText.height + 30 + buttonAreaHeight + 24;
  const height = Math.min(Math.max(minimumHeight, contentHeight), sh - viewportPadding * 2);
  const panelTop = (sh - height) / 2;
  const panel = scene.add.rectangle(sw / 2, sh / 2, width, height, 0x0b1320, 0.98)
    .setStrokeStyle(2, 0x55e9ff, 0.95).setScrollFactor(0);
  titleText.setY(panelTop + 30);
  bodyText.setY(titleText.y + titleText.height + 24);

  const buttonPositions = requestedButtonWidths.map(() => ({ x: sw / 2, y: 0, width: 0 }));
  const firstButtonY = panelTop + height - 24 - buttonAreaHeight + 20;
  buttonRows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + buttonGap * Math.max(0, row.length - 1);
    let cursorX = sw / 2 - rowWidth / 2;
    row.forEach((item) => {
      buttonPositions[item.index] = { x: cursorX + item.width / 2, y: firstButtonY + rowIndex * 56, width: item.width };
      cursorX += item.width + buttonGap;
    });
  });
  root.add([backdrop, panel, titleText, bodyText]);
  return { root, buttonPositions };
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
  const layout = createModalRoot(scene, title, body, 780, 360, [200, 200]);
  const root = layout.root;
  const confirmPosition = layout.buttonPositions[0];
  const cancelPosition = layout.buttonPositions[1];
  const confirm = createButton(scene, confirmPosition.x, confirmPosition.y, confirmLabel, () => {
    root.destroy(true);
    onClose?.();
    onConfirm();
  }, confirmPosition.width);
  const cancel = createButton(scene, cancelPosition.x, cancelPosition.y, cancelLabel, () => {
    root.destroy(true);
    onClose?.();
  }, cancelPosition.width);
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
  const layout = createModalRoot(scene, title, body, 820, 420, actions.map((action) => action.width ?? 210));
  const root = layout.root;
  const buttons: Phaser.GameObjects.Container[] = [];
  actions.forEach((action, index) => {
    const position = layout.buttonPositions[index];
    const button = createButton(scene, position.x, position.y, action.label, () => {
      root.destroy(true);
      onClose?.();
      action.onClick();
    }, position.width);
    button.setDepth(4001).setScrollFactor(0);
    buttons.push(button);
  });
  root.add(buttons);
  return {
    destroy: () => root.destroy(true)
  };
};
