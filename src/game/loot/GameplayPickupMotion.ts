import type { RectSpec, PickupType } from '../types.ts';
import { PICKUP_BALANCE } from '../config/balance/index.ts';

export interface PickupMotionSprite { x: number; y: number; setPosition(x: number, y: number): unknown; }
export interface PickupMotion { velocityX: number; velocityY: number; phase: number; }
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const PICKUP_FLOAT_DRIFT_MIN = 12.5;
const PICKUP_FLOAT_DRIFT_RANGE = 4.5;
const PICKUP_FLOAT_MAX_SPEED = 20;
const PICKUP_SEPARATION_PUSH = 0.2;
const PICKUP_BOUNCE_TRANSFER = 0.5;
const PICKUP_BOUNCE_KICK = 2;

/** Arena's original drift/separation rules, with world geometry supplied by each scene.
 * Weak keys retain no retired pickups. No physics bodies, timers or scene ownership.
 */
export class GameplayPickupMotion extends WeakMap<PickupMotionSprite, PickupMotion> {
  register(sprite: PickupMotionSprite, type: PickupType): void {
    const motionSeed = Math.abs(sprite.x * 0.037 + sprite.y * 0.053 + type.length * 1.731);
    const driftAngle = motionSeed % (Math.PI * 2);
    const driftSpeed = PICKUP_FLOAT_DRIFT_MIN + motionSeed % PICKUP_FLOAT_DRIFT_RANGE;
    this.set(sprite, { velocityX: Math.cos(driftAngle) * driftSpeed,
      velocityY: Math.sin(driftAngle) * driftSpeed, phase: motionSeed % (Math.PI * 2) });
  }
  update<T>(pickups: readonly T[], getSprite: (pickup: T) => PickupMotionSprite, bounds: RectSpec, walls: readonly RectSpec[], now: number, dt: number): void {
    const padding = 24;
    const minimumX = bounds.x + padding;
    const maximumX = bounds.x + bounds.w - padding;
    const minimumY = bounds.y + padding;
    const maximumY = bounds.y + bounds.h - padding;

    for (const pickup of pickups) {
      const motion = this.get(getSprite(pickup));
      if (!motion) continue;

      const breezeX = Math.sin(now * 0.00072 + motion.phase) * 2.8;
      const breezeY = Math.cos(now * 0.00061 + motion.phase * 1.37) * 2.5;
      motion.velocityX = clamp((motion.velocityX + breezeX * dt) * Math.pow(0.994, dt * 60), -PICKUP_FLOAT_MAX_SPEED, PICKUP_FLOAT_MAX_SPEED);
      motion.velocityY = clamp((motion.velocityY + breezeY * dt) * Math.pow(0.994, dt * 60), -PICKUP_FLOAT_MAX_SPEED, PICKUP_FLOAT_MAX_SPEED);

      const previousX = getSprite(pickup).x;
      const previousY = getSprite(pickup).y;
      getSprite(pickup).x += motion.velocityX * dt;
      getSprite(pickup).y += motion.velocityY * dt;

      if (getSprite(pickup).x <= minimumX || getSprite(pickup).x >= maximumX) {
        getSprite(pickup).x = clamp(getSprite(pickup).x, minimumX, maximumX);
        motion.velocityX *= -0.82;
      }
      if (getSprite(pickup).y <= minimumY || getSprite(pickup).y >= maximumY) {
        getSprite(pickup).y = clamp(getSprite(pickup).y, minimumY, maximumY);
        motion.velocityY *= -0.82;
      }

      for (const wall of walls) {
        const left = wall.x - padding;
        const right = wall.x + wall.w + padding;
        const top = wall.y - padding;
        const bottom = wall.y + wall.h + padding;
        if (getSprite(pickup).x <= left || getSprite(pickup).x >= right || getSprite(pickup).y <= top || getSprite(pickup).y >= bottom) continue;
        getSprite(pickup).setPosition(previousX, previousY);
        motion.velocityX *= -0.72;
        motion.velocityY *= -0.72;
        break;
      }
    }
  }

  separate<T>(pickups: readonly T[], getSprite: (pickup: T) => PickupMotionSprite, bounds: RectSpec, walls: readonly RectSpec[]): void {
    const separationDistance = 35;
    const separationDistanceSquared = separationDistance * separationDistance;
    for (let firstIndex = 0; firstIndex < pickups.length; firstIndex += 1) {
      const first = pickups[firstIndex];
      const firstMotion = this.get(getSprite(first));
      if (!firstMotion) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < pickups.length; secondIndex += 1) {
        const second = pickups[secondIndex];
        const secondMotion = this.get(getSprite(second));
        if (!secondMotion) continue;
        let dx = getSprite(second).x - getSprite(first).x;
        let dy = getSprite(second).y - getSprite(first).y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= separationDistanceSquared) continue;
        if (distanceSquared < 0.0001) {
          const fallbackAngle = (firstIndex * 2.399 + secondIndex * 1.713) % (Math.PI * 2);
          dx = Math.cos(fallbackAngle);
          dy = Math.sin(fallbackAngle);
          distanceSquared = 1;
        }
        const distance = Math.sqrt(distanceSquared);
        const normalX = dx / distance;
        const normalY = dy / distance;
        const push = (separationDistance - distance) * PICKUP_SEPARATION_PUSH;
        getSprite(first).x -= normalX * push;
        getSprite(first).y -= normalY * push;
        getSprite(second).x += normalX * push;
        getSprite(second).y += normalY * push;

        const firstNormalSpeed = firstMotion.velocityX * normalX + firstMotion.velocityY * normalY;
        const secondNormalSpeed = secondMotion.velocityX * normalX + secondMotion.velocityY * normalY;
        const impulse = (secondNormalSpeed - firstNormalSpeed) * PICKUP_BOUNCE_TRANSFER;
        firstMotion.velocityX += normalX * impulse - normalX * PICKUP_BOUNCE_KICK;
        firstMotion.velocityY += normalY * impulse - normalY * PICKUP_BOUNCE_KICK;
        secondMotion.velocityX -= normalX * impulse - normalX * PICKUP_BOUNCE_KICK;
        secondMotion.velocityY -= normalY * impulse - normalY * PICKUP_BOUNCE_KICK;
      }
    }

    // Separation can nudge a crowded pickup toward geometry, so finish by projecting it
    // back to the nearest safe edge instead of letting a floating cluster enter a wall.
    const padding = 24;
    for (const pickup of pickups) {
      const motion = this.get(getSprite(pickup));
      if (!motion) continue;
      getSprite(pickup).x = clamp(getSprite(pickup).x, bounds.x + padding, bounds.x + bounds.w - padding);
      getSprite(pickup).y = clamp(getSprite(pickup).y, bounds.y + padding, bounds.y + bounds.h - padding);
      for (const wall of walls) {
        const left = wall.x - padding;
        const right = wall.x + wall.w + padding;
        const top = wall.y - padding;
        const bottom = wall.y + wall.h + padding;
        if (getSprite(pickup).x <= left || getSprite(pickup).x >= right || getSprite(pickup).y <= top || getSprite(pickup).y >= bottom) continue;
        const distanceLeft = getSprite(pickup).x - left;
        const distanceRight = right - getSprite(pickup).x;
        const distanceTop = getSprite(pickup).y - top;
        const distanceBottom = bottom - getSprite(pickup).y;
        const nearestEdge = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);
        if (nearestEdge === distanceLeft) {
          getSprite(pickup).x = left;
          motion.velocityX = -Math.abs(motion.velocityX);
        } else if (nearestEdge === distanceRight) {
          getSprite(pickup).x = right;
          motion.velocityX = Math.abs(motion.velocityX);
        } else if (nearestEdge === distanceTop) {
          getSprite(pickup).y = top;
          motion.velocityY = -Math.abs(motion.velocityY);
        } else {
          getSprite(pickup).y = bottom;
          motion.velocityY = Math.abs(motion.velocityY);
        }
        break;
      }
    }
  }

}

export const energyPickupBlocked = (energy: number, maximum: number, overdrive: boolean): boolean =>
  overdrive ? energy >= maximum * 2 : energy > maximum * (1 - PICKUP_BALANCE.energyAutoCollectMissingFraction);

export function findGameplayPickupLanding(originX: number, originY: number, angle: number, distance: number,
  bounds: RectSpec, blocked: (x: number, y: number) => boolean): { x: number; y: number } {
  for (let attempt = 0; attempt < 14; attempt++) {
    const candidateAngle = angle + attempt * .47;
    const candidateDistance = Math.max(24, distance - attempt * 3);
    const x = clamp(originX + Math.cos(candidateAngle) * candidateDistance, bounds.x + 36, bounds.x + bounds.w - 36);
    const y = clamp(originY + Math.sin(candidateAngle) * candidateDistance, bounds.y + 36, bounds.y + bounds.h - 36);
    if (!blocked(x, y)) return { x, y };
  }
  return { x: originX, y: originY };
}

/** Collection precedes attraction, exactly as in Arena. Returns true only in range. */
export function collectOrAttractPickup(sprite: PickupMotionSprite, playerX: number, playerY: number,
  radius: number, attractionRadius: number, pullSpeed: number, dt: number, available: boolean): boolean {
  if (!available) return false;
  const dx = playerX - sprite.x, dy = playerY - sprite.y;
  const squared = dx * dx + dy * dy;
  if (squared < radius * radius) return true;
  if (pullSpeed > 0 && squared < attractionRadius * attractionRadius) {
    const distance = Math.sqrt(squared);
    const step = Math.min(Math.max(0, distance - radius * .7), pullSpeed * dt);
    if (step > 0 && distance > 0) { sprite.x += dx / distance * step; sprite.y += dy / distance * step; }
  }
  return false;
}
