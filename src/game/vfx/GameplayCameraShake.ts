import type Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { explosionCameraImpulse, type ExplosionImpulseSource } from './ExplosionCameraImpulse.ts';

/** Respect the active profile at the event boundary, including after Options.
 * Authored durations/intensities and Phaser's restart behavior are preserved. */
export const shakeGameplayCamera = (
  scene: Phaser.Scene, duration: number, intensity: number, force = true
): boolean => {
  if (!SaveSystem.get().settings.screenShake) return false;
  scene.cameras.main.shake(duration, intensity, force);
  return true;
};

export const applyExplosionCameraImpulse = (scene: Phaser.Scene, source: ExplosionImpulseSource): boolean => {
  const impulse = explosionCameraImpulse(source);
  if (!impulse) return false;
  // force=false keeps rapid chains from repeatedly restarting the same shake.
  return shakeGameplayCamera(scene, impulse.durationMs, impulse.intensity, false);
};
