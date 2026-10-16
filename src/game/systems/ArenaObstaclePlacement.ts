import type { ArenaTemplate, GeneratedObstacle, RectSpec } from '../types.ts';
import { ARENA_GENERATION_CONFIG as C } from '../config/arenaGeneration.ts';
import { SeededRandom } from './SeededRandom.ts';
import type { PointSpec } from './ArenaTopology.ts';

/** Edge-to-edge clearance includes diagonal corners, unlike center or shared-face tests. */
export const arenaRectClearance = (a: RectSpec, b: RectSpec): number => Math.hypot(
  Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w),
  Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h)
);

/** A few aligned equipment installations complement the archetype's structures.
 * Placement uses the existing 140px group corridor (24px operative diameter),
 * and the full collision rectangle, including its corners. No runtime work. */
export function placeArenaEquipment(random: SeededRandom, bounds: RectSpec, walls: RectSpec[],
  protectedPoints: PointSpec[], archetype: ArenaTemplate, round: number): GeneratedObstacle[] {
  const ranges: Record<ArenaTemplate, [number, number]> = {
    'open-field': [4, 7], islands: [3, 8], fortress: [3, 7], ring: [2, 6], split: [4, 9],
    'hub-spoke': [4, 8], canyon: [2, 6], maze: [1, 4], chambers: [2, 5],
    'asymmetric-clusters': [2, 3], crossroads: [3, 7], perimeter: [3, 7]
  };
  const [min, max] = ranges[archetype];
  const target = random.int(min, Math.min(max, min + Math.floor(round / 5) + 4));
  const obstacles: GeneratedObstacle[] = [], occupied = [...walls];
  for (let attempt = 0; attempt < target * 15 && obstacles.length < target; attempt++) {
    const kind = random.pick(['machinery', 'energy-column', 'crate', 'small-barricade'] as const);
    const cell = C.navigationCellSize;
    const x = Math.round(random.float(bounds.x + cell * 3, bounds.x + bounds.w - cell * 3) / cell) * cell;
    const y = Math.round(random.float(bounds.y + cell * 3, bounds.y + bounds.h - cell * 3) / cell) * cell;
    let w = cell * (kind === 'small-barricade' ? 4 : random.int(2, 3)), h = cell * 2;
    if (random.bool()) [w, h] = [h, w];
    const rect = { x: x - w / 2, y: y - h / 2, w, h };
    if (occupied.some(other => arenaRectClearance(rect, other) < C.minimumCorridorWidth)) continue;
    if (protectedPoints.some(p => arenaRectClearance(rect, { ...p, w: 0, h: 0 }) < C.objectiveClearance)) continue;
    if (rect.x < bounds.x || rect.y < bounds.y || rect.x + w > bounds.x + bounds.w || rect.y + h > bounds.y + bounds.h) continue;
    obstacles.push({ id: `${kind}-${x}-${y}`, kind, x, y, w, h, blocksMovement: true, blocksLineOfSight: true });
    occupied.push(rect);
  }
  return obstacles;
}
