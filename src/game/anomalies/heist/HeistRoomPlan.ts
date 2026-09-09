import type { HeistFacilityLayout, HeistLayoutPoint } from './HeistFacilityLayout.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';

export interface HeistWallMount extends HeistLayoutPoint {
  rotation: number;
  wallIndex: number;
}

/** A solid room-facing wall span, never a doorway or an arbitrary floor point. */
export const findHeistWallMount = (
  layout: Pick<HeistFacilityLayout, 'wallRects'>, point: HeistLayoutPoint
): HeistWallMount | null => {
  let best: HeistWallMount | null = null;
  let distance = Infinity;
  layout.wallRects.forEach((wall, wallIndex) => {
    const horizontal = wall.w >= wall.h;
    if ((horizontal ? wall.w : wall.h) < 124) return;
    const x = horizontal ? Math.max(wall.x + 62, Math.min(point.x, wall.x + wall.w - 62))
      : point.x < wall.x ? wall.x : wall.x + wall.w;
    const y = horizontal ? point.y < wall.y ? wall.y : wall.y + wall.h
      : Math.max(wall.y + 62, Math.min(point.y, wall.y + wall.h - 62));
    const lateral = horizontal ? Math.abs(x - point.x) : Math.abs(y - point.y);
    const d = Math.hypot(x - point.x, y - point.y);
    if (lateral > 28 || d < 100 || d > 220 || d >= distance) return;
    distance = d;
    best = { x, y, wallIndex, rotation: horizontal ? point.y < y ? -Math.PI / 2 : Math.PI / 2 : point.x < x ? Math.PI : 0 };
  });
  return best;
};

export const HEIST_ROOM_ROLES = [
  { id: 'coolant', name: 'COOLANT EXCHANGE', accent: 0x53cfdf, code: 'C / 07' },
  { id: 'relay', name: 'SIGNAL RELAY', accent: 0x8fa5ef, code: 'R / 12' },
  { id: 'security', name: 'SECURITY CONTROL', accent: 0xd3a95a, code: 'S / 04' },
  { id: 'freight', name: 'BONDED STORAGE', accent: 0x80b9ae, code: 'F / 09' },
  { id: 'service', name: 'MAINTENANCE BAY', accent: 0x689caf, code: 'M / 03' }
] as const;

export interface HeistRoomDetail extends HeistLayoutPoint {
  nodeId: string;
  role: typeof HEIST_ROOM_ROLES[number];
  mount: HeistWallMount;
}

/** Existing side chambers gain a purpose without changing the maze graph,
 * loot budget, or the central 184px movement lane. All raised fixtures fit
 * inside the wall's existing footprint; floor diagrams are flat inlays. */
export const createHeistRoomPlan = (layout: HeistFacilityLayout): HeistRoomDetail[] => {
  const degrees = new Map(layout.nodes.map(n => [n.id, 0]));
  for (const [a, b] of layout.edges) { degrees.set(a, (degrees.get(a) ?? 0) + 1); degrees.set(b, (degrees.get(b) ?? 0) + 1); }
  const excluded = new Set([layout.entryNodeId, layout.extractionNodeId,
    ...layout.trapPlacements.map(t => t.nodeId), ...layout.vaultDoors.map(d => d.approachNodeId)]);
  const random = new SeededRandom((layout.seed ^ 0x524f4f4d) >>> 0);
  const candidates = random.shuffle(layout.nodes.filter(n => n.kind === 'facility' && !excluded.has(n.id)))
    .sort((a, b) => (degrees.get(a.id) ?? 0) - (degrees.get(b.id) ?? 0));
  const rooms: HeistRoomDetail[] = [];
  for (const node of candidates) {
    const mount = findHeistWallMount(layout, node);
    if (!mount) continue;
    rooms.push({ x: node.x, y: node.y, nodeId: node.id, mount, role: HEIST_ROOM_ROLES[rooms.length % HEIST_ROOM_ROLES.length] });
    if (rooms.length === 24) break;
  }
  return rooms;
};
