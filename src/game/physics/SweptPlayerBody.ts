import Phaser from 'phaser';
import type { RectSpec } from '../types.ts';
import { resolveSweptCircleMotion } from './SweptCircleCollision.ts';

/** Arcade's player body integration with a sweep before committing displacement.
 * World.step calls this for EVERY physics substep, before overlaps/colliders and
 * before postUpdate synchronizes the Sprite. Both worlds share this contract. */
export class SweptPlayerBody extends Phaser.Physics.Arcade.Body {
  // Phaser uses these step deltas for separation and postUpdate, but omits them
  // from its public declarations. They are initialized by the Body constructor.
  declare _dx: number;
  declare _dy: number;
  private readonly blockers: RectSpec[] = [];
  private readonly rectReserve: RectSpec[] = [];

  override update(delta: number): void {
    if (!this.moves || this.directControl || delta <= 0) { super.update(delta); return; }
    this.prev.copy(this.position);
    this.world.updateMotion(this, delta);
    const startX = this.position.x + this.halfWidth;
    const startY = this.position.y + this.halfHeight;
    const dx = this.velocity.x * delta;
    const dy = this.velocity.y * delta;
    this.blockers.length = 0;
    const append = (x: number, y: number, w: number, h: number): void => {
      const index = this.blockers.length;
      const rect = this.rectReserve[index] ?? (this.rectReserve[index] = { x, y, w, h });
      rect.x = x; rect.y = y; rect.w = w; rect.h = h;
      this.blockers.push(rect);
    };
    if (dx !== 0 || dy !== 0) {
      for (const body of this.world.staticBodies.entries) {
        if (body.enable && !body.checkCollision.none) append(body.x, body.y, body.width, body.height);
      }
      if (this.collideWorldBounds) {
        const b = this.world.bounds;
        append(b.x - 1, b.y - 1, b.width + 2, 1);
        append(b.x - 1, b.bottom, b.width + 2, 1);
        append(b.x - 1, b.y - 1, 1, b.height + 2);
        append(b.right, b.y - 1, 1, b.height + 2);
      }
    }
    const result = resolveSweptCircleMotion(startX, startY, startX + dx, startY + dy,
      this.isCircle ? this.halfWidth : Math.max(this.halfWidth, this.halfHeight), this.blockers);
    this.position.set(result.x - this.halfWidth, result.y - this.halfHeight);
    this.newVelocity.set(this.position.x - this.prev.x, this.position.y - this.prev.y);
    this._dx = this.newVelocity.x;
    this._dy = this.newVelocity.y;
    if (result.tangentX !== undefined && result.tangentY !== undefined) {
      this.velocity.set(result.tangentX / delta, result.tangentY / delta);
    } else {
      if (result.normalX && this.velocity.x * result.normalX < 0) this.velocity.x = 0;
      if (result.normalY && this.velocity.y * result.normalY < 0) this.velocity.y = 0;
    }
    this.updateCenter();
    this.angle = Math.atan2(this.velocity.y, this.velocity.x);
    this.speed = this.velocity.length();
    if (this.collideWorldBounds && this.checkWorldBounds() && this.onWorldBounds) {
      const b = this.blocked;
      this.world.emit(Phaser.Physics.Arcade.Events.WORLD_BOUNDS, this, b.up, b.down, b.left, b.right);
    }
  }
}
