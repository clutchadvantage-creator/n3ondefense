import type { ArenaLayout, RectSpec } from '../types.ts';
import { SeededRandom } from '../systems/SeededRandom.ts';
import type { SharedFireTrapPlacement } from '../hazards/SharedFireTrapSystem.ts';

const NOZZLE_CLEARANCE = 58;
const BOMBSITE_CLEARANCE = 160;
const SPAWN_CLEARANCE = 135;
const WALL_BANK_MINIMUM = 6;
const WALL_BANK_MAXIMUM = 10;
const WALL_BANK_SPACING = 285;
const MINIMUM_FLAME_LENGTH = 190;
const MAXIMUM_FLAME_LENGTH = 330;
const FLAME_LANE_HALF_WIDTH = 68;

interface MountCandidate {
  x: number;
  y: number;
  rotation: number;
  zone: 'perimeter-left' | 'perimeter-right' | 'perimeter-top' | 'perimeter-bottom' | 'interior';
}

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

const anchorIsSafe = (layout: ArenaLayout, candidate: MountCandidate): boolean => {
  const bounds = layout.generation.bounds;
  if (candidate.x < bounds.x + 4 || candidate.x > bounds.x + bounds.w - 4
    || candidate.y < bounds.y + 4 || candidate.y > bounds.y + bounds.h - 4) return false;
  if (!layout.bombSites.every((site) => pointClearOf(candidate.x, candidate.y, site, BOMBSITE_CLEARANCE))) return false;
  if (!layout.enemySpawns.every((spawn) => pointClearOf(candidate.x, candidate.y, spawn, SPAWN_CLEARANCE))) return false;
  if (!pointClearOf(candidate.x, candidate.y, layout.playerSpawn, SPAWN_CLEARANCE + 35)) return false;
  if (obstacleRectangles(layout).some((rect) => pointInExpandedRectangle(candidate.x, candidate.y, rect, 34))) return false;
  return layout.smashables.every((prop) => pointClearOf(candidate.x, candidate.y, prop,
    NOZZLE_CLEARANCE + Math.max(prop.width, prop.height) * 0.5));
};

/** Walks the actual lane and returns the usable length before the first piece
 * of topology. Large/open arenas can use a longer jet while compact rooms
 * automatically receive a shorter, still-reactable stream. */
const resolveClearFireLength = (
  layout: ArenaLayout,
  candidate: MountCandidate,
  blockers: readonly RectSpec[]
): number | null => {
  const bounds = layout.generation.bounds;
  const cosine = Math.cos(candidate.rotation);
  const sine = Math.sin(candidate.rotation);
  let lastSafe = 0;
  for (let distance = 46; distance <= MAXIMUM_FLAME_LENGTH; distance += 18) {
    const centerX = candidate.x + cosine * distance;
    const centerY = candidate.y + sine * distance;
    if (centerX < bounds.x + 26 || centerX > bounds.x + bounds.w - 26
      || centerY < bounds.y + 26 || centerY > bounds.y + bounds.h - 26) break;
    const sideX = -sine * FLAME_LANE_HALF_WIDTH;
    const sideY = cosine * FLAME_LANE_HALF_WIDTH;
    let blocked = false;
    for (let lane = -1; lane <= 1; lane += 1) {
      const sampleX = centerX + sideX * lane;
      const sampleY = centerY + sideY * lane;
      if (blockers.some((rect) => pointInExpandedRectangle(sampleX, sampleY, rect, 14))) {
        blocked = true;
        break;
      }
      if (!layout.bombSites.every((site) => pointClearOf(sampleX, sampleY, site, BOMBSITE_CLEARANCE))) {
        blocked = true;
        break;
      }
    }
    if (blocked) break;
    lastSafe = distance;
  }
  return lastSafe >= MINIMUM_FLAME_LENGTH ? Math.min(MAXIMUM_FLAME_LENGTH, lastSafe) : null;
};

const createPerimeterCandidates = (layout: ArenaLayout): MountCandidate[] => {
  const bounds = layout.generation.bounds;
  const candidates: MountCandidate[] = [];
  // Generated arenas reserve a 30px structural boundary. Mount just inside
  // its playable face so the bank reads as recessed without hiding beneath it.
  const innerFaceInset = 32;
  const verticalCount = Math.max(3, Math.min(5, Math.floor(bounds.h / 390)));
  const horizontalCount = Math.max(3, Math.min(6, Math.floor(bounds.w / 430)));
  for (let index = 0; index < verticalCount; index += 1) {
    const y = bounds.y + bounds.h * (index + 1) / (verticalCount + 1);
    candidates.push({ x: bounds.x + innerFaceInset, y, rotation: 0, zone: 'perimeter-left' });
    candidates.push({ x: bounds.x + bounds.w - innerFaceInset, y, rotation: Math.PI, zone: 'perimeter-right' });
  }
  for (let index = 0; index < horizontalCount; index += 1) {
    const x = bounds.x + bounds.w * (index + 1) / (horizontalCount + 1);
    candidates.push({ x, y: bounds.y + innerFaceInset, rotation: Math.PI * 0.5, zone: 'perimeter-top' });
    candidates.push({ x, y: bounds.y + bounds.h - innerFaceInset, rotation: -Math.PI * 0.5, zone: 'perimeter-bottom' });
  }
  return candidates;
};

const createInteriorWallCandidates = (layout: ArenaLayout): MountCandidate[] => {
  const candidates: MountCandidate[] = [];
  for (const wall of layout.walls) {
    const horizontal = wall.w >= wall.h;
    const length = horizontal ? wall.w : wall.h;
    if (length < 150) continue;
    const fractions = length >= 540 ? [0.3, 0.7] : [0.5];
    for (const fraction of fractions) {
      if (horizontal) {
        const x = wall.x + wall.w * fraction;
        candidates.push({ x, y: wall.y - 4, rotation: -Math.PI * 0.5, zone: 'interior' });
        candidates.push({ x, y: wall.y + wall.h + 4, rotation: Math.PI * 0.5, zone: 'interior' });
      } else {
        const y = wall.y + wall.h * fraction;
        candidates.push({ x: wall.x - 4, y, rotation: Math.PI, zone: 'interior' });
        candidates.push({ x: wall.x + wall.w + 4, y, rotation: 0, zone: 'interior' });
      }
    }
  }
  return candidates;
};

const farEnoughFromBanks = (
  x: number,
  y: number,
  existing: readonly SharedFireTrapPlacement[]
): boolean => existing.every((bank) => {
  const dx = bank.x - x;
  const dy = bank.y - y;
  return dx * dx + dy * dy >= WALL_BANK_SPACING * WALL_BANK_SPACING;
});

export const isArenaFireTrapPlacementSafe = (
  layout: ArenaLayout,
  placement: SharedFireTrapPlacement,
  existing: readonly SharedFireTrapPlacement[] = []
): boolean => {
  if (placement.kind !== 'wall') return false;
  const candidate: MountCandidate = {
    x: placement.x, y: placement.y, rotation: placement.rotation, zone: 'interior'
  };
  if (!anchorIsSafe(layout, candidate) || !farEnoughFromBanks(placement.x, placement.y, existing)) return false;
  const length = resolveClearFireLength(layout, candidate, [...layout.walls, ...obstacleRectangles(layout)]);
  return length !== null && (placement.flameLength ?? length) <= length;
};

/** Builds a distributed network of compact banks on perimeter and interior wall
 * faces. Local +X always points into playable space; local Y is the wall
 * tangent used by the shared renderer for its three-port row/column. */
export const createArenaFireTrapPlacements = (layout: ArenaLayout, round: number): SharedFireTrapPlacement[] => {
  const random = new SeededRandom((layout.seed ^ Math.imul(round + 31, 0x6c8e9cf5)) >>> 0);
  const blockers = [...layout.walls, ...obstacleRectangles(layout)];
  const target = Math.min(WALL_BANK_MAXIMUM,
    WALL_BANK_MINIMUM + Math.min(3, Math.floor(Math.max(1, round) / 18)) + random.int(0, 1));
  const rawCandidates = [...createPerimeterCandidates(layout), ...createInteriorWallCandidates(layout)];
  const validCandidates = rawCandidates.map((candidate) => ({
    candidate,
    flameLength: anchorIsSafe(layout, candidate) ? resolveClearFireLength(layout, candidate, blockers) : null
  })).filter((entry): entry is { candidate: MountCandidate; flameLength: number } => entry.flameLength !== null);
  const selected: SharedFireTrapPlacement[] = [];

  const addCandidate = (candidate: MountCandidate, flameLength: number): boolean => {
    if (selected.length >= target || !farEnoughFromBanks(candidate.x, candidate.y, selected)) return false;
    selected.push({
      id: `arena-fire-${layout.seed}-${selected.length}`,
      x: candidate.x,
      y: candidate.y,
      rotation: candidate.rotation,
      kind: 'wall',
      flameLength: Math.floor(flameLength),
      triggerRadius: Math.min(410, Math.floor(flameLength + 105)),
      initialDelayMs: 2_600 + selected.length * 520 + random.int(0, 1_800)
    });
    return true;
  };

  const perimeterZones: MountCandidate['zone'][] = [
    'perimeter-left', 'perimeter-right', 'perimeter-top', 'perimeter-bottom'
  ];
  for (const zone of perimeterZones) {
    const choices = random.shuffle(validCandidates.filter((entry) => entry.candidate.zone === zone));
    for (const entry of choices) if (addCandidate(entry.candidate, entry.flameLength)) break;
  }
  for (const entry of random.shuffle([...validCandidates])) {
    if (selected.length >= target) break;
    addCandidate(entry.candidate, entry.flameLength);
  }
  return selected;
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
