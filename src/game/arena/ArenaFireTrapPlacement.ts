import type { ArenaLayout, RectSpec } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import type { SharedFireTrapPlacement } from '../hazards/SharedFireTrapSystem.ts';

const NOZZLE_CLEARANCE = 58;
const BOMBSITE_CLEARANCE = 150;
const SPAWN_CLEARANCE = 125;
const STATIC_NOZZLE_MAXIMUM = 4;

const obstacleRectangles = (layout: ArenaLayout): RectSpec[] => layout.obstacles.map((obstacle) => ({
  x: obstacle.x - obstacle.w * 0.5,
  y: obstacle.y - obstacle.h * 0.5,
  w: obstacle.w,
  h: obstacle.h
}));

const pointInExpandedRectangle = (x: number, y: number, rect: RectSpec, padding: number): boolean => (
  x >= rect.x - padding && x <= rect.x + rect.w + padding
  && y >= rect.y - padding && y <= rect.y + rect.h + padding
);

const pointClearOf = (x: number, y: number, point: { x: number; y: number }, clearance: number): boolean => {
  const dx = x - point.x;
  const dy = y - point.y;
  return dx * dx + dy * dy >= clearance * clearance;
};

const fireLaneIsClear = (
  layout: ArenaLayout,
  x: number,
  y: number,
  rotation: number,
  blockers: readonly RectSpec[]
): boolean => {
  const bounds = layout.generation.bounds;
  for (const distance of [82, 160, 250, 325]) {
    const sampleX = x + Math.cos(rotation) * distance;
    const sampleY = y + Math.sin(rotation) * distance;
    if (sampleX < bounds.x + 34 || sampleX > bounds.x + bounds.w - 34
      || sampleY < bounds.y + 34 || sampleY > bounds.y + bounds.h - 34) return false;
    if (blockers.some((rect) => pointInExpandedRectangle(sampleX, sampleY, rect, 22))) return false;
    if (!layout.bombSites.every((site) => pointClearOf(sampleX, sampleY, site, BOMBSITE_CLEARANCE))) return false;
  }
  return true;
};

/** Deterministic low-density infrastructure mounted at wall endpoints. Every
 * emitted flame lane is sampled against real collision rectangles first. */
export const createArenaFireTrapPlacements = (layout: ArenaLayout, round: number): SharedFireTrapPlacement[] => {
  const random = new SeededRandom((layout.seed ^ Math.imul(round + 31, 0x6c8e9cf5)) >>> 0);
  const blockers = [...layout.walls, ...obstacleRectangles(layout)];
  const target = Math.min(STATIC_NOZZLE_MAXIMUM, 2 + Math.floor(round / 16) + random.int(0, 1));
  const candidates: SharedFireTrapPlacement[] = [];
  const walls = [...layout.walls].sort((first, second) => (second.w + second.h) - (first.w + first.h));
  for (let wallIndex = 0; wallIndex < walls.length && candidates.length < target * 5; wallIndex += 1) {
    const wall = walls[(wallIndex * 3 + random.int(0, Math.max(0, walls.length - 1))) % walls.length];
    const horizontal = wall.w >= wall.h;
    const specs = horizontal
      ? [
          { x: wall.x - 2, y: wall.y + wall.h * 0.5, rotation: Math.PI },
          { x: wall.x + wall.w + 2, y: wall.y + wall.h * 0.5, rotation: 0 }
        ]
      : [
          { x: wall.x + wall.w * 0.5, y: wall.y - 2, rotation: -Math.PI * 0.5 },
          { x: wall.x + wall.w * 0.5, y: wall.y + wall.h + 2, rotation: Math.PI * 0.5 }
        ];
    const spec = specs[random.int(0, specs.length - 1)];
    if (!layout.bombSites.every((site) => pointClearOf(spec.x, spec.y, site, BOMBSITE_CLEARANCE))) continue;
    if (!layout.enemySpawns.every((spawn) => pointClearOf(spec.x, spec.y, spawn, SPAWN_CLEARANCE))) continue;
    if (!pointClearOf(spec.x, spec.y, layout.playerSpawn, SPAWN_CLEARANCE + 35)) continue;
    if (!fireLaneIsClear(layout, spec.x, spec.y, spec.rotation, blockers)) continue;
    if (candidates.some((existing) => {
      const dx = existing.x - spec.x;
      const dy = existing.y - spec.y;
      return dx * dx + dy * dy < 420 * 420;
    })) continue;
    candidates.push({
      id: `arena-fire-${layout.seed}-${candidates.length}`,
      ...spec,
      kind: 'wall',
      triggerRadius: 285,
      initialDelayMs: 2_200 + candidates.length * 850 + random.int(0, 1_400)
    });
  }
  return candidates.slice(0, target);
};

/** Finds a fair floor-nozzle position near a predicted target without creating
 * a collision, covering a bombsite, or blocking a required spawn lane. */
export const resolveArenaFloorFirePlacement = (
  layout: ArenaLayout,
  requestedX: number,
  requestedY: number,
  sequence: number
): { x: number; y: number } | null => {
  const blockers = [...layout.walls, ...obstacleRectangles(layout)];
  const bounds = layout.generation.bounds;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const radius = attempt === 0 ? 0 : 34 + Math.floor((attempt - 1) / 4) * 28;
    const angle = sequence * 2.3999632297 + attempt * 1.61803398875;
    const x = Math.round(requestedX + Math.cos(angle) * radius);
    const y = Math.round(requestedY + Math.sin(angle) * radius);
    if (x < bounds.x + 90 || x > bounds.x + bounds.w - 90
      || y < bounds.y + 90 || y > bounds.y + bounds.h - 90) continue;
    if (blockers.some((rect) => pointInExpandedRectangle(x, y, rect, NOZZLE_CLEARANCE))) continue;
    if (!layout.bombSites.every((site) => pointClearOf(x, y, site, BOMBSITE_CLEARANCE))) continue;
    if (!layout.enemySpawns.every((spawn) => pointClearOf(x, y, spawn, 92))) continue;
    if (layout.smashables.some((prop) => {
      const dx = prop.x - x;
      const dy = prop.y - y;
      return dx * dx + dy * dy < (NOZZLE_CLEARANCE + Math.max(prop.width, prop.height) * 0.5) ** 2;
    })) continue;
    return { x, y };
  }
  return null;
};
