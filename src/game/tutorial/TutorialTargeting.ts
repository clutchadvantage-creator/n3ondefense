import type { TutorialTargetBounds } from './TutorialTypes.ts';

export interface TutorialRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TutorialCalloutPosition = 'above' | 'below' | 'center';

export function unionTutorialBounds(bounds: readonly TutorialRectLike[]): TutorialTargetBounds | null {
  if (!bounds.length) return null;
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Keeps a tutorial callout wholly inside its UI mount, even for full-height targets. */
export function resolveTutorialCalloutPlacement(
  viewportWidth: number,
  viewportHeight: number,
  target: TutorialRectLike,
  calloutWidth: number,
  calloutHeight: number,
  gap = 26,
  safeMargin = 16
): { x: number; y: number; position: TutorialCalloutPosition } {
  const halfWidth = Math.min(calloutWidth / 2, Math.max(0, viewportWidth / 2 - safeMargin));
  const x = Math.max(safeMargin + halfWidth, Math.min(viewportWidth - safeMargin - halfWidth, target.x + target.width / 2));
  const targetBottom = target.y + target.height;
  if (targetBottom + gap + calloutHeight <= viewportHeight - safeMargin) {
    return { x, y: targetBottom + gap, position: 'below' };
  }
  if (target.y - gap - calloutHeight >= safeMargin) {
    return { x, y: target.y - gap, position: 'above' };
  }
  return {
    x: Math.max(safeMargin + halfWidth, Math.min(viewportWidth - safeMargin - halfWidth, viewportWidth / 2)),
    y: viewportHeight / 2,
    position: 'center'
  };
}

/** Projects Phaser scene coordinates into CSS viewport coordinates. */
export function projectTutorialBoundsToViewport(
  bounds: TutorialRectLike,
  canvas: TutorialRectLike,
  sceneWidth: number,
  sceneHeight: number
): TutorialTargetBounds {
  const scaleX = canvas.width / Math.max(1, sceneWidth);
  const scaleY = canvas.height / Math.max(1, sceneHeight);
  return {
    x: canvas.x + bounds.x * scaleX,
    y: canvas.y + bounds.y * scaleY,
    width: bounds.width * scaleX,
    height: bounds.height * scaleY
  };
}

/**
 * Converts viewport bounds into the tutorial mount's local CSS coordinates.
 * This prevents spotlight drift when the game is embedded, offset, or scaled.
 */
export function projectViewportBoundsToTutorialMount(
  bounds: TutorialTargetBounds,
  mount: TutorialRectLike,
  mountWidth: number,
  mountHeight: number
): TutorialTargetBounds {
  const scaleX = mountWidth / Math.max(1, mount.width);
  const scaleY = mountHeight / Math.max(1, mount.height);
  return {
    x: (bounds.x - mount.x) * scaleX,
    y: (bounds.y - mount.y) * scaleY,
    width: bounds.width * scaleX,
    height: bounds.height * scaleY
  };
}
