import { MOD_BY_ID } from './definitions.ts';
import type { ModLoadoutSlots, ModSlot } from './types.ts';

export const MAX_EQUIPPED_LEGENDARY_MODS = 1;

export const isLegendaryModId = (modId: string | null | undefined): boolean =>
  typeof modId === 'string' && MOD_BY_ID.get(modId)?.rarity === 'legendary';

export const hasLegendaryInAnotherSlot = (slots: ModLoadoutSlots, excludedSlot: ModSlot): boolean =>
  Object.entries(slots).some(([slot, modId]) => slot !== excludedSlot && isLegendaryModId(modId));
