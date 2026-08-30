import type { CosmeticOption } from '../types.ts';

export interface MineFrameAppearance {
  textureKey: string;
  primaryColor: number;
  accentColor: number;
}

/** Premium-only gameplay appearance. Undefined deliberately preserves the original free mine. */
export const resolveMineFrameAppearance = (item: CosmeticOption | undefined): MineFrameAppearance | undefined =>
  item?.category === 'mineFrame' && item.mineFrameEffect && item.textureKey
    ? { textureKey: item.textureKey, primaryColor: item.color, accentColor: item.accentColor ?? item.color }
    : undefined;
