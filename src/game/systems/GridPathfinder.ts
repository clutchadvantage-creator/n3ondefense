interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathQueryOptions {
  cellPenalty?: (cx: number, cy: number) => number;
  smooth?: boolean;
  maxIterations?: number;
  output?: PathPoint[];
}

const DIRECTIONS = new Int8Array([
  1, 0,
  -1, 0,
  0, 1,
  0, -1,
  1, 1,
  1, -1,
  -1, 1,
  -1, -1
]);

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/**
 * Allocation-conscious A* grid used by every active enemy. Search storage is
 * retained and reset in-place between queries, avoiding the Maps, Sets,
 * coordinate strings, sorted open arrays, and temporary vectors that caused
 * sustained garbage collection during long encounters.
 */
export class GridPathfinder {
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly cellSize: number;
  private readonly blockerPadding: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellCount: number;
  private readonly blocked: Uint8Array;
  private readonly gScore: Float64Array;
  private readonly fScore: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly closed: Uint8Array;
  private readonly heap: Int32Array;
  private readonly heapPosition: Int32Array;
  private readonly insertionOrder: Int32Array;
  private heapSize = 0;
  private nextInsertionOrder = 0;
  private readonly reconstructedIndices: number[] = [];
  private readonly smoothedIndices: number[] = [];

  constructor(
    worldWidth: number,
    worldHeight: number,
    cellSize: number,
    walls: WallRect[],
    blockerPadding = 0
  ) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.cellSize = cellSize;
    this.blockerPadding = blockerPadding;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.cellCount = this.cols * this.rows;
    this.blocked = new Uint8Array(this.cellCount);
    this.gScore = new Float64Array(this.cellCount);
    this.fScore = new Float64Array(this.cellCount);
    this.cameFrom = new Int32Array(this.cellCount);
    this.closed = new Uint8Array(this.cellCount);
    this.heap = new Int32Array(this.cellCount);
    this.heapPosition = new Int32Array(this.cellCount);
    this.insertionOrder = new Int32Array(this.cellCount);
    this.buildBlockedGrid(walls);
  }

  private index(x: number, y: number): number {
    return y * this.cols + x;
  }

  private cellX(index: number): number {
    return index % this.cols;
  }

  private cellY(index: number): number {
    return Math.floor(index / this.cols);
  }

  private buildBlockedGrid(walls: WallRect[]): void {
    for (const wall of walls) {
      const minX = Math.max(0, Math.floor((wall.x - this.blockerPadding) / this.cellSize));
      const maxX = Math.min(this.cols - 1, Math.floor((wall.x + wall.w + this.blockerPadding) / this.cellSize));
      const minY = Math.max(0, Math.floor((wall.y - this.blockerPadding) / this.cellSize));
      const maxY = Math.min(this.rows - 1, Math.floor((wall.y + wall.h + this.blockerPadding) / this.cellSize));

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) this.blocked[this.index(x, y)] = 1;
      }
    }
  }

  worldToCell(wx: number, wy: number): PathPoint {
    return {
      x: clamp(Math.floor(wx / this.cellSize), 0, this.cols - 1),
      y: clamp(Math.floor(wy / this.cellSize), 0, this.rows - 1)
    };
  }

  cellToWorld(cx: number, cy: number): PathPoint {
    return { x: this.cellCenterX(cx), y: this.cellCenterY(cy) };
  }

  cellCenterX(cx: number): number {
    return clamp(cx * this.cellSize + this.cellSize * 0.5, 0, this.worldWidth);
  }

  cellCenterY(cy: number): number {
    return clamp(cy * this.cellSize + this.cellSize * 0.5, 0, this.worldHeight);
  }

  private isWalkable(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows
      && this.blocked[this.index(cx, cy)] === 0;
  }

  private findNearestWalkableCell(
    wx: number,
    wy: number,
    minimumRing = 0,
    maximumRing = 5
  ): PathPoint | null {
    const originX = clamp(Math.floor(wx / this.cellSize), 0, this.cols - 1);
    const originY = clamp(Math.floor(wy / this.cellSize), 0, this.rows - 1);
    for (let ring = minimumRing; ring <= maximumRing; ring += 1) {
      let bestX = -1;
      let bestY = -1;
      let bestDistanceSquared = Number.POSITIVE_INFINITY;
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const cx = originX + dx;
          const cy = originY + dy;
          if (!this.isWalkable(cx, cy)) continue;
          const worldDx = this.cellCenterX(cx) - wx;
          const worldDy = this.cellCenterY(cy) - wy;
          const distanceSquared = worldDx * worldDx + worldDy * worldDy;
          if (distanceSquared >= bestDistanceSquared) continue;
          bestDistanceSquared = distanceSquared;
          bestX = cx;
          bestY = cy;
        }
      }
      if (bestX >= 0) return { x: bestX, y: bestY };
    }
    return null;
  }

  findNearestWalkableWorld(wx: number, wy: number, minimumRing = 0, maximumRing = 5): PathPoint | null {
    const cell = this.findNearestWalkableCell(wx, wy, minimumRing, maximumRing);
    return cell ? this.cellToWorld(cell.x, cell.y) : null;
  }

  findPath(fromX: number, fromY: number, toX: number, toY: number, options?: PathQueryOptions): PathPoint[] {
    const output = options?.output ?? [];
    const requestedStartX = clamp(Math.floor(fromX / this.cellSize), 0, this.cols - 1);
    const requestedStartY = clamp(Math.floor(fromY / this.cellSize), 0, this.rows - 1);
    const requestedGoalX = clamp(Math.floor(toX / this.cellSize), 0, this.cols - 1);
    const requestedGoalY = clamp(Math.floor(toY / this.cellSize), 0, this.rows - 1);
    const start = this.isWalkable(requestedStartX, requestedStartY)
      ? { x: requestedStartX, y: requestedStartY }
      : this.findNearestWalkableCell(fromX, fromY, 1, 8);
    const goal = this.isWalkable(requestedGoalX, requestedGoalY)
      ? { x: requestedGoalX, y: requestedGoalY }
      : this.findNearestWalkableCell(toX, toY, 1, 8);

    if (!start || !goal) {
      output.length = 0;
      return output;
    }
    if (start.x === goal.x && start.y === goal.y) {
      const point = output[0] ?? { x: 0, y: 0 };
      point.x = this.cellCenterX(goal.x);
      point.y = this.cellCenterY(goal.y);
      output[0] = point;
      output.length = 1;
      return output;
    }

    this.resetSearchStorage();
    const startIndex = this.index(start.x, start.y);
    const goalIndex = this.index(goal.x, goal.y);
    this.gScore[startIndex] = 0;
    this.fScore[startIndex] = this.heuristic(start.x, start.y, goal.x, goal.y);
    this.pushOrDecrease(startIndex);

    const maxIterations = options?.maxIterations ?? 2200;
    const cellPenalty = options?.cellPenalty;
    let iterations = 0;

    while (this.heapSize > 0 && iterations < maxIterations) {
      iterations += 1;
      const currentIndex = this.popMinimum();
      if (currentIndex === goalIndex) return this.buildWorldPath(currentIndex, options?.smooth ?? false, output);
      this.closed[currentIndex] = 1;
      const currentX = this.cellX(currentIndex);
      const currentY = this.cellY(currentIndex);
      const currentG = this.gScore[currentIndex];

      for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 2) {
        const dx = DIRECTIONS[directionIndex];
        const dy = DIRECTIONS[directionIndex + 1];
        const nextX = currentX + dx;
        const nextY = currentY + dy;
        if (!this.isWalkable(nextX, nextY)) continue;
        const nextIndex = this.index(nextX, nextY);
        if (this.closed[nextIndex] !== 0) continue;

        // Prevent corner cutting through walls.
        if (dx !== 0 && dy !== 0
          && (!this.isWalkable(currentX + dx, currentY) || !this.isWalkable(currentX, currentY + dy))) {
          continue;
        }

        const candidateG = currentG + (dx !== 0 && dy !== 0 ? 1.41 : 1)
          + (cellPenalty ? cellPenalty(nextX, nextY) : 0);
        if (candidateG >= this.gScore[nextIndex]) continue;
        this.cameFrom[nextIndex] = currentIndex;
        this.gScore[nextIndex] = candidateG;
        this.fScore[nextIndex] = candidateG + this.heuristic(nextX, nextY, goal.x, goal.y);
        this.pushOrDecrease(nextIndex);
      }
    }

    output.length = 0;
    return output;
  }

  smoothWorldPath(worldPath: readonly PathPoint[]): PathPoint[] {
    if (worldPath.length <= 2) return [...worldPath];
    const cells: PathPoint[] = new Array(worldPath.length);
    for (let index = 0; index < worldPath.length; index += 1) cells[index] = this.worldToCell(worldPath[index].x, worldPath[index].y);
    const result: PathPoint[] = [cells[0]];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let furthest = anchor + 1;
      for (let index = anchor + 1; index < cells.length; index += 1) {
        if (!this.hasLineOfSightCells(cells[anchor].x, cells[anchor].y, cells[index].x, cells[index].y)) break;
        furthest = index;
      }
      result.push(cells[furthest]);
      anchor = furthest;
    }
    for (let index = 0; index < result.length; index += 1) result[index] = this.cellToWorld(result[index].x, result[index].y);
    return result;
  }

  hasLineOfSightWorld(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const startX = clamp(Math.floor(fromX / this.cellSize), 0, this.cols - 1);
    const startY = clamp(Math.floor(fromY / this.cellSize), 0, this.rows - 1);
    const goalX = clamp(Math.floor(toX / this.cellSize), 0, this.cols - 1);
    const goalY = clamp(Math.floor(toY / this.cellSize), 0, this.rows - 1);
    return this.isWalkable(startX, startY) && this.isWalkable(goalX, goalY)
      && this.hasLineOfSightCells(startX, startY, goalX, goalY);
  }

  private resetSearchStorage(): void {
    this.gScore.fill(Number.POSITIVE_INFINITY);
    this.fScore.fill(Number.POSITIVE_INFINITY);
    this.cameFrom.fill(-1);
    this.closed.fill(0);
    this.heapPosition.fill(-1);
    this.heapSize = 0;
    this.nextInsertionOrder = 0;
  }

  private heuristic(x: number, y: number, goalX: number, goalY: number): number {
    return Math.abs(goalX - x) + Math.abs(goalY - y);
  }

  private less(leftIndex: number, rightIndex: number): boolean {
    const leftF = this.fScore[leftIndex];
    const rightF = this.fScore[rightIndex];
    return leftF < rightF || (leftF === rightF && this.insertionOrder[leftIndex] < this.insertionOrder[rightIndex]);
  }

  private pushOrDecrease(cellIndex: number): void {
    const existingPosition = this.heapPosition[cellIndex];
    if (existingPosition >= 0) {
      this.bubbleUp(existingPosition);
      return;
    }
    const position = this.heapSize;
    this.heapSize += 1;
    this.heap[position] = cellIndex;
    this.heapPosition[cellIndex] = position;
    this.insertionOrder[cellIndex] = this.nextInsertionOrder;
    this.nextInsertionOrder += 1;
    this.bubbleUp(position);
  }

  private popMinimum(): number {
    const result = this.heap[0];
    this.heapSize -= 1;
    this.heapPosition[result] = -1;
    if (this.heapSize > 0) {
      const replacement = this.heap[this.heapSize];
      this.heap[0] = replacement;
      this.heapPosition[replacement] = 0;
      this.bubbleDown(0);
    }
    return result;
  }

  private bubbleUp(startPosition: number): void {
    let position = startPosition;
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (!this.less(this.heap[position], this.heap[parent])) break;
      this.swapHeapEntries(position, parent);
      position = parent;
    }
  }

  private bubbleDown(startPosition: number): void {
    let position = startPosition;
    while (true) {
      const left = position * 2 + 1;
      if (left >= this.heapSize) return;
      const right = left + 1;
      let best = left;
      if (right < this.heapSize && this.less(this.heap[right], this.heap[left])) best = right;
      if (!this.less(this.heap[best], this.heap[position])) return;
      this.swapHeapEntries(position, best);
      position = best;
    }
  }

  private swapHeapEntries(left: number, right: number): void {
    const leftCell = this.heap[left];
    const rightCell = this.heap[right];
    this.heap[left] = rightCell;
    this.heap[right] = leftCell;
    this.heapPosition[leftCell] = right;
    this.heapPosition[rightCell] = left;
  }

  private buildWorldPath(endIndex: number, smooth: boolean, output: PathPoint[]): PathPoint[] {
    const reconstructed = this.reconstructedIndices;
    reconstructed.length = 0;
    let current = endIndex;
    while (this.cameFrom[current] >= 0) {
      reconstructed.push(current);
      current = this.cameFrom[current];
    }
    reconstructed.reverse();
    const selected = smooth ? this.smoothIndexPath(reconstructed) : reconstructed;
    for (let index = 0; index < selected.length; index += 1) {
      const cellIndex = selected[index];
      const point = output[index] ?? { x: 0, y: 0 };
      point.x = this.cellCenterX(this.cellX(cellIndex));
      point.y = this.cellCenterY(this.cellY(cellIndex));
      output[index] = point;
    }
    output.length = selected.length;
    return output;
  }

  private smoothIndexPath(indices: readonly number[]): readonly number[] {
    if (indices.length <= 2) return indices;
    const result = this.smoothedIndices;
    result.length = 0;
    result.push(indices[0]);
    let anchor = 0;
    while (anchor < indices.length - 1) {
      let furthest = anchor + 1;
      const anchorIndex = indices[anchor];
      const anchorX = this.cellX(anchorIndex);
      const anchorY = this.cellY(anchorIndex);
      for (let index = anchor + 1; index < indices.length; index += 1) {
        const candidate = indices[index];
        if (!this.hasLineOfSightCells(anchorX, anchorY, this.cellX(candidate), this.cellY(candidate))) break;
        furthest = index;
      }
      result.push(indices[furthest]);
      anchor = furthest;
    }
    return result;
  }

  private hasLineOfSightCells(x0: number, y0: number, x1: number, y1: number): boolean {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx - dy;

    while (true) {
      if (!this.isWalkable(x, y)) return false;
      if (x === x1 && y === y1) return true;
      const doubledError = error * 2;
      if (doubledError > -dy) {
        error -= dy;
        x += sx;
      }
      if (doubledError < dx) {
        error += dx;
        y += sy;
      }
    }
  }
}
