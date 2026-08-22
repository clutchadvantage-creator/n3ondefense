import Phaser from 'phaser';
import { COSMETICS } from '../../data/cosmetics';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { StorefrontUi } from '../../ui/stores/StorefrontUi';
import { SceneKeys } from '../flow/SceneKeys';
import { RunTransitionManager } from '../flow/RunTransitionManager.ts';
import { resolveStoreReturnRoute, type StoreReturnRequest, type StoreReturnRoute } from '../stores/StoreNavigation.ts';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import { SaveSystem } from '../systems/SaveSystem';
import type { CosmeticOption } from '../types';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { UPGRADE_DEFINITIONS, getUpgradeCost, getUpgradeLevel } from '../../data/upgrades';
import type { UpgradeDefinition } from '../types';

interface StoreSceneData extends StoreReturnRequest {}

export class CosmeticsStoreScene extends Phaser.Scene {
  private storefront: StorefrontUi | null = null;

  constructor() {
    super(SceneKeys.Cosmetics);
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
    this.add.rectangle(this.scale.width * 0.5, this.scale.height * 0.5, this.scale.width, this.scale.height, 0x05040d, 1);
    this.storefront = new StorefrontUi({
      root: getGameUiRoot(),
      mode: 'cosmetics',
      cosmetics: COSMETICS,
      upgrades: UPGRADE_DEFINITIONS,
      particlesEnabled: save.settings.particles,
      getSnapshot: () => {
        const current = SaveSystem.get();
        return {
          credits: current.credits,
          coreTokens: current.coreTokens,
          plasmaChips: SaveSystem.getModCollection().plasmaChips,
          upgrades: current.upgrades,
          ownedCosmetics: current.unlockedCosmetics,
          equippedCosmetics: current.equippedCosmetics
        };
      },
      onBack: () => this.returnToMainMenu(returnRoute),
      onReturn: returnRoute.returnScene === SceneKeys.MainMenu ? undefined : () => this.returnToPreviousScene(returnRoute),
      returnLabel: returnRoute.returnScene === SceneKeys.Arena ? 'BACK TO GAME' : 'BACK TO RESULTS',
      onUnlock: (item) => this.unlockCosmetic(item),
      onEquip: (item) => this.equipCosmetic(item),
      onUpgrade: (definition, level) => this.purchaseUpgrade(definition, level)
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.storefront?.destroy();
      this.storefront = null;
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

  private unlockCosmetic(item: CosmeticOption): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    if (save.unlockedCosmetics.includes(item.id) || item.cost === 0) return this.equipCosmetic(item);
    const result = SaveSystem.purchaseAndEquipCosmetic(item.id);
    return { ok: result.ok, message: result.message ?? (result.ok ? 'ITEM UNLOCKED • EQUIPPED' : 'PURCHASE FAILED') };
  }

  private equipCosmetic(item: CosmeticOption): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    if (!save.unlockedCosmetics.includes(item.id) && item.cost !== 0) return { ok: false, message: 'ITEM IS LOCKED' };
    SaveSystem.unlockCosmetic(item.id);
    SaveSystem.equipCosmetic(item.category, item.id);
    return { ok: true, message: 'COSMETIC EQUIPPED' };
  }

  private purchaseUpgrade(definition: UpgradeDefinition, displayedLevel: number): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    const currentLevel = getUpgradeLevel(save.upgrades, definition.id);
    if (currentLevel !== displayedLevel) return { ok: false, message: 'LEVEL CHANGED • SELECT AGAIN' };
    if (currentLevel >= definition.maxLevel) return { ok: false, message: 'MAX LEVEL' };
    const cost = getUpgradeCost(definition.baseCost, definition.growth, currentLevel);
    if (!SaveSystem.spendCredits(cost, 'upgrade')) return { ok: false, message: `NEED ${(cost - save.credits).toLocaleString()} MORE CREDITS` };
    SaveSystem.setUpgradeLevel(definition.id, currentLevel + 1);
    return { ok: true, message: 'UPGRADE INSTALLED' };
  }
}
