import type { RectSpec } from '../types.ts';

export interface LaserSegment { x1: number; y1: number; x2: number; y2: number }

/** Clip in place, preserving the beam's angle. A miss leaves the segment untouched. */
export function clipLaserSegment(segment: LaserSegment, bounds: RectSpec): boolean {
  let enter = 0, exit = 1;
  const dx = segment.x2 - segment.x1, dy = segment.y2 - segment.y1;
  for (let axis = 0; axis < 2; axis++) {
    const start = axis ? segment.y1 : segment.x1, delta = axis ? dy : dx;
    const min = axis ? bounds.y : bounds.x, max = min + (axis ? bounds.h : bounds.w);
    if (Math.abs(delta) < 1e-10) {
      if (start < min || start > max) return false;
      continue;
    }
    const first = (min - start) / delta, last = (max - start) / delta;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return false;
  }
  segment.x2 = segment.x1 + exit * dx; segment.y2 = segment.y1 + exit * dy;
  segment.x1 += enter * dx; segment.y1 += enter * dy;
  return true;
}
