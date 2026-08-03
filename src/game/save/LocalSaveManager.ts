import { STORAGE_NAMESPACE, type ExportedSaveFile, type LocalLeaderboardEntry, type LocalPlayerSave, type LocalProfileIndex, type ProfileSummary } from './LocalSaveTypes';
import { buildProfileSummary, createDefaultLocalSave, createEmptyProfileIndex, normalizeLocalSave, validateProfileName } from './SaveValidator';
import { buildSaveExport, exportSaveFile } from './SaveExportManager';
import { migrateUnknownSave, previewImportedSave } from './SaveMigrationManager';

export interface SaveOperationResult {
  ok: boolean;
  message?: string;
}

export interface LegacyProgressionStatus {
  found: boolean;
  prompted: boolean;
  raw?: unknown;
}

export interface RecoveryStatus {
  profileId: string;
  hasValidBackup: boolean;
  primaryCorrupted: boolean;
}

const INDEX_KEY = `${STORAGE_NAMESPACE}.profiles`;
const LEGACY_SAVE_KEYS = ['projectx.neon.defense.v1', `${STORAGE_NAMESPACE}.save`];

const memoryStorage = new Map<string, string>();
let storageAvailable = true;

const backupKey = (profileId: string): string => `${STORAGE_NAMESPACE}.profile.${profileId}.backup`;
const profileKey = (profileId: string): string => `${STORAGE_NAMESPACE}.profile.${profileId}`;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    storageAvailable = false;
    return memoryStorage.get(key) ?? null;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    storageAvailable = false;
    memoryStorage.set(key, value);
  }
};

const removeStorage = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    storageAvailable = false;
    memoryStorage.delete(key);
  }
};

const parseJson = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const readIndex = (): LocalProfileIndex => {
  const parsed = parseJson(readStorage(INDEX_KEY));
  if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.profiles)) {
    return createEmptyProfileIndex();
  }

  const profiles: ProfileSummary[] = [];
  for (const item of parsed.profiles) {
    if (isObject(item) && typeof item.id === 'string' && typeof item.name === 'string') {
      const normalized = normalizeLocalSave(parseJson(readStorage(profileKey(item.id))));
      if (normalized) {
        profiles.push(buildProfileSummary(normalized));
        continue;
      }
      profiles.push({
        id: item.id,
        name: item.name,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        lastPlayedAt: typeof item.lastPlayedAt === 'string' ? item.lastPlayedAt : new Date().toISOString(),
        credits: Math.max(0, Number(item.credits) || 0),
        coreTokens: Math.max(0, Number(item.coreTokens) || 0),
        highestRound: Math.max(0, Number(item.highestRound) || 0),
        roundsCompleted: Math.max(0, Number(item.roundsCompleted) || 0),
        equippedPlayerColor: typeof item.equippedPlayerColor === 'string' ? item.equippedPlayerColor : null,
        saveRevision: Math.max(0, Number(item.saveRevision) || 0)
      });
    }
  }

  return {
    version: 1,
    activeProfileId: typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null,
    profiles,
    legacyMigrationPrompted: Boolean(parsed.legacyMigrationPrompted)
  };
};

const writeIndex = (index: LocalProfileIndex): void => {
  writeStorage(INDEX_KEY, JSON.stringify(index));
};

const ensureProfileId = (profileId: string): boolean => profileId.length > 0;

const getExistingNames = (index: LocalProfileIndex, excludeProfileId?: string): string[] => index.profiles.filter((profile) => profile.id !== excludeProfileId).map((profile) => profile.name);

export class LocalSaveManager {
  private static index: LocalProfileIndex = readIndex();
  private static lastRecovery: RecoveryStatus | null = null;

  static ensureLoaded(): LocalProfileIndex {
    LocalSaveManager.index = readIndex();
    return LocalSaveManager.index;
  }

  static getStorageAvailable(): boolean {
    return storageAvailable;
  }

  static getStorageMessage(): string | null {
    return storageAvailable ? null : 'LOCAL SAVING UNAVAILABLE';
  }

  static listProfiles(): ProfileSummary[] {
    return [...LocalSaveManager.ensureLoaded().profiles].sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
  }

  static getLeaderboardEntries(): LocalLeaderboardEntry[] {
    return LocalSaveManager.listProfiles().flatMap((profile) => {
      const save = LocalSaveManager.loadProfile(profile.id);
      if (!save) return [];
      return [{
        profileId: save.profile.id,
        name: save.profile.name,
        credits: save.wallet.credits,
        totalCreditsEarned: save.progress.totalCreditsEarned,
        highestRound: save.progress.highestRound,
        roundsCompleted: save.progress.roundsCompleted,
        bombSitesDestroyed: save.progress.bombSitesDestroyed,
        enemiesDestroyed: save.progress.enemiesDestroyed
      }];
    });
  }

  static getActiveProfileId(): string | null {
    const active = LocalSaveManager.ensureLoaded().activeProfileId;
    if (active && LocalSaveManager.listProfiles().some((profile) => profile.id === active)) return active;
    return LocalSaveManager.listProfiles()[0]?.id ?? null;
  }

  static getActiveProfileSummary(): ProfileSummary | null {
    const activeId = LocalSaveManager.getActiveProfileId();
    if (!activeId) return null;
    return LocalSaveManager.listProfiles().find((profile) => profile.id === activeId) ?? null;
  }

  static getActiveProfileSave(): LocalPlayerSave | null {
    const activeId = LocalSaveManager.getActiveProfileId();
    if (!activeId) return null;
    return LocalSaveManager.loadProfile(activeId);
  }

  static getRecoveryStatus(): RecoveryStatus | null {
    return LocalSaveManager.lastRecovery;
  }

  static selectProfile(profileId: string): { ok: boolean; save?: LocalPlayerSave; recovery?: RecoveryStatus; message?: string } {
    const save = LocalSaveManager.loadProfile(profileId);
    if (save) {
      LocalSaveManager.index.activeProfileId = profileId;
      writeIndex(LocalSaveManager.index);
      LocalSaveManager.lastRecovery = null;
      return { ok: true, save };
    }

    const backup = normalizeLocalSave(parseJson(readStorage(backupKey(profileId))));
    const recovery: RecoveryStatus = {
      profileId,
      hasValidBackup: Boolean(backup),
      primaryCorrupted: true
    };
    LocalSaveManager.lastRecovery = recovery;
    return { ok: false, recovery, message: backup ? 'Primary save is corrupted, but a backup exists.' : 'Profile save is unavailable.' };
  }

  static createProfile(name: string, source?: Partial<LocalPlayerSave>): { ok: boolean; save?: LocalPlayerSave; message?: string } {
    const validation = validateProfileName(name, getExistingNames(LocalSaveManager.ensureLoaded()));
    if (!validation.ok) return { ok: false, message: validation.error };

    const profileId = crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const save = createDefaultLocalSave(profileId, validation.value, source);
    const result = LocalSaveManager.writeProfile(save, true);
    if (!result.ok) return result;

    LocalSaveManager.index.activeProfileId = profileId;
    writeIndex(LocalSaveManager.index);
    LocalSaveManager.lastRecovery = null;
    return { ok: true, save };
  }

  static renameProfile(profileId: string, name: string): SaveOperationResult {
    const index = LocalSaveManager.ensureLoaded();
    const profile = index.profiles.find((entry) => entry.id === profileId);
    if (!profile) return { ok: false, message: 'Profile not found.' };
    const validation = validateProfileName(name, getExistingNames(index, profileId));
    if (!validation.ok) return { ok: false, message: validation.error };

    const save = LocalSaveManager.loadProfile(profileId);
    if (!save) return { ok: false, message: 'Profile save could not be loaded.' };
    save.profile.name = validation.value;
    return LocalSaveManager.writeProfile(save, true);
  }

  static deleteProfile(profileId: string): SaveOperationResult {
    const index = LocalSaveManager.ensureLoaded();
    if (!index.profiles.some((profile) => profile.id === profileId)) return { ok: false, message: 'Profile not found.' };

    removeStorage(profileKey(profileId));
    removeStorage(backupKey(profileId));
    index.profiles = index.profiles.filter((profile) => profile.id !== profileId);
    if (index.activeProfileId === profileId) {
      index.activeProfileId = index.profiles[0]?.id ?? null;
    }
    writeIndex(index);
    return { ok: true };
  }

  static resetProfile(profileId: string): SaveOperationResult {
    const save = LocalSaveManager.loadProfile(profileId);
    if (!save) return { ok: false, message: 'Profile save could not be loaded.' };

    const reset = createDefaultLocalSave(profileId, save.profile.name, {
      profile: {
        ...save.profile,
        createdAt: save.profile.createdAt,
        lastPlayedAt: new Date().toISOString()
      },
      settings: save.settings
    });
    reset.settings = { ...save.settings };
    return LocalSaveManager.writeProfile(reset, true);
  }

  static restoreBackup(profileId: string): SaveOperationResult {
    const backup = normalizeLocalSave(parseJson(readStorage(backupKey(profileId))));
    if (!backup) return { ok: false, message: 'No valid backup was found for this profile.' };
    const result = LocalSaveManager.writeProfile(backup, false);
    if (result.ok) {
      LocalSaveManager.lastRecovery = null;
    }
    return result;
  }

  static recordLegacyPrompted(): void {
    LocalSaveManager.index.legacyMigrationPrompted = true;
    writeIndex(LocalSaveManager.index);
  }

  static detectLegacyProgress(): LegacyProgressionStatus {
    const prompted = LocalSaveManager.ensureLoaded().legacyMigrationPrompted;
    const raw = LEGACY_SAVE_KEYS.map((key) => parseJson(readStorage(key))).find((value) => value !== null);
    return {
      found: raw !== undefined && raw !== null,
      prompted,
      raw
    };
  }

  static createProfileFromLegacy(name: string): { ok: boolean; save?: LocalPlayerSave; message?: string } {
    const raw = LEGACY_SAVE_KEYS.map((key) => parseJson(readStorage(key))).find((value) => value !== null);
    if (!raw) return { ok: false, message: 'Legacy save data was not found.' };
    const validation = validateProfileName(name, getExistingNames(LocalSaveManager.ensureLoaded()));
    if (!validation.ok) return { ok: false, message: validation.error };
    const migrated = migrateUnknownSave(raw, getExistingNames(LocalSaveManager.ensureLoaded()));
    if (!migrated) return { ok: false, message: 'Legacy save could not be imported.' };
    migrated.profile.name = validation.value;
    migrated.profile.id = crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const result = LocalSaveManager.writeProfile(migrated, true);
    if (!result.ok) return result;
    LocalSaveManager.index.activeProfileId = migrated.profile.id;
    writeIndex(LocalSaveManager.index);
    return { ok: true, save: migrated };
  }

  static previewImport(raw: unknown): { ok: boolean; preview?: { save: LocalPlayerSave; duplicateName: boolean; suggestedName: string }; message?: string } {
    const preview = previewImportedSave(raw, getExistingNames(LocalSaveManager.ensureLoaded()));
    if (!preview) return { ok: false, message: 'That file is not a valid N3ONDefense local save.' };
    return { ok: true, preview };
  }

  static importProfile(raw: unknown, mode: 'new' | 'replace', targetProfileId?: string): SaveOperationResult {
    const migrated = migrateUnknownSave(raw, getExistingNames(LocalSaveManager.ensureLoaded()));
    if (!migrated) return { ok: false, message: 'That file could not be imported.' };

    if (mode === 'replace' && targetProfileId) {
      migrated.profile.id = targetProfileId;
      const replaceResult = LocalSaveManager.writeProfile(migrated, true);
      if (!replaceResult.ok) return replaceResult;
      LocalSaveManager.index.activeProfileId = targetProfileId;
      writeIndex(LocalSaveManager.index);
      return { ok: true };
    }

    const previousActive = LocalSaveManager.getActiveProfileId();
    const createResult = LocalSaveManager.createProfile(migrated.profile.name, migrated);
    if (!createResult.ok) return createResult;
    LocalSaveManager.index.activeProfileId = previousActive;
    writeIndex(LocalSaveManager.index);
    return { ok: true };
  }

  static exportProfile(profileId: string): { ok: boolean; file?: ExportedSaveFile; message?: string } {
    const save = LocalSaveManager.loadProfile(profileId);
    if (!save) return { ok: false, message: 'Profile could not be loaded for export.' };
    return { ok: true, file: buildSaveExport(save) };
  }

  static downloadProfile(profileId: string): SaveOperationResult {
    const exportResult = LocalSaveManager.exportProfile(profileId);
    if (!exportResult.ok || !exportResult.file) return { ok: false, message: exportResult.message };
    exportSaveFile(exportResult.file, exportResult.file.save.profile.name);
    return { ok: true, message: 'Backup exported.' };
  }

  static getLegacyKey(): string {
    return LEGACY_SAVE_KEYS[0];
  }

  static getProfileKey(profileId: string): string {
    return profileKey(profileId);
  }

  static getBackupKey(profileId: string): string {
    return backupKey(profileId);
  }

  static getActiveProfileSaveRaw(): string | null {
    const activeId = LocalSaveManager.getActiveProfileId();
    if (!activeId) return null;
    return readStorage(profileKey(activeId));
  }

  static getProfilesBackupAvailability(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const profile of LocalSaveManager.listProfiles()) {
      result[profile.id] = Boolean(normalizeLocalSave(parseJson(readStorage(backupKey(profile.id)))));
    }
    return result;
  }

  private static loadProfile(profileId: string): LocalPlayerSave | null {
    if (!ensureProfileId(profileId)) return null;
    return normalizeLocalSave(parseJson(readStorage(profileKey(profileId))));
  }

  private static writeProfile(save: LocalPlayerSave, createBackup: boolean): SaveOperationResult {
    const currentRaw = readStorage(profileKey(save.profile.id));
    const current = normalizeLocalSave(parseJson(currentRaw));
    if (createBackup && currentRaw && current) {
      writeStorage(backupKey(save.profile.id), currentRaw);
    }

    writeStorage(profileKey(save.profile.id), JSON.stringify(save));
    const verified = normalizeLocalSave(parseJson(readStorage(profileKey(save.profile.id))));
    if (!verified) {
      if (currentRaw && current) {
        writeStorage(profileKey(save.profile.id), currentRaw);
      }
      return { ok: false, message: 'The browser rejected the save write.' };
    }

    LocalSaveManager.refreshSummary(verified);
    LocalSaveManager.lastRecovery = null;
    return { ok: true };
  }

  private static refreshSummary(save: LocalPlayerSave): void {
    const index = LocalSaveManager.ensureLoaded();
    const summary = buildProfileSummary(save);
    const existing = index.profiles.findIndex((profile) => profile.id === save.profile.id);
    if (existing >= 0) {
      index.profiles[existing] = summary;
    } else {
      index.profiles.push(summary);
    }
    index.activeProfileId = save.profile.id;
    writeIndex(index);
  }
}
