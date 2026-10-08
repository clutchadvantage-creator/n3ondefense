import { earnWeeklyCampaignRewards, getWeeklyFeaturedRewards, getWeeklyRewardHistory } from '../progression/WeeklyRewardCampaigns.ts';
import { deliverWeeklyFeaturedRewards } from '../progression/WeeklyRewardDelivery.ts';
import type { WeeklyMissionEligibility } from '../progression/WeeklyMissionLibrary.ts';
import { COSMETICS, getCosmeticPurchaseCosts } from '../../data/cosmetics';
import { UPGRADE_DEFINITIONS, getUpgradeCost } from '../../data/upgrades';
import type { CosmeticOption } from '../types';
import { type LocalPlayerSave, type ProfileSummary } from '../save/LocalSaveTypes';
import { LocalSaveManager } from '../save/LocalSaveManager';
import { addModDrop, createDefaultModLoadout, deleteModCard, equipMod, infuseModCard, rankUpMod, recycleAllUnupgradedDuplicates, recycleDuplicateMod, removeModInfusion, sellDuplicateMod, unequipMod } from '../mods/ModInventoryService.ts';
import { MOD_DEFINITIONS } from '../mods/definitions.ts';
import type { ModInfusionId, ModSlot, RunProtocolId } from '../mods/types.ts';
import {
  applyPlasmaRecalibration,
  findRecalibrationCard,
  getRecalibrationCandidatePool,
  getRecalibrationSlots,
  isModRecalibrationEligible,
  PLASMA_RECALIBRATION_BALANCE,
  resetPlasmaRecalibrationTransaction,
  rollPlasmaRecalibrationCandidate,
  type PlasmaRecalibrationCandidate
} from '../mods/PlasmaRecalibration.ts';
import { modStatEvents, type ModStatChangeListener } from '../mods/ModStatEvents.ts';
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
import { executeCurrencyExchange, type ExchangeCurrency } from '../economy/CurrencyExchange.ts';
import { walletState, type WalletChangeListener, type WalletSnapshot } from '../economy/WalletState.ts';
import { resolveOperationsConfiguration, selectOperationsCheckpoint } from '../progression/OperationsConfiguration.ts';
import { getPendingCampaignPackages, recordCampaignTrainingCompletion, recordCampaignVictory, type CampaignEncounterKind } from '../progression/CampaignProgression.ts';
import { prepareCampaignRewardPackages, type PreparedCampaignPackages } from '../progression/CampaignRewardPackages.ts';
import { ACCESS_CARD_PRICE, ACCESS_CARD_DAILY_LIMIT, ACCESS_CARD_TYPES, normalizeAccessCards, accessCardUseError } from '../anomalies/AnomalyAccessCards.ts';
import type { AnomalyId } from '../anomalies/types.ts';

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

  private static walletSnapshot(save: LocalPlayerSave): WalletSnapshot {
    return {
      profileId: save.profile.id,
      credits: save.wallet.credits,
      coreTokens: save.wallet.coreTokens,
      plasmaChips: save.mods.plasmaChips,
      fluxCores: save.wallet.fluxCores
    };
  }

  static getWalletSnapshot(): WalletSnapshot {
    return PlayerProfileStore.walletSnapshot(PlayerProfileStore.getActiveSave());
  }

  static getAccessCards() { return normalizeAccessCards(PlayerProfileStore.getActiveSave().accessCards); }

  static purchaseAccessCard(id: AnomalyId): PurchaseResult {
    return PlayerProfileStore.accessCardTransaction(id, false);
  }

  static useAccessCard(id: AnomalyId, lastStarted?: string): PurchaseResult {
    return PlayerProfileStore.accessCardTransaction(id, true, lastStarted);
  }

  private static accessCardTransaction(id: AnomalyId, use: boolean, lastStarted?: string): PurchaseResult {
    if (!ACCESS_CARD_TYPES.includes(id)) return { ok: false, message: 'UNKNOWN ACCESS CARD' };
    const previous = PlayerProfileStore.getActiveSave();
    const candidate = structuredClone(previous);
    candidate.accessCards = normalizeAccessCards(candidate.accessCards);
    const cards = candidate.accessCards;
    if (use) {
      const error = accessCardUseError(cards, id, lastStarted);
      if (error) return { ok: false, message: error };
      cards.owned[id]--; cards.uses++;
    } else {
      if (cards.purchases >= ACCESS_CARD_DAILY_LIMIT) return { ok: false, message: 'DAILY PURCHASE LIMIT REACHED' };
      if (!spendCreditsAtomic(candidate.wallet, candidate.progress, ACCESS_CARD_PRICE, 'other'))
        return { ok: false, message: 'NEED 50,000 CREDITS' };
      cards.owned[id]++; cards.purchases++;
    }
    PlayerProfileStore.activeSave = candidate;
    if (!PlayerProfileStore.save(true)) {
      PlayerProfileStore.activeSave = previous;
      walletState.publish(PlayerProfileStore.walletSnapshot(previous));
      return { ok: false, message: 'LOCAL SAVING UNAVAILABLE — CARD TRANSACTION CANCELLED' };
    }
    return { ok: true, message: use ? 'ACCESS GRANTED' : 'ACCESS CARD PURCHASED' };
  }

  static subscribeWalletChanges(listener: WalletChangeListener, emitCurrent = true): () => void {
    return walletState.subscribe(listener, emitCurrent);
  }

  static subscribeModStatChanges(listener: ModStatChangeListener): () => void {
    return modStatEvents.subscribe(listener);
  }

  static bootstrap(): void {
    const selected = LocalSaveManager.getActiveProfileSave();
    if (selected) {
      PlayerProfileStore.activeSave = selected;
      PlayerProfileStore.claimCampaignPackages();
      PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
      walletState.prime(PlayerProfileStore.walletSnapshot(selected));
      return;
    }

    PlayerProfileStore.activeSave = null;
    walletState.prime(null);
  }

  static hasActiveProfile(): boolean {
    if (PlayerProfileStore.activeSave) return true;
    return Boolean(LocalSaveManager.getActiveProfileSave());
  }

  static getActiveSave(): LocalPlayerSave {
    if (!PlayerProfileStore.activeSave) {
      const loaded = LocalSaveManager.getActiveProfileSave();
      PlayerProfileStore.activeSave = loaded ?? null;
      if (loaded) PlayerProfileStore.claimCampaignPackages();
      if (loaded) walletState.prime(PlayerProfileStore.walletSnapshot(loaded));
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
      walletState.prime(null);
      return { ok: false, message: result.message };
    }

    PlayerProfileStore.activeSave = result.save;
    PlayerProfileStore.claimCampaignPackages();
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
    walletState.publish(PlayerProfileStore.walletSnapshot(result.save), true);
    PlayerProfileStore.markNotice('SAVED LOCALLY');
    return { ok: true };
  }

  static createProfile(name: string): PurchaseResult {
    const result = LocalSaveManager.createProfile(name);
    if (!result.ok || !result.save) return { ok: false, message: result.message };
    PlayerProfileStore.activeSave = result.save;
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
    walletState.publish(PlayerProfileStore.walletSnapshot(result.save), true);
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static createProfileFromLegacy(name: string): PurchaseResult {
    const result = LocalSaveManager.createProfileFromLegacy(name);
    if (!result.ok || !result.save) return { ok: false, message: result.message };
    PlayerProfileStore.activeSave = result.save;
    PlayerProfileStore.claimCampaignPackages();
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
    walletState.publish(PlayerProfileStore.walletSnapshot(result.save), true);
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
      if (fallback) {
        PlayerProfileStore.activeSave = fallback;
        PlayerProfileStore.claimCampaignPackages();
        walletState.publish(PlayerProfileStore.walletSnapshot(fallback), true);
      } else walletState.prime(null);
    }
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static restoreBackup(profileId: string): PurchaseResult {
    const result = LocalSaveManager.restoreBackup(profileId);
    if (!result.ok) return result;
    if (PlayerProfileStore.activeSave?.profile.id === profileId) {
      PlayerProfileStore.activeSave = LocalSaveManager.getActiveProfileSave();
      if (PlayerProfileStore.activeSave) PlayerProfileStore.claimCampaignPackages();
      if (PlayerProfileStore.activeSave) walletState.publish(PlayerProfileStore.walletSnapshot(PlayerProfileStore.activeSave), true);
    }
    PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    return { ok: true };
  }

  static resetProgress(profileId: string): PurchaseResult {
    const result = LocalSaveManager.resetProfile(profileId);
    if (!result.ok) return result;
    if (PlayerProfileStore.activeSave?.profile.id === profileId) {
      PlayerProfileStore.activeSave = LocalSaveManager.getActiveProfileSave();
      if (PlayerProfileStore.activeSave) walletState.publish(PlayerProfileStore.walletSnapshot(PlayerProfileStore.activeSave), true);
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
      if (PlayerProfileStore.activeSave) PlayerProfileStore.claimCampaignPackages();
      if (PlayerProfileStore.activeSave) walletState.publish(PlayerProfileStore.walletSnapshot(PlayerProfileStore.activeSave), true);
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

  static recordRoundCompletion(round: number, protocol: RunProtocolId = 'normal', encounter: CampaignEncounterKind = 'arena'): void {
    const save = PlayerProfileStore.getActiveSave();
    PlayerProfileStore.observeWeeklyProgress(save);
    recordCampaignVictory(save.progress.campaign, RUN_PROTOCOLS[protocol].family, round, encounter);
    if (encounter === 'boss' || encounter === 'trinity') {
      save.progress.bossesDefeated++;
      if (isOverdriveProtocol(protocol)) save.progress.overdriveWeeklyProgress.bossesDefeated = (save.progress.overdriveWeeklyProgress.bossesDefeated ?? 0) + 1;
    }
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
    PlayerProfileStore.saveWeeklyProgress(save);
  }

  static recordEnemyDestroyed(count = 1, protocol?: RunProtocolId): void {
    PlayerProfileStore.recordCombatProgress(count, 0, protocol);
  }

  static recordSupremeCompletion(): void {
    const save = PlayerProfileStore.getActiveSave();
    PlayerProfileStore.observeWeeklyProgress(save);
    recordCampaignVictory(save.progress.campaign, 'supreme', 30, 'trinity');
    save.progress.bossesDefeated++;
    save.progress.overdriveWeeklyProgress.bossesDefeated = (save.progress.overdriveWeeklyProgress.bossesDefeated ?? 0) + 1;
    save.progress.supremeOverdriveCompleted = true;
    save.progress.supremeHighestRound = Math.max(save.progress.supremeHighestRound, 30);
    save.progress.highestRound = Math.max(save.progress.highestRound, 30);
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.saveWeeklyProgress(save);
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
    return PlayerProfileStore.getActiveSave().progress.campaign.modes.overdrive.completed;
  }

  static completeCampaignTraining(): void {
    recordCampaignTrainingCompletion(PlayerProfileStore.getActiveSave().progress.campaign);
    PlayerProfileStore.save();
  }

  /** Inventory and claims are one persistence operation; failure keeps the old
   * in-memory pair so a later retry cannot observe an uncommitted grant. */
  static claimCampaignPackages(): PreparedCampaignPackages['grants'] {
    const save = PlayerProfileStore.getActiveSave();
    if (!getPendingCampaignPackages(save.progress.campaign).length) return [];
    const prepared = prepareCampaignRewardPackages(save.progress.campaign, save.mods,
      stableRewardIndex(`${save.profile.id}:campaign-packages`, 0xffffffff), new Date().toISOString());
    const previousProgress = save.progress.campaign;
    const previousMods = save.mods;
    save.progress.campaign = prepared.progress;
    save.mods = prepared.mods;
    if (!PlayerProfileStore.save()) {
      save.progress.campaign = previousProgress;
      save.mods = previousMods;
      return [];
    }
    return prepared.grants;
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
    PlayerProfileStore.observeWeeklyProgress(save);
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
    PlayerProfileStore.saveWeeklyProgress(save);
  }

  static recordArcadeMetric(event: ArcadeMetricEvent): void {
    const save = PlayerProfileStore.getActiveSave();
    PlayerProfileStore.observeWeeklyProgress(save);
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
      PlayerProfileStore.saveWeeklyProgress(save);
    }
  }

  static getWeeklyMissionEligibility(save = PlayerProfileStore.getActiveSave()): WeeklyMissionEligibility {
    const systems: WeeklyMissionEligibility['systems'][number][] = ['combat'];
    if (save.progress.campaign.packages.training.eligible || save.progress.highestRound > 0) systems.push('arcade', 'anomalies', 'exchange');
    if (save.mods.cards.some(card => {
      const definition = MOD_DEFINITIONS.find(item => item.id === card.modId);
      return definition && card.upgradeLevel < definition.maxRank;
    })) systems.push('mod-upgrade');
    return { systems };
  }

  /** Observes before and after authoritative counter mutations, including UTC rollover. */
  private static observeWeeklyProgress(save: LocalPlayerSave, nowMs = Date.now()): boolean {
    // Reserve any previous week's earned reward before replacing its track.
    let changed = earnWeeklyCampaignRewards(save.progress.weeklyRewardCampaigns, save.progress.weeklyOperations);
    const resolution = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress,
      save.progress.weeklyOperations, nowMs, { eligibility: () => PlayerProfileStore.getWeeklyMissionEligibility(save), claimRewards: false });
    save.progress.weeklyOperations = resolution.state;
    changed = earnWeeklyCampaignRewards(save.progress.weeklyRewardCampaigns, resolution.state) || changed;
    return resolution.stateChanged || changed;
  }

  private static saveWeeklyProgress(save: LocalPlayerSave): void {
    PlayerProfileStore.observeWeeklyProgress(save);
    PlayerProfileStore.save();
  }

  static recordAnomalyCompletion(id: AnomalyId, protocol: RunProtocolId): void {
    const save = PlayerProfileStore.getActiveSave();
    PlayerProfileStore.observeWeeklyProgress(save);
    const key = id === 'heist' ? 'heistsCompleted' : 'skyBreachesCompleted';
    save.progress[key]++;
    if (isOverdriveProtocol(protocol)) save.progress.overdriveWeeklyProgress[key] = (save.progress.overdriveWeeklyProgress[key] ?? 0) + 1;
    PlayerProfileStore.saveWeeklyProgress(save);
  }

  static getWeeklyOperations(nowMs = Date.now()): WeeklyOperationDecksSnapshot {
    const previous = PlayerProfileStore.getActiveSave();
    // Persist earned reservations before attempting delivery. An unavailable
    // inventory adapter or interrupted grant leaves a recoverable EARNED receipt.
    if (PlayerProfileStore.observeWeeklyProgress(previous, nowMs)) PlayerProfileStore.save(true);
    const save = structuredClone(previous);
    const resolution = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, nowMs,
      { eligibility: () => PlayerProfileStore.getWeeklyMissionEligibility(save) });
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
      // Weekly packages are claimed in Main Menu, outside any active Supreme
      // operation. They cannot bypass the in-Supreme drop requirement.
      const rewardPool = MOD_DEFINITIONS.filter((definition) => definition.rarity !== 'supreme');
      if (reward.randomMod && rewardPool.length > 0) {
        const modIndex = stableRewardIndex(`${save.profile.id}:${grant.deck}:${grant.rotationId}`, rewardPool.length);
        addModDrop(save.mods, rewardPool[modIndex].id, new Date(nowMs).toISOString());
      }
      for (const cosmeticId of reward.cosmeticIds ?? []) {
        if (COSMETICS.some((cosmetic) => cosmetic.id === cosmeticId) && !save.cosmetics.owned.includes(cosmeticId)) {
          save.cosmetics.owned.push(cosmeticId);
        }
      }
      save.profile.lastPlayedAt = new Date(nowMs).toISOString();
    }
    const delivered = deliverWeeklyFeaturedRewards(save, nowMs);
    if (resolution.stateChanged || delivered) {
      PlayerProfileStore.activeSave = save;
      if (!PlayerProfileStore.save(true)) {
        PlayerProfileStore.activeSave = previous;
        walletState.publish(PlayerProfileStore.walletSnapshot(previous));
      }
    }
    const committed = PlayerProfileStore.getActiveSave();
    for (const deck of ['regular', 'overdrive'] as const) {
      resolution.snapshot[deck].rewardClaimed = (deck === 'regular' ? committed.progress.weeklyOperations : committed.progress.weeklyOperations.overdrive).rewardClaimed;
      resolution.snapshot[deck].featuredRewards = getWeeklyFeaturedRewards(committed.progress.weeklyRewardCampaigns, deck, nowMs);
    }
    return resolution.snapshot;
  }

  static getWeeklyRewardHistory(nowMs = Date.now()) {
    return getWeeklyRewardHistory(PlayerProfileStore.getActiveSave().progress.weeklyRewardCampaigns, nowMs);
  }

  static getWeeklyEntitlementAmount(inventoryRef: string): number {
    return PlayerProfileStore.getActiveSave().progress.weeklyRewardCampaigns.entitlements
      .filter(item => item.inventoryRef === inventoryRef).reduce((sum, item) => sum + item.amount, 0);
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
    PlayerProfileStore.observeWeeklyProgress(save);
    const earned = Math.floor(amount);
    save.wallet.credits += earned;
    save.progress.totalCreditsEarned += earned;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.saveWeeklyProgress(save);
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
    PlayerProfileStore.observeWeeklyProgress(save);
    const result = rankUpMod(save.mods, modId, save.wallet.credits, save.wallet.coreTokens, instanceId);
    if (!result.ok || result.cost === undefined || result.coreTokenCost === undefined) return result;
    if (!spendCreditsAtomic(save.wallet, save.progress, result.cost, 'modRank')) return { ok: false, message: 'Not enough credits.' };
    save.wallet.coreTokens -= result.coreTokenCost;
    save.profile.lastPlayedAt = new Date().toISOString();
    save.progress.modUpgrades++;
    PlayerProfileStore.saveWeeklyProgress(save);
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

  static getOperationsConfiguration() {
    const save = PlayerProfileStore.getActiveSave();
    return resolveOperationsConfiguration(save.protocol, save.progress);
  }

  static setOperationsCheckpoint(protocol: RunProtocolId, normalStartingRound?: number): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = selectOperationsCheckpoint(save.protocol, save.progress, protocol, normalStartingRound);
    if (!result.ok || !result.preference) return { ok: false, message: result.message };
    save.protocol = result.preference;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    // Reuse the deployment notification channel as an invalidation signal.
    // The profile save remains the sole source of Operations truth.
    publishDeploymentConfigurationChanged(save.garage);
    return { ok: true, message: result.message };
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
    const result = equipMod(save.mods, slot, modId, instanceId, resolveOperationsConfiguration(save.protocol, save.progress).protocol);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static unequipMod(slot: ModSlot): void {
    const save = PlayerProfileStore.getActiveSave();
    unequipMod(save.mods, slot);
    PlayerProfileStore.save();
  }

  static exchangeCurrency(source: ExchangeCurrency, target: ExchangeCurrency, amount: number) {
    const save = PlayerProfileStore.getActiveSave();
    PlayerProfileStore.observeWeeklyProgress(save);
    const balances = {
      credits: save.wallet.credits,
      coreTokens: save.wallet.coreTokens,
      plasmaChips: save.mods.plasmaChips,
      fluxCores: save.wallet.fluxCores
    };
    const result = executeCurrencyExchange(balances, source, target, amount);
    if (!result.ok) return result;

    // Commit all four authoritative balances together, then persist once. A
    // failed quote never touches profile state and conversions are not counted
    // as newly earned lifetime rewards.
    save.wallet.credits = balances.credits;
    save.wallet.coreTokens = balances.coreTokens;
    save.wallet.fluxCores = balances.fluxCores;
    save.mods.plasmaChips = balances.plasmaChips;
    save.profile.lastPlayedAt = new Date().toISOString();
    save.progress.currencyExchanges++;
    PlayerProfileStore.saveWeeklyProgress(save);
    return result;
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

  static rollPlasmaRecalibration(instanceId: string): PurchaseResult & { candidate?: PlasmaRecalibrationCandidate; cost?: number } {
    const save = PlayerProfileStore.getActiveSave();
    const selection = findRecalibrationCard(save.mods.cards, instanceId);
    if (!selection) return { ok: false, message: 'OWNED MOD CARD NOT FOUND' };
    if (!isModRecalibrationEligible(selection.definition, selection.card)) {
      return { ok: false, message: `MAX RANK ${selection.definition.maxRank} REQUIRED` };
    }
    const slots = getRecalibrationSlots(selection.definition).filter((slot) => !slot.protected);
    if (!slots.length || !getRecalibrationCandidatePool(selection.definition, selection.card).length) {
      return { ok: false, message: 'NO SAFE RECALIBRATION ATTRIBUTES AVAILABLE' };
    }
    const cost = PLASMA_RECALIBRATION_BALANCE.rollCost;
    if (save.mods.plasmaChips < cost) return { ok: false, message: `INSUFFICIENT PLASMA CHIPS — ${cost} REQUIRED`, cost };
    const roll = rollPlasmaRecalibrationCandidate(selection.definition, selection.card);
    if (!roll.ok || !roll.candidate) return { ok: false, message: roll.message, cost };
    // One atomic transaction: the candidate is generated before mutation, then
    // exactly one cost is committed and persisted regardless of Keep/Replace.
    save.mods.plasmaChips -= cost;
    save.profile.lastPlayedAt = new Date().toISOString();
    PlayerProfileStore.save();
    return { ok: true, message: roll.message, candidate: roll.candidate, cost };
  }

  static applyPlasmaRecalibration(instanceId: string, slotIndex: number, candidate: PlasmaRecalibrationCandidate): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const selection = findRecalibrationCard(save.mods.cards, instanceId);
    if (!selection) return { ok: false, message: 'OWNED MOD CARD NOT FOUND' };
    const previousCalibrations = selection.card.calibrations?.map((entry) => ({ ...entry }));
    const result = applyPlasmaRecalibration(selection.card, selection.definition, slotIndex, candidate);
    if (!result.ok) return result;
    save.profile.lastPlayedAt = new Date().toISOString();
    if (!PlayerProfileStore.save()) {
      if (previousCalibrations?.length) selection.card.calibrations = previousCalibrations;
      else delete selection.card.calibrations;
      return { ok: false, message: 'LOCAL SAVE COMMIT FAILED // CALIBRATION NOT APPLIED' };
    }
    modStatEvents.publish({
      profileId: save.profile.id,
      instanceId: selection.card.instanceId,
      modId: selection.card.modId,
      reason: 'recalibrated'
    });
    return result;
  }

  static resetPlasmaRecalibration(instanceId: string): PurchaseResult & { cost?: number } {
    const save = PlayerProfileStore.getActiveSave();
    const selection = findRecalibrationCard(save.mods.cards, instanceId);
    if (!selection) return { ok: false, message: 'OWNED MOD CARD NOT FOUND' };
    const cost = PLASMA_RECALIBRATION_BALANCE.resetCost;
    const previousChips = save.mods.plasmaChips;
    const previousCalibrations = selection.card.calibrations?.map((entry) => ({ ...entry }));
    const previousLastPlayedAt = save.profile.lastPlayedAt;
    const reset = resetPlasmaRecalibrationTransaction(save.mods, instanceId);
    if (!reset.ok) return reset;
    save.profile.lastPlayedAt = new Date().toISOString();
    if (!PlayerProfileStore.save()) {
      save.mods.plasmaChips = previousChips;
      save.profile.lastPlayedAt = previousLastPlayedAt;
      if (previousCalibrations?.length) selection.card.calibrations = previousCalibrations;
      else delete selection.card.calibrations;
      walletState.prime(PlayerProfileStore.walletSnapshot(save));
      return { ok: false, message: 'LOCAL SAVE COMMIT FAILED // NO CHIPS SPENT', cost };
    }
    modStatEvents.publish({
      profileId: save.profile.id,
      instanceId: selection.card.instanceId,
      modId: selection.card.modId,
      reason: 'reset-native'
    });
    return { ok: true, message: 'NATIVE STATS RESTORED', cost };
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

  static removeModInfusion(instanceId: string): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const result = removeModInfusion(save.mods, instanceId);
    if (result.ok) PlayerProfileStore.save();
    return result;
  }

  static setPreferredProtocol(protocol: RunProtocolId): PurchaseResult {
    const save = PlayerProfileStore.getActiveSave();
    const definition = RUN_PROTOCOLS[protocol];
    if (!isRunProtocolUnlocked(protocol, save.progress)) return { ok: false, message: `Defeat ${definition.family === 'supreme' ? 'Overdrive' : 'Normal'} Boss 30 to unlock this mode.` };
    return PlayerProfileStore.setOperationsCheckpoint(protocol, protocol === 'normal' ? save.protocol.selectedNormalStartRound : undefined);
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

  static save(requirePersistent = false): boolean {
    const save = PlayerProfileStore.getActiveSave();
    const now = Date.now();
    const deltaSeconds = Math.max(0, Math.floor((now - PlayerProfileStore.lastPlaytimeCommitAt) / 1000));
    if (deltaSeconds > 0) {
      save.progress.totalPlaytimeSeconds += deltaSeconds;
      PlayerProfileStore.lastPlaytimeCommitAt = now;
    }
    save.metadata.updatedAt = new Date().toISOString();
    save.metadata.saveRevision += 1;
    const result = LocalSaveManager.importProfile(save, 'replace', save.profile.id, requirePersistent);
    if (!result.ok) {
      PlayerProfileStore.markNotice('LOCAL SAVING UNAVAILABLE');
    } else {
      PlayerProfileStore.markNotice('LOCAL SAVE UPDATED');
    }
    // Persistent transactions must not advertise a wallet that failed to commit.
    if (result.ok || !requirePersistent) walletState.publish(PlayerProfileStore.walletSnapshot(save));
    return result.ok;
  }

  static resetSessionTracking(): void {
    PlayerProfileStore.lastPlaytimeCommitAt = Date.now();
  }

  private static markNotice(text: string): void {
    PlayerProfileStore.notice = text;
    PlayerProfileStore.noticeUntil = Date.now() + 4000;
  }
}
