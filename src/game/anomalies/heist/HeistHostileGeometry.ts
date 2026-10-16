import type { RectSpec } from '../../types.ts';
import type { HeistFacilityLayout, HeistLayoutPoint } from './HeistFacilityLayout.ts';

/** Conservative body footprint, shared by spawn validation and relocation recovery. */
export const hostileOverlapsRect = (x: number, y: number, halfWidth: number, halfHeight: number, rect: RectSpec): boolean =>
  x + halfWidth > rect.x && x - halfWidth < rect.x + rect.w
  && y + halfHeight > rect.y && y - halfHeight < rect.y + rect.h;

export const validHeistHostilePosition = (
  layout: HeistFacilityLayout, x: number, y: number, halfWidth: number, halfHeight = halfWidth
): boolean => x - halfWidth >= 0 && y - halfHeight >= 0
  && x + halfWidth <= layout.world.width && y + halfHeight <= layout.world.height
  && !hostileOverlapsRect(x, y, halfWidth, halfHeight, layout.vaultBounds)
  && !layout.wallRects.some(rect => hostileOverlapsRect(x, y, halfWidth, halfHeight, rect));

/** Only invalid placements search the existing facility nodes; no random retries. */
export const safeHeistHostilePosition = (
  layout: HeistFacilityLayout, x: number, y: number, halfWidth: number, halfHeight = halfWidth
): HeistLayoutPoint | null => {
  if (validHeistHostilePosition(layout, x, y, halfWidth, halfHeight)) return { x, y };
  let best: HeistLayoutPoint | null = null;
  let distance = Infinity;
  for (const node of layout.nodes) {
    if (node.kind !== 'facility') continue;
    const d = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (d >= distance || !validHeistHostilePosition(layout, node.x, node.y, halfWidth, halfHeight)) continue;
    best = node;
    distance = d;
  }
  return best;
};
