import type { RectSpec } from '../types.ts';

export interface SweptCircleResolution {
  hit: boolean;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
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
    const hit = segmentExpandedRectHit(startX, startY, deltaX, deltaY, radius, rect);
    if (!hit || (nearest && hit.time >= nearest.time)) continue;
    nearest = hit;
  }
  return nearest;
};

/**
 * Sweeps a circular body through the existing static wall rectangles. Two
 * bounded passes preserve a tangential slide at corners without adding a new
 * physics system or performing work outside the short dash window.
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
    const intoSurface = slideX * hit.normalX + slideY * hit.normalY;
    if (intoSurface < 0) {
      slideX -= intoSurface * hit.normalX;
      slideY -= intoSurface * hit.normalY;
    }
    if (hit.normalX !== 0) normalX = hit.normalX;
    if (hit.normalY !== 0) normalY = hit.normalY;
    remainingX = slideX;
    remainingY = slideY;
    if (remainingX * remainingX + remainingY * remainingY <= AXIS_EPSILON) break;
  }

  return { hit: collided, x, y, normalX, normalY };
};
