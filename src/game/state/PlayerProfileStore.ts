import { COSMETICS, getCosmeticPurchaseCosts } from '../../data/cosmetics';
import { UPGRADE_DEFINITIONS, getUpgradeCost } from '../../data/upgrades';
import type { CosmeticOption } from '../types';
import { type LocalPlayerSave, type ProfileSummary } from '../save/LocalSaveTypes';
import { LocalSaveManager } from '../save/LocalSaveManager';
import { addModDrop, createDefaultModLoadout, deleteModCard, equipMod, infuseModCard, rankUpMod, recycleAllUnupgradedDuplicates, recycleDuplicateMod, sellDuplicateMod, unequipMod } from '../mods/ModInventoryService.ts';
import { MOD_DEFINITIONS } from '../mods/definitions.ts';
import type { ModInfusionId, ModSlot, RunProtocolId } from '../mods/types.ts';
import { RUN_PROTOCOLS, isRunProtocolUnlocked } from '../mods/modBalance.ts';
import { isSupremeProtocol } from '../progression/SupremeProgression.ts';
import { buildRunEconomySnapshot, getNextLoadoutSlotCost, getRunSetupCost, purchaseRunSetup, spendCreditsAtomic } from '../economy/EconomyService.ts';
import type { CreditSpendCategory, RunSetupSelection } from '../economy/types.ts';
import { loadGaragePreset, normalizeRunSetupSelection, saveCurrentGaragePreset } from '../garage/GarageState.ts';
import type { GaragePresetId, PlayerGarageState } from '../garage/types.ts';
import {
  commitDeploymentLaunch,
  isSavedDeploymentReminderDue,
  publishDeploymentConfigurationChanged,
  setSavedDeploymentEnabled
} from '../garage/SavedDeploymentConfiguration.ts';
import { resolveWeeklyOperationDecks, type WeeklyOperationDecksSnapshot, type WeeklyOperationProgressSource } from '../progression/WeeklyOperations.ts';
import type { ArcadeMetricEvent } from '../arcade/types.ts';

export interface PurchaseResult {
  ok: boolean;
  message?: string;
}

const isOverdriveProtocol = (protocol?: RunProtocolId): boolean => Boolean(protocol && protocol !== 'normal');

const stableRewardIndex = (key: string, length: number): number => {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return length > 0 ? (hash >>> 0) % length : 0;
};

export class PlayerProfileStore {
  private static activeSave: LocalPlayerSave | null = null;
  private static notice: string | null = null;
  private static noticeUntil = 0;
  private static lastPlaytimeCommitAt = Date.now();

  static bootstrap(): void {
    const selected = LocalSaveManager.getActiveProfileSave();
    if (selected) {
      PlayerProfileStore.activeSave = selected;
      PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
      return;
    }

    PlayerProfileStore.activeSave = null;
  }

  static hasActiveProfile(): boolean {
    if (PlayerProfileStore.activeSave) return true;
    return Boolean(LocalSaveManager.getActiveProfileSave());
  }

  static getActiveSave(): LocalPlayerSave {
    if (!PlayerProfileStore.activeSave) {
      const loaded = LocalSaveManager.getActiveProfileSave();
      PlayerProfileStore.activeSave = loaded ?? null;
    }
    if (!PlayerProfileStore.activeSave) {
      throw new Error('No active local profile is selected.');
    }
    return PlayerProfileStore.activeSave;
  }

  static getActiveProfileSummary(): ProfileSummary | null {
    return LocalSaveManager.getActiveProfileSummary();
  }

  static getProfiles(): ProfileSummary[] {
    return LocalSaveManager.listProfiles();
  }

  static getLeaderboardEntries() {
    return LocalSaveManager.getLeaderboardEntries();
  }

  static getRecoveryStatus() {
    return LocalSaveManager.getRecoveryStatus();
  }

  static getStorageMessage(): string | null {
    return LocalSaveManager.getStorageMessage();
  }

  static getNotice(): string | null {
    if (PlayerProfileStore.notice && Date.now() <= PlayerProfileStore.noticeUntil) return PlayerProfileStore.notice;
    return null;
  }

  static consumeNotice(): string | null {
    const notice = PlayerProfileStore.getNotice();
    PlayerProfileStore.notice = null;
    PlayerProfileStore.noticeUntil = 0;
    return notice;
  }

  static selectProfile(profileId: string): PurchaseResult {
    const result = LocalSaveManager.selectProfile(profileId);
    if (!result.ok || !result.save) {
      PlayerProfileStore.activeSave = null;
      return { ok: false, message: result.message };
    }

    PlayerProfileStore.activeSave = result.save;
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
    PlayerProfileStore.markNotice('SAVED LOCALLY');
    return { ok: true };
  }

  static createProfile(name: string): PurchaseResult {
    const result = LocalSaveManager.createProfile(name);
    if (!result.ok || !result.save) return { ok: false, message: result.message };
    PlayerProfileStore.activeSave = result.save;
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static createProfileFromLegacy(name: string): PurchaseResult {
    const result = LocalSaveManager.createProfileFromLegacy(name);
    if (!result.ok || !result.save) return { ok: false, message: result.message };
    PlayerProfileStore.activeSave = result.save;
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static renameProfile(profileId: string, name: string): PurchaseResult {
    const result = LocalSaveManager.renameProfile(profileId, name);
    if (!result.ok) return result;
    if (PlayerProfileStore.activeSave?.profile.id === profileId) {
      PlayerProfileStore.activeSave.profile.name = name.trim();
    }
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static deleteProfile(profileId: string): PurchaseResult {
    const result = LocalSaveManager.deleteProfile(profileId);
    if (!result.ok) return result;
    if (PlayerProfileStore.activeSave?.profile.id === profileId) {
      PlayerProfileStore.activeSave = null;
      const fallback = LocalSaveManager.getActiveProfileSave();
      if (fallback) PlayerProfileStore.activeSave = fallback;
    }
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static restoreBackup(profileId: string): PurchaseResult {
    const result = LocalSaveManager.restoreBackup(profileId);
    if (!result.ok) return result;
    if (PlayerProfileStore.activeSave?.profile.id === profileId) {
      PlayerProfileStore.activeSave = LocalSaveManager.getActiveProfileSave();
    }
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static resetProgress(profileId: string): PurchaseResult {
    const result = LocalSaveManager.resetProfile(profileId);
    if (!result.ok) return result;
    if (PlayerProfileStore.activeSave?.profile.id === profileId) {
      PlayerProfileStore.activeSave = LocalSaveManager.getActiveProfileSave();
    }
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static exportActiveProfile(): PurchaseResult {
    const active = PlayerProfileStore.getActiveSave();
    const result = LocalSaveManager.downloadProfile(active.profile.id);
    if (!result.ok) return result;
    PlayerProfileStore.markNotice('Backup exported.');
    return { ok: true, message: result.message };
  }

  static importProfile(raw: unknown, mode: 'new' | 'replace', targetProfileId?: string): PurchaseResult {
    const result = LocalSaveManager.importProfile(raw, mode, targetProfileId);
    if (!result.ok) return result;
    if (mode === 'replace' && targetProfileId) {
      PlayerProfileStore.activeSave = LocalSaveManager.getActiveProfileSave();
    }
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static previewImport(raw: unknown) {
    return LocalSaveManager.previewImport(raw);
  }

  static detectLegacyProgress() {
    return LocalSaveManager.detectLegacyProgress();
  }

  static recordLegacyPrompted(): void {
    LocalSaveManager.recordLegacyPrompted();
  }

  static exportProfile(profileId: string): PurchaseResult & { file?: import('../save/LocalSaveTypes').ExportedSaveFile } {
    const result = LocalSaveManager.exportProfile(profileId);
    if (!result.ok || !result.file) return result;
    return { ok: true, file: result.file };
  }

  static recordRoundCompletion(round: number, protocol?: RunProtocolId): void {
    const save = PlayerProfileStore.getActiveSave();
    save.progress.roundsCompleted += 1;
    save.progress.highestRound = Math.max(save.progress.highestRound, round);
    if (!protocol || protocol === 'normal') {
      save.progress.normalHighestRound = Math.max(save.progress.normalHighestRound, round);
    }
    if (isSupremeProtocol(protocol)) {
      save.progress.supremeHighestRound = Math.max(save.progress.supremeHighestRound, round);
    }
    if (isOverdriveProtocol(protocol)) {
      save.progress.overdriveWeeklyProgress.roundsCompleted += 1;
      save.progress.overdriveWeeklyProgress.highestRound = Math.max(save.progress.overdriveWeeklyProgress.highestRound, round);
    }
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static recordEnemyDestroyed(count = 1, protocol?: RunProtocolId): void {
    PlayerProfileStore.recordCombatProgress(count, 0, protocol);
  }

  static recordSupremeCompletion(): void {
    const save = PlayerProfileStore.getActiveSave();
    save.progress.supremeOverdriveCompleted = true;
    save.progress.supremeHighestRound = Math.max(save.progress.supremeHighestRound, 100);
    save.progress.highestRound = Math.max(save.progress.highestRound, 100);
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static hasRegularOverdriveSupremeBridgeAwarded(): boolean {
    return PlayerProfileStore.getActiveSave().progress.regularOverdriveSupremeBridgeAwarded;
  }

  static markRegularOverdriveSupremeBridgeAwarded(): void {
    const save = PlayerProfileStore.getActiveSave();
    if (save.progress.regularOverdriveSupremeBridgeAwarded) return;
    save.progress.regularOverdriveSupremeBridgeAwarded = true;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static hasCompletedRegularOverdrive(): boolean {
    return PlayerProfileStore.getActiveSave().progress.regularOverdriveCompleted;
  }

  static recordRegularOverdriveCompletion(): void {
    const save = PlayerProfileStore.getActiveSave();
    if (save.progress.regularOverdriveCompleted) return;
    save.progress.regularOverdriveCompleted = true;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static hasSeenFirstSupremeTutorial(): boolean {
    return PlayerProfileStore.getActiveSave().progress.firstSupremeTutorialSeen;
  }

  static markFirstSupremeTutorialSeen(): void {
    const save = PlayerProfileStore.getActiveSave();
    if (save.progress.firstSupremeTutorialSeen) return;
    save.progress.firstSupremeTutorialSeen = true;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static recordBombSiteDestroyed(count = 1, protocol?: RunProtocolId): void {
    PlayerProfileStore.recordCombatProgress(0, count, protocol);
  }

  /**
   * Commits encounter counters in one profile write. ArenaScene batches these
   * values so a busy kill wave cannot synchronously serialize localStorage for
   * every individual enemy while combat is running.
   */
  static recordCombatProgress(enemiesDestroyed = 0, bombSitesDestroyed = 0, protocol?: RunProtocolId): void {
    const save = PlayerProfileStore.getActiveSave();
    const enemyCount = Math.max(0, Math.floor(enemiesDestroyed));
    const siteCount = Math.max(0, Math.floor(bombSitesDestroyed));
    save.progress.enemiesDestroyed = Math.max(
      0,
      save.progress.enemiesDestroyed + enemyCount
    );
    save.progress.bombSitesDestroyed = Math.max(
      0,
      save.progress.bombSitesDestroyed + siteCount
    );
    if (isOverdriveProtocol(protocol)) {
      save.progress.overdriveWeeklyProgress.enemiesDestroyed += enemyCount;
      save.progress.overdriveWeeklyProgress.bombSitesDestroyed += siteCount;
    }
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static recordArcadeMetric(event: ArcadeMetricEvent): void {
    const save = PlayerProfileStore.getActiveSave();
    const targets: WeeklyOperationProgressSource[] = [save.progress];
    if (isOverdriveProtocol(event.protocol)) targets.push(save.progress.overdriveWeeklyProgress);
    for (const progress of targets) {
      if (event.name === 'arcade_event_completed') progress.arcadeEventsCompleted += 1;
      else if (event.name === 'golden_enemy_killed') progress.goldenEnemiesKilled += 1;
      else if (event.name === 'arcade_miniboss_killed') progress.arcadeMiniBossesKilled += 1;
      else if (event.name === 'neon_circuit_completed') progress.neonCircuitsCompleted += 1;
    }
    if (event.name === 'arcade_event_completed'
      || event.name === 'golden_enemy_killed'
      || event.name === 'arcade_miniboss_killed'
      || event.name === 'neon_circuit_completed') {
      save.profile.lastPlayedAt = new Date().toISOString();
      PlayerProfileStore.save();
    }
  }

  static getWeeklyOperations(nowMs = Date.now()): WeeklyOperationDecksSnapshot {
    const save = PlayerProfileStore.getActiveSave();
    const resolution = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, nowMs);
    save.progress.weeklyOperations = resolution.state;
    for (const grant of resolution.rewardsToGrant) {
      const reward = grant.reward;
      save.wallet.credits += reward.credits;
      save.wallet.coreTokens += reward.coreTokens;
      save.wallet.fluxCores += reward.fluxCores ?? 0;
      save.mods.plasmaChips += reward.plasmaChips ?? 0;
      save.progress.totalCreditsEarned += reward.credits;
      save.progress.totalCoreTokensEarned += reward.coreTokens;
      save.progress.totalFluxCoresEarned += reward.fluxCores ?? 0;
      if (reward.randomMod && MOD_DEFINITIONS.length > 0) {
        const modIndex = stableRewardIndex(`${save.profile.id}:${grant.deck}:${grant.rotationId}`, MOD_DEFINITIONS.length);
        addModDrop(save.mods, MOD_DEFINITIONS[modIndex].id, new Date(nowMs).toISOString());
      }
      for (const cosmeticId of reward.cosmeticIds ?? []) {
        if (COSMETICS.some((cosmetic) => cosmetic.id === cosmeticId) && !save.cosmetics.owned.includes(cosmeticId)) {
          save.cosmetics.owned.push(cosmeticId);
        }
      }
      save.profile.lastPlayedAt = new Date(nowMs).toISOString();
    }
    if (resolution.stateChanged) PlayerProfileStore.save();
    return resolution.snapshot;
  }

  static getInitialDeploymentBriefingState(): { seen: boolean; highestRound: number } {
    const progress = PlayerProfileStore.getActiveSave().progress;
    return {
      seen: progress.initialDeploymentBriefingSeen,
      highestRound: progress.highestRound
    };
  }

  static markInitialDeploymentBriefingSeen(): void {
    const save = PlayerProfileStore.getActiveSave();
    if (save.progress.initialDeploymentBriefingSeen) return;
    save.progress.initialDeploymentBriefingSeen = true;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static addCredits(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const save = PlayerProfileStore.getActiveSave();
    const earned = Math.floor(amount);
    save.wallet.credits += earned;
    save.progress.totalCreditsEarned += earned;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static addCoreTokens(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const save = PlayerProfileStore.getActiveSave();
    const earned = Math.floor(amount);
    save.wallet.coreTokens += earned;
    save.progress.totalCoreTokensEarned += earned;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static spendCredits(amount: number, category: CreditSpendCategory = 'other'): boolean {
    const save = PlayerProfileStore.getActiveSave();
    if (!spendCreditsAtomic(save.wallet, save.progress, amount, category)) return false;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return true;
  }

  static spendCoreTokens(amount: number): boolean {
    const save = PlayerProfileStore.getActiveSave();
    if (!Number.isFinite(amount) || amount < 0) return false;
    const spent = Math.floor(amount);
    if (save.wallet.coreTokens < spent) return false;
    save.wallet.coreTokens -= spent;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return true;
  }

  static purchaseUpgrade(upgradeKey: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const definition = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === upgradeKey);
    if (!definition) return { ok: false, message: 'Unknown upgrade.' };
    const current = save.upgrades[upgradeKey] ?? 0;
    if (current >= definition.maxLevel) return { ok: false, message: 'That upgrade is already maxed.' };

    const cost = getUpgradeCost(definition.baseCost, definition.growth, current);
    if (save.wallet.credits < cost) return { ok: false, message: 'Not enough credits.' };

    if (!spendCreditsAtomic(save.wallet, save.progress, cost, 'upgrade')) return { ok: false, message: 'Not enough credits.' };
    save.upgrades[upgradeKey] = current + 1;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return { ok: true };
  }

  static spendFluxCores(amount: number): boolean {
    const save = PlayerProfileStore.getActiveSave();
    if (!Number.isFinite(amount) || amount < 0) return false;
    const spent = Math.floor(amount);
    if (save.wallet.fluxCores < spent) return false;
    save.wallet.fluxCores -= spent;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return true;
  }

  static addMod(modId: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = addModDrop(save.mods, modId);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static rankUpMod(modId: string, instanceId?: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = rankUpMod(save.mods, modId, save.wallet.credits, save.wallet.coreTokens, instanceId);
    if (!result.ok || result.cost === undefined || result.coreTokenCost === undefined) return result;
    if (!spendCreditsAtomic(save.wallet, save.progress, result.cost, 'modRank')) return { ok: false, message: 'Not enough credits.' };
    save.wallet.coreTokens -= result.coreTokenCost;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return result;
  }

  static canAffordRunSetup(selection: RunSetupSelection): boolean {
    return PlayerProfileStore.getActiveSave().wallet.credits >= getRunSetupCost(selection);
  }

  static purchaseRunSetup(selection: RunSetupSelection) {
    const save = PlayerProfileStore.getActiveSave();
    const result = purchaseRunSetup(save.wallet, save.progress, selection);
    if (result.ok) {
      save.profile.lastPlayedAt = new Date().toISOString();
      PlayerProfileStore.save();
    }
    return result;
  }

  static buildRunEconomySnapshot(selection: RunSetupSelection, creditsSpentBeforeRun: number) {
    const save = PlayerProfileStore.getActiveSave();
    return buildRunEconomySnapshot(save.upgrades, selection, creditsSpentBeforeRun);
  }

  static getGarageState(): PlayerGarageState {
    return structuredClone(PlayerProfileStore.getActiveSave().garage);
  }

  static getNextRunSetupSelection(): RunSetupSelection {
    return { ...PlayerProfileStore.getActiveSave().garage.nextRun };
  }

  static setNextRunSetupSelection(selection: RunSetupSelection): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    save.garage.nextRun = normalizeRunSetupSelection(selection);
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    publishDeploymentConfigurationChanged(save.garage);
    return { ok: true, message: 'Next deployment configuration updated.' };
  }

  static setSavedDeploymentEnabled(enabled: boolean, nowMs = Date.now()): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    setSavedDeploymentEnabled(save.garage, enabled, nowMs);
    save.profile.lastPlayedAt = new Date(nowMs).toISOString();
    PlayerProfileStore.save();
    publishDeploymentConfigurationChanged(save.garage);
    return { ok: true, message: enabled ? 'Saved deployment configuration enabled.' : 'Saved deployment configuration disabled.' };
  }

  static isSavedDeploymentReminderDue(nowMs = Date.now()): boolean {
    return isSavedDeploymentReminderDue(PlayerProfileStore.getActiveSave().garage, nowMs);
  }

  static commitDeploymentLaunch(options: { acknowledgeReminder?: boolean; nowMs?: number } = {}) {
    const save = PlayerProfileStore.getActiveSave();
    const result = commitDeploymentLaunch(save, options);
    if (result.ok) {
      save.profile.lastPlayedAt = new Date(options.nowMs ?? Date.now()).toISOString();
      PlayerProfileStore.save();
      publishDeploymentConfigurationChanged(save.garage);
    }
    return result;
  }

  static saveGaragePreset(presetId: GaragePresetId): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = saveCurrentGaragePreset(save, presetId);
    if (result.ok) {
      save.profile.lastPlayedAt = new Date().toISOString();
      PlayerProfileStore.save();
    }
    return result;
  }

  static loadGaragePreset(presetId: GaragePresetId): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = loadGaragePreset(save, presetId);
    if (result.ok) {
      save.profile.lastPlayedAt = new Date().toISOString();
      PlayerProfileStore.save();
      publishDeploymentConfigurationChanged(save.garage);
    }
    return result;
  }

  static purchaseAdditionalModLoadoutSlot(): PurchaseResult & { cost?: number } {
    const save = PlayerProfileStore.getActiveSave();
    const cost = getNextLoadoutSlotCost(save.mods.purchasedLoadoutSlots);
    if (cost === null) return { ok: false, message: 'Maximum saved Mod loadouts purchased.' };
    if (!spendCreditsAtomic(save.wallet, save.progress, cost, 'loadout')) return { ok: false, message: 'Not enough credits.', cost };
    save.mods.purchasedLoadoutSlots += 1;
    const number = save.mods.loadouts.length + 1;
    save.mods.loadouts.push({ id: `loadout-${number}`, name: `Loadout ${number}`, slots: createDefaultModLoadout(), cardSlots: createDefaultModLoadout() });
    PlayerProfileStore.save();
    return { ok: true, message: 'Saved Mod loadout purchased.', cost };
  }

  static equipMod(slot: ModSlot, modId: string, instanceId?: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = equipMod(save.mods, slot, modId, instanceId, save.protocol.preferred);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static unequipMod(slot: ModSlot): void {
    const save = PlayerProfileStore.getActiveSave();
    unequipMod(save.mods, slot);
    PlayerProfileStore.save();
  }

  static addFluxCores(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const save = PlayerProfileStore.getActiveSave();
    const earned = Math.floor(amount);
    save.wallet.fluxCores += earned;
    save.progress.totalFluxCoresEarned += earned;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static addPlasmaChips(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const save = PlayerProfileStore.getActiveSave();
    save.mods.plasmaChips += Math.floor(amount);
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static spendPlasmaChips(amount: number): boolean {
    const save = PlayerProfileStore.getActiveSave();
    if (!Number.isFinite(amount) || amount < 0) return false;
    const spent = Math.floor(amount);
    if (save.mods.plasmaChips < spent) return false;
    save.mods.plasmaChips -= spent;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return true;
  }

  static sellDuplicateMod(instanceId: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = sellDuplicateMod(save.mods, instanceId);
    if (!result.ok || result.credits === undefined) return result;
    save.wallet.credits += result.credits;
    save.progress.totalCreditsEarned += result.credits;
    PlayerProfileStore.save();
    return result;
  }

  static recycleDuplicateMod(instanceId: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = recycleDuplicateMod(save.mods, instanceId);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static recycleAllUnupgradedDuplicates(): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = recycleAllUnupgradedDuplicates(save.mods);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static deleteModCard(instanceId: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = deleteModCard(save.mods, instanceId);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static infuseModCard(instanceId: string, infusionId: ModInfusionId): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = infuseModCard(save.mods, instanceId, infusionId);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static setPreferredProtocol(protocol: RunProtocolId): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const definition = RUN_PROTOCOLS[protocol];
    if (!isRunProtocolUnlocked(protocol, save.progress)) return { ok: false, message: `Reach Round ${definition.unlockHighestRound} in the required progression tier to unlock ${definition.label}.` };
    save.protocol.preferred = protocol;
    PlayerProfileStore.save();
    return { ok: true };
  }

  static unlockCosmetic(cosmeticKey: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    if (!COSMETICS.some((cosmetic) => cosmetic.id === cosmeticKey)) return { ok: false, message: 'Unknown cosmetic.' };
    if (!save.cosmetics.owned.includes(cosmeticKey)) {
      save.cosmetics.owned.push(cosmeticKey);
    }
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return { ok: true };
  }

  static purchaseAndEquipCosmetic(cosmeticKey: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const cosmetic = COSMETICS.find((item) => item.id === cosmeticKey);
    if (!cosmetic) return { ok: false, message: 'UNKNOWN COSMETIC' };
    if (save.cosmetics.owned.includes(cosmeticKey) || cosmetic.cost === 0) {
      if (!save.cosmetics.owned.includes(cosmeticKey)) save.cosmetics.owned.push(cosmeticKey);
      save.cosmetics.equipped[cosmetic.category] = cosmeticKey;
      save.profile.lastPlayedAt = new Date().toISOString();
      PlayerProfileStore.save();
      return { ok: true, message: 'COSMETIC EQUIPPED' };
    }

    const costs = getCosmeticPurchaseCosts(cosmetic);
    const missing: string[] = [];
    if (save.wallet.credits < costs.credits) missing.push(`${(costs.credits - save.wallet.credits).toLocaleString()} CREDITS`);
    if (save.wallet.coreTokens < costs.coreTokens) missing.push(`${(costs.coreTokens - save.wallet.coreTokens).toLocaleString()} CORE TOKENS`);
    if (save.mods.plasmaChips < costs.plasmaChips) missing.push(`${(costs.plasmaChips - save.mods.plasmaChips).toLocaleString()} PLASMA CHIPS`);
    if (missing.length > 0) return { ok: false, message: `NEED ${missing.join(' + ')}` };

    if (costs.credits > 0 && !spendCreditsAtomic(save.wallet, save.progress, costs.credits, 'cosmetic')) return { ok: false, message: 'PURCHASE FAILED' };
    save.wallet.coreTokens -= costs.coreTokens;
    save.mods.plasmaChips -= costs.plasmaChips;
    save.cosmetics.owned.push(cosmeticKey);
    save.cosmetics.equipped[cosmetic.category] = cosmeticKey;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return { ok: true, message: 'ITEM UNLOCKED • EQUIPPED' };
  }

  static equipCosmetic(slot: string, cosmeticKey: string): void {
    const save = PlayerProfileStore.getActiveSave();
    const category = slot as CosmeticOption['category'];
    if (!save.cosmetics.owned.includes(cosmeticKey)) return;
    save.cosmetics.equipped[category] = cosmeticKey;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static setSettings(settings: Partial<LocalPlayerSave['settings']>): void {
    const save = PlayerProfileStore.getActiveSave();
    save.settings = { ...save.settings, ...settings };
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
  }

  static save(): void {
    const save = PlayerProfileStore.getActiveSave();
    const now = Date.now();
    const deltaSeconds = Math.max(0, Math.floor((now - PlayerProfileStore.lastPlaytimeCommitAt) / 1000));
    if (deltaSeconds > 0) {
      save.progress.totalPlaytimeSeconds += deltaSeconds;
      PlayerProfileStore.lastPlaytimeCommitAt = now;
    }
    save.metadata.updatedAt = new Date().toISOString();
    save.metadata.saveRevision += 1;
    const result = LocalSaveManager.importProfile(save, 'replace', save.profile.id);
    if (!result.ok) {
      PlayerProfileStore.markNotice('LOCAL SAVING UNAVAILABLE');
    } else {
      PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    }
  }

  static resetSessionTracking(): void {
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
  }

  private static markNotice(text: string): void {
    PlayerProfileStore.notice = text;
    PlayerProfileStore.noticeUntil = Date.now() + 4000;
  }
}
