import { MOD_BY_ID } from './definitions.ts';
import { MOD_BALANCE } from './modBalance.ts';
import type { LocalModCollection, ModLoadoutSlots, ModRank, ModSlot, OwnedModState } from './types.ts';

export interface ModOperationResult { ok: boolean; message: string; }

export const createDefaultModLoadout = (): ModLoadoutSlots => ({ weapon: null, player: null, defense: null, bombSite: null, wildcard: null });
export const createDefaultModCollection = (): LocalModCollection => ({
  inventory: {},
  loadouts: [{ id: 'default', name: 'Primary Loadout', slots: createDefaultModLoadout() }],
  activeLoadoutId: 'default'
});

export const addModDrop = (mods: LocalModCollection, modId: string, acquiredAt = new Date().toISOString()): ModOperationResult => {
  if (!MOD_BY_ID.has(modId)) return { ok: false, message: 'Unknown mod.' };
  const owned = mods.inventory[modId];
  if (!owned) {
    mods.inventory[modId] = { rank: 1, duplicates: 0, discovered: true, acquiredCount: 1, firstAcquiredAt: acquiredAt };
    return { ok: true, message: 'Mod discovered at Rank 1.' };
  }
  owned.discovered = true;
  owned.duplicates += 1;
  owned.acquiredCount += 1;
  return { ok: true, message: 'Duplicate mod stored.' };
};

export const rankUpMod = (mods: LocalModCollection, modId: string, credits: number): ModOperationResult & { cost?: number } => {
  const owned = mods.inventory[modId];
  if (!owned?.discovered) return { ok: false, message: 'Mod has not been discovered.' };
  if (owned.rank >= 3) return { ok: false, message: 'Mod is already Rank 3.' };
  const nextRank = (owned.rank + 1) as 2 | 3;
  const duplicateCost = MOD_BALANCE.duplicateRequirements[nextRank];
  const creditCost = MOD_BALANCE.rankCreditCosts[nextRank];
  if (owned.duplicates < duplicateCost) return { ok: false, message: `Requires ${duplicateCost} duplicate${duplicateCost === 1 ? '' : 's'}.`, cost: creditCost };
  if (credits < creditCost) return { ok: false, message: `Requires ${creditCost} credits.`, cost: creditCost };
  owned.duplicates -= duplicateCost;
  owned.rank = nextRank;
  return { ok: true, message: `Upgraded to Rank ${nextRank}.`, cost: creditCost };
};

const slotAccepts = (slot: ModSlot, category: string): boolean => slot === 'wildcard' || slot === category;

export const equipMod = (mods: LocalModCollection, slot: ModSlot, modId: string): ModOperationResult => {
  const definition = MOD_BY_ID.get(modId);
  const owned = mods.inventory[modId];
  const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
  if (!definition || !owned?.discovered) return { ok: false, message: 'That mod is locked or invalid.' };
  if (!loadout) return { ok: false, message: 'No active loadout.' };
  if (!slotAccepts(slot, definition.category)) return { ok: false, message: `${definition.name} cannot use the ${slot} slot.` };
  if (Object.entries(loadout.slots).some(([otherSlot, equipped]) => otherSlot !== slot && equipped === modId)) return { ok: false, message: 'The same mod cannot be equipped twice.' };
  loadout.slots[slot] = modId;
  return { ok: true, message: `${definition.name} equipped.` };
};

export const unequipMod = (mods: LocalModCollection, slot: ModSlot): void => {
  const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
  if (loadout) loadout.slots[slot] = null;
};

export const normalizeOwnedMod = (value: unknown): OwnedModState | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OwnedModState>;
  if (!candidate.discovered) return null;
  const rank = Math.max(1, Math.min(3, Math.floor(Number(candidate.rank) || 1))) as ModRank;
  return { rank, duplicates: Math.max(0, Math.floor(Number(candidate.duplicates) || 0)), discovered: true, acquiredCount: Math.max(1, Math.floor(Number(candidate.acquiredCount) || 1)), ...(typeof candidate.firstAcquiredAt === 'string' ? { firstAcquiredAt: candidate.firstAcquiredAt } : {}) };
};
