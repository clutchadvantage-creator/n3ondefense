import type { CosmeticOption } from '../types.ts';
import type { AudioSfxName } from '../config/audio.ts';
import { GAME_VERSION } from '../config/version.ts';
import type { AbilityBindings } from '../config/controls.ts';
import type { LocalModCollection, ProtocolPreference } from '../mods/types.ts';
import type { CreditSpendBreakdown } from '../economy/types.ts';
import type { PlayerGarageState } from '../garage/types.ts';
import type { WeeklyOperationProgressSource, WeeklyOperationsState } from '../progression/WeeklyOperations.ts';
import type { AimSettings, HudSettings } from '../config/interfaceSettings.ts';
import type { ControllerSettings } from '../config/controllerSettings.ts';

// Compatibility identifiers: changing these would orphan existing local
// profiles and exported backups created before the N3ONDefense rename.
export const STORAGE_NAMESPACE = 'neon-breach';
export const CURRENT_SAVE_VERSION = 17;
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
  fluxCores: number;
}

export interface LocalPlayerProgress {
  highestRound: number;
  /** Highest round completed in Normal; drives ten-round Normal checkpoints. */
  normalHighestRound: number;
  /** Highest round completed while a Supreme protocol was active. */
  supremeHighestRound: number;
  /** Explicit campaign milestone; never inferred from highestRound alone. */
  supremeOverdriveCompleted: boolean;
  /** Round 50 was successfully completed in the regular Overdrive family. */
  regularOverdriveCompleted: boolean;
  /** One-time regular-Overdrive R48-50 introduction to the Supreme tier. */
  regularOverdriveSupremeBridgeAwarded: boolean;
  /** The one-time first-Supreme rules briefing has been presented. */
  firstSupremeTutorialSeen: boolean;
  roundsCompleted: number;
  enemiesDestroyed: number;
  bombSitesDestroyed: number;
  totalCreditsEarned: number;
  arcadeEventsCompleted: number;
  goldenEnemiesKilled: number;
  arcadeMiniBossesKilled: number;
  neonCircuitsCompleted: number;
  totalCreditsSpent: number;
  creditSpendByCategory: CreditSpendBreakdown;
  totalCoreTokensEarned: number;
  totalFluxCoresEarned: number;
  totalPlaytimeSeconds: number;
  initialDeploymentBriefingSeen: boolean;
  overdriveWeeklyProgress: WeeklyOperationProgressSource;
  weeklyOperations: WeeklyOperationsState;
}

export interface LocalPlayerSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  soundVolumes: Record<AudioSfxName, number>;
  screenShake: boolean;
  particles: boolean;
  abilityBindings: AbilityBindings;
  hud: HudSettings;
  aim: AimSettings;
  controller: ControllerSettings;
  contextualTutorials: boolean;
  buttonJiggle: number;
}

export type FirstRunTeachingStage =
  | 'welcome-main-menu'
  | 'waiting-for-start-local'
  | 'arena-teaching'
  | 'waiting-for-store'
  | 'store-teaching'
  | 'waiting-for-garage'
  | 'garage-teaching'
  | 'mod-collection-teaching'
  | 'complete';

export interface TutorialProgressState {
  version: 3;
  /** True only for a profile created after the first-run Main Menu welcome was introduced. */
  firstRunWelcomePending: boolean;
  /** Authoritative cross-scene state for the one-time new-operative teaching flow. */
  firstRunStage: FirstRunTeachingStage;
  completedSequences: string[];
  skippedSequences: string[];
  completedSteps: Record<string, string[]>;
  replaySequenceId: string | null;
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
  garage: PlayerGarageState;
  protocol: ProtocolPreference;
  progress: LocalPlayerProgress;
  settings: LocalPlayerSettings;
  tutorials: TutorialProgressState;
  metadata: LocalPlayerMetadata;
}

export interface LocalPlayerSaveV1 {
  version: 1;
  profile: LocalPlayerProfile;
  wallet: Omit<LocalPlayerWallet, 'fluxCores'> & { fluxCores?: number };
  upgrades: Record<string, number>;
  cosmetics: LocalPlayerCosmetics;
  progress: Omit<LocalPlayerProgress, 'normalHighestRound' | 'supremeHighestRound' | 'supremeOverdriveCompleted' | 'regularOverdriveCompleted' | 'regularOverdriveSupremeBridgeAwarded' | 'firstSupremeTutorialSeen' | 'totalPlaytimeSeconds' | 'totalCreditsSpent' | 'creditSpendByCategory' | 'initialDeploymentBriefingSeen' | 'totalFluxCoresEarned' | 'arcadeEventsCompleted' | 'goldenEnemiesKilled' | 'arcadeMiniBossesKilled' | 'neonCircuitsCompleted' | 'overdriveWeeklyProgress' | 'weeklyOperations'>;
  settings: Omit<LocalPlayerSettings, 'screenShake' | 'particles' | 'soundVolumes' | 'abilityBindings' | 'hud' | 'aim' | 'controller' | 'contextualTutorials' | 'buttonJiggle'>;
  metadata: Omit<LocalPlayerMetadata, 'saveRevision'>;
}

export interface ProfileSummary {
  id: string;
  name: string;
  createdAt: string;
  lastPlayedAt: string;
  credits: number;
  coreTokens: number;
  fluxCores: number;
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
