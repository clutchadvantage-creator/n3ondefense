export interface MechanicalFragmentBudget {
  count: number;
  degraded: boolean;
}

/** Pure load-shedding rule used by the pooled cosmetic destruction renderer. */
export const resolveMechanicalFragmentBudget = (
  requested: number,
  active: number,
  capacity: number
): MechanicalFragmentBudget => {
  const safeCapacity = Math.max(1, Math.floor(capacity));
  const desired = Math.max(0, Math.floor(requested));
  const occupancy = Math.max(0, active) / safeCapacity;
  const qualityLimit = occupancy >= 0.9 ? 1 : occupancy >= 0.72 ? 3 : occupancy >= 0.5 ? 5 : desired;
  const count = Math.min(desired, qualityLimit);
  return { count, degraded: count < desired };
};
