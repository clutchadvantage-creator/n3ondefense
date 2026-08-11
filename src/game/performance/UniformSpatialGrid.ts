interface SpatialPoint {
  x: number;
  y: number;
}

/**
 * Allocation-conscious uniform grid for repeated nearby-entity queries. Empty
 * buckets are retained across frames so late-game combat does not continually
 * allocate Maps and arrays as contacts move between cells.
 */
export class UniformSpatialGrid<T extends SpatialPoint> {
  private readonly buckets = new Map<number, T[]>();
  private readonly activeBuckets: T[][] = [];
  private readonly cellSize: number;

  constructor(cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Spatial grid cell size must be positive.');
    this.cellSize = cellSize;
  }

  rebuild(items: readonly T[]): void {
    for (const bucket of this.activeBuckets) bucket.length = 0;
    this.activeBuckets.length = 0;

    for (const item of items) {
      const cellX = Math.floor(item.x / this.cellSize);
      const cellY = Math.floor(item.y / this.cellSize);
      const key = this.key(cellX, cellY);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      if (bucket.length === 0) this.activeBuckets.push(bucket);
      bucket.push(item);
    }
  }

  clear(): void {
    for (const bucket of this.activeBuckets) bucket.length = 0;
    this.activeBuckets.length = 0;
  }

  forEachNearby(x: number, y: number, radius: number, visit: (item: T) => void): void {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);

    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        const bucket = this.buckets.get(this.key(cellX, cellY));
        if (!bucket) continue;
        for (let index = 0; index < bucket.length; index += 1) visit(bucket[index]);
      }
    }
  }

  private key(cellX: number, cellY: number): number {
    // Arena cell coordinates are small signed integers. Pairing them avoids a
    // per-query string allocation while remaining collision-free in this range.
    return (cellX + 32768) * 65536 + cellY + 32768;
  }
}
