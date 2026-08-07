import { MOD_BY_ID } from './definitions.ts';
import { createDefaultModCollection, createDefaultModLoadout, normalizeOwnedMod } from './ModInventoryService.ts';
import type { LocalModCollection, ModSlot, ProtocolPreference, RunProtocolId } from './types.ts';

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const MOD_SLOTS: ModSlot[] = ['weapon', 'player', 'defense', 'bombSite', 'wildcard'];

export const normalizeModCollection = (mods: unknown): LocalModCollection => {
  const defaults = createDefaultModCollection();
  if (!isObject(mods)) return defaults;
  const inventory: LocalModCollection['inventory'] = {};
  if (isObject(mods.inventory)) {
    for (const [id, raw] of Object.entries(mods.inventory)) {
      if (!MOD_BY_ID.has(id)) continue;
      const owned = normalizeOwnedMod(raw);
      if (owned) inventory[id] = owned;
    }
  }
  const rawLoadouts = Array.isArray(mods.loadouts) ? mods.loadouts : [];
  const loadouts = rawLoadouts.slice(0, 1).flatMap((raw, index) => {
    if (!isObject(raw)) return [];
    const slots = createDefaultModLoadout();
    const equipped = new Set<string>();
    const rawSlots = isObject(raw.slots) ? raw.slots : {};
    for (const slot of MOD_SLOTS) {
      const id = typeof rawSlots[slot] === 'string' ? rawSlots[slot] : null;
      const definition = id ? MOD_BY_ID.get(id) : undefined;
      if (!id || !definition || !inventory[id]?.discovered || equipped.has(id)) continue;
      if (slot !== 'wildcard' && definition.category !== slot) continue;
      slots[slot] = id;
      equipped.add(id);
    }
    return [{ id: typeof raw.id === 'string' && raw.id ? raw.id : `loadout-${index + 1}`, name: typeof raw.name === 'string' && raw.name ? raw.name : 'Primary Loadout', slots }];
  });
  const validLoadouts = loadouts.length > 0 ? loadouts : defaults.loadouts;
  const requestedActive = typeof mods.activeLoadoutId === 'string' ? mods.activeLoadoutId : '';
  return { inventory, loadouts: validLoadouts, activeLoadoutId: validLoadouts.some((entry) => entry.id === requestedActive) ? requestedActive : validLoadouts[0].id };
};

export const normalizeProtocolPreference = (value: unknown): ProtocolPreference => {
  const candidate = isObject(value) ? value.preferred : value;
  return { preferred: (candidate === 'overdrive' ? 'overdrive' : 'normal') as RunProtocolId };
};
