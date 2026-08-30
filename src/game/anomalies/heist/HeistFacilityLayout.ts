import type { RectSpec } from '../../types.ts';
import { SeededRandom } from '../../systems/SeededRandom.ts';

export const HEIST_WORLD = { width: 5200, height: 3320 } as const;

export const HEIST_LAYOUT_GRID = {
  columns: 13,
  rows: 9,
  margin: 130,
  cellWidth: 380,
  cellHeight: 340,
  wallThickness: 58,
  passageWidth: 184
} as const;

export type HeistTrapType = 'fire' | 'spike' | 'snag';

export interface HeistLayoutPoint {
  x: number;
  y: number;
}

export interface HeistLayoutNode extends HeistLayoutPoint {
  id: string;
  column: number;
  row: number;
  kind: 'facility' | 'vault';
}

export interface HeistVaultDoorSpec extends HeistLayoutPoint {
  id: string;
  side: 'north' | 'south' | 'east' | 'west';
  orientation: 'horizontal' | 'vertical';
  approachNodeId: string;
  width: number;
}

export interface HeistTrapPlacement extends HeistLayoutPoint {
  id: string;
  type: HeistTrapType;
  rotation: number;
  nodeId: string;
}

export interface HeistFacilityLayout {
  seed: number;
  world: typeof HEIST_WORLD;
  nodes: readonly HeistLayoutNode[];
  edges: readonly (readonly [string, string])[];
  wallRects: readonly RectSpec[];
  vaultBounds: RectSpec;
  vaultNodeId: string;
  vaultDoors: readonly HeistVaultDoorSpec[];
  entryNodeId: string;
  entryPoint: HeistLayoutPoint;
  extractionNodeId: string;
  extractionPoint: HeistLayoutPoint;
  route: readonly HeistLayoutPoint[];
  extractionRoute: readonly HeistLayoutPoint[];
  containerPoints: readonly HeistLayoutPoint[];
  supportPoints: readonly ({ kind: 'health' | 'energy' } & HeistLayoutPoint)[];
  ambushPoints: readonly HeistLayoutPoint[];
  trapPlacements: readonly HeistTrapPlacement[];
  diagnostics: {
    attempts: number;
    loops: number;
    deadEnds: number;
    entryPathNodes: number;
    extractionPathNodes: number;
    initialVaultLineOfSightBlocked: boolean;
    valid: boolean;
  };
}

export interface HeistLayoutValidation {
  valid: boolean;
  reasons: string[];
}

const VAULT_COLUMNS = new Set([5, 6, 7]);
const VAULT_ROWS = new Set([3, 4, 5]);
const VAULT_NODE_ID = 'vault';

const nodeId = (column: number, row: number): string => `cell-${column}-${row}`;
const edgeKey = (a: string, b: string): string => a < b ? `${a}|${b}` : `${b}|${a}`;
const isVaultCell = (column: number, row: number): boolean => VAULT_COLUMNS.has(column) && VAULT_ROWS.has(row);

const cellCenter = (column: number, row: number): HeistLayoutPoint => ({
  x: HEIST_LAYOUT_GRID.margin + column * HEIST_LAYOUT_GRID.cellWidth + HEIST_LAYOUT_GRID.cellWidth * 0.5,
  y: HEIST_LAYOUT_GRID.margin + row * HEIST_LAYOUT_GRID.cellHeight + HEIST_LAYOUT_GRID.cellHeight * 0.5
});

const pointInsideRect = (point: HeistLayoutPoint, rect: RectSpec, padding = 0): boolean =>
  point.x >= rect.x - padding && point.x <= rect.x + rect.w + padding
  && point.y >= rect.y - padding && point.y <= rect.y + rect.h + padding;

const segmentIntersectsRect = (a: HeistLayoutPoint, b: HeistLayoutPoint, rect: RectSpec): boolean => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let minimum = 0;
  let maximum = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const ratio = q / p;
    if (p < 0) {
      if (ratio > maximum) return false;
      if (ratio > minimum) minimum = ratio;
    } else {
      if (ratio < minimum) return false;
      if (ratio < maximum) maximum = ratio;
    }
    return true;
  };
  return clip(-dx, a.x - rect.x)
    && clip(dx, rect.x + rect.w - a.x)
    && clip(-dy, a.y - rect.y)
    && clip(dy, rect.y + rect.h - a.y);
};

const adjacencyFor = (nodes: readonly HeistLayoutNode[], edges: readonly (readonly [string, string])[]): Map<string, string[]> => {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const [a, b] of edges) {
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }
  return adjacency;
};

export const nearestHeistNodeId = (layout: Pick<HeistFacilityLayout, 'nodes'>, x: number, y: number): string => {
  let nearest = layout.nodes[0]?.id ?? VAULT_NODE_ID;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const node of layout.nodes) {
    const dx = node.x - x;
    const dy = node.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = node.id;
    }
  }
  return nearest;
};

export const findHeistNodePath = (
  layout: Pick<HeistFacilityLayout, 'nodes' | 'edges'>,
  fromNodeId: string,
  toNodeId: string
): string[] => {
  if (fromNodeId === toNodeId) return [fromNodeId];
  const adjacency = adjacencyFor(layout.nodes, layout.edges);
  const queue = [fromNodeId];
  const parent = new Map<string, string | null>([[fromNodeId, null]]);
  for (let read = 0; read < queue.length; read += 1) {
    const current = queue[read];
    for (const neighbor of adjacency.get(current) ?? []) {
      if (parent.has(neighbor)) continue;
      parent.set(neighbor, current);
      if (neighbor === toNodeId) {
        const path = [toNodeId];
        let cursor: string | null = current;
        while (cursor) { path.push(cursor); cursor = parent.get(cursor) ?? null; }
        return path.reverse();
      }
      queue.push(neighbor);
    }
  }
  return [];
};

export const heistPathPoints = (
  layout: Pick<HeistFacilityLayout, 'nodes' | 'edges'>,
  fromNodeId: string,
  toNodeId: string
): HeistLayoutPoint[] => {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  return findHeistNodePath(layout, fromNodeId, toNodeId)
    .map((id) => byId.get(id))
    .filter((node): node is HeistLayoutNode => Boolean(node))
    .map(({ x, y }) => ({ x, y }));
};

const addSegmentedWall = (
  wallRects: RectSpec[],
  x: number,
  y: number,
  width: number,
  height: number,
  opening: boolean,
  horizontal: boolean
): void => {
  const thickness = HEIST_LAYOUT_GRID.wallThickness;
  const gap = HEIST_LAYOUT_GRID.passageWidth;
  if (!opening) {
    wallRects.push({ x, y, w: Math.max(thickness, width), h: Math.max(thickness, height) });
    return;
  }
  const length = horizontal ? width : height;
  const side = Math.max(0, (length - gap) * 0.5);
  if (horizontal) {
    wallRects.push({ x, y, w: side, h: thickness });
    wallRects.push({ x: x + side + gap, y, w: side, h: thickness });
  } else {
    wallRects.push({ x, y, w: thickness, h: side });
    wallRects.push({ x, y: y + side + gap, w: thickness, h: side });
  }
};

const buildWalls = (openEdges: ReadonlySet<string>, vaultDoors: readonly HeistVaultDoorSpec[]): RectSpec[] => {
  const grid = HEIST_LAYOUT_GRID;
  const walls: RectSpec[] = [
    { x: 0, y: 0, w: HEIST_WORLD.width, h: 90 },
    { x: 0, y: HEIST_WORLD.height - 90, w: HEIST_WORLD.width, h: 90 },
    { x: 0, y: 0, w: 90, h: HEIST_WORLD.height },
    { x: HEIST_WORLD.width - 90, y: 0, w: 90, h: HEIST_WORLD.height }
  ];

  for (let column = 0; column < grid.columns - 1; column += 1) {
    const x = grid.margin + (column + 1) * grid.cellWidth - grid.wallThickness * 0.5;
    for (let row = 0; row < grid.rows; row += 1) {
      if (isVaultCell(column, row) || isVaultCell(column + 1, row)) continue;
      const a = nodeId(column, row);
      const b = nodeId(column + 1, row);
      addSegmentedWall(walls, x, grid.margin + row * grid.cellHeight,
        grid.wallThickness, grid.cellHeight, openEdges.has(edgeKey(a, b)), false);
    }
  }
  for (let row = 0; row < grid.rows - 1; row += 1) {
    const y = grid.margin + (row + 1) * grid.cellHeight - grid.wallThickness * 0.5;
    for (let column = 0; column < grid.columns; column += 1) {
      if (isVaultCell(column, row) || isVaultCell(column, row + 1)) continue;
      const a = nodeId(column, row);
      const b = nodeId(column, row + 1);
      addSegmentedWall(walls, grid.margin + column * grid.cellWidth, y,
        grid.cellWidth, grid.wallThickness, openEdges.has(edgeKey(a, b)), true);
    }
  }

  const vaultX = grid.margin + 5 * grid.cellWidth;
  const vaultY = grid.margin + 3 * grid.cellHeight;
  const vaultWidth = 3 * grid.cellWidth;
  const vaultHeight = 3 * grid.cellHeight;
  const doorBySide = new Map(vaultDoors.map((door) => [door.side, door]));
  addSegmentedWall(walls, vaultX, vaultY - grid.wallThickness * 0.5, vaultWidth, grid.wallThickness,
    doorBySide.has('north'), true);
  addSegmentedWall(walls, vaultX, vaultY + vaultHeight - grid.wallThickness * 0.5, vaultWidth, grid.wallThickness,
    doorBySide.has('south'), true);
  addSegmentedWall(walls, vaultX - grid.wallThickness * 0.5, vaultY, grid.wallThickness, vaultHeight,
    doorBySide.has('west'), false);
  addSegmentedWall(walls, vaultX + vaultWidth - grid.wallThickness * 0.5, vaultY, grid.wallThickness, vaultHeight,
    doorBySide.has('east'), false);
  return walls.filter((rect) => rect.w > 1 && rect.h > 1);
};

const buildCandidateEdges = (nodes: readonly HeistLayoutNode[]): Array<[string, string]> => {
  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges: Array<[string, string]> = [];
  for (const node of nodes) {
    if (node.kind !== 'facility') continue;
    for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
      const neighbor = nodeId(node.column + dc, node.row + dr);
      if (nodeSet.has(neighbor)) edges.push([node.id, neighbor]);
    }
  }
  return edges;
};

const shuffle = <T>(values: T[], random: SeededRandom): T[] => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random.next() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
};

const createGraph = (
  facilityNodes: readonly HeistLayoutNode[],
  random: SeededRandom
): { edges: Array<[string, string]>; loopCount: number } => {
  const candidates = buildCandidateEdges(facilityNodes);
  const candidateAdjacency = new Map(facilityNodes.map((node) => [node.id, [] as string[]]));
  for (const [a, b] of candidates) {
    candidateAdjacency.get(a)?.push(b);
    candidateAdjacency.get(b)?.push(a);
  }
  const start = facilityNodes[Math.floor(random.next() * facilityNodes.length)].id;
  const visited = new Set([start]);
  const stack = [start];
  const edges: Array<[string, string]> = [];
  while (stack.length) {
    const current = stack[stack.length - 1];
    const unvisited = shuffle([...(candidateAdjacency.get(current) ?? [])].filter((id) => !visited.has(id)), random);
    if (!unvisited.length) { stack.pop(); continue; }
    const next = unvisited[0];
    visited.add(next);
    stack.push(next);
    edges.push([current, next]);
  }
  const open = new Set(edges.map(([a, b]) => edgeKey(a, b)));
  const remaining = shuffle(candidates.filter(([a, b]) => !open.has(edgeKey(a, b))), random);
  const desiredLoops = Math.max(7, Math.floor(facilityNodes.length * 0.075));
  for (let index = 0; index < Math.min(desiredLoops, remaining.length); index += 1) edges.push(remaining[index]);
  return { edges, loopCount: Math.min(desiredLoops, remaining.length) };
};

const vaultDoorDefinitions = (): HeistVaultDoorSpec[] => {
  const grid = HEIST_LAYOUT_GRID;
  const vaultX = grid.margin + 5 * grid.cellWidth;
  const vaultY = grid.margin + 3 * grid.cellHeight;
  const vaultWidth = grid.cellWidth * 3;
  const vaultHeight = grid.cellHeight * 3;
  return [
    { id: 'vault-north', side: 'north', orientation: 'horizontal', x: vaultX + vaultWidth * 0.5,
      y: vaultY, approachNodeId: nodeId(6, 2), width: grid.passageWidth },
    { id: 'vault-south', side: 'south', orientation: 'horizontal', x: vaultX + vaultWidth * 0.5,
      y: vaultY + vaultHeight, approachNodeId: nodeId(6, 6), width: grid.passageWidth },
    { id: 'vault-west', side: 'west', orientation: 'vertical', x: vaultX,
      y: vaultY + vaultHeight * 0.5, approachNodeId: nodeId(4, 4), width: grid.passageWidth },
    { id: 'vault-east', side: 'east', orientation: 'vertical', x: vaultX + vaultWidth,
      y: vaultY + vaultHeight * 0.5, approachNodeId: nodeId(8, 4), width: grid.passageWidth }
  ];
};

const chooseFacilityNode = (
  candidates: readonly HeistLayoutNode[],
  random: SeededRandom,
  predicate: (node: HeistLayoutNode) => boolean
): HeistLayoutNode => {
  const eligible = candidates.filter(predicate);
  return eligible[Math.floor(random.next() * eligible.length)] ?? candidates[0];
};

const createTrapPlacements = (
  nodes: readonly HeistLayoutNode[],
  edges: readonly (readonly [string, string])[],
  excluded: ReadonlySet<string>,
  random: SeededRandom
): HeistTrapPlacement[] => {
  const adjacency = adjacencyFor(nodes, edges);
  const candidates = shuffle(nodes.filter((node) => node.kind === 'facility' && !excluded.has(node.id)), random);
  const traps: HeistTrapPlacement[] = [];
  const desired = Math.min(18, Math.max(12, Math.floor(candidates.length * 0.15)));
  for (const node of candidates) {
    if (traps.length >= desired) break;
    if (traps.some((trap) => (trap.x - node.x) ** 2 + (trap.y - node.y) ** 2 < 430 ** 2)) continue;
    const degree = adjacency.get(node.id)?.length ?? 0;
    const type: HeistTrapType = traps.length % 3 === 0 ? 'fire' : traps.length % 3 === 1 ? 'spike' : 'snag';
    const rotation = type === 'fire'
      ? (degree <= 1 || random.next() < 0.5 ? 0 : Math.PI * 0.5)
      : random.next() < 0.5 ? 0 : Math.PI * 0.5;
    traps.push({
      id: `trap-${type}-${traps.length}`,
      type,
      nodeId: node.id,
      x: node.x + (type === 'fire' ? Math.cos(rotation + Math.PI) * 118 : 0),
      y: node.y + (type === 'fire' ? Math.sin(rotation + Math.PI) * 102 : 0),
      rotation
    });
  }
  return traps;
};

const createLayoutAttempt = (seed: number, attempt: number): HeistFacilityLayout => {
  const attemptSeed = (seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
  const random = new SeededRandom(attemptSeed);
  const facilityNodes: HeistLayoutNode[] = [];
  for (let row = 0; row < HEIST_LAYOUT_GRID.rows; row += 1) {
    for (let column = 0; column < HEIST_LAYOUT_GRID.columns; column += 1) {
      if (isVaultCell(column, row)) continue;
      facilityNodes.push({ id: nodeId(column, row), column, row, kind: 'facility', ...cellCenter(column, row) });
    }
  }
  const vaultBounds: RectSpec = {
    x: HEIST_LAYOUT_GRID.margin + 5 * HEIST_LAYOUT_GRID.cellWidth,
    y: HEIST_LAYOUT_GRID.margin + 3 * HEIST_LAYOUT_GRID.cellHeight,
    w: 3 * HEIST_LAYOUT_GRID.cellWidth,
    h: 3 * HEIST_LAYOUT_GRID.cellHeight
  };
  const vaultNode: HeistLayoutNode = {
    id: VAULT_NODE_ID, column: 6, row: 4, kind: 'vault',
    x: vaultBounds.x + vaultBounds.w * 0.5, y: vaultBounds.y + vaultBounds.h * 0.5
  };
  const graph = createGraph(facilityNodes, random);
  const vaultDoors = shuffle(vaultDoorDefinitions(), random).slice(0, 3);
  const edges: Array<[string, string]> = [...graph.edges,
    ...vaultDoors.map((door) => [door.approachNodeId, VAULT_NODE_ID] as [string, string])];
  const nodes = [...facilityNodes, vaultNode];
  const openEdges = new Set(graph.edges.map(([a, b]) => edgeKey(a, b)));
  const wallRects = buildWalls(openEdges, vaultDoors);

  const outerNodes = facilityNodes.filter((node) => node.column === 0 || node.column === HEIST_LAYOUT_GRID.columns - 1
    || node.row === 0 || node.row === HEIST_LAYOUT_GRID.rows - 1);
  const entryCandidates = outerNodes.filter((node) => {
    const path = findHeistNodePath({ nodes, edges }, node.id, VAULT_NODE_ID);
    return path.length >= 9 && wallRects.some((rect) => segmentIntersectsRect(node, vaultNode, rect));
  });
  const entry = chooseFacilityNode(entryCandidates.length ? entryCandidates : outerNodes, random, () => true);
  const entryPathIds = findHeistNodePath({ nodes, edges }, entry.id, VAULT_NODE_ID);

  const extractionCandidates = facilityNodes.filter((node) => {
    if (node.id === entry.id) return false;
    const outerOrMid = node.column <= 2 || node.column >= HEIST_LAYOUT_GRID.columns - 3
      || node.row <= 1 || node.row >= HEIST_LAYOUT_GRID.rows - 2;
    if (!outerOrMid) return false;
    const path = findHeistNodePath({ nodes, edges }, VAULT_NODE_ID, node.id);
    return path.length >= 7 && path.length <= 15;
  });
  const extraction = chooseFacilityNode(extractionCandidates.length ? extractionCandidates : outerNodes, random,
    (node) => node.id !== entry.id);
  const extractionPathIds = findHeistNodePath({ nodes, edges }, VAULT_NODE_ID, extraction.id);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pointsFor = (ids: readonly string[]): HeistLayoutPoint[] => ids
    .map((id) => byId.get(id))
    .filter((node): node is HeistLayoutNode => Boolean(node))
    .map(({ x, y }) => ({ x, y }));

  const excludedTrapNodes = new Set([
    entry.id, extraction.id, VAULT_NODE_ID,
    ...vaultDoors.map((door) => door.approachNodeId),
    ...entryPathIds.slice(0, 2)
  ]);
  const trapPlacements = createTrapPlacements(nodes, edges, excludedTrapNodes, random);
  const trapNodes = new Set(trapPlacements.map((trap) => trap.nodeId));
  const supportCandidates = shuffle(facilityNodes.filter((node) => !trapNodes.has(node.id)
    && node.id !== entry.id && node.id !== extraction.id
    && !vaultDoors.some((door) => door.approachNodeId === node.id)), random).slice(0, 8);
  const supportPoints = supportCandidates.map((node, index) => ({
    kind: index % 2 ? 'energy' as const : 'health' as const,
    x: node.x + (index % 2 ? 38 : -38), y: node.y + (index % 3 - 1) * 28
  }));
  const ambushCandidates = shuffle(facilityNodes.filter((node) => node.id !== entry.id
    && node.id !== extraction.id && !trapNodes.has(node.id) && !pointInsideRect(node, vaultBounds, 80)), random);
  const ambushPoints = [
    ...vaultDoors.map((door) => ({
      x: door.x + (door.side === 'west' ? -190 : door.side === 'east' ? 190 : 0),
      y: door.y + (door.side === 'north' ? -190 : door.side === 'south' ? 190 : 0)
    })),
    ...ambushCandidates.slice(0, 18).map(({ x, y }) => ({ x, y }))
  ];
  const containerPoints: HeistLayoutPoint[] = [
    { x: vaultBounds.x + 210, y: vaultBounds.y + 210 },
    { x: vaultBounds.x + vaultBounds.w * 0.5, y: vaultBounds.y + 190 },
    { x: vaultBounds.x + vaultBounds.w - 210, y: vaultBounds.y + 210 },
    { x: vaultBounds.x + 210, y: vaultBounds.y + vaultBounds.h * 0.5 },
    { x: vaultBounds.x + vaultBounds.w - 210, y: vaultBounds.y + vaultBounds.h * 0.5 },
    { x: vaultBounds.x + 210, y: vaultBounds.y + vaultBounds.h - 210 },
    { x: vaultBounds.x + vaultBounds.w * 0.5, y: vaultBounds.y + vaultBounds.h - 190 },
    { x: vaultBounds.x + vaultBounds.w - 210, y: vaultBounds.y + vaultBounds.h - 210 }
  ];
  const adjacency = adjacencyFor(nodes, edges);
  const deadEnds = facilityNodes.filter((node) => (adjacency.get(node.id)?.length ?? 0) === 1).length;
  const layout: HeistFacilityLayout = {
    seed: attemptSeed,
    world: HEIST_WORLD,
    nodes,
    edges,
    wallRects,
    vaultBounds,
    vaultNodeId: VAULT_NODE_ID,
    vaultDoors,
    entryNodeId: entry.id,
    entryPoint: { x: entry.x, y: entry.y },
    extractionNodeId: extraction.id,
    extractionPoint: { x: extraction.x, y: extraction.y },
    route: pointsFor(entryPathIds),
    extractionRoute: pointsFor(extractionPathIds),
    containerPoints,
    supportPoints,
    ambushPoints,
    trapPlacements,
    diagnostics: {
      attempts: attempt + 1,
      loops: graph.loopCount + Math.max(0, vaultDoors.length - 1),
      deadEnds,
      entryPathNodes: entryPathIds.length,
      extractionPathNodes: extractionPathIds.length,
      initialVaultLineOfSightBlocked: wallRects.some((rect) => segmentIntersectsRect(entry, vaultNode, rect)),
      valid: false
    }
  };
  layout.diagnostics.valid = validateHeistFacilityLayout(layout).valid;
  return layout;
};

export const validateHeistFacilityLayout = (layout: HeistFacilityLayout): HeistLayoutValidation => {
  const reasons: string[] = [];
  const entryPath = findHeistNodePath(layout, layout.entryNodeId, layout.vaultNodeId);
  const extractionPath = findHeistNodePath(layout, layout.vaultNodeId, layout.extractionNodeId);
  if (entryPath.length < 9) reasons.push('entry-route-too-short');
  if (extractionPath.length < 7 || extractionPath.length > 15) reasons.push('extraction-route-outside-fair-distance');
  if (layout.entryNodeId === layout.extractionNodeId) reasons.push('entry-and-extraction-match');
  if (layout.vaultDoors.length < 2) reasons.push('vault-needs-multiple-approaches');
  if (layout.diagnostics.loops < 2) reasons.push('insufficient-loops');
  if (layout.diagnostics.deadEnds < 2) reasons.push('insufficient-dead-ends');
  if (!layout.diagnostics.initialVaultLineOfSightBlocked) reasons.push('vault-visible-from-entry');
  if (layout.trapPlacements.some((trap) => trap.nodeId === layout.entryNodeId
    || trap.nodeId === layout.extractionNodeId
    || layout.vaultDoors.some((door) => door.approachNodeId === trap.nodeId))) reasons.push('trap-on-protected-node');
  if (layout.entryPoint.x < 100 || layout.entryPoint.y < 100
    || layout.entryPoint.x > layout.world.width - 100 || layout.entryPoint.y > layout.world.height - 100) {
    reasons.push('entry-outside-world');
  }
  return { valid: reasons.length === 0, reasons };
};

export const generateHeistFacilityLayout = (seed: number): HeistFacilityLayout => {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const layout = createLayoutAttempt(seed >>> 0, attempt);
    if (layout.diagnostics.valid) return layout;
  }
  // The graph builder is connected by construction. This deterministic final
  // attempt is a safe reproducible fallback rather than an unbounded retry.
  const fallback = createLayoutAttempt(0x48333135, 0);
  if (!validateHeistFacilityLayout(fallback).valid) {
    throw new Error('HEIST facility fallback failed validation');
  }
  return fallback;
};
