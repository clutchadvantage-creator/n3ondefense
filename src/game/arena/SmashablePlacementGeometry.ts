import type { ArenaSmashablePlacement, RectSpec } from '../types.ts';

export const smashableWorldFootprint = (
  placement: Pick<ArenaSmashablePlacement, 'x' | 'y' | 'width' | 'height' | 'rotation'>
): RectSpec => {
  const quarterTurn = Math.abs(Math.sin(placement.rotation)) > 0.5;
  const width = quarterTurn ? placement.height : placement.width;
  const height = quarterTurn ? placement.width : placement.height;
  return { x: placement.x - width * 0.5, y: placement.y - height * 0.5, w: width, h: height };
};

export const rectanglesOverlap = (first: RectSpec, second: RectSpec, clearance = 0): boolean => (
  first.x < second.x + second.w + clearance
  && first.x + first.w > second.x - clearance
  && first.y < second.y + second.h + clearance
  && first.y + first.h > second.y - clearance
);

export const footprintClearOfPoint = (
  footprint: RectSpec,
  point: { x: number; y: number },
  radius: number
): boolean => {
  const closestX = Math.max(footprint.x, Math.min(point.x, footprint.x + footprint.w));
  const closestY = Math.max(footprint.y, Math.min(point.y, footprint.y + footprint.h));
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy >= radius * radius;
};

export const footprintInside = (footprint: RectSpec, bounds: RectSpec, margin: number): boolean => (
  footprint.x >= bounds.x + margin
  && footprint.y >= bounds.y + margin
  && footprint.x + footprint.w <= bounds.x + bounds.w - margin
  && footprint.y + footprint.h <= bounds.y + bounds.h - margin
);
