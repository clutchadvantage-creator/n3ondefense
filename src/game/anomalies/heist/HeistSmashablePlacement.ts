import type { ArenaSmashablePlacement, RectSpec } from '../../types.ts';
import { ARENA_SMASHABLE_DEFINITIONS } from '../../arena/ArenaSmashableDefinitions.ts';
import {
  footprintClearOfPoint,
  footprintInside,
  rectanglesOverlap,
  smashableWorldFootprint
} from '../../arena/SmashablePlacementGeometry.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';
import { HEIST_LAYOUT_GRID, type HeistFacilityLayout } from './HeistFacilityLayout.ts';

export const HEIST_SMASHABLE_MINIMUM = 12;
export const HEIST_SMASHABLE_MAXIMUM = 16;
const WALL_CLEARANCE = 12;
const PROP_CLEARANCE = 30;

const rectangleGap = (first: RectSpec, second: RectSpec): number => {
  const dx = Math.max(second.x - (first.x + first.w), first.x - (second.x + second.w), 0);
  const dy = Math.max(second.y - (first.y + first.h), first.y - (second.y + second.h), 0);
  return Math.hypot(dx, dy);
};

const nearestWall = (footprint: RectSpec, walls: readonly RectSpec[]): RectSpec | null => {
  let nearest: RectSpec | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    const gap = rectangleGap(footprint, wall);
    if (gap < best) { best = gap; nearest = wall; }
  }
  return best <= 24 ? nearest : null;
};

export const isHeistSmashablePlacementSafe = (
  layout: HeistFacilityLayout,
  placement: ArenaSmashablePlacement,
  existing: readonly ArenaSmashablePlacement[] = []
): boolean => {
  const footprint = smashableWorldFootprint(placement);
  const worldBounds: RectSpec = { x: 0, y: 0, w: layout.world.width, h: layout.world.height };
  if (!footprintInside(footprint, worldBounds, 104)) return false;
  const anchor = nearestWall(footprint, layout.wallRects);
  if (!anchor) return false;
  if (layout.wallRects.some((wall) => rectanglesOverlap(footprint, wall, WALL_CLEARANCE - 2))) return false;
  if (existing.some((other) => rectanglesOverlap(footprint, smashableWorldFootprint(other), PROP_CLEARANCE))) return false;

  const protectedPoints: Array<{ point: { x: number; y: number }; radius: number }> = [
    { point: layout.entryPoint, radius: 190 },
    { point: layout.extractionPoint, radius: 190 },
    ...layout.containerPoints.map((point) => ({ point, radius: 112 })),
    ...layout.supportPoints.map((point) => ({ point, radius: 82 })),
    ...layout.trapPlacements.map((point) => ({ point, radius: 126 })),
    ...layout.ambushPoints.map((point) => ({ point, radius: 112 })),
    ...layout.route.map((point) => ({ point, radius: 92 })),
    ...layout.extractionRoute.map((point) => ({ point, radius: 92 })),
    ...layout.nodes.filter((node) => node.kind === 'facility').map((point) => ({ point, radius: 72 })),
    ...layout.vaultDoors.map((point) => ({ point, radius: 126 }))
  ];
  if (!protectedPoints.every(({ point, radius }) => footprintClearOfPoint(footprint, point, radius))) return false;
  return true;
};

/** Facility scenery shares the Arena runtime/destruction implementation, but
 * has its own deterministic placement density and protected mission spaces. */
export const createHeistSmashablePlacements = (
  layout: HeistFacilityLayout,
  round: number
): ArenaSmashablePlacement[] => {
  const random = new SeededRandom((layout.seed ^ Math.imul(round + 31, 0x7feb352d) ^ 0x48335350) >>> 0);
  const target = Math.min(HEIST_SMASHABLE_MAXIMUM, HEIST_SMASHABLE_MINIMUM + random.int(0, 4));
  const nodes = random.shuffle(layout.nodes.filter((node) => node.kind === 'facility'));
  const placements: ArenaSmashablePlacement[] = [];
  const accents = [0x43edfa, 0xff4dcb, 0xffc857, 0x76ffb2] as const;
  const candidateCount = nodes.length * 4;
  for (let attempt = 0; attempt < candidateCount && placements.length < target; attempt += 1) {
    const node = nodes[attempt % nodes.length];
    if (!node) break;
    const definition = random.pick(ARENA_SMASHABLE_DEFINITIONS);
    const side = (attempt + random.int(0, 3)) % 4;
    const againstVerticalWall = side < 2;
    const rotation = againstVerticalWall ? 0 : Math.PI * 0.5;
    const worldWidth = againstVerticalWall ? definition.width : definition.height;
    const worldHeight = againstVerticalWall ? definition.height : definition.width;
    const insetX = HEIST_LAYOUT_GRID.cellWidth * 0.5 - HEIST_LAYOUT_GRID.wallThickness * 0.5
      - worldWidth * 0.5 - WALL_CLEARANCE;
    const insetY = HEIST_LAYOUT_GRID.cellHeight * 0.5 - HEIST_LAYOUT_GRID.wallThickness * 0.5
      - worldHeight * 0.5 - WALL_CLEARANCE;
    const x = againstVerticalWall
      ? node.x + (side === 0 ? -insetX : insetX)
      : node.x + random.float(-54, 54);
    const y = againstVerticalWall
      ? node.y + random.float(-48, 48)
      : node.y + (side === 2 ? -insetY : insetY);
    const placement: ArenaSmashablePlacement = {
      id: `heist-prop-${layout.seed}-${placements.length}`,
      kind: definition.kind,
      durability: definition.durability,
      x: Math.round(x),
      y: Math.round(y),
      width: definition.width,
      height: definition.height,
      rotation,
      accent: random.pick(accents),
      lootRoll: random.next()
    };
    if (!isHeistSmashablePlacementSafe(layout, placement, placements)) continue;
    placements.push(placement);
  }
  return placements;
};
