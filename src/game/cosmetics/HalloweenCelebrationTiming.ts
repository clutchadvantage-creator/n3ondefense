/** Shared deterministic choreography: ignition, reveal, celebration, release, dissolve. */
export const HALLOWEEN_TIMING = { revealEnd: 650, releaseAt: 2_850, fadeAt: 3_250, end: 4_200 } as const;
export const clampCelebration = (value: number): number => Math.max(0, Math.min(1, value));
export const halloweenCelebrationEnvelope = (elapsed: number): number =>
  clampCelebration(elapsed / 140) * (1 - clampCelebration((elapsed - HALLOWEEN_TIMING.fadeAt) / (HALLOWEEN_TIMING.end - HALLOWEEN_TIMING.fadeAt)));
export const halloweenRevealScale = (elapsed: number): number => {
  const progress = clampCelebration(elapsed / HALLOWEEN_TIMING.revealEnd);
  return .12 + .88 * (1 + 2.70158 * (progress - 1) ** 3 + 1.70158 * (progress - 1) ** 2);
};
