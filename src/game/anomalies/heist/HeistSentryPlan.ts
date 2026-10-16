import type { ArenaSmashablePlacement, RectSpec } from '../../types.ts';
import { HEIST_LAYOUT_GRID, type HeistFacilityLayout, type HeistLayoutPoint } from './HeistFacilityLayout.ts';
import { createHeistRoomPlan } from './HeistRoomPlan.ts';
import { validHeistHostilePosition } from './HeistHostileGeometry.ts';
import { smashableWorldFootprint } from '../../arena/SmashablePlacementGeometry.ts';
import { hostileOverlapsRect } from './HeistHostileGeometry.ts';

export interface HeistSentryRoomPlan {
  nodeId: string;
  bounds: RectSpec;
  sentry: HeistLayoutPoint;
  propId: string;
}
export const insideSentryRoom = (room: HeistSentryRoomPlan, x: number, y: number): boolean =>
  x >= room.bounds.x && x <= room.bounds.x + room.bounds.w
  && y >= room.bounds.y && y <= room.bounds.y + room.bounds.h;

/** Reuse occupied, accessible side chambers and their existing smashables.
 * Corners keep the central 184px passage and door approaches clear. */
export const createHeistSentryPlan = (layout: HeistFacilityLayout,
  props: readonly ArenaSmashablePlacement[]): HeistSentryRoomPlan[] => {
  const rooms: HeistSentryRoomPlan[] = [];
  const halfW = (HEIST_LAYOUT_GRID.cellWidth - HEIST_LAYOUT_GRID.wallThickness) / 2;
  const halfH = (HEIST_LAYOUT_GRID.cellHeight - HEIST_LAYOUT_GRID.wallThickness) / 2;
  for (const node of createHeistRoomPlan(layout, Infinity)) {
    const bounds = { x: node.x - halfW, y: node.y - halfH, w: halfW * 2, h: halfH * 2 };
    const prop = props.find(p => p.x >= bounds.x && p.x <= bounds.x + bounds.w && p.y >= bounds.y && p.y <= bounds.y + bounds.h);
    if (!prop) continue;
    const corners = [-1, 1].flatMap(sx => [-1, 1].map(sy => ({ x: node.x + sx * 122, y: node.y + sy * 102 })))
      .sort((a, b) => Math.hypot(b.x - prop.x, b.y - prop.y) - Math.hypot(a.x - prop.x, a.y - prop.y));
    const sentry = corners.find(p => validHeistHostilePosition(layout, p.x, p.y, 28)
      && !props.some(other => hostileOverlapsRect(p.x, p.y, 42, 42, smashableWorldFootprint(other))));
    if (!sentry) continue;
    rooms.push({ nodeId: node.nodeId, bounds, sentry, propId: prop.id });
    if (rooms.length === 3) break;
  }
  return rooms;
};

export type HeistSentryPhase = 'dormant' | 'deploying' | 'active' | 'destroyed';
export const HEIST_SENTRY_DEPLOY_MS = 980;

/** The active scene clock owns deployment. Damage events are the only trigger. */
export class HeistSentryState {
  phase: HeistSentryPhase = 'dormant';
  elapsedMs = 0;
  trigger(): boolean {
    if (this.phase !== 'dormant') return false;
    this.phase = 'deploying'; this.elapsedMs = 0; return true;
  }
  advance(deltaMs: number): boolean {
    if (this.phase !== 'deploying') return false;
    this.elapsedMs += Math.max(0, deltaMs);
    if (this.elapsedMs < HEIST_SENTRY_DEPLOY_MS) return false;
    this.phase = 'active'; return true;
  }
  destroy(): boolean {
    if (this.phase !== 'active') return false;
    this.phase = 'destroyed'; return true;
  }
}
