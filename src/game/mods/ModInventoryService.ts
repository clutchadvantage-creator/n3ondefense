import { MOD_BY_ID } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import type { LocalModCollection, ModCardInstance, ModInfusionId, ModLoadoutSlots, ModRank, ModSlot, OwnedModState } from './types.ts';
import { MOD_INFUSION_BY_ID } from './infusions.ts';

export interface ModOperationResult { ok: boolean; message: string; }

export const createDefaultModLoadout = (): ModLoadoutSlots => ({ weapon: null, player: null, defense: null, bombSite: null, wildcard: null });
export const createDefaultModCollection = (): LocalModCollection => ({
  inventory: {},
  cards: [],
  plasmaChips: 0,
  loadouts: [{ id: 'default', name: 'Primary Loadout', slots: createDefaultModLoadout(), cardSlots: createDefaultModLoadout() }],
  activeLoadoutId: 'default'
});

const createCardId = (modId: string): string => `${modId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const addModDrop = (mods: LocalModCollection, modId: string, acquiredAt = new Date().toISOString()): ModOperationResult => {
  if (!MOD_BY_ID.has(modId)) return { ok: false, message: 'Unknown mod.' };
  const owned = mods.inventory[modId];
  if (!owned) {
    mods.inventory[modId] = { rank: 0, duplicates: 0, discovered: true, acquiredCount: 1, firstAcquiredAt: acquiredAt };
    mods.cards.push({ instanceId: createCardId(modId), modId, acquiredAt, upgradeLevel: 0 });
    return { ok: true, message: 'Mod card discovered.' };
  }
  owned.discovered = true;
  owned.duplicates += 1;
  owned.acquiredCount += 1;
  mods.cards.push({ instanceId: createCardId(modId), modId, acquiredAt, upgradeLevel: 0 });
  return { ok: true, message: 'Duplicate mod stored.' };
};

const removableDuplicate = (mods: LocalModCollection, instanceId: string): ModCardInstance | null => {
  const card = mods.cards.find((entry) => entry.instanceId === instanceId);
  if (!card || mods.cards.filter((entry) => entry.modId === card.modId).length <= 1) return null;
  return card;
};

const removeDuplicateCard = (mods: LocalModCollection, card: ModCardInstance): void => {
  mods.cards = mods.cards.filter((entry) => entry.instanceId !== card.instanceId);
  for (const loadout of mods.loadouts) {
    for (const slot of Object.keys(loadout.cardSlots) as ModSlot[]) {
      if (loadout.cardSlots[slot] === card.instanceId) loadout.cardSlots[slot] = mods.cards.find((entry) => entry.modId === card.modId)?.instanceId ?? null;
    }
  }
  const owned = mods.inventory[card.modId];
  if (owned) {
    owned.duplicates = Math.max(0, owned.duplicates - 1);
    owned.rank = Math.max(0, ...mods.cards.filter((entry) => entry.modId === card.modId).map((entry) => entry.upgradeLevel)) as ModRank;
  }
};

export const sellDuplicateMod = (mods: LocalModCollection, instanceId: string): ModOperationResult & { credits?: number } => {
  const card = removableDuplicate(mods, instanceId);
  const definition = card ? MOD_BY_ID.get(card.modId) : undefined;
  if (!card || !definition) return { ok: false, message: 'Only duplicate cards can be sold.' };
  const credits = MOD_BALANCE.duplicateCreditValueByRarity[definition.rarity];
  removeDuplicateCard(mods, card);
  return { ok: true, message: `Duplicate sold for ${credits} credits.`, credits };
};

export const recycleDuplicateMod = (mods: LocalModCollection, instanceId: string): ModOperationResult & { plasmaChips?: number } => {
  const card = removableDuplicate(mods, instanceId);
  const definition = card ? MOD_BY_ID.get(card.modId) : undefined;
  if (!card || !definition) return { ok: false, message: 'Only duplicate cards can be recycled.' };
  const plasmaChips = MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity];
  removeDuplicateCard(mods, card);
  mods.plasmaChips += plasmaChips;
  return { ok: true, message: `Duplicate recycled into ${plasmaChips} Plasma Chip${plasmaChips === 1 ? '' : 's'}.`, plasmaChips };
};

export const infuseModCard = (mods: LocalModCollection, instanceId: string, infusionId: ModInfusionId): ModOperationResult => {
  const card = mods.cards.find((entry) => entry.instanceId === instanceId);
  if (!card) return { ok: false, message: 'Card not found.' };
  const infusion = MOD_INFUSION_BY_ID.get(infusionId);
  if (!infusion) return { ok: false, message: 'Unknown cosmetic infusion.' };
  const cost = infusion.plasmaCost;
  if (card.infusionId === infusionId) return { ok: false, message: 'That infusion is already installed.' };
  if (mods.plasmaChips < cost) return { ok: false, message: `Requires ${cost} Plasma Chips.` };
  mods.plasmaChips -= cost;
  card.infusionId = infusionId;
  return { ok: true, message: 'Cosmetic infusion installed.' };
};

export const rankUpMod = (mods: LocalModCollection, modId: string, credits: number, instanceId?: string): ModOperationResult & { cost?: number } => {
  const owned = mods.inventory[modId];
  const targetCard = instanceId ? mods.cards.find((card) => card.instanceId === instanceId && card.modId === modId) : mods.cards.find((card) => card.modId === modId);
  if (!owned?.discovered) return { ok: false, message: 'Mod has not been discovered.' };
  if (!targetCard) return { ok: false, message: 'Card not found.' };
  if (targetCard.upgradeLevel >= 3) return { ok: false, message: 'Mod card is fully upgraded.' };
  const nextRank = (targetCard.upgradeLevel + 1) as 1 | 2 | 3;
  const duplicateCost = MOD_BALANCE.duplicateRequirements[nextRank];
  const creditCost = MOD_BALANCE.rankCreditCosts[nextRank];
  if (owned.duplicates < duplicateCost) return { ok: false, message: `Requires ${duplicateCost} duplicate${duplicateCost === 1 ? '' : 's'}.`, cost: creditCost };
  if (credits < creditCost) return { ok: false, message: `Requires ${creditCost} credits.`, cost: creditCost };
  const duplicateCards = mods.cards.filter((card) => card.modId === modId && card.instanceId !== targetCard.instanceId).slice(0, duplicateCost);
  if (duplicateCards.length < duplicateCost) return { ok: false, message: 'Duplicate card inventory is inconsistent.' };
  const consumedIds = new Set(duplicateCards.map((card) => card.instanceId));
  mods.cards = mods.cards.filter((card) => !consumedIds.has(card.instanceId));
  for (const loadout of mods.loadouts) for (const slot of Object.keys(loadout.cardSlots) as ModSlot[]) {
    if (loadout.cardSlots[slot] && consumedIds.has(loadout.cardSlots[slot]!)) loadout.cardSlots[slot] = mods.cards.find((card) => card.modId === modId)?.instanceId ?? null;
  }
  owned.duplicates -= duplicateCost;
  targetCard.upgradeLevel = nextRank;
  owned.rank = Math.max(...mods.cards.filter((card) => card.modId === modId).map((card) => card.upgradeLevel)) as ModRank;
  return { ok: true, message: `Card upgraded to ${nextRank}/3.`, cost: creditCost };
};

const slotAccepts = (slot: ModSlot, category: string): boolean => slot === 'wildcard' || slot === category;

export const equipMod = (mods: LocalModCollection, slot: ModSlot, modId: string, instanceId?: string): ModOperationResult => {
  const definition = MOD_BY_ID.get(modId);
  const owned = mods.inventory[modId];
  const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
  if (!definition || !owned?.discovered) return { ok: false, message: 'That mod is locked or invalid.' };
  if (!loadout) return { ok: false, message: 'No active loadout.' };
  if (!slotAccepts(slot, definition.category)) return { ok: false, message: `${definition.name} cannot use the ${slot} slot.` };
  if (Object.entries(loadout.slots).some(([otherSlot, equipped]) => otherSlot !== slot && equipped === modId)) return { ok: false, message: 'The same mod cannot be equipped twice.' };
  const card = instanceId ? mods.cards.find((entry) => entry.instanceId === instanceId && entry.modId === modId) : mods.cards.find((entry) => entry.modId === modId);
  if (!card) return { ok: false, message: 'That card instance is missing.' };
  loadout.slots[slot] = modId;
  loadout.cardSlots[slot] = card.instanceId;
  return { ok: true, message: `${definition.name} equipped.` };
};

export const unequipMod = (mods: LocalModCollection, slot: ModSlot): void => {
  const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
  if (loadout) { loadout.slots[slot] = null; loadout.cardSlots[slot] = null; }
};

export const normalizeOwnedMod = (value: unknown): OwnedModState | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OwnedModState>;
  if (!candidate.discovered) return null;
  const rank = Math.max(0, Math.min(3, Math.floor(Number(candidate.rank) || 0))) as ModRank;
  return { rank, duplicates: Math.max(0, Math.floor(Number(candidate.duplicates) || 0)), discovered: true, acquiredCount: Math.max(1, Math.floor(Number(candidate.acquiredCount) || 1)), ...(typeof candidate.firstAcquiredAt === 'string' ? { firstAcquiredAt: candidate.firstAcquiredAt } : {}) };
};
