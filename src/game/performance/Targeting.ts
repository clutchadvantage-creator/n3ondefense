export const shouldReplaceTurretTarget = (
  candidatePriority: boolean,
  candidateDistanceSquared: number,
  candidateIndex: number,
  hasCurrent: boolean,
  currentPriority: boolean,
  currentDistanceSquared: number,
  currentIndex: number
): boolean => {
  if (!hasCurrent) return true;
  if (candidatePriority !== currentPriority) return candidatePriority;
  if (candidateDistanceSquared !== currentDistanceSquared) return candidateDistanceSquared < currentDistanceSquared;
  return candidateIndex < currentIndex;
};
