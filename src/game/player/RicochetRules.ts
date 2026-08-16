export const RICOCHET_MAX_WALL_BOUNCES = 2;

export interface RicochetVelocity {
  x: number;
  y: number;
}

/** Reflects a projectile while preserving its exact speed. */
export const reflectRicochetVelocity = (
  velocityX: number,
  velocityY: number,
  struckVerticalSurface: boolean,
  struckHorizontalSurface: boolean
): RicochetVelocity => {
  if (!struckVerticalSurface && !struckHorizontalSurface) {
    return { x: -velocityX, y: -velocityY };
  }
  return {
    x: struckVerticalSurface ? -velocityX : velocityX,
    y: struckHorizontalSurface ? -velocityY : velocityY
  };
};
