import { MOD_BY_ID } from './definitions.ts';
import { isSupremeProtocol } from '../progression/SupremeProgression.ts';
import type { ModDefinition, ModLoadoutSlots, ModSlot, RunProtocolId } from './types.ts';

export const MAX_EQUIPPED_LEGENDARY_MODS = 1;
export const MAX_EQUIPPED_SUPREME_MODS = 2;

export const isLegendaryModId = (modId: string | null | undefined): boolean =>
  typeof modId === 'string' && MOD_BY_ID.get(modId)?.rarity === 'legendary';

export const hasLegendaryInAnotherSlot = (slots: ModLoadoutSlots, excludedSlot: ModSlot): boolean =>
  Object.entries(slots).some(([slot, modId]) => slot !== excludedSlot && isLegendaryModId(modId));

export const isSupremeModId = (modId: string | null | undefined): boolean =>
  typeof modId === 'string' && MOD_BY_ID.get(modId)?.rarity === 'supreme';

export const countEquippedSupremeMods = (slots: ModLoadoutSlots, excludedSlot?: ModSlot): number =>
  Object.entries(slots).reduce((total, [slot, modId]) =>
    total + (slot !== excludedSlot && isSupremeModId(modId) ? 1 : 0), 0);

export const isModSlotCompatible = (
  definition: ModDefinition,
  slot: ModSlot,
  protocol: RunProtocolId
): boolean => definition.rarity === 'supreme'
  ? isSupremeProtocol(protocol)
  : slot === 'wildcard' || slot === definition.category;

export interface ModEquipValidation {
  ok: boolean;
  message: string;
}

/** One authoritative validator used by inventory, UI, presets, and runtime. */
export const validateModEquip = (
  slots: ModLoadoutSlots,
  definition: ModDefinition,
  slot: ModSlot,
  protocol: RunProtocolId
): ModEquipValidation => {
  if (definition.rarity === 'supreme' && !isSupremeProtocol(protocol)) {
    return { ok: false, message: 'Supreme Mods can only be activated in Supreme Overdrive.' };
  }
  if (!isModSlotCompatible(definition, slot, protocol)) {
    return { ok: false, message: `${definition.name} cannot use the ${slot} slot.` };
  }
  if (definition.rarity === 'supreme' && countEquippedSupremeMods(slots, slot) >= MAX_EQUIPPED_SUPREME_MODS) {
    return { ok: false, message: 'Supreme capacity reached - maximum 2 active.' };
  }
  if (definition.rarity === 'legendary' && hasLegendaryInAnotherSlot(slots, slot)) {
    return { ok: false, message: 'Only one Legendary Mod can be equipped at a time.' };
  }
  return { ok: true, message: '' };
};
