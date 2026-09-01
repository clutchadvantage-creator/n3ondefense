import type { ArenaLayout, ArenaSmashablePlacement, RectSpec } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import { ARENA_SMASHABLE_DEFINITIONS } from './ArenaSmashableDefinitions.ts';

const pointOutside = (x: number, y: number, rect: RectSpec, padding: number): boolean => (
  x < rect.x - padding || x > rect.x + rect.w + padding
  || y < rect.y - padding || y > rect.y + rect.h + padding
);

/**
 * Places non-blocking dressing beside existing structure. Because props never
 * enter navigation blockers, they cannot create new choke points; generous
 * objective/spawn clearances preserve combat flow.
 */
export const createArenaSmashablePlacements = (layout: ArenaLayout, round: number): ArenaSmashablePlacement[] => {
  const random = new SeededRandom((layout.seed ^ Math.imul(round + 17, 0x45d9f3b)) >>> 0);
  const target = Math.min(13, 6 + Math.floor(round / 8) + random.int(0, 3));
  const blockers = [...layout.walls, ...layout.obstacles.map((obstacle) => ({
    x: obstacle.x - obstacle.w * 0.5,
    y: obstacle.y - obstacle.h * 0.5,
    w: obstacle.w,
    h: obstacle.h
  }))];
  const protectedPoints = [layout.playerSpawn, ...layout.enemySpawns, ...layout.bombSites];
  const placements: ArenaSmashablePlacement[] = [];
  const bounds = layout.generation.bounds;
  for (let attempt = 0; attempt < target * 30 && placements.length < target; attempt += 1) {
    const definition = random.pick(ARENA_SMASHABLE_DEFINITIONS);
    const anchor = random.pick(layout.walls.length ? layout.walls : blockers);
    if (!anchor) break;
    const horizontal = anchor.w >= anchor.h;
    const side = random.bool() ? -1 : 1;
    const x = horizontal
      ? random.float(anchor.x + 28, anchor.x + Math.max(29, anchor.w - 28))
      : anchor.x + anchor.w * 0.5 + side * (definition.width * 0.5 + 14);
    const y = horizontal
      ? anchor.y + anchor.h * 0.5 + side * (definition.height * 0.5 + 14)
      : random.float(anchor.y + 28, anchor.y + Math.max(29, anchor.h - 28));
    const halfWidth = definition.width * 0.5;
    const halfHeight = definition.height * 0.5;
    if (x - halfWidth < bounds.x + 34 || x + halfWidth > bounds.x + bounds.w - 34
      || y - halfHeight < bounds.y + 34 || y + halfHeight > bounds.y + bounds.h - 34) continue;
    if (protectedPoints.some((point) => (point.x - x) ** 2 + (point.y - y) ** 2 < 165 ** 2)) continue;
    if (placements.some((placement) => (placement.x - x) ** 2 + (placement.y - y) ** 2 < 92 ** 2)) continue;
    if (!blockers.every((rect) => pointOutside(x, y, rect, Math.min(halfWidth, halfHeight) * 0.5))) continue;
    placements.push({
      id: `prop-${layout.seed}-${placements.length}`,
      kind: definition.kind,
      durability: definition.durability,
      x: Math.round(x),
      y: Math.round(y),
      width: definition.width,
      height: definition.height,
      rotation: horizontal ? 0 : Math.PI * 0.5,
      accent: random.bool(0.28) ? layout.theme.secondary : layout.theme.primary,
      lootRoll: random.next()
    });
  }
  return placements;
};
