import { COSMETICS } from '../../data/cosmetics.ts';
import { UPGRADE_DEFINITIONS } from '../../data/upgrades.ts';
import type { CosmeticOption } from '../types.ts';
import { DEFAULT_AUDIO_VOLUME, SFX_DEFINITIONS, createDefaultSoundVolumes } from '../config/audio.ts';
import { CURRENT_SAVE_VERSION, EXPORT_FORMAT, GAME_VERSION, type FirstRunTeachingStage, type LocalPlayerMetadata, type LocalPlayerProgress, type LocalPlayerSave, type LocalPlayerSaveV1, type LocalPlayerSettings, type ProfileSummary, type TutorialProgressState } from './LocalSaveTypes.ts';
import { DEFAULT_ABILITY_BINDINGS, normalizeAbilityBindings } from '../config/controls.ts';
import { normalizeModCollection, normalizeProtocolPreference } from '../mods/ModSaveNormalizer.ts';
import { createEmptyCreditSpendBreakdown } from '../economy/EconomyService.ts';
import type { CreditSpendCategory } from '../economy/types.ts';
import { createDefaultGarageState, normalizeGarageState } from '../garage/GarageState.ts';
import { createDefaultWeeklyOperationsState, createWeeklyBaselines, normalizeWeeklyOperationsState } from '../progression/WeeklyOperations.ts';
import { DEFAULT_AIM_SETTINGS, DEFAULT_HUD_SETTINGS, normalizeAimSettings, normalizeHudSettings } from '../config/interfaceSettings.ts';
import { DEFAULT_CONTROLLER_SETTINGS, normalizeControllerSettings } from '../config/controllerSettings.ts';

const defaultSettings: LocalPlayerSettings = {
  masterVolume: DEFAULT_AUDIO_VOLUME,
  musicVolume: DEFAULT_AUDIO_VOLUME,
  sfxVolume: DEFAULT_AUDIO_VOLUME,
  soundVolumes: createDefaultSoundVolumes(),
  screenShake: true,
  particles: true,
  abilityBindings: { ...DEFAULT_ABILITY_BINDINGS },
  hud: { ...DEFAULT_HUD_SETTINGS },
  aim: { ...DEFAULT_AIM_SETTINGS, reticle: { ...DEFAULT_AIM_SETTINGS.reticle } },
  controller: { ...DEFAULT_CONTROLLER_SETTINGS },
  contextualTutorials: true,
  buttonJiggle: 1
};

const createDefaultTutorialProgress = (): TutorialProgressState => ({
  version: 3,
  firstRunWelcomePending: true,
  firstRunStage: 'welcome-main-menu',
  completedSequences: [],
  skippedSequences: [],
  completedSteps: {},
  replaySequenceId: null
});

const normalizeTutorialProgress = (value: unknown): TutorialProgressState => {
  const candidate = isObject(value) ? value : {};
  const uniqueStrings = (input: unknown): string[] => Array.isArray(input)
    ? Array.from(new Set(input.filter((item): item is string => typeof item === 'string' && item.length > 0)))
    : [];
  const completedSteps: Record<string, string[]> = {};
  if (isObject(candidate.completedSteps)) {
    for (const [sequenceId, steps] of Object.entries(candidate.completedSteps)) {
      if (sequenceId) completedSteps[sequenceId] = uniqueStrings(steps);
    }
  }
  const stages = new Set<FirstRunTeachingStage>([
    'welcome-main-menu', 'waiting-for-start-local', 'arena-teaching', 'waiting-for-store',
    'store-teaching', 'waiting-for-garage', 'garage-teaching', 'mod-collection-teaching', 'complete'
  ]);
  const version = toInteger(candidate.version);
  let firstRunStage: FirstRunTeachingStage = 'complete';
  if (version === 3 && typeof candidate.firstRunStage === 'string' && stages.has(candidate.firstRunStage as FirstRunTeachingStage)) {
    firstRunStage = candidate.firstRunStage as FirstRunTeachingStage;
  } else if (version === 2 && candidate.firstRunWelcomePending === true) {
    // Repair profiles created by the prior implementation. If Welcome was
    // acknowledged before its click-through bug opened Store, resume at the
    // required Start Local step instead of replaying or skipping ahead.
    const welcomeSteps = completedSteps['onboarding.menu-welcome'] ?? [];
    firstRunStage = welcomeSteps.includes('welcome') ? 'waiting-for-start-local' : 'welcome-main-menu';
  }
  return {
    version: 3,
    // Tutorial progress older than v2 belongs to an established profile. Do
    // not surprise those players with a newly-added first-run flow.
    firstRunWelcomePending: firstRunStage === 'welcome-main-menu' || firstRunStage === 'waiting-for-start-local',
    firstRunStage,
    completedSequences: uniqueStrings(candidate.completedSequences),
    skippedSequences: uniqueStrings(candidate.skippedSequences),
    completedSteps,
    replaySequenceId: typeof candidate.replaySequenceId === 'string' && candidate.replaySequenceId.length > 0
      ? candidate.replaySequenceId
      : null
  };
};

const defaultEquipped: Partial<Record<CosmeticOption['category'], string>> = {
  playerColor: 'player-cyan',
  playerShape: 'player-circle',
  projectileColor: 'projectile-cyan',
  projectileShape: 'projectile-shape-pulse',
  trailColor: 'trail-cyan',
  bombColor: 'bomb-purple',
  turretSkin: 'turret-default',
  fenceStyle: 'fence-default',
  dashTrail: 'dash-cyan'
};

const defaultOwned = ['player-cyan', 'player-native', 'player-circle', 'projectile-cyan', 'projectile-shape-pulse', 'turret-default', 'fence-default', 'dash-cyan'];

const upgradeDefaults = (): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const upgrade of UPGRADE_DEFINITIONS) {
    result[upgrade.id] = 0;
  }
  return result;
};

const cosmeticIds = new Set(COSMETICS.map((cosmetic) => cosmetic.id));
const cosmeticCategories = new Set<CosmeticOption['category']>(COSMETICS.map((cosmetic) => cosmetic.category));
const upgradeIds = new Set(UPGRADE_DEFINITIONS.map((upgrade) => upgrade.id));

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const toInteger = (value: unknown, fallback = 0): number => {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
};

const toBoolean = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const sanitizeString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const isTimestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

const normalizeOwnedCosmetics = (owned: unknown): string[] => {
  const result = new Set<string>(defaultOwned);
  if (Array.isArray(owned)) {
    for (const item of owned) {
      if (typeof item === 'string' && cosmeticIds.has(item)) result.add(item);
    }
  }
  return Array.from(result);
};

const normalizeEquippedCosmetics = (equipped: unknown, owned: string[]): Partial<Record<CosmeticOption['category'], string>> => {
  const result: Partial<Record<CosmeticOption['category'], string>> = { ...defaultEquipped };
  if (isObject(equipped)) {
    for (const [rawCategory, rawId] of Object.entries(equipped)) {
      if (typeof rawCategory !== 'string' || typeof rawId !== 'string') continue;
      if (!cosmeticCategories.has(rawCategory as CosmeticOption['category'])) continue;
      if (!cosmeticIds.has(rawId)) continue;
      if (!owned.includes(rawId)) continue;
      result[rawCategory as CosmeticOption['category']] = rawId;
    }
  }
  return result;
};

const normalizeProgress = (progress: unknown): LocalPlayerProgress => {
  const candidate = isObject(progress) ? progress : {};
  const rawSpend = isObject(candidate.creditSpendByCategory) ? candidate.creditSpendByCategory : {};
  const creditSpendByCategory = createEmptyCreditSpendBreakdown();
  for (const category of Object.keys(creditSpendByCategory) as CreditSpendCategory[]) {
    creditSpendByCategory[category] = toInteger(rawSpend[category]);
  }
  return {
    highestRound: toInteger(candidate.highestRound),
    supremeHighestRound: toInteger(candidate.supremeHighestRound),
    supremeOverdriveCompleted: toBoolean(candidate.supremeOverdriveCompleted, false),
    roundsCompleted: toInteger(candidate.roundsCompleted),
    enemiesDestroyed: toInteger(candidate.enemiesDestroyed),
    bombSitesDestroyed: toInteger(candidate.bombSitesDestroyed),
    totalCreditsEarned: toInteger(candidate.totalCreditsEarned),
    arcadeEventsCompleted: toInteger(candidate.arcadeEventsCompleted),
    goldenEnemiesKilled: toInteger(candidate.goldenEnemiesKilled),
    arcadeMiniBossesKilled: toInteger(candidate.arcadeMiniBossesKilled),
    neonCircuitsCompleted: toInteger(candidate.neonCircuitsCompleted),
    totalCreditsSpent: toInteger(candidate.totalCreditsSpent),
    creditSpendByCategory,
    totalCoreTokensEarned: toInteger(candidate.totalCoreTokensEarned),
    totalFluxCoresEarned: toInteger(candidate.totalFluxCoresEarned),
    totalPlaytimeSeconds: toInteger(candidate.totalPlaytimeSeconds),
    initialDeploymentBriefingSeen: toBoolean(candidate.initialDeploymentBriefingSeen, false),
    overdriveWeeklyProgress: createWeeklyBaselines(isObject(candidate.overdriveWeeklyProgress) ? candidate.overdriveWeeklyProgress : undefined),
    weeklyOperations: normalizeWeeklyOperationsState(candidate.weeklyOperations)
  };
};

const normalizeSettings = (settings: unknown): LocalPlayerSettings => {
  const candidate = isObject(settings) ? settings : {};
  const soundCandidates = isObject(candidate.soundVolumes) ? candidate.soundVolumes : {};
  const soundVolumes = createDefaultSoundVolumes();
  for (const definition of SFX_DEFINITIONS) {
    soundVolumes[definition.key] = clamp(toFiniteNumber(soundCandidates[definition.key], soundVolumes[definition.key]), 0, 1);
  }
  return {
    masterVolume: clamp(toFiniteNumber(candidate.masterVolume, defaultSettings.masterVolume), 0, 1),
    musicVolume: clamp(toFiniteNumber(candidate.musicVolume, defaultSettings.musicVolume), 0, 1),
    sfxVolume: clamp(toFiniteNumber(candidate.sfxVolume, defaultSettings.sfxVolume), 0, 1),
    soundVolumes,
    screenShake: toBoolean(candidate.screenShake, defaultSettings.screenShake),
    particles: toBoolean(candidate.particles, defaultSettings.particles),
    abilityBindings: normalizeAbilityBindings(candidate.abilityBindings),
    hud: normalizeHudSettings(candidate.hud),
    aim: normalizeAimSettings(candidate.aim),
    controller: normalizeControllerSettings(candidate.controller),
    contextualTutorials: toBoolean(candidate.contextualTutorials, true),
    buttonJiggle: clamp(toFiniteNumber(candidate.buttonJiggle, defaultSettings.buttonJiggle), 0, 1)
  };
};


const normalizeMetadata = (metadata: unknown, revision: number): LocalPlayerMetadata => {
  const candidate = isObject(metadata) ? metadata : {};
  return {
    updatedAt: isTimestamp(candidate.updatedAt) ? candidate.updatedAt : new Date().toISOString(),
    saveRevision: Math.max(0, Math.floor(toFiniteNumber(candidate.saveRevision, revision))),
    gameVersion: typeof candidate.gameVersion === 'string' && candidate.gameVersion.length > 0 ? candidate.gameVersion : GAME_VERSION
  };
};

export const validateProfileName = (name: string, existingNames: string[] = []): { ok: boolean; value: string; error?: string } => {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { ok: false, value: trimmed, error: 'Profile name must be between 2 and 20 characters.' };
  }
  if (/[^A-Za-z0-9 _-]/.test(trimmed) || /[\u0000-\u001f\u007f<>"'`]/.test(trimmed)) {
    return { ok: false, value: trimmed, error: 'Profile names can only use letters, numbers, spaces, hyphens, and underscores.' };
  }
  if (existingNames.some((existing) => existing.trim().toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, value: trimmed, error: 'That local profile name already exists.' };
  }
  return { ok: true, value: trimmed };
};

export const createDefaultLocalSave = (profileId: string, profileName: string, source?: (Partial<LocalPlayerSave> & Record<string, unknown>)): LocalPlayerSave => {
  const now = new Date().toISOString();
  const owned = normalizeOwnedCosmetics(source?.cosmetics?.owned);
  const legacyCredits = typeof source?.credits === 'number' ? source.credits : 0;
  const legacyTokens = typeof source?.coreTokens === 'number' ? source.coreTokens : 0;
  const save: LocalPlayerSave = {
    version: CURRENT_SAVE_VERSION,
    profile: {
      id: profileId,
      name: profileName,
      createdAt: source?.profile?.createdAt && isTimestamp(source.profile.createdAt) ? source.profile.createdAt : now,
      lastPlayedAt: now
    },
    wallet: {
      credits: Math.max(0, toInteger(source?.wallet?.credits ?? legacyCredits)),
      coreTokens: Math.max(0, toInteger(source?.wallet?.coreTokens ?? legacyTokens)),
      fluxCores: Math.max(0, toInteger(source?.wallet?.fluxCores))
    },
    upgrades: { ...upgradeDefaults(), ...(isObject(source?.upgrades) ? source?.upgrades : {}) },
    cosmetics: {
      owned,
      equipped: normalizeEquippedCosmetics(source?.cosmetics?.equipped, owned)
    },
    mods: normalizeModCollection(source?.mods),
    garage: normalizeGarageState(source?.garage),
    protocol: normalizeProtocolPreference(source?.protocol),
    progress: normalizeProgress(source?.progress),
    settings: normalizeSettings(source?.settings),
    tutorials: source?.tutorials ? normalizeTutorialProgress(source.tutorials) : createDefaultTutorialProgress(),
    metadata: {
      updatedAt: now,
      saveRevision: 1,
      gameVersion: GAME_VERSION
    }
  };
  return normalizeLocalSave(save) ?? save;
};

export const normalizeLocalSave = (input: unknown): LocalPlayerSave | null => {
  if (!isObject(input)) return null;

  const version = toInteger(input.version, 0);
  const current: Partial<LocalPlayerSave> = {};
  if (version === 1) {
    const v1 = input as Partial<LocalPlayerSaveV1>;
    current.version = CURRENT_SAVE_VERSION;
    current.profile = {
      id: sanitizeString(v1.profile?.id),
      name: sanitizeString(v1.profile?.name),
      createdAt: isTimestamp(v1.profile?.createdAt) ? v1.profile.createdAt : new Date().toISOString(),
      lastPlayedAt: isTimestamp(v1.profile?.lastPlayedAt) ? v1.profile.lastPlayedAt : new Date().toISOString()
    };
    current.wallet = {
      credits: Math.max(0, toInteger(v1.wallet?.credits)),
      coreTokens: Math.max(0, toInteger(v1.wallet?.coreTokens)),
      fluxCores: Math.max(0, toInteger(v1.wallet?.fluxCores))
    };
    current.upgrades = { ...upgradeDefaults(), ...(isObject(v1.upgrades) ? v1.upgrades : {}) };
    const owned = normalizeOwnedCosmetics(v1.cosmetics?.owned);
    current.cosmetics = {
      owned,
      equipped: normalizeEquippedCosmetics(v1.cosmetics?.equipped, owned)
    };
    current.progress = {
      highestRound: toInteger(v1.progress?.highestRound),
      supremeHighestRound: 0,
      supremeOverdriveCompleted: false,
      roundsCompleted: toInteger(v1.progress?.roundsCompleted),
      enemiesDestroyed: toInteger(v1.progress?.enemiesDestroyed),
      bombSitesDestroyed: toInteger(v1.progress?.bombSitesDestroyed),
      totalCreditsEarned: toInteger(v1.progress?.totalCreditsEarned),
      arcadeEventsCompleted: 0,
      goldenEnemiesKilled: 0,
      arcadeMiniBossesKilled: 0,
      neonCircuitsCompleted: 0,
      totalCreditsSpent: 0,
      creditSpendByCategory: createEmptyCreditSpendBreakdown(),
      totalCoreTokensEarned: toInteger(v1.progress?.totalCoreTokensEarned),
      totalFluxCoresEarned: 0,
      totalPlaytimeSeconds: 0,
      initialDeploymentBriefingSeen: false,
      overdriveWeeklyProgress: createWeeklyBaselines(),
      weeklyOperations: createDefaultWeeklyOperationsState()
    };
    current.garage = createDefaultGarageState();
    current.settings = {
      ...defaultSettings,
      ...(isObject(v1.settings) ? {
        masterVolume: v1.settings.masterVolume,
        musicVolume: v1.settings.musicVolume,
        sfxVolume: v1.settings.sfxVolume
      } : {})
    };
    current.metadata = {
      updatedAt: isTimestamp(v1.metadata?.updatedAt) ? v1.metadata.updatedAt : new Date().toISOString(),
      saveRevision: 1,
      gameVersion: typeof v1.metadata?.gameVersion === 'string' ? v1.metadata.gameVersion : GAME_VERSION
    };
  } else if (version === 2 || version === 3 || version === 4 || version === 5 || version === 6 || version === 7 || version === 8 || version === 9 || version === 10 || version === 11 || version === 12 || version === 13 || version === CURRENT_SAVE_VERSION) {
    const candidate = input as Partial<LocalPlayerSave>;
    const legacyCandidate = candidate as Partial<LocalPlayerSave> & Record<string, unknown>;
    current.version = CURRENT_SAVE_VERSION;
    current.profile = {
      id: sanitizeString(candidate.profile?.id),
      name: sanitizeString(candidate.profile?.name),
      createdAt: isTimestamp(candidate.profile?.createdAt) ? candidate.profile.createdAt : new Date().toISOString(),
      lastPlayedAt: isTimestamp(candidate.profile?.lastPlayedAt) ? candidate.profile.lastPlayedAt : new Date().toISOString()
    };
    current.wallet = {
      credits: Math.max(0, toInteger(candidate.wallet?.credits ?? legacyCandidate.credits)),
      coreTokens: Math.max(0, toInteger(candidate.wallet?.coreTokens ?? legacyCandidate.coreTokens)),
      fluxCores: Math.max(0, toInteger(candidate.wallet?.fluxCores ?? legacyCandidate.fluxCores))
    };
    current.upgrades = { ...upgradeDefaults(), ...(isObject(candidate.upgrades) ? candidate.upgrades : {}) };
    const owned = normalizeOwnedCosmetics(candidate.cosmetics?.owned);
    current.cosmetics = {
      owned,
      equipped: normalizeEquippedCosmetics(candidate.cosmetics?.equipped, owned)
    };
    current.mods = normalizeModCollection(candidate.mods);
    current.garage = normalizeGarageState(candidate.garage);
    current.protocol = normalizeProtocolPreference(candidate.protocol);
    current.progress = normalizeProgress(candidate.progress);
    current.settings = normalizeSettings(candidate.settings);
    current.tutorials = normalizeTutorialProgress(candidate.tutorials);
    current.metadata = normalizeMetadata(candidate.metadata, CURRENT_SAVE_VERSION);
  } else {
    return null;
  }

  if (!current.profile?.id || !current.profile?.name) return null;
  if (!current.profile.createdAt || !current.profile.lastPlayedAt) return null;
  if (!Object.keys(current.upgrades ?? {}).every((id) => upgradeIds.has(id))) return null;

  current.mods = normalizeModCollection(current.mods);
  current.garage = normalizeGarageState(current.garage);
  current.protocol = normalizeProtocolPreference(current.protocol);
  current.tutorials = normalizeTutorialProgress(current.tutorials);
  return current as LocalPlayerSave;
};

export const normalizeImportedSave = (input: unknown): LocalPlayerSave | null => {
  if (!isObject(input) || input.format !== EXPORT_FORMAT || input.exportVersion !== 1) return null;
  return normalizeLocalSave(input.save);
};

export const buildProfileSummary = (save: LocalPlayerSave): ProfileSummary => ({
  id: save.profile.id,
  name: save.profile.name,
  createdAt: save.profile.createdAt,
  lastPlayedAt: save.profile.lastPlayedAt,
  credits: save.wallet.credits,
  coreTokens: save.wallet.coreTokens,
  fluxCores: save.wallet.fluxCores,
  highestRound: save.progress.highestRound,
  roundsCompleted: save.progress.roundsCompleted,
  equippedPlayerColor: save.cosmetics.equipped.playerColor ?? null,
  saveRevision: save.metadata.saveRevision
});

export const createEmptyProfileIndex = (): { version: 1; activeProfileId: string | null; profiles: ProfileSummary[]; legacyMigrationPrompted: boolean } => ({
  version: 1,
  activeProfileId: null,
  profiles: [],
  legacyMigrationPrompted: false
});

export const getDefaultSettings = (): LocalPlayerSettings => ({
  ...defaultSettings,
  soundVolumes: { ...defaultSettings.soundVolumes },
  abilityBindings: { ...defaultSettings.abilityBindings },
  hud: { ...defaultSettings.hud },
  aim: { ...defaultSettings.aim, reticle: { ...defaultSettings.aim.reticle } }
});

export const getDefaultOwnedCosmetics = (): string[] => [...defaultOwned];
