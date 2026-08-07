import type { CosmeticOption } from '../types.ts';
import type { AudioSfxName } from '../config/audio.ts';
import { GAME_VERSION } from '../config/version.ts';
import type { AbilityBindings } from '../config/controls.ts';
import type { LocalModCollection, ProtocolPreference } from '../mods/types.ts';

// Compatibility identifiers: changing these would orphan existing local
// profiles and exported backups created before the N3ONDefense rename.
export const STORAGE_NAMESPACE = 'neon-breach';
export const CURRENT_SAVE_VERSION = 4;
export const EXPORT_FORMAT = 'neon-breach-local-save';
export { GAME_VERSION };

export interface LocalPlayerProfile {
  id: string;
  name: string;
  createdAt: string;
  lastPlayedAt: string;
}

export interface LocalPlayerWallet {
  credits: number;
  coreTokens: number;
}

export interface LocalPlayerProgress {
  highestRound: number;
  roundsCompleted: number;
  enemiesDestroyed: number;
  bombSitesDestroyed: number;
  totalCreditsEarned: number;
  totalCoreTokensEarned: number;
  totalPlaytimeSeconds: number;
}

export interface LocalPlayerSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  soundVolumes: Record<AudioSfxName, number>;
  screenShake: boolean;
  particles: boolean;
  abilityBindings: AbilityBindings;
}

export interface LocalPlayerCosmetics {
  owned: string[];
  equipped: Partial<Record<CosmeticOption['category'], string>>;
}

export interface LocalPlayerMetadata {
  updatedAt: string;
  saveRevision: number;
  gameVersion: string;
}

export interface LocalPlayerSave {
  version: number;
  profile: LocalPlayerProfile;
  wallet: LocalPlayerWallet;
  upgrades: Record<string, number>;
  cosmetics: LocalPlayerCosmetics;
  mods: LocalModCollection;
  protocol: ProtocolPreference;
  progress: LocalPlayerProgress;
  settings: LocalPlayerSettings;
  metadata: LocalPlayerMetadata;
}

export interface LocalPlayerSaveV1 {
  version: 1;
  profile: LocalPlayerProfile;
  wallet: LocalPlayerWallet;
  upgrades: Record<string, number>;
  cosmetics: LocalPlayerCosmetics;
  progress: Omit<LocalPlayerProgress, 'totalPlaytimeSeconds'>;
  settings: Omit<LocalPlayerSettings, 'screenShake' | 'particles' | 'soundVolumes' | 'abilityBindings'>;
  metadata: Omit<LocalPlayerMetadata, 'saveRevision'>;
}

export interface ProfileSummary {
  id: string;
  name: string;
  createdAt: string;
  lastPlayedAt: string;
  credits: number;
  coreTokens: number;
  highestRound: number;
  roundsCompleted: number;
  equippedPlayerColor: string | null;
  saveRevision: number;
}

export interface LocalProfileIndex {
  version: 1;
  activeProfileId: string | null;
  profiles: ProfileSummary[];
  legacyMigrationPrompted: boolean;
}

export type LocalPlayerSaveV2 = Omit<LocalPlayerSave, 'version' | 'mods' | 'protocol'> & { version: 2 };
export type LocalPlayerSaveV3 = Omit<LocalPlayerSave, 'version' | 'mods'> & {
  version: 3;
  mods: Omit<LocalModCollection, 'cards' | 'plasmaChips'>;
};

export interface LocalLeaderboardEntry {
  profileId: string;
  name: string;
  credits: number;
  totalCreditsEarned: number;
  highestRound: number;
  roundsCompleted: number;
  bombSitesDestroyed: number;
  enemiesDestroyed: number;
}

export interface ExportedSaveFile {
  format: typeof EXPORT_FORMAT;
  exportVersion: 1;
  gameVersion: string;
  exportedAt: string;
  save: LocalPlayerSave;
}

export interface ImportedSavePreview {
  save: LocalPlayerSave;
  suggestedName: string;
  duplicateName: boolean;
}
