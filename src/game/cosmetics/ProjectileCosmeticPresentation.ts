import type { CosmeticOption } from '../types.ts';

export interface ProjectileCosmeticPresentation {
  textureKey: string;
  displayWidth: number;
  displayHeight: number;
  preserveNativePalette: boolean;
}

const LEGACY_DISPLAY_SIZE_BY_TEXTURE: Readonly<Record<string, readonly [number, number]>> = {
  'projectile-missile': [17, 8],
  'projectile-sword': [17, 8],
  'projectile-lightning': [15, 10],
  'projectile-carrot': [16, 9],
  'projectile-bubbles': [13, 11],
  'projectile-balloons': [14, 13]
};

const PREMIUM_DISPLAY_SIZE_BY_TEXTURE: Readonly<Record<string, readonly [number, number]>> = {
  'projectile-premium-medical-needle': [22, 12],
  'projectile-premium-hardware-bolt': [20, 12],
  'projectile-premium-alien-goo': [17, 14],
  'projectile-premium-cereal-loop': [17, 14],
  'projectile-premium-fly': [19, 14],
  'projectile-premium-joint': [21, 12],
  'projectile-premium-tactical-missile': [23, 13],
  'projectile-premium-teardrop': [19, 12]
};

/**
 * Presentation-only dimensions for the equipped shape. Physics keeps the
 * standard projectile body; these values only make authored silhouettes
 * legible at combat scale.
 */
export const resolveProjectileCosmeticPresentation = (
  item: CosmeticOption | undefined,
  fallbackTextureKey = 'projectile-pulse'
): ProjectileCosmeticPresentation => {
  const textureKey = item?.textureKey ?? fallbackTextureKey;
  const [displayWidth, displayHeight] = PREMIUM_DISPLAY_SIZE_BY_TEXTURE[textureKey]
    ?? LEGACY_DISPLAY_SIZE_BY_TEXTURE[textureKey]
    ?? [8, 8];
  return {
    textureKey,
    displayWidth,
    displayHeight,
    preserveNativePalette: item?.category === 'projectileShape' && item.preserveNativePalette === true
  };
};

