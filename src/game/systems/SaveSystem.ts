import { getCosmeticById, getCosmeticDisplayColor, isPrismCosmetic, resolveOperativeFrameAppearance } from '../../data/cosmetics';
import { PlayerProfileStore } from '../state/PlayerProfileStore';
import type { CosmeticOption, GameSaveData } from '../types';
import type { OnlineProgressSnapshot } from '../../online/onlineTypes';
import type { ModInfusionId, ModSlot, RunProtocolId } from '../mods/types.ts';
import type { CreditSpendCategory, RunSetupSelection } from '../economy/types.ts';
import type { GaragePresetId } from '../garage/types.ts';
import type { ArcadeMetricEvent } from '../arcade/types.ts';
import type { ExchangeCurrency } from '../economy/CurrencyExchange.ts';
import { buildEconomyAnalytics, type EconomyAnalyticsSnapshot } from '../economy/EconomyAnalytics.ts';

export class SaveSystem {
  /** Read-only, freshly derived account economy data for presentation surfaces. */
  static getEconomyAnalytics(): EconomyAnalyticsSnapshot {
    return buildEconomyAnalytics(PlayerProfileStore.getActiveSave());
  }

  static get(): GameSaveData {
    const save = PlayerProfileStore.getActiveSave();
    return {
      credits: save.wallet.credits,
      coreTokens: save.wallet.coreTokens,
      fluxCores: save.wallet.fluxCores,
      upgrades: save.upgrades,
      unlockedCosmetics: [...save.cosmetics.owned],
      equippedCosmetics: { ...save.cosmetics.equipped },
      settings: {
        masterVolume: save.settings.masterVolume,
        musicVolume: save.settings.musicVolume,
        sfxVolume: save.settings.sfxVolume,
        soundVolumes: { ...save.settings.soundVolumes },
        screenShake: save.settings.screenShake,
        particles: save.settings.particles,
        abilityBindings: { ...save.settings.abilityBindings },
        hud: { ...save.settings.hud },
        aim: { ...save.settings.aim, reticle: { ...save.settings.aim.reticle } },
        controller: { ...save.settings.controller },
        contextualTutorials: save.settings.contextualTutorials,
        buttonJiggle: save.settings.buttonJiggle
      }
    };
  }

  static persist(): void {
    PlayerProfileStore.save();
  }

  static addCredits(amount: number): void {
    PlayerProfileStore.addCredits(amount);
  }

  static addCoreTokens(amount: number): void {
    PlayerProfileStore.addCoreTokens(amount);
  }

  static addFluxCores(amount: number): void {
    PlayerProfileStore.addFluxCores(amount);
  }

  static addPlasmaChips(amount: number): void {
    PlayerProfileStore.addPlasmaChips(amount);
  }

  static spendCredits(amount: number, category: CreditSpendCategory = 'other'): boolean {
    return PlayerProfileStore.spendCredits(amount, category);
  }

  static spendCoreTokens(amount: number): boolean {
    return PlayerProfileStore.spendCoreTokens(amount);
  }

  static spendFluxCores(amount: number): boolean {
    return PlayerProfileStore.spendFluxCores(amount);
  }

  static spendPlasmaChips(amount: number): boolean {
    return PlayerProfileStore.spendPlasmaChips(amount);
  }

  static exchangeCurrency(source: ExchangeCurrency, target: ExchangeCurrency, amount: number) {
    return PlayerProfileStore.exchangeCurrency(source, target, amount);
  }

  static recordRoundCompletion(round: number, protocol?: RunProtocolId): void {
    PlayerProfileStore.recordRoundCompletion(round, protocol);
  }

  static recordSupremeCompletion(): void { PlayerProfileStore.recordSupremeCompletion(); }
  static hasRegularOverdriveSupremeBridgeAwarded(): boolean { return PlayerProfileStore.hasRegularOverdriveSupremeBridgeAwarded(); }
  static markRegularOverdriveSupremeBridgeAwarded(): void { PlayerProfileStore.markRegularOverdriveSupremeBridgeAwarded(); }
  static hasCompletedRegularOverdrive(): boolean { return PlayerProfileStore.hasCompletedRegularOverdrive(); }
  static recordRegularOverdriveCompletion(): void { PlayerProfileStore.recordRegularOverdriveCompletion(); }
  static hasSeenFirstSupremeTutorial(): boolean { return PlayerProfileStore.hasSeenFirstSupremeTutorial(); }
  static markFirstSupremeTutorialSeen(): void { PlayerProfileStore.markFirstSupremeTutorialSeen(); }

  static recordEnemyDestroyed(count = 1, protocol?: RunProtocolId): void {
    PlayerProfileStore.recordEnemyDestroyed(count, protocol);
  }

  static recordBombSiteDestroyed(count = 1, protocol?: RunProtocolId): void {
    PlayerProfileStore.recordBombSiteDestroyed(count, protocol);
  }

  static recordCombatProgress(enemiesDestroyed: number, bombSitesDestroyed: number, protocol?: RunProtocolId): void {
    PlayerProfileStore.recordCombatProgress(enemiesDestroyed, bombSitesDestroyed, protocol);
  }

  static recordArcadeMetric(event: ArcadeMetricEvent): void {
    PlayerProfileStore.recordArcadeMetric(event);
  }

  static setUpgradeLevel(id: string, level: number): void {
    const save = PlayerProfileStore.getActiveSave();
    save.upgrades[id] = Math.max(0, level);
    PlayerProfileStore.save();
  }

  static setSettings(settings: Partial<GameSaveData['settings']>): void {
    PlayerProfileStore.setSettings(settings);
  }

  static unlockCosmetic(id: string): void {
    PlayerProfileStore.unlockCosmetic(id);
  }

  static purchaseAndEquipCosmetic(id: string) {
    return PlayerProfileStore.purchaseAndEquipCosmetic(id);
  }

  static equipCosmetic(category: CosmeticOption['category'], id: string): void {
    PlayerProfileStore.equipCosmetic(category, id);
  }

  static getCosmeticColor(category: CosmeticOption['category'], timeMs = Date.now()): number {
    const save = PlayerProfileStore.getActiveSave();
    const chosenId = save.cosmetics.equipped[category];
    const item = getCosmeticById(chosenId);
    return item ? getCosmeticDisplayColor(item, timeMs) : 0x4ef9ff;
  }

  static isPrismCosmetic(category: CosmeticOption['category']): boolean {
    const save = PlayerProfileStore.getActiveSave();
    const chosenId = save.cosmetics.equipped[category];
    return isPrismCosmetic(getCosmeticById(chosenId));
  }

  static getOperativeFrameAppearance(timeMs = Date.now()) {
    const equipped = PlayerProfileStore.getActiveSave().cosmetics.equipped;
    return resolveOperativeFrameAppearance(equipped.playerShape, equipped.playerColor, timeMs);
  }

  static getEquippedCosmeticId(category: CosmeticOption['category']): string | null {
    const save = PlayerProfileStore.getActiveSave();
    return save.cosmetics.equipped[category] ?? null;
  }

  static getActiveProfileSummary() {
    return PlayerProfileStore.getActiveProfileSummary();
  }

  static getProfiles() {
    return PlayerProfileStore.getProfiles();
  }

  static getModCollection() {
    return PlayerProfileStore.getActiveSave().mods;
  }

  static addMod(modId: string) { return PlayerProfileStore.addMod(modId); }
  static rankUpMod(modId: string, instanceId?: string) { return PlayerProfileStore.rankUpMod(modId, instanceId); }
  static equipMod(slot: ModSlot, modId: string, instanceId?: string) { return PlayerProfileStore.equipMod(slot, modId, instanceId); }
  static unequipMod(slot: ModSlot): void { PlayerProfileStore.unequipMod(slot); }
  static sellDuplicateMod(instanceId: string) { return PlayerProfileStore.sellDuplicateMod(instanceId); }
  static recycleDuplicateMod(instanceId: string) { return PlayerProfileStore.recycleDuplicateMod(instanceId); }
  static recycleAllUnupgradedDuplicates() { return PlayerProfileStore.recycleAllUnupgradedDuplicates(); }
  static deleteModCard(instanceId: string) { return PlayerProfileStore.deleteModCard(instanceId); }
  static infuseModCard(instanceId: string, infusionId: ModInfusionId) { return PlayerProfileStore.infuseModCard(instanceId, infusionId); }
  static removeModInfusion(instanceId: string) { return PlayerProfileStore.removeModInfusion(instanceId); }
  static getPreferredProtocol(): RunProtocolId { return PlayerProfileStore.getActiveSave().protocol.preferred; }
  static setPreferredProtocol(protocol: RunProtocolId) { return PlayerProfileStore.setPreferredProtocol(protocol); }
  static getHighestRound(): number { return PlayerProfileStore.getActiveSave().progress.highestRound; }
  static getNormalHighestRound(): number { return PlayerProfileStore.getActiveSave().progress.normalHighestRound; }
  static getSupremeHighestRound(): number { return PlayerProfileStore.getActiveSave().progress.supremeHighestRound; }
  static hasCompletedSupremeOverdrive(): boolean { return PlayerProfileStore.getActiveSave().progress.supremeOverdriveCompleted; }
  static getWeeklyOperations(nowMs = Date.now()) { return PlayerProfileStore.getWeeklyOperations(nowMs); }
  static getInitialDeploymentBriefingState() { return PlayerProfileStore.getInitialDeploymentBriefingState(); }
  static markInitialDeploymentBriefingSeen(): void { PlayerProfileStore.markInitialDeploymentBriefingSeen(); }
  static canAffordRunSetup(selection: RunSetupSelection): boolean { return PlayerProfileStore.canAffordRunSetup(selection); }
  static purchaseRunSetup(selection: RunSetupSelection) { return PlayerProfileStore.purchaseRunSetup(selection); }
  static buildRunEconomySnapshot(selection: RunSetupSelection, creditsSpentBeforeRun: number) { return PlayerProfileStore.buildRunEconomySnapshot(selection, creditsSpentBeforeRun); }
  static getGarageState() { return PlayerProfileStore.getGarageState(); }
  static getNextRunSetupSelection(): RunSetupSelection { return PlayerProfileStore.getNextRunSetupSelection(); }
  static setNextRunSetupSelection(selection: RunSetupSelection) { return PlayerProfileStore.setNextRunSetupSelection(selection); }
  static setSavedDeploymentEnabled(enabled: boolean, nowMs = Date.now()) { return PlayerProfileStore.setSavedDeploymentEnabled(enabled, nowMs); }
  static isSavedDeploymentReminderDue(nowMs = Date.now()): boolean { return PlayerProfileStore.isSavedDeploymentReminderDue(nowMs); }
  static commitDeploymentLaunch(options: { acknowledgeReminder?: boolean; nowMs?: number } = {}) { return PlayerProfileStore.commitDeploymentLaunch(options); }
  static saveGaragePreset(presetId: GaragePresetId) { return PlayerProfileStore.saveGaragePreset(presetId); }
  static loadGaragePreset(presetId: GaragePresetId) { return PlayerProfileStore.loadGaragePreset(presetId); }
  static purchaseAdditionalModLoadoutSlot() { return PlayerProfileStore.purchaseAdditionalModLoadoutSlot(); }

  static getLeaderboardEntries() {
    return PlayerProfileStore.getLeaderboardEntries();
  }

  static getOnlineProgressSnapshot(): OnlineProgressSnapshot {
    const progress = PlayerProfileStore.getActiveSave().progress;
    return {
      roundsCompleted: progress.roundsCompleted,
      enemiesDestroyed: progress.enemiesDestroyed,
      bombSitesDestroyed: progress.bombSitesDestroyed,
      totalCreditsEarned: progress.totalCreditsEarned
    };
  }

  static selectProfile(profileId: string) {
    return PlayerProfileStore.selectProfile(profileId);
  }

  static createProfile(name: string) {
    return PlayerProfileStore.createProfile(name);
  }

  static createProfileFromLegacy(name: string) {
    return PlayerProfileStore.createProfileFromLegacy(name);
  }

  static renameProfile(profileId: string, name: string) {
    return PlayerProfileStore.renameProfile(profileId, name);
  }

  static deleteProfile(profileId: string) {
    return PlayerProfileStore.deleteProfile(profileId);
  }

  static resetProgress(profileId: string) {
    return PlayerProfileStore.resetProgress(profileId);
  }

  static restoreBackup(profileId: string) {
    return PlayerProfileStore.restoreBackup(profileId);
  }

  static exportActiveProfile() {
    return PlayerProfileStore.exportActiveProfile();
  }

  static exportProfile(profileId: string) {
    return PlayerProfileStore.exportProfile(profileId);
  }

  static importProfile(raw: unknown, mode: 'new' | 'replace', targetProfileId?: string) {
    return PlayerProfileStore.importProfile(raw, mode, targetProfileId);
  }

  static previewImport(raw: unknown) {
    return PlayerProfileStore.previewImport(raw);
  }

  static detectLegacyProgress() {
    return PlayerProfileStore.detectLegacyProgress();
  }

  static recordLegacyPrompted() {
    return PlayerProfileStore.recordLegacyPrompted();
  }

  static getStorageMessage() {
    return PlayerProfileStore.getStorageMessage();
  }

  static getNotice() {
    return PlayerProfileStore.getNotice();
  }

  static getTutorialProgress() {
    return PlayerProfileStore.getActiveSave().tutorials;
  }

  static updateTutorialProgress(mutator: (progress: import('../save/LocalSaveTypes.ts').TutorialProgressState) => void): void {
    const progress = PlayerProfileStore.getActiveSave().tutorials;
    mutator(progress);
    PlayerProfileStore.save();
  }
}
