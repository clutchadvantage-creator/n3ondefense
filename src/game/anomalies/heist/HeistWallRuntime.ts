import type { RectSpec } from '../../types.ts';

const DEFAULT_CELL_SIZE = 256;

const cloneRect = (rect: RectSpec): RectSpec => ({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });

const mergeHorizontal = (rects: readonly RectSpec[]): RectSpec[] => {
  const groups = new Map<string, RectSpec[]>();
  for (const rect of rects) {
    const key = `${rect.y}|${rect.h}`;
    const group = groups.get(key);
    if (group) group.push(cloneRect(rect));
    else groups.set(key, [cloneRect(rect)]);
  }
  const merged: RectSpec[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.x - b.x || a.w - b.w);
    let current = group[0];
    for (let index = 1; index < group.length; index += 1) {
      const next = group[index];
      const end = current.x + current.w;
      if (next.x <= end) current.w = Math.max(end, next.x + next.w) - current.x;
      else { merged.push(current); current = next; }
    }
    if (current) merged.push(current);
  }
  return merged;
};

const mergeVertical = (rects: readonly RectSpec[]): RectSpec[] => {
  const groups = new Map<string, RectSpec[]>();
  for (const rect of rects) {
    const key = `${rect.x}|${rect.w}`;
    const group = groups.get(key);
    if (group) group.push(cloneRect(rect));
    else groups.set(key, [cloneRect(rect)]);
  }
  const merged: RectSpec[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.y - b.y || a.h - b.h);
    let current = group[0];
    for (let index = 1; index < group.length; index += 1) {
      const next = group[index];
      const end = current.y + current.h;
      if (next.y <= end) current.h = Math.max(end, next.y + next.h) - current.y;
      else { merged.push(current); current = next; }
    }
    if (current) merged.push(current);
  }
  return merged;
};

/**
 * Reduces redundant HEIST wall bodies without changing their occupied union.
 * Only collinear rectangles with the same cross-section are joined; corners,
 * openings, passage widths, and every collision boundary remain unchanged.
 */
export const mergeAxisAlignedHeistWalls = (rects: readonly RectSpec[]): RectSpec[] => {
  let merged = rects.map(cloneRect);
  // A horizontal join can expose a vertical join (and vice versa). The layout
  // is finite, and each successful pass strictly reduces the rectangle count.
  while (true) {
    const before = merged.length;
    merged = mergeVertical(mergeHorizontal(merged));
    if (merged.length === before) return merged;
  }
};

export interface HeistWallPointIndexDiagnostics {
  cellSize: number;
  bucketCount: number;
  maximumCandidatesPerBucket: number;
}

/** Allocation-free point containment index for the projectile hot path. */
export class HeistWallPointIndex {
  private readonly buckets = new Map<number, RectSpec[]>();
  private readonly cellSize: number;
  readonly diagnostics: HeistWallPointIndexDiagnostics;

  constructor(rects: readonly RectSpec[], cellSize = DEFAULT_CELL_SIZE) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('HEIST wall index cell size must be positive.');
    this.cellSize = cellSize;
    for (const rect of rects) {
      const minCellX = Math.floor(rect.x / cellSize);
      const maxCellX = Math.floor((rect.x + rect.w) / cellSize);
      const minCellY = Math.floor(rect.y / cellSize);
      const maxCellY = Math.floor((rect.y + rect.h) / cellSize);
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          const key = this.key(cellX, cellY);
          const bucket = this.buckets.get(key);
          if (bucket) bucket.push(rect);
          else this.buckets.set(key, [rect]);
        }
      }
    }
    let maximumCandidatesPerBucket = 0;
    for (const bucket of this.buckets.values()) maximumCandidatesPerBucket = Math.max(maximumCandidatesPerBucket, bucket.length);
    this.diagnostics = { cellSize, bucketCount: this.buckets.size, maximumCandidatesPerBucket };
  }

  contains(x: number, y: number): boolean {
    const bucket = this.buckets.get(this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)));
    if (!bucket) return false;
    for (let index = 0; index < bucket.length; index += 1) {
      const rect = bucket[index];
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
    }
    return false;
  }

  private key(cellX: number, cellY: number): number {
    return (cellX + 32768) * 65536 + cellY + 32768;
  }
}

/** Partition the occupied wall union into disjoint rectangles. Long runs own
 * junctions first; branches terminate flush at that run instead of crossing
 * through it. This preserves door openings and every walkable route. */
export const normalizeHeistWallJunctions = (rects: readonly RectSpec[]): RectSpec[] => {
  const ordered = mergeAxisAlignedHeistWalls(rects).sort((a, b) => b.w*b.h-a.w*a.h);
  const result: RectSpec[] = [];
  for (const rect of ordered) {
    let pieces = [rect];
    for (const occupied of result) {
      const next: RectSpec[] = [];
      for (const piece of pieces) {
        const left = Math.max(piece.x, occupied.x), right = Math.min(piece.x+piece.w, occupied.x+occupied.w);
        const top = Math.max(piece.y, occupied.y), bottom = Math.min(piece.y+piece.h, occupied.y+occupied.h);
        if (right <= left || bottom <= top) { next.push(piece); continue; }
        if (top > piece.y) next.push({ x: piece.x, y: piece.y, w: piece.w, h: top-piece.y });
        if (bottom < piece.y+piece.h) next.push({ x: piece.x, y: bottom, w: piece.w, h: piece.y+piece.h-bottom });
        if (left > piece.x) next.push({ x: piece.x, y: top, w: left-piece.x, h: bottom-top });
        if (right < piece.x+piece.w) next.push({ x: right, y: top, w: piece.x+piece.w-right, h: bottom-top });
      }
      pieces = next;
      if (!pieces.length) break;
    }
    result.push(...pieces);
  }
  return mergeAxisAlignedHeistWalls(result);
};

export interface HeistWallEdge { side: 'north' | 'south' | 'east' | 'west'; x: number; y: number; length: number; }

/** Only exposed union edges receive dimensional facades. An internal seam at
 * an L/T/four-way junction is neither a visual wall face nor a collider edge. */
export const exposedHeistWallEdges = (rect: RectSpec, walls: readonly RectSpec[]): HeistWallEdge[] => {
  const edges: HeistWallEdge[] = [];
  for (const side of ['north', 'south', 'east', 'west'] as const) {
    const horizontal = side === 'north' || side === 'south';
    const coordinate = side === 'north' ? rect.y : side === 'south' ? rect.y+rect.h : side === 'west' ? rect.x : rect.x+rect.w;
    let spans = [[horizontal ? rect.x : rect.y, horizontal ? rect.x+rect.w : rect.y+rect.h]];
    for (const other of walls) {
      if (other === rect) continue;
      const touching = side === 'north' ? other.y+other.h === coordinate : side === 'south' ? other.y === coordinate
        : side === 'west' ? other.x+other.w === coordinate : other.x === coordinate;
      if (!touching) continue;
      const start = horizontal ? other.x : other.y, end = start+(horizontal ? other.w : other.h);
      const next: number[][] = [];
      for (const [a,b] of spans) {
        if (end <= a || start >= b) next.push([a,b]);
        else { if (start>a) next.push([a,start]); if (end<b) next.push([end,b]); }
      }
      spans = next;
    }
    for (const [start,end] of spans) edges.push({ side, x: horizontal ? start : coordinate,
      y: horizontal ? coordinate : start, length: end-start });
  }
  return edges;
};
