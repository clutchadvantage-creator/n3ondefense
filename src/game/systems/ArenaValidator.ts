import type { ArenaLayout, RectSpec } from '../types.ts';
import { ARENA_GENERATION_CONFIG as CONFIG } from '../config/arenaGeneration.ts';
import { GridPathfinder } from './GridPathfinder.ts';

const overlapsRect = (r: RectSpec, x: number, y: number, pad = 0): boolean => {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
};

export class ArenaValidator {
  static validateDetailed(layout: ArenaLayout, worldWidth: number, worldHeight: number): { valid: boolean; checks: string[]; failures: string[] } {
    const checks: string[] = [];
    const failures: string[] = [];
    const fail = (message: string): void => { failures.push(message); };
    const pass = (message: string): void => { checks.push(message); };
    const blockers: RectSpec[] = [...layout.walls, ...layout.obstacles.map((o) => ({ x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h }))];
    if (blockers.every((r) => r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= worldWidth && r.y + r.h <= worldHeight)) pass('geometry-in-bounds'); else fail('invalid-geometry');
    if (blockers.every((r) => !overlapsRect(r, layout.playerSpawn.x, layout.playerSpawn.y, 34))) pass('player-spawn-clear'); else fail('player-spawn-blocked');
    if (layout.enemySpawns.every((sp) => blockers.every((r) => !overlapsRect(r, sp.x, sp.y, 30)))) pass('enemy-spawns-clear'); else fail('enemy-spawn-blocked');
    if (layout.bombSites.every((site) => blockers.every((r) => !overlapsRect(r, site.x, site.y, 92)))) pass('bomb-sites-clear'); else fail('bomb-site-blocked');
    const separated = layout.bombSites.every((a, index) => layout.bombSites.slice(index + 1).every((b) => Math.hypot(a.x-b.x,a.y-b.y) >= 200));
    if (separated) pass('bomb-sites-separated'); else fail('bomb-sites-too-close');
    const pathfinder = new GridPathfinder(worldWidth, worldHeight, CONFIG.navigationCellSize, blockers, CONFIG.enemyNavigationPadding);
    const playerReachable = layout.bombSites.every((site) => pathfinder.findPath(layout.playerSpawn.x, layout.playerSpawn.y, site.x, site.y, { smooth:false }).length > 0);
    if (playerReachable) pass('player-reaches-all-objectives'); else fail('player-objective-path-missing');
    const enemyReachable = layout.bombSites.every((site) => layout.enemySpawns.every((spawn) => pathfinder.findPath(spawn.x,spawn.y,site.x,site.y,{smooth:false}).length>0));
    if (enemyReachable) pass('enemies-reach-all-objectives'); else fail('enemy-objective-path-missing');
    const groupClearancePadding = Math.max(
      CONFIG.enemyNavigationPadding,
      Math.ceil((CONFIG.minimumCorridorWidth - CONFIG.navigationCellSize) / 2)
    );
    const groupPathfinder = new GridPathfinder(
      worldWidth,
      worldHeight,
      CONFIG.navigationCellSize,
      blockers,
      groupClearancePadding
    );
    const playerGroupRoutes = layout.bombSites.every((site) =>
      groupPathfinder.findPath(layout.playerSpawn.x, layout.playerSpawn.y, site.x, site.y, { smooth:false }).length > 0
    );
    if (playerGroupRoutes) pass('important-player-routes-meet-group-width'); else fail('important-player-route-too-narrow');
    const enemyGroupRoutes = layout.bombSites.every((site) => layout.enemySpawns.every((spawn) =>
      groupPathfinder.findPath(spawn.x, spawn.y, site.x, site.y, { smooth:false }).length > 0
    ));
    if (enemyGroupRoutes) pass('important-enemy-routes-meet-group-width'); else fail('important-enemy-route-too-narrow');
    const spawnEscapePoints = [32,-32].flatMap((dx) => [32,-32].map((dy) => ({x:layout.playerSpawn.x+dx,y:layout.playerSpawn.y+dy})));
    if (spawnEscapePoints.filter((p)=>blockers.every((r)=>!overlapsRect(r,p.x,p.y,12))).length>=2) pass('player-spawn-has-escape-space'); else fail('player-spawn-trapped');
    if (layout.bombSites.every((site) => [0,Math.PI/2,Math.PI,Math.PI*1.5].filter((angle)=>blockers.every((r)=>!overlapsRect(r,site.x+Math.cos(angle)*125,site.y+Math.sin(angle)*125,30))).length>=2)) pass('defense-placement-space'); else fail('insufficient-defense-space');
    return { valid: failures.length===0, checks, failures };
  }

  static validate(layout: ArenaLayout, worldWidth: number, worldHeight: number): boolean {
    if (layout.generation) return this.validateDetailed(layout, worldWidth, worldHeight).valid;
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

    const pathfinder = new GridPathfinder(
      worldWidth,
      worldHeight,
      CONFIG.navigationCellSize,
      blockers,
      CONFIG.enemyNavigationPadding
    );

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
