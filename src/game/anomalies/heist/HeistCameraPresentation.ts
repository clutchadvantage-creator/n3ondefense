import Phaser from 'phaser';
import type { RectSpec } from '../../types.ts';

const CORRIDOR_ZOOM = 1.18;
const OPEN_AREA_ZOOM = 1.08;
const CORRIDOR_LOOK_AHEAD = 112;
const OPEN_AREA_LOOK_AHEAD = 78;
const VERTICAL_COMPOSITION_BIAS = 46;

const smoothingFactor = (rate: number, deltaMs: number): number =>
  1 - Math.exp(-rate * Math.min(50, Math.max(0, deltaMs)) / 1000);

/**
 * HEIST-only elevated chase presentation. The camera is positioned explicitly
 * before any screen-to-world aiming samples are taken, then pre-rendered once
 * so mouse, pointer-lock, controller, and placement transforms all use the
 * exact camera matrix that will render the frame.
 */
export class HeistCameraPresentation {
  private directionX = 0;
  private directionY = -1;
  private centerX: number;
  private centerY: number;
  private zoom = CORRIDOR_ZOOM;

  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly player: Phaser.GameObjects.Components.Transform & { body?: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | null },
    private readonly vaultBounds: RectSpec
  ) {
    this.camera.stopFollow();
    this.centerX = player.x;
    this.centerY = player.y - VERTICAL_COMPOSITION_BIAS;
    this.applyCamera();
  }

  update(deltaMs: number, openArea: boolean): void {
    const body = this.player.body;
    const velocityX = body && 'velocity' in body ? body.velocity.x : 0;
    const velocityY = body && 'velocity' in body ? body.velocity.y : 0;
    const velocityMagnitudeSquared = velocityX * velocityX + velocityY * velocityY;
    const facingX = Math.cos(this.player.rotation);
    const facingY = Math.sin(this.player.rotation);
    let desiredX = facingX;
    let desiredY = facingY;

    // Movement contributes to framing while facing remains dominant, which
    // keeps strafing combat readable and prevents abrupt camera reversals.
    if (velocityMagnitudeSquared > 24 * 24) {
      const inverseVelocity = 1 / Math.sqrt(velocityMagnitudeSquared);
      desiredX = facingX * 0.68 + velocityX * inverseVelocity * 0.32;
      desiredY = facingY * 0.68 + velocityY * inverseVelocity * 0.32;
      const desiredMagnitude = Math.hypot(desiredX, desiredY) || 1;
      desiredX /= desiredMagnitude;
      desiredY /= desiredMagnitude;
    }

    const directionBlend = smoothingFactor(7.2, deltaMs);
    this.directionX = Phaser.Math.Linear(this.directionX, desiredX, directionBlend);
    this.directionY = Phaser.Math.Linear(this.directionY, desiredY, directionBlend);
    const directionMagnitude = Math.hypot(this.directionX, this.directionY) || 1;
    this.directionX /= directionMagnitude;
    this.directionY /= directionMagnitude;

    const insideVault = this.player.x >= this.vaultBounds.x && this.player.x <= this.vaultBounds.x + this.vaultBounds.w
      && this.player.y >= this.vaultBounds.y && this.player.y <= this.vaultBounds.y + this.vaultBounds.h;
    const widen = openArea || insideVault;
    const targetZoom = widen ? OPEN_AREA_ZOOM : CORRIDOR_ZOOM;
    const lookAhead = widen ? OPEN_AREA_LOOK_AHEAD : CORRIDOR_LOOK_AHEAD;
    const targetCenterX = this.player.x + this.directionX * lookAhead;
    const targetCenterY = this.player.y + this.directionY * lookAhead - VERTICAL_COMPOSITION_BIAS;
    const positionBlend = smoothingFactor(8.4, deltaMs);
    this.centerX = Phaser.Math.Linear(this.centerX, targetCenterX, positionBlend);
    this.centerY = Phaser.Math.Linear(this.centerY, targetCenterY, positionBlend);
    this.zoom = Phaser.Math.Linear(this.zoom, targetZoom, smoothingFactor(3.6, deltaMs));
    this.applyCamera();
  }

  destroy(): void {
    this.camera.stopFollow();
  }

  private applyCamera(): void {
    this.camera.setZoom(this.zoom);
    this.camera.setScroll(this.centerX - this.camera.width * 0.5, this.centerY - this.camera.height * 0.5);
    // CameraManager normally performs this after Scene.update. Doing it here
    // is intentional: all aim conversions later in the same update observe
    // the new scroll/zoom instead of a one-frame-old transform.
    this.camera.preRender();
  }
}
