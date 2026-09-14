import Phaser from 'phaser';
import { Enemy, type EnemyStats } from '../Enemy.ts';
import type { RectSpec } from '../../types.ts';
import { ArenaDroneStrafe, DroneBurstWeapon, DRONE_VARIANTS, type DroneFlightState, type DroneMovement, type DroneVariant } from './DroneFlight.ts';
/** Shared enemy body and damage pipeline, with replaceable flight and weapon components. */
export class FlyingDrone extends Enemy {
  readonly flight: DroneMovement;
  readonly weapon = new DroneBurstWeapon();
  readonly variant: DroneVariant;
  private readonly flightState: DroneFlightState = { x: 0, y: 0, vx: 0, vy: 0 };
  private readonly marker: Phaser.GameObjects.Image | null;
  private elapsedMs = 0;
  constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats, sequence: number, variant: DroneVariant = 'standard', movement?: DroneMovement) {
    super(scene, x, y, DRONE_VARIANTS[variant].texture, stats);
    this.variant = variant;
    this.flight = movement ?? new ArenaDroneStrafe(sequence);
    this.setDepth(10).setAlpha(.3);
    this.setVisualTintOverride(null);
    this.marker = variant === 'target' ? scene.add.image(x, y, 'enemy-drone-target').setDepth(11) : null;
    // Sprite destruction (including scene shutdown) owns the optional marker.
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.marker?.destroy());
  }
  updateFlight(now: number, dt: number, targetX: number, targetY: number, bounds: RectSpec, cadenceMs: number, fire: (angle: number) => void): void {
    const delta = Math.max(0, Math.min(.05, dt));
    this.elapsedMs += delta * 1000;
    if (now < this.disabledUntil) {
      this.setVelocity(0, 0);
      return;
    }
    const body = this.body as Phaser.Physics.Arcade.Body;
    const s = this.flightState;
    s.x = this.x;
    s.y = this.y;
    s.vx = body.velocity.x;
    s.vy = body.velocity.y;
    this.flight.update(s, targetX, targetY, this.effectiveSpeed(this.stats.speed, now) * DRONE_VARIANTS[this.variant].speed, bounds, delta);
    if (s.x !== this.x || s.y !== this.y)
      body.reset(s.x, s.y);
    this.setVelocity(s.vx, s.vy);
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    this.setRotation(angle + Math.PI / 2);
    this.setAlpha(Math.min(1, .3 + this.elapsedMs / 600));
    this.marker?.setPosition(this.x, this.y).setRotation(-this.elapsedMs * .0004)
      .setAlpha(.65 + .25 * Math.sin(this.elapsedMs * .008));
    this.weapon.update(this.elapsedMs, angle, Math.hypot(targetX - this.x, targetY - this.y) < 560, cadenceMs, fire);
  }
}
