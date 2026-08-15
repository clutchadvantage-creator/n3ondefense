import type { RectSpec } from '../types.ts';

export interface TraversalRepairResult {
  walls: RectSpec[];
  widenedPassages: number;
}

const overlapLength = (aStart: number, aLength: number, bStart: number, bLength: number): number =>
  Math.max(0, Math.min(aStart + aLength, bStart + bLength) - Math.max(aStart, bStart));

const shortenPair = (
  leading: RectSpec,
  trailing: RectSpec,
  axis: 'x' | 'y',
  amount: number,
  minimumSegmentLength: number
): boolean => {
  const leadingLength = axis === 'x' ? leading.w : leading.h;
  const trailingLength = axis === 'x' ? trailing.w : trailing.h;
  const leadingRoom = Math.max(0, leadingLength - minimumSegmentLength);
  const trailingRoom = Math.max(0, trailingLength - minimumSegmentLength);
  if (leadingRoom + trailingRoom + 0.001 < amount) return false;

  const trimLeading = Math.min(leadingRoom, amount / 2 + Math.max(0, amount / 2 - trailingRoom));
  const trimTrailing = amount - trimLeading;
  if (axis === 'x') {
    leading.w -= trimLeading;
    trailing.x += trimTrailing;
    trailing.w -= trimTrailing;
  } else {
    leading.h -= trimLeading;
    trailing.y += trimTrailing;
    trailing.h -= trimTrailing;
  }
  return true;
};

/**
 * Repairs accidental narrow doorways made from collinear wall segments. The
 * operation only shortens segment ends facing an existing opening, preserving
 * each archetype's structures while making that opening useful to a crowd.
 */
export const repairNarrowPassages = (
  sourceWalls: readonly RectSpec[],
  minimumPassageWidth: number,
  boundaryThickness: number
): TraversalRepairResult => {
  const walls = sourceWalls.map((wall) => ({ ...wall }));
  const minimumSegmentLength = Math.max(boundaryThickness * 1.5, 42);
  const alignmentTolerance = Math.max(4, boundaryThickness * 0.45);
  const minimumSharedFace = Math.max(12, boundaryThickness * 0.4);
  let widenedPassages = 0;

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (let firstIndex = 0; firstIndex < walls.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < walls.length; secondIndex += 1) {
        const first = walls[firstIndex];
        const second = walls[secondIndex];
        const horizontal = Math.abs(first.y - second.y) <= alignmentTolerance
          && overlapLength(first.y, first.h, second.y, second.h) >= minimumSharedFace;
        if (horizontal) {
          const leading = first.x <= second.x ? first : second;
          const trailing = leading === first ? second : first;
          const gap = trailing.x - (leading.x + leading.w);
          if (gap > 0.001 && gap < minimumPassageWidth
            && shortenPair(leading, trailing, 'x', minimumPassageWidth - gap, minimumSegmentLength)) {
            widenedPassages += 1;
            changed = true;
            continue;
          }
        }

        const vertical = Math.abs(first.x - second.x) <= alignmentTolerance
          && overlapLength(first.x, first.w, second.x, second.w) >= minimumSharedFace;
        if (!vertical) continue;
        const leading = first.y <= second.y ? first : second;
        const trailing = leading === first ? second : first;
        const gap = trailing.y - (leading.y + leading.h);
        if (gap > 0.001 && gap < minimumPassageWidth
          && shortenPair(leading, trailing, 'y', minimumPassageWidth - gap, minimumSegmentLength)) {
          widenedPassages += 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return { walls, widenedPassages };
};

/** Returns true when a secondary obstacle would leave a narrow straight lane. */
export const createsNarrowPassage = (
  candidate: RectSpec,
  blockers: readonly RectSpec[],
  minimumPassageWidth: number
): boolean => blockers.some((blocker) => {
  const sharedVerticalFace = overlapLength(candidate.y, candidate.h, blocker.y, blocker.h);
  if (sharedVerticalFace > 12) {
    const horizontalGap = candidate.x >= blocker.x + blocker.w
      ? candidate.x - (blocker.x + blocker.w)
      : blocker.x >= candidate.x + candidate.w
        ? blocker.x - (candidate.x + candidate.w)
        : 0;
    if (horizontalGap > 0 && horizontalGap < minimumPassageWidth) return true;
  }

  const sharedHorizontalFace = overlapLength(candidate.x, candidate.w, blocker.x, blocker.w);
  if (sharedHorizontalFace <= 12) return false;
  const verticalGap = candidate.y >= blocker.y + blocker.h
    ? candidate.y - (blocker.y + blocker.h)
    : blocker.y >= candidate.y + candidate.h
      ? blocker.y - (candidate.y + candidate.h)
      : 0;
  return verticalGap > 0 && verticalGap < minimumPassageWidth;
});
