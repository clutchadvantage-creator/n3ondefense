import type { RectSpec } from '../types';
import { SeededRandom } from './SeededRandom';

export class WallFactory {
  constructor(private readonly random: SeededRandom) {}

  horizontal(x: number, y: number, length: number, thickness: number): RectSpec[] {
    return [{ x, y, w: length, h: thickness }];
  }

  vertical(x: number, y: number, length: number, thickness: number): RectSpec[] {
    return [{ x, y, w: thickness, h: length }];
  }

  lShape(x: number, y: number, a: number, b: number, t: number): RectSpec[] {
    return [{ x, y, w: a, h: t }, { x, y, w: t, h: b }];
  }

  uShape(x: number, y: number, w: number, h: number, t: number): RectSpec[] {
    return [
      { x, y, w, h: t },
      { x, y, w: t, h },
      { x: x + w - t, y, w: t, h }
    ];
  }

  tShape(x: number, y: number, w: number, h: number, t: number): RectSpec[] {
    return [
      { x, y, w, h: t },
      { x: x + w * 0.5 - t * 0.5, y, w: t, h }
    ];
  }

  cross(x: number, y: number, span: number, t: number): RectSpec[] {
    return [
      { x, y: y + span * 0.5 - t * 0.5, w: span, h: t },
      { x: x + span * 0.5 - t * 0.5, y, w: t, h: span }
    ];
  }

  room(x: number, y: number, w: number, h: number, t: number, opening = false): RectSpec[] {
    const walls: RectSpec[] = [
      { x, y, w, h: t },
      { x, y: y + h - t, w, h: t },
      { x, y, w: t, h },
      { x: x + w - t, y, w: t, h }
    ];
    if (!opening) return walls;

    const side = this.random.pick(['top', 'bottom', 'left', 'right'] as const);
    const gap = Math.max(70, Math.floor(Math.min(w, h) * 0.35));
    if (side === 'top') {
      walls[0] = { x, y, w: (w - gap) * 0.5, h: t };
      walls.push({ x: x + (w + gap) * 0.5, y, w: (w - gap) * 0.5, h: t });
    }
    if (side === 'bottom') {
      walls[1] = { x, y: y + h - t, w: (w - gap) * 0.5, h: t };
      walls.push({ x: x + (w + gap) * 0.5, y: y + h - t, w: (w - gap) * 0.5, h: t });
    }
    if (side === 'left') {
      walls[2] = { x, y, w: t, h: (h - gap) * 0.5 };
      walls.push({ x, y: y + (h + gap) * 0.5, w: t, h: (h - gap) * 0.5 });
    }
    if (side === 'right') {
      walls[3] = { x: x + w - t, y, w: t, h: (h - gap) * 0.5 };
      walls.push({ x: x + w - t, y: y + (h + gap) * 0.5, w: t, h: (h - gap) * 0.5 });
    }

    return walls;
  }

  zigzag(x: number, y: number, segment: number, count: number, t: number): RectSpec[] {
    const walls: RectSpec[] = [];
    for (let i = 0; i < count; i += 1) {
      const offset = i % 2 === 0 ? 0 : segment * 0.45;
      walls.push({ x: x + offset, y: y + i * segment, w: segment, h: t });
    }
    return walls;
  }

  angled(x: number, y: number, length: number, t: number): RectSpec[] {
    const steps = Math.max(3, Math.floor(length / 46));
    const walls: RectSpec[] = [];
    for (let i = 0; i < steps; i += 1) {
      walls.push({ x: x + i * 22, y: y + i * 16, w: 30, h: t });
    }
    return walls;
  }

  pillar(x: number, y: number, size: number): RectSpec[] {
    return [{ x, y, w: size, h: size }];
  }

  barrierCluster(x: number, y: number, count: number, size: number): RectSpec[] {
    const walls: RectSpec[] = [];
    for (let i = 0; i < count; i += 1) {
      walls.push({
        x: x + this.random.int(-60, 60),
        y: y + this.random.int(-60, 60),
        w: this.random.int(Math.floor(size * 0.6), size),
        h: this.random.int(Math.floor(size * 0.4), Math.floor(size * 0.8))
      });
    }
    return walls;
  }

  connectedSegments(x: number, y: number, segmentLen: number, segments: number, t: number): RectSpec[] {
    const walls: RectSpec[] = [];
    let cx = x;
    let cy = y;
    for (let i = 0; i < segments; i += 1) {
      const dir = this.random.pick(['h', 'v'] as const);
      if (dir === 'h') {
        const len = this.random.int(Math.floor(segmentLen * 0.6), segmentLen);
        walls.push({ x: cx, y: cy, w: len, h: t });
        cx += this.random.bool() ? len : -len;
      } else {
        const len = this.random.int(Math.floor(segmentLen * 0.6), segmentLen);
        walls.push({ x: cx, y: cy, w: t, h: len });
        cy += this.random.bool() ? len : -len;
      }
    }
    return walls;
  }
}
