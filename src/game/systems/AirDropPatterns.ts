import type { RectSpec } from '../types';
import type { SeededRandom } from './SeededRandom';

export const AIR_DROP_PATTERN_NAMES = [
  'LANE DROP',
  'CHECKER BURST',
  'ORBITAL RING',
  'SPIRAL RAIN',
  'CROSS DROP',
  'SCATTER GRID'
] as const;

export interface AirDropPoint {
  x: number;
  y: number;
}

interface AirDropPatternOptions {
  pattern: number;
  count: number;
  bounds: RectSpec;
  safeEdgeInset: number;
  minimumSpacing: number;
  random: SeededRandom;
  isBlocked: (x: number, y: number) => boolean;
}

const distanceSquared = (left: AirDropPoint, right: AirDropPoint): number => {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const resolvePlayablePoint = (
  point: AirDropPoint,
  left: number,
  right: number,
  top: number,
  bottom: number,
  isBlocked: (x: number, y: number) => boolean
): AirDropPoint | null => {
  const clamped = { x: clamp(point.x, left, right), y: clamp(point.y, top, bottom) };
  if (!isBlocked(clamped.x, clamped.y)) return clamped;
  for (let radius = 40; radius <= 160; radius += 40) {
    for (let step = 0; step < 8; step += 1) {
      const angle = step / 8 * Math.PI * 2;
      const candidate = {
        x: clamp(clamped.x + Math.cos(angle) * radius, left, right),
        y: clamp(clamped.y + Math.sin(angle) * radius, top, bottom)
      };
      if (!isBlocked(candidate.x, candidate.y)) return candidate;
    }
  }
  return null;
};

/** Shared deterministic impact layouts for bomblets and gas canisters. */
export const createAirDropPattern = (options: AirDropPatternOptions): AirDropPoint[] => {
  const { pattern, count, bounds, safeEdgeInset, minimumSpacing, random, isBlocked } = options;
  const left = bounds.x + safeEdgeInset;
  const right = bounds.x + bounds.w - safeEdgeInset;
  const top = bounds.y + safeEdgeInset;
  const bottom = bounds.y + bounds.h - safeEdgeInset;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const center = {
    x: random.float(left + width * 0.2, right - width * 0.2),
    y: random.float(top + height * 0.2, bottom - height * 0.2)
  };
  const candidates: AirDropPoint[] = [];

  if (pattern === 0) {
    const vertical = random.bool();
    const lane = random.float(0.22, 0.78);
    for (let index = 0; index < count; index += 1) {
      const progress = count === 1 ? 0.5 : index / (count - 1);
      candidates.push(vertical
        ? { x: left + width * lane + Math.sin(index * 1.7) * 34, y: top + height * progress }
        : { x: left + width * progress, y: top + height * lane + Math.sin(index * 1.7) * 34 });
    }
  } else if (pattern === 1) {
    const columns = Math.max(3, Math.ceil(Math.sqrt(count * 1.5)));
    const rows = Math.ceil(count / columns);
    for (let index = 0; index < count; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      candidates.push({
        x: left + width * ((column + 0.5) / columns),
        y: top + height * ((row + 0.5) / rows) + (column % 2 === 0 ? -22 : 22)
      });
    }
  } else if (pattern === 2) {
    const radius = Math.min(width, height) * random.float(0.2, 0.36);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + random.float(-0.12, 0.12);
      candidates.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    }
  } else if (pattern === 3) {
    for (let index = 0; index < count; index += 1) {
      const progress = (index + 1) / count;
      const radius = Math.min(width, height) * 0.38 * progress;
      const angle = progress * Math.PI * 4.5;
      candidates.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    }
  } else if (pattern === 4) {
    for (let index = 0; index < count; index += 1) {
      const progress = count === 1 ? 0.5 : index / (count - 1);
      candidates.push({
        x: left + width * progress,
        y: index % 2 === 0 ? top + height * progress : bottom - height * progress
      });
    }
  } else {
    for (let index = 0; index < count * 2; index += 1) {
      candidates.push({ x: random.float(left, right), y: random.float(top, bottom) });
    }
  }

  const minimumSpacingSquared = minimumSpacing * minimumSpacing;
  const accepted: AirDropPoint[] = [];
  for (const point of candidates) {
    const resolved = resolvePlayablePoint(point, left, right, top, bottom, isBlocked);
    if (!resolved || accepted.some((other) => distanceSquared(other, resolved) < minimumSpacingSquared)) continue;
    accepted.push(resolved);
    if (accepted.length >= count) break;
  }
  for (let tries = 0; accepted.length < count && tries < 80; tries += 1) {
    const fallback = resolvePlayablePoint(
      { x: random.float(left, right), y: random.float(top, bottom) },
      left,
      right,
      top,
      bottom,
      isBlocked
    );
    if (fallback && accepted.every((other) => distanceSquared(other, fallback) >= minimumSpacingSquared)) {
      accepted.push(fallback);
    }
  }
  return accepted;
};
