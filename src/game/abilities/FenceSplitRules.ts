export interface FenceSplitStage {
  streamCount: number;
  damageShare: number;
}

export const MAX_DISTINCT_FENCE_SPLITS = 2;

export const resolveFenceSplitStage = (
  initialStreamCount: number,
  initialDamageShare: number,
  distinctFencesAlreadyCrossed: number
): FenceSplitStage | null => {
  if (distinctFencesAlreadyCrossed < 0 || distinctFencesAlreadyCrossed >= MAX_DISTINCT_FENCE_SPLITS) return null;
  if (distinctFencesAlreadyCrossed === 0) {
    return {
      streamCount: Math.max(1, Math.floor(initialStreamCount)),
      damageShare: Math.max(0, initialDamageShare)
    };
  }
  return { streamCount: 2, damageShare: 1 };
};
