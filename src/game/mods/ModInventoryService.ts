import { MOD_BY_ID } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import type { LocalModCollection, ModCardInstance, ModInfusionId, ModLoadoutSlots, ModRank, ModSlot, OwnedModState } from './types.ts';
import { MOD_INFUSION_BY_ID } from './infusions.ts';
import { hasLegendaryInAnotherSlot } from './ModLoadoutRules.ts';

export interface ModOperationResult { ok: boolean; message: string; }

export const createDefaultModLoadout = (): ModLoadoutSlots => ({ weapon: null, player: null, defense: null, bombSite: null, wildcard: null });
export const createDefaultModCollection = (): LocalModCollection => ({
  inventory: {},
  cards: [],
  plasmaChips: 0,
  purchasedLoadoutSlots: 1,
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

export const getModCopyCounts = (cards: readonly ModCardInstance[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.modId, (counts.get(card.modId) ?? 0) + 1);
  return counts;
};

export const getRecyclableUnupgradedDuplicates = (mods: LocalModCollection): ModCardInstance[] => {
  const cardsByMod = new Map<string, ModCardInstance[]>();
  for (const card of mods.cards) {
    const group = cardsByMod.get(card.modId) ?? [];
    group.push(card);
    cardsByMod.set(card.modId, group);
  }
  const equippedCardIds = new Set(mods.loadouts.flatMap((loadout) => Object.values(loadout.cardSlots)));
  const recyclable: ModCardInstance[] = [];
  for (const cards of cardsByMod.values()) {
    if (cards.length <= 1) continue;
    const unupgraded = cards.filter((card) => card.upgradeLevel === 0);
    if (!unupgraded.length) continue;
    if (cards.some((card) => card.upgradeLevel > 0)) {
      recyclable.push(...unupgraded);
      continue;
    }
    const keeper = [...unupgraded].sort((a, b) =>
      Number(Boolean(b.infusionId)) - Number(Boolean(a.infusionId))
      || Number(equippedCardIds.has(b.instanceId)) - Number(equippedCardIds.has(a.instanceId))
      || a.acquiredAt.localeCompare(b.acquiredAt)
      || a.instanceId.localeCompare(b.instanceId)
    )[0];
    recyclable.push(...unupgraded.filter((card) => card.instanceId !== keeper.instanceId));
  }
  return recyclable;
};

const removeCard = (mods: LocalModCollection, card: ModCardInstance): void => {
  mods.cards = mods.cards.filter((entry) => entry.instanceId !== card.instanceId);
  for (const loadout of mods.loadouts) {
    for (const slot of Object.keys(loadout.cardSlots) as ModSlot[]) {
      if (loadout.cardSlots[slot] !== card.instanceId) continue;
      const replacement = mods.cards.find((entry) => entry.modId === card.modId);
      loadout.cardSlots[slot] = replacement?.instanceId ?? null;
      if (!replacement) loadout.slots[slot] = null;
    }
  }
  const owned = mods.inventory[card.modId];
  if (owned) {
    const remaining = mods.cards.filter((entry) => entry.modId === card.modId);
    if (!remaining.length) delete mods.inventory[card.modId];
    else {
      owned.duplicates = Math.max(0, remaining.length - 1);
      owned.rank = Math.max(...remaining.map((entry) => entry.upgradeLevel)) as ModRank;
    }
  }
};

export const sellDuplicateMod = (mods: LocalModCollection, instanceId: string): ModOperationResult & { credits?: number } => {
  const card = mods.cards.find((entry) => entry.instanceId === instanceId);
  const definition = card ? MOD_BY_ID.get(card.modId) : undefined;
  if (!card || !definition) return { ok: false, message: 'Card not found.' };
  const credits = MOD_BALANCE.duplicateCreditValueByRarity[definition.rarity];
  removeCard(mods, card);
  return { ok: true, message: `Card sold for ${credits} credits.`, credits };
};

export const recycleDuplicateMod = (mods: LocalModCollection, instanceId: string): ModOperationResult & { plasmaChips?: number } => {
  const card = mods.cards.find((entry) => entry.instanceId === instanceId);
  const definition = card ? MOD_BY_ID.get(card.modId) : undefined;
  if (!card || !definition) return { ok: false, message: 'Card not found.' };
  const plasmaChips = MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity];
  removeCard(mods, card);
  mods.plasmaChips += plasmaChips;
  return { ok: true, message: `Card recycled into ${plasmaChips} Plasma Chip${plasmaChips === 1 ? '' : 's'}.`, plasmaChips };
};

export const recycleAllUnupgradedDuplicates = (mods: LocalModCollection): ModOperationResult & { recycledCards?: number; plasmaChips?: number } => {
  const recyclable = getRecyclableUnupgradedDuplicates(mods);
  if (!recyclable.length) return { ok: false, message: 'No unupgraded duplicate cards are available to recycle.' };
  let plasmaChips = 0;
  let recycledCards = 0;
  for (const card of recyclable) {
    const result = recycleDuplicateMod(mods, card.instanceId);
    if (!result.ok) continue;
    plasmaChips += result.plasmaChips ?? 0;
    recycledCards += 1;
  }
  return {
    ok: recycledCards > 0,
    message: `Recycled ${recycledCards} unupgraded duplicate card${recycledCards === 1 ? '' : 's'} into ${plasmaChips} Plasma Chip${plasmaChips === 1 ? '' : 's'}.`,
    recycledCards,
    plasmaChips
  };
};

export const deleteModCard = (mods: LocalModCollection, instanceId: string): ModOperationResult => {
  const card = mods.cards.find((entry) => entry.instanceId === instanceId);
  if (!card) return { ok: false, message: 'Card not found.' };
  removeCard(mods, card);
  return { ok: true, message: 'Card deleted.' };
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

export const rankUpMod = (mods: LocalModCollection, modId: string, credits: number, coreTokens = 0, instanceId?: string): ModOperationResult & { cost?: number; coreTokenCost?: number } => {
  const owned = mods.inventory[modId];
  const definition = MOD_BY_ID.get(modId);
  const targetCard = instanceId ? mods.cards.find((card) => card.instanceId === instanceId && card.modId === modId) : mods.cards.find((card) => card.modId === modId);
  if (!owned?.discovered || !definition) return { ok: false, message: 'Mod has not been discovered.' };
  if (!targetCard) return { ok: false, message: 'Card not found.' };
  if (targetCard.upgradeLevel >= 3) return { ok: false, message: 'Mod card is fully upgraded.' };
  const nextRank = (targetCard.upgradeLevel + 1) as 1 | 2 | 3;
  const creditCost = MOD_BALANCE.rankCreditCosts[nextRank];
  const coreTokenCost = MOD_BALANCE.rankCoreTokenCostsByRarity[definition.rarity][nextRank];
  if (credits < creditCost) return { ok: false, message: `Requires ${creditCost.toLocaleString()} Credits.`, cost: creditCost, coreTokenCost };
  if (coreTokens < coreTokenCost) return { ok: false, message: `Requires ${coreTokenCost.toLocaleString()} Core Tokens.`, cost: creditCost, coreTokenCost };
  targetCard.upgradeLevel = nextRank;
  owned.rank = Math.max(...mods.cards.filter((card) => card.modId === modId).map((card) => card.upgradeLevel)) as ModRank;
  const tokenMessage = coreTokenCost > 0 ? ` and ${coreTokenCost.toLocaleString()} Core Tokens` : '';
  return { ok: true, message: `Card upgraded to ${nextRank}/3 for ${creditCost.toLocaleString()} Credits${tokenMessage}.`, cost: creditCost, coreTokenCost };
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
  if (definition.rarity === 'legendary' && hasLegendaryInAnotherSlot(loadout.slots, slot)) {
    return { ok: false, message: 'Only one Legendary Mod can be equipped at a time.' };
  }
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
