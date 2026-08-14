export interface BombsitePoint {
  x: number;
  y: number;
}

export function isInsideBombsiteField(
  site: BombsitePoint,
  x: number,
  y: number,
  radius: number
): boolean {
  const dx = x - site.x;
  const dy = y - site.y;
  return dx * dx + dy * dy <= radius * radius;
}

export function segmentIntersectsBombsiteField(
  site: BombsitePoint,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number
): boolean {
  const segmentX = x2 - x1;
  const segmentY = y2 - y1;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared <= 0.0001) return isInsideBombsiteField(site, x1, y1, radius);
  const t = Math.max(0, Math.min(1, ((site.x - x1) * segmentX + (site.y - y1) * segmentY) / lengthSquared));
  const closestX = x1 + segmentX * t;
  const closestY = y1 + segmentY * t;
  return isInsideBombsiteField(site, closestX, closestY, radius);
}

export function defuseCrossesThreshold(
  currentProgressMs: number,
  requestedProgressMs: number,
  requiredProgressMs: number,
  threshold: number
): boolean {
  if (requiredProgressMs <= 0) return false;
  const current = Math.max(0, currentProgressMs);
  const projected = current + Math.max(0, requestedProgressMs);
  const trigger = Math.max(0, Math.min(1, threshold)) * requiredProgressMs;
  return current < trigger && projected >= trigger;
}

export function countdownStagesCrossed(
  previousTimerMs: number,
  currentTimerMs: number,
  thresholdsMs: readonly number[],
  alreadyTriggered: ReadonlySet<number>
): number[] {
  const crossed: number[] = [];
  thresholdsMs.forEach((threshold, index) => {
    if (!alreadyTriggered.has(index) && previousTimerMs > threshold && currentTimerMs <= threshold) crossed.push(index);
  });
  return crossed;
}

export function advanceKillSwitch(
  currentKills: number,
  killsAdded: number,
  killsRequired: number
): { remainingKills: number; triggers: number } {
  const required = Math.max(1, Math.floor(killsRequired));
  const total = Math.max(0, Math.floor(currentKills)) + Math.max(0, Math.floor(killsAdded));
  return { remainingKills: total % required, triggers: Math.floor(total / required) };
}
