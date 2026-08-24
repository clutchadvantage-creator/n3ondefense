import { MOD_BY_ID } from './definitions.ts';
import { createDefaultModCollection, createDefaultModLoadout, normalizeOwnedMod } from './ModInventoryService.ts';
import type { LocalModCollection, ModCardInstance, ModInfusionId, ModSlot, ProtocolPreference } from './types.ts';
import { normalizeRunProtocolId } from './modBalance.ts';
import { MOD_INFUSION_BY_ID } from './infusions.ts';
import { ECONOMY_BALANCE } from '../economy/economyBalance.ts';
import { countEquippedSupremeMods, isLegendaryModId, isSupremeModId, MAX_EQUIPPED_SUPREME_MODS } from './ModLoadoutRules.ts';

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
  const cards: ModCardInstance[] = [];
  const seenCards = new Set<string>();
  if (Array.isArray(mods.cards)) {
    for (const raw of mods.cards) {
      if (!isObject(raw) || typeof raw.instanceId !== 'string' || typeof raw.modId !== 'string' || !inventory[raw.modId] || seenCards.has(raw.instanceId)) continue;
      seenCards.add(raw.instanceId);
      cards.push({
        instanceId: raw.instanceId,
        modId: raw.modId,
        acquiredAt: typeof raw.acquiredAt === 'string' ? raw.acquiredAt : new Date(0).toISOString(),
        upgradeLevel: Math.max(0, Math.min(3, Math.floor(Number(raw.upgradeLevel) || 0))) as 0 | 1 | 2 | 3,
        ...(typeof raw.infusionId === 'string' && MOD_INFUSION_BY_ID.has(raw.infusionId as ModInfusionId) ? { infusionId: raw.infusionId as ModCardInstance['infusionId'] } : {})
      });
    }
  }
  for (const [modId, owned] of Object.entries(inventory)) {
    const expected = owned.duplicates + 1;
    const existing = cards.filter((card) => card.modId === modId).length;
    for (let index = existing; index < expected; index += 1) {
      cards.push({ instanceId: `legacy-${modId}-${index + 1}`, modId, acquiredAt: owned.firstAcquiredAt ?? new Date(0).toISOString(), upgradeLevel: index === 0 ? Math.max(0, owned.rank - 1) as 0 | 1 | 2 : 0 });
    }
    if (existing > expected) owned.duplicates = existing - 1;
    owned.rank = Math.max(0, ...cards.filter((card) => card.modId === modId).map((card) => card.upgradeLevel)) as 0 | 1 | 2 | 3;
  }
  const purchasedLoadoutSlots = Math.max(1, Math.min(
    ECONOMY_BALANCE.modLoadoutSlots.maximumSavedLoadouts,
    Math.floor(Number(mods.purchasedLoadoutSlots) || 1)
  ));
  const rawLoadouts = Array.isArray(mods.loadouts) ? mods.loadouts : [];
  const loadouts = rawLoadouts.slice(0, purchasedLoadoutSlots).flatMap((raw, index) => {
    if (!isObject(raw)) return [];
    const slots = createDefaultModLoadout();
    const cardSlots = createDefaultModLoadout();
    const equipped = new Set<string>();
    let hasLegendary = false;
    const rawSlots = isObject(raw.slots) ? raw.slots : {};
    for (const slot of MOD_SLOTS) {
      const id = typeof rawSlots[slot] === 'string' ? rawSlots[slot] : null;
      const definition = id ? MOD_BY_ID.get(id) : undefined;
      if (!id || !definition || !inventory[id]?.discovered || equipped.has(id)) continue;
      // Supreme ownership/loadout references remain serialized independent of
      // the selected mode. Activation is filtered by ModRuntime. Supreme is
      // the sole universal-slot class and old invalid >2 states are trimmed
      // without touching inventory ownership.
      if (!isSupremeModId(id) && slot !== 'wildcard' && definition.category !== slot) continue;
      if (isSupremeModId(id) && countEquippedSupremeMods(slots) >= MAX_EQUIPPED_SUPREME_MODS) continue;
      if (isLegendaryModId(id) && hasLegendary) continue;
      slots[slot] = id;
      const requestedCard = isObject(raw.cardSlots) && typeof raw.cardSlots[slot] === 'string' ? raw.cardSlots[slot] : '';
      cardSlots[slot] = cards.some((card) => card.instanceId === requestedCard && card.modId === id)
        ? requestedCard
        : cards.find((card) => card.modId === id)?.instanceId ?? null;
      equipped.add(id);
      if (isLegendaryModId(id)) hasLegendary = true;
    }
    return [{ id: typeof raw.id === 'string' && raw.id ? raw.id : `loadout-${index + 1}`, name: typeof raw.name === 'string' && raw.name ? raw.name : 'Primary Loadout', slots, cardSlots }];
  });
  const validLoadouts = loadouts.length > 0 ? loadouts : defaults.loadouts;
  while (validLoadouts.length < purchasedLoadoutSlots) {
    const number = validLoadouts.length + 1;
    validLoadouts.push({ id: `loadout-${number}`, name: `Loadout ${number}`, slots: createDefaultModLoadout(), cardSlots: createDefaultModLoadout() });
  }
  const requestedActive = typeof mods.activeLoadoutId === 'string' ? mods.activeLoadoutId : '';
  return {
    inventory,
    cards,
    plasmaChips: Math.max(0, Math.floor(Number(mods.plasmaChips) || 0)),
    purchasedLoadoutSlots,
    loadouts: validLoadouts,
    activeLoadoutId: validLoadouts.some((entry) => entry.id === requestedActive) ? requestedActive : validLoadouts[0].id
  };
};

export const normalizeProtocolPreference = (value: unknown): ProtocolPreference => {
  const candidate = isObject(value) ? value.preferred : value;
  return { preferred: normalizeRunProtocolId(candidate) };
};
