import { createDefaultLocalSave, normalizeImportedSave, normalizeLocalSave } from './SaveValidator';
import { DEFAULT_AUDIO_VOLUME, createDefaultSoundVolumes } from '../config/audio';
import { DEFAULT_ABILITY_BINDINGS } from '../config/controls';
import { CURRENT_SAVE_VERSION, EXPORT_FORMAT, GAME_VERSION, type ExportedSaveFile, type ImportedSavePreview, type LocalPlayerSave, type LocalPlayerSaveV1 } from './LocalSaveTypes';

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const createUniqueName = (name: string, existingNames: string[]): string => {
  const base = name.trim() || 'Imported Profile';
  if (!existingNames.some((entry) => entry.trim().toLowerCase() === base.toLowerCase())) return base;
  let index = 2;
  while (existingNames.some((entry) => entry.trim().toLowerCase() === `${base} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${base} ${index}`;
};

const migrateV1ToV2 = (save: LocalPlayerSaveV1): LocalPlayerSave => {
  const normalized = normalizeLocalSave({
    version: CURRENT_SAVE_VERSION,
    profile: save.profile,
    wallet: save.wallet,
    upgrades: save.upgrades,
    cosmetics: save.cosmetics,
    progress: { ...save.progress, totalPlaytimeSeconds: 0 },
    settings: { ...save.settings, screenShake: true, particles: true },
    metadata: { ...save.metadata, saveRevision: 1 }
  });
  if (!normalized) {
    return createDefaultLocalSave(save.profile.id || 'legacy-profile', save.profile.name || 'Legacy Profile');
  }
  return normalized;
};

export const migrateUnknownSave = (input: unknown, existingNames: string[] = []): LocalPlayerSave | null => {
  if (isObject(input) && input.format === EXPORT_FORMAT && input.exportVersion === 1) {
    const preview = normalizeImportedSave(input);
    if (!preview) return null;
    const uniqueName = createUniqueName(preview.profile.name, existingNames);
    return {
      ...preview,
      profile: {
        ...preview.profile,
        name: uniqueName
      }
    };
  }

  const normalized = normalizeLocalSave(input);
  if (normalized) return normalized;

  if (isObject(input) && typeof input.credits === 'number' && typeof input.coreTokens === 'number') {
    const profileName = createUniqueName('Legacy Profile', existingNames);
    return createDefaultLocalSave(`legacy-${Date.now()}`, profileName, {
      wallet: {
        credits: input.credits,
        coreTokens: input.coreTokens,
        fluxCores: typeof input.fluxCores === 'number' ? input.fluxCores : 0
      },
      upgrades: isObject(input.upgrades) ? (input.upgrades as Record<string, number>) : {},
      cosmetics: {
        owned: Array.isArray(input.unlockedCosmetics) ? input.unlockedCosmetics : [],
        equipped: isObject(input.equippedCosmetics) ? input.equippedCosmetics : {}
      },
      settings: isObject(input.settings) ? {
        masterVolume: typeof input.settings.masterVolume === 'number' ? input.settings.masterVolume : DEFAULT_AUDIO_VOLUME,
        musicVolume: typeof input.settings.musicVolume === 'number' ? input.settings.musicVolume : DEFAULT_AUDIO_VOLUME,
        sfxVolume: typeof input.settings.sfxVolume === 'number' ? input.settings.sfxVolume : DEFAULT_AUDIO_VOLUME,
        soundVolumes: createDefaultSoundVolumes(),
        screenShake: true,
        particles: true,
        abilityBindings: { ...DEFAULT_ABILITY_BINDINGS }
      } : {
        masterVolume: DEFAULT_AUDIO_VOLUME,
        musicVolume: DEFAULT_AUDIO_VOLUME,
        sfxVolume: DEFAULT_AUDIO_VOLUME,
        soundVolumes: createDefaultSoundVolumes(),
        screenShake: true,
        particles: true,
        abilityBindings: { ...DEFAULT_ABILITY_BINDINGS }
      }
    });
  }

  if (isObject(input) && typeof input.version === 'number' && input.version === 1) {
    return migrateV1ToV2(input as unknown as LocalPlayerSaveV1);
  }

  return null;
};

export const previewImportedSave = (input: unknown, existingNames: string[] = []): ImportedSavePreview | null => {
  if (!isObject(input) || input.format !== EXPORT_FORMAT || input.exportVersion !== 1) return null;
  const save = normalizeImportedSave(input);
  if (!save) return null;
  const suggestedName = createUniqueName(save.profile.name, existingNames);
  const duplicateName = existingNames.some((entry) => entry.trim().toLowerCase() === save.profile.name.trim().toLowerCase());
  return {
    save: {
      ...save,
      profile: {
        ...save.profile,
        name: suggestedName
      }
    },
    suggestedName,
    duplicateName
  };
};

export const buildExportedSaveFile = (save: LocalPlayerSave): ExportedSaveFile => ({
  format: EXPORT_FORMAT,
  exportVersion: 1,
  gameVersion: save.metadata.gameVersion || GAME_VERSION,
  exportedAt: new Date().toISOString(),
  save
});
