import type { ArenaLayout, RectSpec } from '../types';
import { GridPathfinder } from './GridPathfinder';

const overlapsRect = (r: RectSpec, x: number, y: number, pad = 0): boolean => {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
};

export class ArenaValidator {
  static validate(layout: ArenaLayout, worldWidth: number, worldHeight: number): boolean {
    const blockers: RectSpec[] = [...layout.walls, ...layout.obstacles.map((o) => ({ x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h }))];

    for (const r of blockers) {
      if (r.w <= 0 || r.h <= 0) return false;
      if (r.x < 0 || r.y < 0 || r.x + r.w > worldWidth || r.y + r.h > worldHeight) return false;
    }

    for (const r of blockers) {
      if (overlapsRect(r, layout.playerSpawn.x, layout.playerSpawn.y, 26)) return false;
    }

    for (const sp of layout.enemySpawns) {
      for (const r of blockers) {
        if (overlapsRect(r, sp.x, sp.y, 24)) return false;
      }
    }

    for (const site of layout.bombSites) {
      for (const r of blockers) {
        if (overlapsRect(r, site.x, site.y, 88)) return false;
      }
    }

    for (let i = 0; i < layout.bombSites.length; i += 1) {
      for (let j = i + 1; j < layout.bombSites.length; j += 1) {
        const a = layout.bombSites[i];
        const b = layout.bombSites[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 200) return false;
      }
    }

    const pathfinder = new GridPathfinder(worldWidth, worldHeight, 40, blockers);

    for (const site of layout.bombSites) {
      const path = pathfinder.findPath(layout.playerSpawn.x, layout.playerSpawn.y, site.x, site.y, { smooth: false });
      if (path.length === 0) return false;
      for (const spawn of layout.enemySpawns) {
        const enemyPath = pathfinder.findPath(spawn.x, spawn.y, site.x, site.y, { smooth: false });
        if (enemyPath.length === 0) return false;
      }
    }

    return true;
  }
}
