import Phaser from 'phaser';
import { UPGRADE_DEFINITIONS, getUpgradeCost, getUpgradeLevel } from '../../data/upgrades';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { StorefrontUi } from '../../ui/stores/StorefrontUi';
import { SceneKeys } from '../flow/SceneKeys';
import { RunTransitionManager } from '../flow/RunTransitionManager.ts';
import { resolveStoreReturnRoute, type StoreReturnRequest, type StoreReturnRoute } from '../stores/StoreNavigation.ts';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import { SaveSystem } from '../systems/SaveSystem';
import type { UpgradeDefinition } from '../types';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { COSMETICS } from '../../data/cosmetics';
import type { CosmeticOption } from '../types';
import { TutorialDirector } from '../tutorial/TutorialDirector.ts';
import { TutorialEventBus } from '../tutorial/TutorialEventBus.ts';

interface StoreSceneData extends StoreReturnRequest {}

export class UpgradeStoreScene extends Phaser.Scene {
  private storefront: StorefrontUi | null = null;
  private tutorialDirector: TutorialDirector | null = null;

  constructor() {
    super(SceneKeys.Upgrades);
  }

  create(data?: StoreSceneData): void {
    let save;
    try {
      save = SaveSystem.get();
    } catch {
      this.scene.start(SceneKeys.LocalProfiles);
      return;
    }

    const arenaCanResume = this.scene.isPaused(SceneKeys.Arena) && this.registry.has('arena-session');
    const returnRoute = resolveStoreReturnRoute(data, arenaCanResume);
    this.add.rectangle(this.scale.width * 0.5, this.scale.height * 0.5, this.scale.width, this.scale.height, 0x030910, 1);
    this.storefront = new StorefrontUi({
      root: getGameUiRoot(),
      mode: 'upgrades',
      upgrades: UPGRADE_DEFINITIONS,
      cosmetics: COSMETICS,
      particlesEnabled: save.settings.particles,
      getSnapshot: () => {
        const current = SaveSystem.get();
        return {
          credits: current.credits,
          coreTokens: current.coreTokens,
          upgrades: current.upgrades,
          ownedCosmetics: current.unlockedCosmetics,
          equippedCosmetics: current.equippedCosmetics
        };
      },
      onBack: () => this.returnToMainMenu(returnRoute),
      onReturn: returnRoute.returnScene === SceneKeys.MainMenu ? undefined : () => this.returnToPreviousScene(returnRoute),
      returnLabel: returnRoute.returnScene === SceneKeys.Arena ? 'BACK TO GAME' : 'BACK TO RESULTS',
      onUpgrade: (definition, level) => this.purchaseUpgrade(definition, level),
      onUnlock: (item) => this.unlockCosmetic(item),
      onEquip: (item) => this.equipCosmetic(item)
    });
    this.tutorialDirector = new TutorialDirector({
      scene: 'upgrades',
      resolveTarget: (target) => {
        const element = document.querySelector<HTMLElement>(`[data-tutorial-target="${target}"]`);
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      },
      setMode: () => undefined,
      isEventActionAvailable: (event) => event !== 'economy.upgradePurchaseAttempted' || this.hasAffordableUpgrade()
    });
    window.setTimeout(() => {
      if (this.scene.isActive()) TutorialEventBus.emit('ui.upgradeStoreOpened');
    }, 180);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.storefront?.destroy();
      this.storefront = null;
      this.tutorialDirector?.destroy();
      this.tutorialDirector = null;
    });
  }

  private returnToPreviousScene(route: StoreReturnRoute): void {
    if (route.returnScene === SceneKeys.Arena && route.resumePausedScene) {
      const arenaCanResume = this.scene.isPaused(SceneKeys.Arena) && this.registry.has('arena-session');
      if (!arenaCanResume) {
        this.scene.start(SceneKeys.MainMenu);
        return;
      }
      const arena = this.scene.get(SceneKeys.Arena);
      this.scene.resume(SceneKeys.Arena);
      arena.events.emit('return-from-store');
      this.scene.stop();
      return;
    }
    this.scene.start(route.returnScene);
  }

  private returnToMainMenu(route: StoreReturnRoute): void {
    if (route.returnScene === SceneKeys.Arena && route.resumePausedScene && this.scene.isPaused(SceneKeys.Arena)) {
      this.scene.get(SceneKeys.Arena).events.emit('quit-from-store');
      this.scene.stop();
      return;
    }
    if (route.returnScene === SceneKeys.RoundFinished) {
      OnlineRunManager.complete('quit');
      GameplayTelemetryRecorder.finishRun('quit');
      this.registry.remove('arena-session');
      this.registry.remove('round-finished');
      RunTransitionManager.clearForMenu(this);
    }
    this.scene.start(SceneKeys.MainMenu);
  }

  private purchaseUpgrade(definition: UpgradeDefinition, displayedLevel: number): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    const currentLevel = getUpgradeLevel(save.upgrades, definition.id);
    if (currentLevel !== displayedLevel) return this.reportUpgradeAttempt(definition.id, { ok: false, message: 'LEVEL CHANGED • SELECT AGAIN' });
    if (currentLevel >= definition.maxLevel) return this.reportUpgradeAttempt(definition.id, { ok: false, message: 'MAX LEVEL' });
    const cost = getUpgradeCost(definition.baseCost, definition.growth, currentLevel);
    if (!SaveSystem.spendCredits(cost, 'upgrade')) {
      return this.reportUpgradeAttempt(definition.id, { ok: false, message: `NEED ${(cost - save.credits).toLocaleString()} MORE CREDITS` });
    }
    SaveSystem.setUpgradeLevel(definition.id, currentLevel + 1);
    TutorialEventBus.emit('economy.upgradePurchased', { id: definition.id, level: currentLevel + 1 });
    return this.reportUpgradeAttempt(definition.id, { ok: true, message: 'UPGRADE INSTALLED' });
  }

  private reportUpgradeAttempt(id: string, result: { ok: boolean; message: string }): { ok: boolean; message: string } {
    TutorialEventBus.emit('economy.upgradePurchaseAttempted', { id, ok: result.ok });
    return result;
  }

  private hasAffordableUpgrade(): boolean {
    const save = SaveSystem.get();
    return UPGRADE_DEFINITIONS.some((definition) => {
      const level = getUpgradeLevel(save.upgrades, definition.id);
      return level < definition.maxLevel && save.credits >= getUpgradeCost(definition.baseCost, definition.growth, level);
    });
  }

  private unlockCosmetic(item: CosmeticOption): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    if (save.unlockedCosmetics.includes(item.id) || item.cost === 0) return this.equipCosmetic(item);
    const paid = item.currency === 'credits' ? SaveSystem.spendCredits(item.cost, 'cosmetic') : SaveSystem.spendCoreTokens(item.cost);
    if (!paid) {
      const balance = item.currency === 'credits' ? save.credits : save.coreTokens;
      return { ok: false, message: `NEED ${(item.cost - balance).toLocaleString()} MORE ${item.currency === 'credits' ? 'CREDITS' : 'CORE TOKENS'}` };
    }
    SaveSystem.unlockCosmetic(item.id);
    SaveSystem.equipCosmetic(item.category, item.id);
    return { ok: true, message: 'ITEM UNLOCKED • EQUIPPED' };
  }

  private equipCosmetic(item: CosmeticOption): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    if (!save.unlockedCosmetics.includes(item.id) && item.cost !== 0) return { ok: false, message: 'ITEM IS LOCKED' };
    SaveSystem.unlockCosmetic(item.id);
    SaveSystem.equipCosmetic(item.category, item.id);
    return { ok: true, message: 'COSMETIC EQUIPPED' };
  }
}
