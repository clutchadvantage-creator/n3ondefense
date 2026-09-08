import type Phaser from 'phaser';

export const GAMEPLAY_CAMERA_ZOOM = 0.9;
export const GAMEPLAY_CAMERA_FOLLOW_LERP = 0.08;

/** Same native follow contract in every combat world. Bounds and short-lived
 * effects remain owned by the scene; ordinary movement never changes zoom. */
export const followGameplayPlayer = (
  camera: Phaser.Cameras.Scene2D.Camera,
  player: Phaser.GameObjects.GameObject & { x: number; y: number }
): void => {
  camera.setZoom(GAMEPLAY_CAMERA_ZOOM);
  camera.startFollow(player, true, GAMEPLAY_CAMERA_FOLLOW_LERP, GAMEPLAY_CAMERA_FOLLOW_LERP);
};
