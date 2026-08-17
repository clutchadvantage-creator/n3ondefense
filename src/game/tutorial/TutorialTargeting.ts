import type { TutorialTargetBounds } from './TutorialTypes.ts';

export interface TutorialRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
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
