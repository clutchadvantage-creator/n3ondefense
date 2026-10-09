import { COSMETICS, DEFAULT_EQUIPPED_COSMETICS } from '../../data/cosmetics.ts';
import { MOD_FOCUS_CATEGORIES, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import type { ModFocusSignalId, RunContractId, RunSetupSelection } from '../economy/types.ts';
import { MOD_BY_ID } from '../mods/definitions.ts';
import { getModDatabaseEntries } from '../mods/ModDatabaseService.ts';
import { createDefaultModLoadout, equipMod } from '../mods/ModInventoryService.ts';
import { RUN_PROTOCOLS, isRunProtocolId, isRunProtocolUnlocked } from '../mods/modBalance.ts';
import { getSupremeCampaignStart } from '../progression/CampaignProgression.ts';
import type { LocalModCollection, ModCardInstance, ModSlot, RunProtocolId } from '../mods/types.ts';
import type { LocalPlayerSave } from '../save/LocalSaveTypes.ts';
import type { CosmeticOption } from '../types.ts';
import type { GaragePreset, GaragePresetId, PlayerGarageState, SaveGaragePresetOptions } from './types.ts';
import { resolveOperationsConfiguration, selectOperationsCheckpoint } from '../progression/OperationsConfiguration.ts';

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
export const GARAGE_PRESET_VERSION = 2;
export const GARAGE_PRESET_NAME_LIMIT = 24;
export const sanitizePresetName = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, GARAGE_PRESET_NAME_LIMIT);
  return trimmed || fallback;
};

const createEmptyPreset = (id: GaragePresetId, index: number): GaragePreset => ({
  id,
  version: GARAGE_PRESET_VERSION,
  name: `CONFIG ${String.fromCharCode(65 + index)}`,
  saved: false,
  cardSlots: createDefaultModLoadout(),
  protocol: null,
  normalStartRound: null,
  campaignStartRound: null,
  contract: null,
  modFocus: null
});

export const createDefaultGarageState = (): PlayerGarageState => ({
  nextRun: { contract: null, modFocus: null },
  savedDeploymentEnabled: false,
  lastDeploymentReminderAt: null,
  activePresetId: null,
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
    activePresetId: GARAGE_PRESET_IDS.includes(value.activePresetId as GaragePresetId) ? value.activePresetId as GaragePresetId : null,
    savedDeploymentEnabled: value.savedDeploymentEnabled === true,
    lastDeploymentReminderAt: typeof value.lastDeploymentReminderAt === 'string' && !Number.isNaN(Date.parse(value.lastDeploymentReminderAt))
      ? value.lastDeploymentReminderAt
      : null,
    presets: GARAGE_PRESET_IDS.map((id, index) => {
      const fallback = createEmptyPreset(id, index);
      const raw = rawPresets.find((entry) => isObject(entry) && entry.id === id) ?? rawPresets[index];
      if (!isObject(raw)) return fallback;
      const issues = Array.isArray(raw.validationIssues) ? raw.validationIssues.filter((item): item is string => typeof item === 'string').slice(0, 20) : [];
      if (raw.version != null && (!Number.isInteger(raw.version) || Number(raw.version) < 1)) issues.push('Saved configuration format is invalid.');
      if (raw.protocol != null && !isRunProtocolId(raw.protocol)) issues.push('Saved gameplay mode is unavailable.');
      if (raw.contract != null && !validContract(raw.contract)) issues.push('Saved Contract is unavailable.');
      if (raw.modFocus != null && !validFocus(raw.modFocus)) issues.push('Saved Signal is unavailable.');
      if (raw.campaignStartRound != null && (!Number.isInteger(raw.campaignStartRound) || Number(raw.campaignStartRound) < 1 || Number(raw.campaignStartRound) > 30)) issues.push('Saved checkpoint is invalid.');
      if (raw.normalStartRound != null && (!Number.isInteger(raw.normalStartRound) || Number(raw.normalStartRound) < 1)) issues.push('Saved Normal checkpoint is invalid.');
      if (raw.saved === true && !isObject(raw.cardSlots)) issues.push('Saved Mod slots are invalid.');
      if (isObject(raw.cardSlots) && Object.values(raw.cardSlots).some(id => id != null && typeof id !== 'string')) issues.push('Saved Mod reference is invalid.');
      const infusionIds = isObject(raw.infusionIds) ? raw.infusionIds : undefined;
      if ('infusionIds' in raw && (!infusionIds || Object.values(infusionIds).some(id => id !== null && typeof id !== 'string'))) issues.push('Saved Infusion linkage is invalid.');
      if (raw.saved === true && raw.version === GARAGE_PRESET_VERSION && (
        !isRunProtocolId(raw.protocol) || raw.campaignStartRound == null || !isObject(raw.cosmetics)
        || typeof raw.savedDeploymentEnabled !== 'boolean' || !isObject(raw.cardSlots) || !infusionIds
        || GARAGE_MOD_SLOTS.some(slot => !(slot in (raw.cardSlots as Record<string, unknown>)) || !(slot in infusionIds))
      )) issues.push('Saved configuration is incomplete; resave the current setup.');
      const cosmetics: GaragePreset['cosmetics'] = {};
      if ('cosmetics' in raw) {
        if (!isObject(raw.cosmetics)) issues.push('Saved cosmetic equipment is invalid.');
        else for (const [category, id] of Object.entries(raw.cosmetics)) {
          if (typeof id === 'string') cosmetics[category as CosmeticOption['category']] = id;
          else issues.push(`Saved ${category} cosmetic reference is invalid.`);
        }
      }
      return {
        ...fallback,
        version: typeof raw.version === 'number' ? raw.version : 1,
        name: sanitizePresetName(raw.name, fallback.name),
        ...('cosmetics' in raw ? { cosmetics } : {}),
        ...(infusionIds ? { infusionIds: Object.fromEntries(GARAGE_MOD_SLOTS.map(slot => [slot, typeof infusionIds[slot] === 'string' ? infusionIds[slot] : null])) } : {}),
        ...(typeof raw.savedDeploymentEnabled === 'boolean' ? { savedDeploymentEnabled: raw.savedDeploymentEnabled } : {}),
        ...(issues.length ? { validationIssues: [...new Set(issues)] } : {}),
        saved: raw.saved === true,
        ...(typeof raw.savedAt === 'string' && !Number.isNaN(Date.parse(raw.savedAt)) ? { savedAt: raw.savedAt } : {}),
        cardSlots: normalizeCardSlots(raw.cardSlots),
        ...(isObject(raw.cardModIds) ? { cardModIds: normalizeCardSlots(raw.cardModIds) } : {}),
        protocol: isRunProtocolId(raw.protocol) ? raw.protocol : null,
        campaignStartRound: typeof raw.campaignStartRound === 'number' && Number.isInteger(raw.campaignStartRound)
          && raw.campaignStartRound >= 1 && raw.campaignStartRound <= 30 ? raw.campaignStartRound : null,
        normalStartRound: typeof raw.normalStartRound === 'number' && Number.isInteger(raw.normalStartRound) && raw.normalStartRound >= 1
          ? raw.normalStartRound
          : null,
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

const currentInfusions = (save: LocalPlayerSave, slots: GaragePreset['cardSlots']): NonNullable<GaragePreset['infusionIds']> =>
  Object.fromEntries(GARAGE_MOD_SLOTS.map(slot => [slot, save.mods.cards.find(card => card.instanceId === slots[slot])?.infusionId ?? null]));

export const saveCurrentGaragePreset = (
  save: LocalPlayerSave, presetId: GaragePresetId, now = new Date().toISOString(), options: SaveGaragePresetOptions = {}
): { ok: boolean; message: string } => {
  const preset = save.garage.presets.find(entry => entry.id === presetId);
  const loadout = save.mods.loadouts.find(entry => entry.id === save.mods.activeLoadoutId) ?? save.mods.loadouts[0];
  if (!preset || !loadout) return { ok: false, message: 'Garage configuration is unavailable.' };
  if (preset.saved && !options.overwriteConfirmed) return { ok: false, message: 'Confirm overwrite before replacing this configuration.' };
  const operations = resolveOperationsConfiguration(save.protocol, save.progress);
  Object.assign(preset, {
    version: GARAGE_PRESET_VERSION, name: sanitizePresetName(options.name, preset.name), saved: true, savedAt: now,
    cardSlots: { ...loadout.cardSlots }, cardModIds: { ...loadout.slots }, infusionIds: currentInfusions(save, loadout.cardSlots),
    cosmetics: { ...save.cosmetics.equipped }, protocol: operations.protocol,
    campaignStartRound: operations.startingRound, normalStartRound: save.protocol.selectedNormalStartRound,
    contract: save.garage.nextRun.contract, modFocus: save.garage.nextRun.modFocus,
    savedDeploymentEnabled: save.garage.savedDeploymentEnabled
  });
  delete preset.validationIssues;
  return { ok: true, message: `${preset.name} saved.` };
};

export const renameGaragePreset = (save: LocalPlayerSave, presetId: GaragePresetId, name: string): { ok: boolean; message: string } => {
  const preset = save.garage.presets.find(entry => entry.id === presetId);
  if (!preset?.saved) return { ok: false, message: 'Save a configuration before renaming it.' };
  preset.name = sanitizePresetName(name, preset.name);
  return { ok: true, message: `${preset.name} renamed.` };
};

export const countMissingPresetCards = (save: LocalPlayerSave, preset: GaragePreset): number =>
  Object.values(preset.cardSlots).filter(instanceId => instanceId && !save.mods.cards.some(card => card.instanceId === instanceId)).length;

export interface GaragePresetLoadResult { ok: boolean; message: string; missingCards: number; ignoredProtocol: boolean; issues?: string[] }

/** Build a candidate loadout using the same equip and checkpoint rules as the Garage.
 * No live state changes until every reference has passed validation. */
export const validateGaragePreset = (save: LocalPlayerSave, preset: GaragePreset) => {
  const issues = [...(preset.validationIssues ?? [])];
  if (!preset.saved) issues.push('That configuration slot is empty.');
  if ((preset.version ?? 1) > GARAGE_PRESET_VERSION) issues.push('This configuration uses a newer format.');
  const current = resolveOperationsConfiguration(save.protocol, save.progress);
  const protocol = preset.protocol ?? current.protocol;
  let preference = { ...save.protocol };
  if (!isRunProtocolId(protocol)) issues.push('Saved gameplay mode is unavailable.');
  else if (preset.protocol) {
    const selected = selectOperationsCheckpoint(save.protocol, save.progress, protocol,
      preset.campaignStartRound ?? (protocol === 'normal'
        ? preset.normalStartRound ?? save.protocol.selectedNormalStartRound
        : getSupremeCampaignStart(protocol) ?? Math.min(30, RUN_PROTOCOLS[protocol].startingRound)));
    if (!selected.ok || !selected.preference) issues.push(selected.message);
    else preference = selected.preference;
  }
  if (preset.contract !== null && !validContract(preset.contract)) issues.push('Saved Contract is unavailable.');
  if (preset.modFocus !== null && !validFocus(preset.modFocus)) issues.push('Saved Signal is unavailable.');
  const loadout = save.mods.loadouts.find(entry => entry.id === save.mods.activeLoadoutId) ?? save.mods.loadouts[0];
  const candidate = loadout ? { ...loadout, slots: createDefaultModLoadout(), cardSlots: createDefaultModLoadout() } : null;
  if (!candidate) issues.push('No active Mod loadout is available.');
  const mods = candidate ? { ...save.mods, activeLoadoutId: candidate.id, loadouts: [candidate] } : null;
  for (const slot of GARAGE_MOD_SLOTS) {
    const id = preset.cardSlots[slot];
    if (!id) continue;
    const card = save.mods.cards.find(entry => entry.instanceId === id);
    const definition = card && MOD_BY_ID.get(card.modId);
    if (!card || !definition) {
      const savedName = MOD_BY_ID.get(preset.cardModIds?.[slot] ?? '')?.name;
      issues.push(`${GARAGE_SLOT_LABELS[slot]}: missing Mod (${savedName ?? id}).`); continue;
    }
    if (preset.infusionIds && (preset.infusionIds[slot] ?? null) !== (card.infusionId ?? null)) {
      issues.push(`${definition.name}: saved Infusion linkage changed; resave this configuration.`);
    }
    if (mods && isRunProtocolId(protocol)) {
      const equipped = equipMod(mods, slot, card.modId, id, protocol);
      if (!equipped.ok) issues.push(`${definition.name}: ${equipped.message}`);
    }
  }
  if (preset.cosmetics) for (const [category, id] of Object.entries(preset.cosmetics)) {
    const cosmetic = COSMETICS.find(item => item.id === id && item.category === category);
    if (!cosmetic || (!save.cosmetics.owned.includes(id) && DEFAULT_EQUIPPED_COSMETICS[cosmetic.category] !== id)) issues.push(`${category}: missing cosmetic (${cosmetic?.label ?? id}).`);
  }
  return { ok: issues.length === 0, issues, preference, loadout: candidate };
};

export const loadGaragePreset = (save: LocalPlayerSave, presetId: GaragePresetId): GaragePresetLoadResult => {
  const preset = save.garage.presets.find(entry => entry.id === presetId);
  if (!preset?.saved) return { ok: false, message: 'That configuration slot is empty.', missingCards: 0, ignoredProtocol: false };
  const validated = validateGaragePreset(save, preset);
  if (!validated.ok || !validated.loadout) return {
    ok: false, message: validated.issues.join(' // '), issues: validated.issues,
    missingCards: countMissingPresetCards(save, preset), ignoredProtocol: false
  };
  const loadout = save.mods.loadouts.find(entry => entry.id === validated.loadout!.id)!;
  loadout.cardSlots = validated.loadout.cardSlots;
  loadout.slots = validated.loadout.slots;
  save.protocol = validated.preference;
  if (preset.cosmetics) save.cosmetics.equipped = { ...preset.cosmetics };
  save.garage.nextRun = { contract: preset.contract, modFocus: preset.modFocus };
  if (preset.savedDeploymentEnabled !== undefined) save.garage.savedDeploymentEnabled = preset.savedDeploymentEnabled;
  save.garage.activePresetId = preset.id;
  return { ok: true, message: `${preset.name} loaded.`, missingCards: 0, ignoredProtocol: false };
};

export const getGaragePresetStatus = (save: LocalPlayerSave, preset: GaragePreset): 'saved' | 'active' | 'modified' => {
  if (save.garage.activePresetId !== preset.id) return 'saved';
  const loadout = save.mods.loadouts.find(entry => entry.id === save.mods.activeLoadoutId) ?? save.mods.loadouts[0];
  const operations = resolveOperationsConfiguration(save.protocol, save.progress);
  const savedMode = preset.protocol && RUN_PROTOCOLS[preset.protocol]?.family;
  const savedStart = preset.campaignStartRound ?? (preset.protocol === 'normal' ? preset.normalStartRound
    : preset.protocol ? getSupremeCampaignStart(preset.protocol) ?? Math.min(30, RUN_PROTOCOLS[preset.protocol]?.startingRound ?? 1) : null);
  const sameCosmetics = !preset.cosmetics || Object.keys({ ...preset.cosmetics, ...save.cosmetics.equipped })
    .every(category => preset.cosmetics![category as CosmeticOption['category']] === save.cosmetics.equipped[category as CosmeticOption['category']]);
  const infusions = loadout ? currentInfusions(save, loadout.cardSlots) : {};
  const matches = !!loadout && GARAGE_MOD_SLOTS.every(slot => loadout.cardSlots[slot] === preset.cardSlots[slot])
    && (!preset.infusionIds || GARAGE_MOD_SLOTS.every(slot => (preset.infusionIds![slot] ?? null) === infusions[slot]))
    && sameCosmetics && (!savedMode || savedMode === operations.mode) && (!savedStart || savedStart === operations.startingRound)
    && preset.contract === save.garage.nextRun.contract && preset.modFocus === save.garage.nextRun.modFocus
    && (preset.savedDeploymentEnabled === undefined || preset.savedDeploymentEnabled === save.garage.savedDeploymentEnabled);
  return matches ? 'active' : 'modified';
};

export const isGarageProtocolUnlocked = (protocol: RunProtocolId, highestRound: number, supremeHighestRound = 0, regularOverdriveCompleted = false): boolean =>
  isRunProtocolUnlocked(protocol, { highestRound, supremeHighestRound, regularOverdriveCompleted });
