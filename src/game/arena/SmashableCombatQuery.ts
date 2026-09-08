import { TEMPORARY_AMMO_BALANCE } from '../player/TemporaryAmmoMode.ts';

/** Explicit shootable-prop capability. Walls and floor decoration do not
 * implement this contract and cannot arm a grenade's smart fuse. */
export interface SmashableCombatQuery {
  hasTargetAt(x: number, y: number, padding: number): boolean;
  hasTargetInRadius(x: number, y: number, radius: number): boolean;
}

export const circleTouchesSmashable = (
  x: number, y: number, radius: number,
  targetX: number, targetY: number, width: number, height: number, rotation = 0
): boolean => {
  const dx = x - targetX, dy = y - targetY;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const outsideX = Math.max(0, Math.abs(dx * cos + dy * sin) - width * 0.5);
  const outsideY = Math.max(0, Math.abs(dy * cos - dx * sin) - height * 0.5);
  return outsideX * outsideX + outsideY * outsideY <= radius * radius;
};

export const grenadeTouchesSmashable = (
  x: number, y: number, proximity: boolean,
  primary: SmashableCombatQuery | null | undefined,
  secondary?: SmashableCombatQuery | null
): boolean => {
  // Unlike a directly selected enemy, props receive area damage. Do not
  // trigger outside the existing blast reach, where that damage cannot land.
  const radius = Math.min(TEMPORARY_AMMO_BALANCE.grenade.proximityFuseRadius,
    TEMPORARY_AMMO_BALANCE.grenade.splashRadius);
  const query = (source: SmashableCombatQuery | null | undefined): boolean => proximity
    ? source?.hasTargetInRadius(x, y, radius) ?? false
    : source?.hasTargetAt(x, y, TEMPORARY_AMMO_BALANCE.grenade.interactiveDirectContactPadding) ?? false;
  return query(primary) || query(secondary);
};
