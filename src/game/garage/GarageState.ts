import { COSMETICS } from '../../data/cosmetics.ts';
import { MOD_FOCUS_CATEGORIES, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import type { ModFocusSignalId, RunContractId, RunSetupSelection } from '../economy/types.ts';
import { MOD_BY_ID } from '../mods/definitions.ts';
import { getModDatabaseEntries } from '../mods/ModDatabaseService.ts';
import { createDefaultModLoadout, equipMod } from '../mods/ModInventoryService.ts';
import { isRunProtocolId, isRunProtocolUnlocked } from '../mods/modBalance.ts';
import type { LocalModCollection, ModCardInstance, ModSlot, RunProtocolId } from '../mods/types.ts';
import type { LocalPlayerSave } from '../save/LocalSaveTypes.ts';
import type { CosmeticOption } from '../types.ts';
import type { GaragePreset, GaragePresetId, PlayerGarageState } from './types.ts';

export const GARAGE_PRESET_IDS = ['config-a', 'config-b', 'config-c'] as const satisfies readonly GaragePresetId[];
export const GARAGE_MOD_SLOTS = ['weapon', 'player', 'defense', 'bombSite', 'wildcard'] as const satisfies readonly ModSlot[];
export const GARAGE_SLOT_LABELS: Record<ModSlot, string> = {
  weapon: 'SLOT 1 // WEAPON',
  player: 'SLOT 2 // PLAYER',
  defense: 'SLOT 3 // DEFENSE',
  bombSite: 'SLOT 4 // BOMBSITE',
  wildcard: 'SLOT 5 // UTILITY / WILDCARD'
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validContract = (value: unknown): value is RunContractId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(RUN_CONTRACTS, value);
const validFocus = (value: unknown): value is ModFocusSignalId => typeof value === 'string' && MOD_FOCUS_CATEGORIES.includes(value as ModFocusSignalId);
const safeName = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/[\u0000-\u001f\u007f<>"'`]/g, '').slice(0, 24);
  return trimmed || fallback;
};

const createEmptyPreset = (id: GaragePresetId, index: number): GaragePreset => ({
  id,
  name: `CONFIG ${String.fromCharCode(65 + index)}`,
  saved: false,
  cardSlots: createDefaultModLoadout(),
  protocol: null,
  contract: null,
  modFocus: null
});

export const createDefaultGarageState = (): PlayerGarageState => ({
  nextRun: { contract: null, modFocus: null },
  presets: GARAGE_PRESET_IDS.map(createEmptyPreset)
});

const normalizeCardSlots = (value: unknown) => {
  const slots = createDefaultModLoadout();
  if (!isObject(value)) return slots;
  for (const slot of GARAGE_MOD_SLOTS) slots[slot] = typeof value[slot] === 'string' ? value[slot] : null;
  return slots;
};

export const normalizeRunSetupSelection = (value: unknown): RunSetupSelection => {
  const candidate = isObject(value) ? value : {};
  return {
    contract: validContract(candidate.contract) ? candidate.contract : null,
    modFocus: validFocus(candidate.modFocus) ? candidate.modFocus : null
  };
};

export const normalizeGarageState = (value: unknown): PlayerGarageState => {
  const defaults = createDefaultGarageState();
  if (!isObject(value)) return defaults;
  const rawPresets = Array.isArray(value.presets) ? value.presets : [];
  return {
    nextRun: normalizeRunSetupSelection(value.nextRun),
    presets: GARAGE_PRESET_IDS.map((id, index) => {
      const fallback = createEmptyPreset(id, index);
      const raw = rawPresets.find((entry) => isObject(entry) && entry.id === id) ?? rawPresets[index];
      if (!isObject(raw)) return fallback;
      return {
        ...fallback,
        name: safeName(raw.name, fallback.name),
        saved: raw.saved === true,
        ...(typeof raw.savedAt === 'string' && !Number.isNaN(Date.parse(raw.savedAt)) ? { savedAt: raw.savedAt } : {}),
        cardSlots: normalizeCardSlots(raw.cardSlots),
        protocol: isRunProtocolId(raw.protocol) ? raw.protocol : null,
        contract: validContract(raw.contract) ? raw.contract : null,
        modFocus: validFocus(raw.modFocus) ? raw.modFocus : null
      };
    })
  };
};

export interface GarageDockModel {
  slot: ModSlot;
  label: string;
  card: ModCardInstance | null;
  empty: boolean;
}

export const getGarageDockModels = (mods: LocalModCollection): GarageDockModel[] => {
  const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
  return GARAGE_MOD_SLOTS.map((slot) => {
    const cardId = loadout?.cardSlots[slot];
    const modId = loadout?.slots[slot];
    const card = cardId && modId ? mods.cards.find((entry) => entry.instanceId === cardId && entry.modId === modId) ?? null : null;
    return { slot, label: GARAGE_SLOT_LABELS[slot], card, empty: !card };
  });
};

export const getModLibraryEntries = (mods: LocalModCollection) => getModDatabaseEntries(mods);

export const getModLibraryProgress = (mods: LocalModCollection): { discovered: number; total: number } => {
  const entries = getModLibraryEntries(mods);
  return { discovered: entries.filter((entry) => entry.discovered).length, total: entries.length };
};

export const getGarageWallet = (save: LocalPlayerSave): { credits: number; coreTokens: number; plasmaChips: number; fluxCores: number } => ({
  credits: save.wallet.credits,
  coreTokens: save.wallet.coreTokens,
  plasmaChips: save.mods.plasmaChips,
  fluxCores: save.wallet.fluxCores
});

export const getOwnedGarageCosmetics = (save: LocalPlayerSave): CosmeticOption[] => {
  const owned = new Set(save.cosmetics.owned);
  return COSMETICS.filter((item) => owned.has(item.id));
};

export const saveCurrentGaragePreset = (save: LocalPlayerSave, presetId: GaragePresetId, now = new Date().toISOString()): { ok: boolean; message: string } => {
  const preset = save.garage.presets.find((entry) => entry.id === presetId);
  const loadout = save.mods.loadouts.find((entry) => entry.id === save.mods.activeLoadoutId) ?? save.mods.loadouts[0];
  if (!preset || !loadout) return { ok: false, message: 'Garage configuration is unavailable.' };
  preset.saved = true;
  preset.savedAt = now;
  preset.cardSlots = { ...loadout.cardSlots };
  preset.protocol = save.protocol.preferred;
  preset.contract = save.garage.nextRun.contract;
  preset.modFocus = save.garage.nextRun.modFocus;
  return { ok: true, message: `${preset.name} saved.` };
};

export const countMissingPresetCards = (save: LocalPlayerSave, preset: GaragePreset): number =>
  Object.values(preset.cardSlots).filter((instanceId) => instanceId && !save.mods.cards.some((card) => card.instanceId === instanceId)).length;

export interface GaragePresetLoadResult { ok: boolean; message: string; missingCards: number; ignoredProtocol: boolean }

export const loadGaragePreset = (save: LocalPlayerSave, presetId: GaragePresetId): GaragePresetLoadResult => {
  const preset = save.garage.presets.find((entry) => entry.id === presetId);
  const loadout = save.mods.loadouts.find((entry) => entry.id === save.mods.activeLoadoutId) ?? save.mods.loadouts[0];
  if (!preset?.saved || !loadout) return { ok: false, message: 'That configuration slot is empty.', missingCards: 0, ignoredProtocol: false };

  let ignoredProtocol = false;
  const targetProtocol = preset.protocol && isRunProtocolUnlocked(preset.protocol, save.progress)
    ? preset.protocol
    : save.protocol.preferred;
  if (preset.protocol && targetProtocol !== preset.protocol) ignoredProtocol = true;
  save.protocol.preferred = targetProtocol;

  loadout.slots = createDefaultModLoadout();
  loadout.cardSlots = createDefaultModLoadout();
  let missingCards = 0;
  for (const slot of GARAGE_MOD_SLOTS) {
    const instanceId = preset.cardSlots[slot];
    if (!instanceId) continue;
    const card = save.mods.cards.find((entry) => entry.instanceId === instanceId);
    const definition = card ? MOD_BY_ID.get(card.modId) : undefined;
    if (!card || !definition) {
      missingCards += 1;
      continue;
    }
    const result = equipMod(save.mods, slot, definition.id, card.instanceId, targetProtocol);
    if (!result.ok) missingCards += 1;
  }

  save.garage.nextRun = normalizeRunSetupSelection({ contract: preset.contract, modFocus: preset.modFocus });
  const notes = [missingCards > 0 ? `${missingCards} missing Mod${missingCards === 1 ? '' : 's'} skipped` : '', ignoredProtocol ? 'locked Protocol ignored' : ''].filter(Boolean);
  return { ok: true, message: `${preset.name} loaded${notes.length ? ` // ${notes.join(' // ')}` : ''}.`, missingCards, ignoredProtocol };
};

export const isGarageProtocolUnlocked = (protocol: RunProtocolId, highestRound: number, supremeHighestRound = 0, regularOverdriveCompleted = false): boolean =>
  isRunProtocolUnlocked(protocol, { highestRound, supremeHighestRound, regularOverdriveCompleted });
