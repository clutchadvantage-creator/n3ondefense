/** All bombsite states reserve this space, including unarmed and destroyed sites.
 * 96px covers the platform/armed ring, plus 160px approach space and a 64px
 * conservative enemy footprint (including the largest chassis presentation).
 */
export const ENEMY_SPAWN_SAFETY = Object.freeze({ siteRadius: 96, approachGap: 160, enemyRadius: 64,
  minimumSiteDistance: 320, wallClearance: 32 });

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };

export function clearOfBombsites(point: Point, sites: readonly Point[]): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && sites.every(site =>
    (point.x - site.x) ** 2 + (point.y - site.y) ** 2 >= ENEMY_SPAWN_SAFETY.minimumSiteDistance ** 2);
}

/** Bounded selection; an unavailable entrance is never replaced with an unsafe point. */
export function selectSafeEnemySpawn(preferred: Point | null | undefined, entrances: readonly Point[],
  sites: readonly Point[], traversable: (point: Point) => boolean, startIndex = 0): Point | null {
  const valid = (p: Point) => clearOfBombsites(p, sites) && traversable(p);
  if (preferred && valid(preferred)) return preferred;
  for (let i = 0; i < entrances.length; i++) {
    const point = entrances[(Math.max(0, Math.floor(startIndex)) + i) % entrances.length];
    if (valid(point)) return point;
  }
  return null;
}

/** Repair entrances only, before secondary obstacles are placed. Preserve their
 * count and use the normal validator afterwards for route/connectivity checks.
 */
export function separateEnemyEntrances(entrances: readonly Point[], sites: readonly Point[],
  bounds: Rect, walls: readonly Rect[]): Point[] | null {
  // Generation publishes integer world positions. Validate those same positions;
  // rounding afterwards could otherwise move a marginal point inside the reserve.
  entrances = entrances.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  sites = sites.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const pad = ENEMY_SPAWN_SAFETY.wallClearance;
  const open = (p: Point) => p.x >= bounds.x + pad && p.y >= bounds.y + pad
    && p.x <= bounds.x + bounds.w - pad && p.y <= bounds.y + bounds.h - pad
    && walls.every(r => p.x < r.x - pad || p.x > r.x + r.w + pad || p.y < r.y - pad || p.y > r.y + r.h + pad);
  const result: Point[] = [];
  let candidates: Point[] | null = null;
  for (const entrance of entrances) {
    if (clearOfBombsites(entrance, sites) && open(entrance)) { result.push({ ...entrance }); continue; }
    if (!candidates) {
      candidates = [];
      const inset = 72;
      for (let x = bounds.x + inset; x <= bounds.x + bounds.w - inset; x += 32)
        candidates.push({ x, y: bounds.y + inset }, { x, y: bounds.y + bounds.h - inset });
      for (let y = bounds.y + inset; y <= bounds.y + bounds.h - inset; y += 32)
        candidates.push({ x: bounds.x + inset, y }, { x: bounds.x + bounds.w - inset, y });
    }
    let best: Point | null = null, distance = Infinity;
    for (const p of candidates) {
      if (!clearOfBombsites(p, sites) || !open(p)
        || result.some(other => Math.hypot(p.x - other.x, p.y - other.y) < 96)
        || entrances.some(other => other !== entrance && clearOfBombsites(other, sites) && Math.hypot(p.x - other.x, p.y - other.y) < 96)) continue;
      const d = (p.x - entrance.x) ** 2 + (p.y - entrance.y) ** 2;
      if (d < distance) { best = p; distance = d; }
    }
    if (!best) return null;
    result.push({ ...best });
  }
  return result;
}
