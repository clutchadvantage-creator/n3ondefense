import type { RectSpec } from '../../types.ts';
import {
  HEIST_LAYOUT_GRID,
  type HeistFacilityLayout,
  type HeistLayoutNode
} from './HeistFacilityLayout.ts';

export const HEIST_ZONE_ALPHA = {
  current: 0.018,
  adjacent: 0.24,
  secondary: 0.76,
  hidden: 0.992
} as const;

export const heistVisibilityZoneRect = (
  layout: Pick<HeistFacilityLayout, 'vaultBounds'>,
  node: HeistLayoutNode
): RectSpec => node.kind === 'vault'
  ? { ...layout.vaultBounds }
  : {
      x: HEIST_LAYOUT_GRID.margin + node.column * HEIST_LAYOUT_GRID.cellWidth,
      y: HEIST_LAYOUT_GRID.margin + node.row * HEIST_LAYOUT_GRID.cellHeight,
      w: HEIST_LAYOUT_GRID.cellWidth,
      h: HEIST_LAYOUT_GRID.cellHeight
    };

/**
 * Allocation-free graph visibility lookup used by the HEIST presentation.
 * The generated topology is known, so revealing two connected hops is both
 * cheaper and more spatially correct than raycasting against every object.
 */
export class HeistZoneVisibility {
  readonly targetAlpha: Float32Array;
  private readonly openAdjacency: number[][];
  private readonly closedAdjacency: number[][];
  private readonly gridZoneIndices = new Int16Array(HEIST_LAYOUT_GRID.columns * HEIST_LAYOUT_GRID.rows);
  private readonly distances: Int8Array;
  private readonly queue: Int16Array;
  private readonly vaultIndex: number;
  private currentIndex = -1;
  private currentDegree = 0;
  private previousDoorsOpen = false;
  private readonly layout: Pick<HeistFacilityLayout, 'nodes' | 'edges' | 'vaultNodeId' | 'vaultBounds'>;

  constructor(layout: Pick<HeistFacilityLayout, 'nodes' | 'edges' | 'vaultNodeId' | 'vaultBounds'>) {
    this.layout = layout;
    const nodeIndex = new Map(layout.nodes.map((node, index) => [node.id, index]));
    this.vaultIndex = nodeIndex.get(layout.vaultNodeId) ?? -1;
    this.gridZoneIndices.fill(this.vaultIndex);
    for (let index = 0; index < layout.nodes.length; index += 1) {
      const node = layout.nodes[index];
      if (node.kind === 'facility') this.gridZoneIndices[node.row * HEIST_LAYOUT_GRID.columns + node.column] = index;
    }
    this.openAdjacency = Array.from({ length: layout.nodes.length }, () => [] as number[]);
    this.closedAdjacency = Array.from({ length: layout.nodes.length }, () => [] as number[]);
    for (const [firstId, secondId] of layout.edges) {
      const first = nodeIndex.get(firstId);
      const second = nodeIndex.get(secondId);
      if (first === undefined || second === undefined) continue;
      this.openAdjacency[first].push(second);
      this.openAdjacency[second].push(first);
      if (first !== this.vaultIndex && second !== this.vaultIndex) {
        this.closedAdjacency[first].push(second);
        this.closedAdjacency[second].push(first);
      }
    }
    this.targetAlpha = new Float32Array(layout.nodes.length);
    this.targetAlpha.fill(HEIST_ZONE_ALPHA.hidden);
    this.distances = new Int8Array(layout.nodes.length);
    this.queue = new Int16Array(layout.nodes.length);
  }

  revealAt(x: number, y: number, doorsOpen: boolean): boolean {
    const zoneIndex = this.zoneIndexAt(x, y);
    if (zoneIndex === this.currentIndex && doorsOpen === this.previousDoorsOpen) return false;
    this.currentIndex = zoneIndex;
    this.previousDoorsOpen = doorsOpen;
    this.targetAlpha.fill(HEIST_ZONE_ALPHA.hidden);
    this.distances.fill(-1);
    if (zoneIndex < 0) return true;

    const adjacency = doorsOpen ? this.openAdjacency : this.closedAdjacency;
    this.currentDegree = adjacency[zoneIndex].length;
    let read = 0;
    let write = 1;
    this.queue[0] = zoneIndex;
    this.distances[zoneIndex] = 0;
    while (read < write) {
      const current = this.queue[read++];
      const distance = this.distances[current];
      this.targetAlpha[current] = distance === 0
        ? HEIST_ZONE_ALPHA.current
        : distance === 1 ? HEIST_ZONE_ALPHA.adjacent : HEIST_ZONE_ALPHA.secondary;
      if (distance >= 2) continue;
      const neighbors = adjacency[current];
      for (let index = 0; index < neighbors.length; index += 1) {
        const neighbor = neighbors[index];
        if (this.distances[neighbor] >= 0) continue;
        this.distances[neighbor] = distance + 1;
        this.queue[write++] = neighbor;
      }
    }
    return true;
  }

  isOpenArea(): boolean {
    return this.currentIndex === this.vaultIndex || this.currentDegree >= 3;
  }

  invalidate(): void {
    this.currentIndex = -1;
  }

  private zoneIndexAt(x: number, y: number): number {
    const vault = this.layout.vaultBounds;
    if (x >= vault.x && x <= vault.x + vault.w && y >= vault.y && y <= vault.y + vault.h) return this.vaultIndex;
    const column = Math.max(0, Math.min(HEIST_LAYOUT_GRID.columns - 1,
      Math.floor((x - HEIST_LAYOUT_GRID.margin) / HEIST_LAYOUT_GRID.cellWidth)));
    const row = Math.max(0, Math.min(HEIST_LAYOUT_GRID.rows - 1,
      Math.floor((y - HEIST_LAYOUT_GRID.margin) / HEIST_LAYOUT_GRID.cellHeight)));
    return this.gridZoneIndices[row * HEIST_LAYOUT_GRID.columns + column];
  }
}
