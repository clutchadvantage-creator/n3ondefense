import type { ArenaLayout, ArenaSmashablePlacement, RectSpec } from '../types.ts';
import { ARENA_GENERATION_CONFIG } from '../config/arenaGeneration.ts';
import { createsNarrowPassage } from '../systems/ArenaTraversal.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import { ARENA_SMASHABLE_DEFINITIONS } from './ArenaSmashableDefinitions.ts';
import {
  footprintClearOfPoint,
  footprintInside,
  rectanglesOverlap,
  smashableWorldFootprint
} from './SmashablePlacementGeometry.ts';

const WALL_CLEARANCE = 12;
const PROP_CLEARANCE = 34;
const BOMBSITE_CLEARANCE = 142;
const PLAYER_SPAWN_CLEARANCE = 165;
const ENEMY_SPAWN_CLEARANCE = 138;
export const ARENA_SMASHABLE_MAXIMUM = 4;

const rectanglesEqual = (first: RectSpec, second: RectSpec): boolean => (
  first.x === second.x && first.y === second.y && first.w === second.w && first.h === second.h
);

const rectangleGap = (first: RectSpec, second: RectSpec): number => {
  const dx = Math.max(second.x - (first.x + first.w), first.x - (second.x + second.w), 0);
  const dy = Math.max(second.y - (first.y + first.h), first.y - (second.y + second.h), 0);
  return Math.hypot(dx, dy);
};

const obstacleRectangles = (layout: ArenaLayout): RectSpec[] => layout.obstacles.map((obstacle) => ({
  x: obstacle.x - obstacle.w * 0.5,
  y: obstacle.y - obstacle.h * 0.5,
  w: obstacle.w,
  h: obstacle.h
}));

export const isArenaSmashablePlacementSafe = (
  layout: ArenaLayout,
  placement: ArenaSmashablePlacement,
  existing: readonly ArenaSmashablePlacement[] = [],
  anchor?: RectSpec
): boolean => {
  const footprint = smashableWorldFootprint(placement);
  if (!footprintInside(footprint, layout.generation.bounds, 34)) return false;
  if (!layout.bombSites.every((site) => footprintClearOfPoint(footprint, site, BOMBSITE_CLEARANCE))) return false;
  if (!footprintClearOfPoint(footprint, layout.playerSpawn, PLAYER_SPAWN_CLEARANCE)) return false;
  if (!layout.enemySpawns.every((spawn) => footprintClearOfPoint(footprint, spawn, ENEMY_SPAWN_CLEARANCE))) return false;

  const obstacles = obstacleRectangles(layout);
  const blockers = [...layout.walls, ...obstacles];
  if (blockers.some((rect) => rectanglesOverlap(footprint, rect, WALL_CLEARANCE - 2))) return false;
  if (existing.some((other) => rectanglesOverlap(footprint, smashableWorldFootprint(other), PROP_CLEARANCE))) return false;

  const structuralAnchor = anchor ?? blockers.reduce<RectSpec | undefined>((nearest, rect) => {
    if (rectangleGap(footprint, rect) > WALL_CLEARANCE + 4) return nearest;
    return !nearest || rectangleGap(footprint, rect) < rectangleGap(footprint, nearest) ? rect : nearest;
  }, undefined);
  if (!structuralAnchor) return false;

  // Do not turn decorative scenery into a visually narrow combat lane. The
  // wall it is intentionally parked beside is ignored; every opposing blocker
  // still participates in the real gameplay-derived corridor-width check.
  if (createsNarrowPassage(footprint, blockers.filter((rect) => !rectanglesEqual(rect, structuralAnchor)),
    ARENA_GENERATION_CONFIG.minimumCorridorWidth)) return false;
  return true;
};

/**
 * Low-density, non-blocking Arena dressing. Candidates are parked beside
 * structure and rejected using their complete rotated footprint. Failure to
 * find a safe location simply produces fewer props.
 */
export const createArenaSmashablePlacements = (layout: ArenaLayout, round: number): ArenaSmashablePlacement[] => {
  const random = new SeededRandom((layout.seed ^ Math.imul(round + 17, 0x45d9f3b)) >>> 0);
  const target = Math.min(ARENA_SMASHABLE_MAXIMUM, 3 + random.int(0, 1));
  const anchors = layout.walls.length ? layout.walls : obstacleRectangles(layout);
  const placements: ArenaSmashablePlacement[] = [];
  for (let attempt = 0; attempt < target * 36 && placements.length < target; attempt += 1) {
    const definition = random.pick(ARENA_SMASHABLE_DEFINITIONS);
    const anchor = random.pick(anchors);
    if (!anchor) break;
    const horizontal = anchor.w >= anchor.h;
    const rotation = horizontal ? 0 : Math.PI * 0.5;
    const worldWidth = horizontal ? definition.width : definition.height;
    const worldHeight = horizontal ? definition.height : definition.width;
    const halfWidth = worldWidth * 0.5;
    const halfHeight = worldHeight * 0.5;
    const side = random.bool() ? -1 : 1;
    const availableWidth = anchor.w - worldWidth - 20;
    const availableHeight = anchor.h - worldHeight - 20;
    if ((horizontal && availableWidth <= 0) || (!horizontal && availableHeight <= 0)) continue;
    const x = horizontal
      ? random.float(anchor.x + halfWidth + 10, anchor.x + anchor.w - halfWidth - 10)
      : anchor.x + anchor.w * 0.5 + side * (anchor.w * 0.5 + halfWidth + WALL_CLEARANCE + 2);
    const y = horizontal
      ? anchor.y + anchor.h * 0.5 + side * (anchor.h * 0.5 + halfHeight + WALL_CLEARANCE + 2)
      : random.float(anchor.y + halfHeight + 10, anchor.y + anchor.h - halfHeight - 10);
    const placement: ArenaSmashablePlacement = {
      id: `prop-${layout.seed}-${placements.length}`,
      kind: definition.kind,
      durability: definition.durability,
      x: Math.round(x),
      y: Math.round(y),
      width: definition.width,
      height: definition.height,
      rotation,
      accent: random.bool(0.28) ? layout.theme.secondary : layout.theme.primary,
      lootRoll: random.next()
    };
    if (!isArenaSmashablePlacementSafe(layout, placement, placements, anchor)) continue;
    placements.push(placement);
  }
  return placements;
};
