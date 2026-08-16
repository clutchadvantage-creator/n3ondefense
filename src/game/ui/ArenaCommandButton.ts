import type Phaser from 'phaser';

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CssCommandLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Converts logical Phaser screen coordinates directly into DOM overlay pixels. */
export const calculateArenaCommandLayout = (
  canvas: ViewportRect,
  overlay: ViewportRect,
  logicalWidth: number,
  logicalHeight: number,
  x: number,
  y: number,
  width: number,
  height: number
): CssCommandLayout => {
  const scaleX = canvas.width / Math.max(1, logicalWidth);
  const scaleY = canvas.height / Math.max(1, logicalHeight);
  return {
    left: canvas.left - overlay.left + x * scaleX,
    top: canvas.top - overlay.top + y * scaleY,
    width: width * scaleX,
    height: height * scaleY
  };
};

/**
 * DOM-backed Arena command for modal transition points. It deliberately does
 * not participate in the scrolling/zoomed world camera, eliminating the
 * pointer/render offset that Phaser Containers can exhibit in ArenaScene.
 */
export class ArenaCommandButton {
  private readonly scene: Phaser.Scene;
  private readonly element: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly handleClick: () => void;

  constructor(
    scene: Phaser.Scene,
    label: string,
    onClick: () => void
  ) {
    this.scene = scene;
    const overlay = document.querySelector<HTMLElement>('#game-ui-root');
    if (!overlay) throw new Error('Missing game UI root for Arena command.');
    this.overlay = overlay;
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'arena-command-button';
    this.element.textContent = label;
    this.element.setAttribute('aria-label', label);
    this.handleClick = () => {
      if (this.element.disabled) return;
      this.element.disabled = true;
      onClick();
    };
    this.element.addEventListener('click', this.handleClick);
    this.overlay.append(this.element);
  }

  setGamePosition(x: number, y: number, width = 280, height = 48): void {
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const overlayRect = this.overlay.getBoundingClientRect();
    const layout = calculateArenaCommandLayout(
      canvasRect,
      overlayRect,
      this.scene.scale.width,
      this.scene.scale.height,
      x,
      y,
      width,
      height
    );
    this.element.style.left = `${layout.left}px`;
    this.element.style.top = `${layout.top}px`;
    this.element.style.width = `${layout.width}px`;
    this.element.style.height = `${layout.height}px`;
    this.element.style.fontSize = `${Math.max(14, 18 * Math.min(layout.width / width, layout.height / height))}px`;
  }

  destroy(): void {
    this.element.removeEventListener('click', this.handleClick);
    this.element.remove();
  }
}
