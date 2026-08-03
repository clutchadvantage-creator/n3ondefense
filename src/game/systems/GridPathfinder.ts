import Phaser from 'phaser';

interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
}

export interface PathQueryOptions {
  cellPenalty?: (cx: number, cy: number) => number;
  smooth?: boolean;
  maxIterations?: number;
}

const keyOf = (x: number, y: number): string => `${x},${y}`;

export class GridPathfinder {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    private readonly cellSize: number,
    walls: WallRect[]
  ) {
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.buildBlockedGrid(walls);
  }

  private index(x: number, y: number): number {
    return y * this.cols + x;
  }

  private buildBlockedGrid(walls: WallRect[]): void {
    for (const wall of walls) {
      const minX = Math.max(0, Math.floor(wall.x / this.cellSize));
      const maxX = Math.min(this.cols - 1, Math.floor((wall.x + wall.w) / this.cellSize));
      const minY = Math.max(0, Math.floor(wall.y / this.cellSize));
      const maxY = Math.min(this.rows - 1, Math.floor((wall.y + wall.h) / this.cellSize));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          this.blocked[this.index(x, y)] = 1;
        }
      }
    }
  }

  worldToCell(wx: number, wy: number): Phaser.Math.Vector2 {
    const x = Phaser.Math.Clamp(Math.floor(wx / this.cellSize), 0, this.cols - 1);
    const y = Phaser.Math.Clamp(Math.floor(wy / this.cellSize), 0, this.rows - 1);
    return new Phaser.Math.Vector2(x, y);
  }

  cellToWorld(cx: number, cy: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      Phaser.Math.Clamp(cx * this.cellSize + this.cellSize * 0.5, 0, this.worldWidth),
      Phaser.Math.Clamp(cy * this.cellSize + this.cellSize * 0.5, 0, this.worldHeight)
    );
  }

  private isWalkable(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    return this.blocked[this.index(cx, cy)] === 0;
  }

  findPath(fromX: number, fromY: number, toX: number, toY: number, options?: PathQueryOptions): Phaser.Math.Vector2[] {
    const start = this.worldToCell(fromX, fromY);
    const goal = this.worldToCell(toX, toY);

    if (!this.isWalkable(goal.x, goal.y) || !this.isWalkable(start.x, start.y)) {
      return [];
    }

    const open: Node[] = [{ x: start.x, y: start.y, g: 0, f: 0 }];
    const came = new Map<string, string>();
    const gScores = new Map<string, number>();
    const closed = new Set<string>();
    gScores.set(keyOf(start.x, start.y), 0);

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]
    ];

    const heuristic = (x: number, y: number): number => {
      const dx = Math.abs(goal.x - x);
      const dy = Math.abs(goal.y - y);
      return dx + dy;
    };

    const maxIterations = options?.maxIterations ?? 2200;
    const cellPenalty = options?.cellPenalty;
    let iterations = 0;

    while (open.length > 0 && iterations < maxIterations) {
      iterations += 1;
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      if (!current) break;

      if (current.x === goal.x && current.y === goal.y) {
        const cells = this.reconstructPath(came, current.x, current.y);
        const smooth = options?.smooth ?? false;
        const outputCells = smooth ? this.smoothCells(cells) : cells;
        return outputCells.map((cell) => this.cellToWorld(cell.x, cell.y));
      }

      closed.add(keyOf(current.x, current.y));

      for (const [dx, dy] of dirs) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nkey = keyOf(nx, ny);
        if (!this.isWalkable(nx, ny) || closed.has(nkey)) continue;

        // Prevent corner cutting through walls.
        if (dx !== 0 && dy !== 0) {
          if (!this.isWalkable(current.x + dx, current.y) || !this.isWalkable(current.x, current.y + dy)) {
            continue;
          }
        }

        const cost = dx !== 0 && dy !== 0 ? 1.41 : 1;
        const candidateG = current.g + cost + (cellPenalty ? cellPenalty(nx, ny) : 0);
        const bestG = gScores.get(nkey);
        if (bestG !== undefined && candidateG >= bestG) continue;

        came.set(nkey, keyOf(current.x, current.y));
        gScores.set(nkey, candidateG);
        const f = candidateG + heuristic(nx, ny);

        const existing = open.find((n) => n.x === nx && n.y === ny);
        if (existing) {
          existing.g = candidateG;
          existing.f = f;
        } else {
          open.push({ x: nx, y: ny, g: candidateG, f });
        }
      }
    }

    return [];
  }

  smoothWorldPath(worldPath: Phaser.Math.Vector2[]): Phaser.Math.Vector2[] {
    if (worldPath.length <= 2) return worldPath;
    const cells = worldPath.map((p) => this.worldToCell(p.x, p.y));
    const smoothedCells = this.smoothCells(cells);
    return smoothedCells.map((cell) => this.cellToWorld(cell.x, cell.y));
  }

  private smoothCells(cells: Phaser.Math.Vector2[]): Phaser.Math.Vector2[] {
    if (cells.length <= 2) return cells;

    const result: Phaser.Math.Vector2[] = [cells[0]];
    let anchor = 0;

    while (anchor < cells.length - 1) {
      let furthest = anchor + 1;
      for (let i = anchor + 1; i < cells.length; i++) {
        const visible = this.hasLineOfSightCells(cells[anchor].x, cells[anchor].y, cells[i].x, cells[i].y);
        if (!visible) break;
        furthest = i;
      }

      result.push(cells[furthest]);
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
    let err = dx - dy;

    while (true) {
      if (!this.isWalkable(x, y)) return false;
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return true;
  }

  private reconstructPath(came: Map<string, string>, endX: number, endY: number): Phaser.Math.Vector2[] {
    const path: Phaser.Math.Vector2[] = [];
    let current = keyOf(endX, endY);

    while (came.has(current)) {
      const [x, y] = current.split(',').map((v) => Number(v));
      path.push(new Phaser.Math.Vector2(x, y));
      const prev = came.get(current);
      if (!prev) break;
      current = prev;
    }

    path.reverse();
    return path;
  }
}
