import type { RectSpec } from '../types.ts';

export interface SweptCircleResolution {
  hit: boolean;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
  /** Full requested displacement projected onto curved contact tangents. */
  tangentX?: number;
  tangentY?: number;
}

interface SegmentHit {
  time: number;
  normalX: number;
  normalY: number;
}

const AXIS_EPSILON = 0.000_001;
const CONTACT_SKIN = 0.35;

const segmentExpandedRectHit = (
  startX: number,
  startY: number,
  deltaX: number,
  deltaY: number,
  radius: number,
  rect: RectSpec
): SegmentHit | null => {
  const minX = rect.x - radius;
  const maxX = rect.x + rect.w + radius;
  const minY = rect.y - radius;
  const maxY = rect.y + rect.h + radius;

  // The regular Arcade collider remains responsible for resolving a body that
  // already begins a step embedded. This sweep owns only high-speed crossings.
  if (startX > minX + AXIS_EPSILON && startX < maxX - AXIS_EPSILON
    && startY > minY + AXIS_EPSILON && startY < maxY - AXIS_EPSILON) return null;

  let enter = 0;
  let exit = 1;
  let normalX = 0;
  let normalY = 0;

  const testAxis = (position: number, delta: number, minimum: number, maximum: number, xAxis: boolean): boolean => {
    if (Math.abs(delta) <= AXIS_EPSILON) return position >= minimum && position <= maximum;
    let near = (minimum - position) / delta;
    let far = (maximum - position) / delta;
    let nearNormal = -1;
    if (near > far) {
      [near, far] = [far, near];
      nearNormal = 1;
    }
    if (near > enter + AXIS_EPSILON) {
      enter = near;
      normalX = xAxis ? nearNormal : 0;
      normalY = xAxis ? 0 : nearNormal;
    } else if (Math.abs(near - enter) <= AXIS_EPSILON) {
      if (xAxis) normalX = nearNormal;
      else normalY = nearNormal;
    }
    exit = Math.min(exit, far);
    return enter <= exit + AXIS_EPSILON;
  };

  if (!testAxis(startX, deltaX, minX, maxX, true)) return null;
  if (!testAxis(startY, deltaY, minY, maxY, false)) return null;
  if (enter < -AXIS_EPSILON || enter > 1 + AXIS_EPSILON || exit < 0) return null;
  if (normalX === 0 && normalY === 0) return null;
  return { time: Math.max(0, enter), normalX, normalY };
};

const nearestHit = (
  startX: number,
  startY: number,
  deltaX: number,
  deltaY: number,
  radius: number,
  rects: readonly RectSpec[]
): SegmentHit | null => {
  let nearest: SegmentHit | null = null;
  for (const rect of rects) {
    const hit = segmentCircleRectHit(startX, startY, deltaX, deltaY, radius, rect);
    if (!hit || (nearest && hit.time >= nearest.time)) continue;
    nearest = hit;
  }
  return nearest;
};

/** The expanded box is a broad phase only. Its square corner regions are
 * outside the circular player's actual footprint and otherwise snag a clear
 * route by up to radius * (sqrt(2) - 1). Side hits retain the fast slab path;
 * only corner candidates pay for a swept point/circle intersection. */
const segmentCircleRectHit = (
  startX: number, startY: number, deltaX: number, deltaY: number, radius: number, rect: RectSpec
): SegmentHit | null => {
  const broad = segmentExpandedRectHit(startX, startY, deltaX, deltaY, radius, rect);
  const right = rect.x + rect.w, bottom = rect.y + rect.h;
  if (!broad && (startX < rect.x-radius || startX > right+radius || startY < rect.y-radius || startY > bottom+radius)) return null;
  const gapX = Math.max(rect.x-startX, 0, startX-right), gapY = Math.max(rect.y-startY, 0, startY-bottom);
  // Arcade still resolves a player that starts physically embedded.
  if (gapX*gapX + gapY*gapY < radius*radius - AXIS_EPSILON) return null;
  if (broad) {
    const x = startX + deltaX*broad.time, y = startY + deltaY*broad.time;
    if ((broad.normalX !== 0 && y >= rect.y && y <= bottom)
      || (broad.normalY !== 0 && x >= rect.x && x <= right)) return broad;
  }
  const speedSquared = deltaX*deltaX + deltaY*deltaY;
  if (speedSquared <= AXIS_EPSILON || radius <= 0) return broad;
  let nearest: SegmentHit | null = null;
  for (let corner = 0; corner < 4; corner++) {
    const east = (corner & 1) !== 0, south = (corner & 2) !== 0;
    const cx = east ? right : rect.x, cy = south ? bottom : rect.y;
    const dx = startX-cx, dy = startY-cy;
    const dot = dx*deltaX + dy*deltaY;
    const discriminant = dot*dot - speedSquared*(dx*dx + dy*dy - radius*radius);
    if (discriminant < 0) continue;
    const time = (-dot - Math.sqrt(discriminant)) / speedSquared;
    if (time < -AXIS_EPSILON || time > 1 || (nearest && time >= nearest.time)) continue;
    const nx = (dx + deltaX*time)/radius, ny = (dy + deltaY*time)/radius;
    if ((east ? nx < -AXIS_EPSILON : nx > AXIS_EPSILON) || (south ? ny < -AXIS_EPSILON : ny > AXIS_EPSILON)) continue;
    if (deltaX*nx + deltaY*ny >= -AXIS_EPSILON) continue;
    nearest = { time: Math.max(0,time), normalX: nx, normalY: ny };
  }
  return nearest;
};

/**
 * Sweeps a circular body through the existing static wall rectangles. Two
 * bounded passes preserve a tangential slide at corners without adding a new
 * physics system. Player body integration also uses this for boosted walking.
 */
export const resolveSweptCircleMotion = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number,
  rects: readonly RectSpec[]
): SweptCircleResolution => {
  let x = startX;
  let y = startY;
  let remainingX = endX - startX;
  let remainingY = endY - startY;
  let normalX = 0;
  let normalY = 0;
  let collided = false;
  let curvedContact = false;
  let tangentX = remainingX;
  let tangentY = remainingY;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const hit = nearestHit(x, y, remainingX, remainingY, radius, rects);
    if (!hit) {
      x += remainingX;
      y += remainingY;
      break;
    }

    collided = true;
    const travelLength = Math.hypot(remainingX, remainingY);
    const safeTime = Math.max(0, hit.time - CONTACT_SKIN / Math.max(CONTACT_SKIN, travelLength));
    x += remainingX * safeTime;
    y += remainingY * safeTime;

    const untraveled = Math.max(0, 1 - hit.time);
    let slideX = remainingX * untraveled;
    let slideY = remainingY * untraveled;
    const curved = hit.normalX !== 0 && hit.normalY !== 0
      && hit.normalX*hit.normalX + hit.normalY*hit.normalY < 1.000_001;
    if (curved) {
      curvedContact = true;
      const into = Math.min(0, slideX*hit.normalX + slideY*hit.normalY);
      slideX -= hit.normalX*into; slideY -= hit.normalY*into;
      const tangentInto = Math.min(0, tangentX*hit.normalX + tangentY*hit.normalY);
      tangentX -= hit.normalX*tangentInto; tangentY -= hit.normalY*tangentInto;
    } else {
      if (slideX * hit.normalX < 0) slideX = 0;
      if (slideY * hit.normalY < 0) slideY = 0;
      if (tangentX * hit.normalX < 0) tangentX = 0;
      if (tangentY * hit.normalY < 0) tangentY = 0;
    }
    if (hit.normalX !== 0) normalX = hit.normalX;
    if (hit.normalY !== 0) normalY = hit.normalY;
    remainingX = slideX;
    remainingY = slideY;
    if (remainingX * remainingX + remainingY * remainingY <= AXIS_EPSILON) break;
  }

  return curvedContact ? { hit: collided, x, y, normalX, normalY, tangentX, tangentY }
    : { hit: collided, x, y, normalX, normalY };
};
