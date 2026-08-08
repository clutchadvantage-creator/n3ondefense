import { COSMETICS } from '../../data/cosmetics';
import { PlayerProfileStore } from '../state/PlayerProfileStore';
import type { CosmeticOption, GameSaveData } from '../types';
import type { OnlineProgressSnapshot } from '../../online/onlineTypes';
import type { ModInfusionId, ModSlot, RunProtocolId } from '../mods/types.ts';
import type { CreditSpendCategory, RunSetupSelection } from '../economy/types.ts';

export class SaveSystem {
  static get(): GameSaveData {
    const save = PlayerProfileStore.getActiveSave();
    return {
      credits: save.wallet.credits,
      coreTokens: save.wallet.coreTokens,
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
        abilityBindings: { ...save.settings.abilityBindings }
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

  static spendCredits(amount: number, category: CreditSpendCategory = 'other'): boolean {
    return PlayerProfileStore.spendCredits(amount, category);
  }

  static spendCoreTokens(amount: number): boolean {
    return PlayerProfileStore.spendCoreTokens(amount);
  }

  static recordRoundCompletion(round: number): void {
    PlayerProfileStore.recordRoundCompletion(round);
  }

  static recordEnemyDestroyed(count = 1): void {
    PlayerProfileStore.recordEnemyDestroyed(count);
  }

  static recordBombSiteDestroyed(count = 1): void {
    PlayerProfileStore.recordBombSiteDestroyed(count);
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

  static equipCosmetic(category: CosmeticOption['category'], id: string): void {
    PlayerProfileStore.equipCosmetic(category, id);
  }

  static getCosmeticColor(category: CosmeticOption['category']): number {
    const save = PlayerProfileStore.getActiveSave();
    const chosenId = save.cosmetics.equipped[category];
    return COSMETICS.find((c) => c.id === chosenId)?.color ?? 0x4ef9ff;
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
  static deleteModCard(instanceId: string) { return PlayerProfileStore.deleteModCard(instanceId); }
  static infuseModCard(instanceId: string, infusionId: ModInfusionId) { return PlayerProfileStore.infuseModCard(instanceId, infusionId); }
  static getPreferredProtocol(): RunProtocolId { return PlayerProfileStore.getActiveSave().protocol.preferred; }
  static setPreferredProtocol(protocol: RunProtocolId) { return PlayerProfileStore.setPreferredProtocol(protocol); }
  static getHighestRound(): number { return PlayerProfileStore.getActiveSave().progress.highestRound; }
  static canAffordRunSetup(selection: RunSetupSelection): boolean { return PlayerProfileStore.canAffordRunSetup(selection); }
  static purchaseRunSetup(selection: RunSetupSelection) { return PlayerProfileStore.purchaseRunSetup(selection); }
  static buildRunEconomySnapshot(selection: RunSetupSelection, creditsSpentBeforeRun: number) { return PlayerProfileStore.buildRunEconomySnapshot(selection, creditsSpentBeforeRun); }
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
}
