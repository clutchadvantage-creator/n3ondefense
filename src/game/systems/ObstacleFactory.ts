import type { GeneratedObstacle, ObstacleKind } from '../types';
import { SeededRandom } from './SeededRandom';

const OBSTACLE_KINDS: ObstacleKind[] = [
  'circle', 'square', 'rectangle', 'triangle', 'hexagon', 'octagon',
  'crate', 'energy-column', 'machinery', 'broken-wall', 'small-barricade', 'central-structure'
];

export class ObstacleFactory {
  constructor(private readonly random: SeededRandom) {}

  createAt(x: number, y: number, sizeMin: number, sizeMax: number): GeneratedObstacle {
    const kind = this.random.pick(OBSTACLE_KINDS);
    const w = this.random.int(sizeMin, sizeMax);
    const h = kind === 'circle' ? w : this.random.int(Math.floor(sizeMin * 0.7), sizeMax);
    return {
      id: `${kind}-${x}-${y}-${this.random.int(0, 99_999)}`,
      kind,
      x,
      y,
      w,
      h,
      blocksMovement: true,
      blocksLineOfSight: true
    };
  }

  batch(areaX: number, areaY: number, areaW: number, areaH: number, count: number): GeneratedObstacle[] {
    const obstacles: GeneratedObstacle[] = [];
    for (let i = 0; i < count; i += 1) {
      const x = this.random.int(areaX, areaX + areaW);
      const y = this.random.int(areaY, areaY + areaH);
      obstacles.push(this.createAt(x, y, 26, 96));
    }
    return obstacles;
  }
}
