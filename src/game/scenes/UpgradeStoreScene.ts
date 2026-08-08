import Phaser from 'phaser';
import { UPGRADE_DEFINITIONS, getUpgradeCost, getUpgradeLevel } from '../../data/upgrades';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { StorefrontUi } from '../../ui/stores/StorefrontUi';
import { SceneKeys } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import type { UpgradeDefinition } from '../types';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { COSMETICS } from '../../data/cosmetics';
import type { CosmeticOption } from '../types';

interface StoreSceneData {
  returnScene?: string;
}

export class UpgradeStoreScene extends Phaser.Scene {
  private storefront: StorefrontUi | null = null;

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
      onBack: () => {
        if (data?.returnScene) OnlineRunManager.complete('quit');
        this.scene.start(SceneKeys.MainMenu);
      },
      onReturnToGame: data?.returnScene ? () => this.scene.start(data.returnScene as string) : undefined,
      onUpgrade: (definition, level) => this.purchaseUpgrade(definition, level),
      onUnlock: (item) => this.unlockCosmetic(item),
      onEquip: (item) => this.equipCosmetic(item)
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.storefront?.destroy();
      this.storefront = null;
    });
  }

  private purchaseUpgrade(definition: UpgradeDefinition, displayedLevel: number): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    const currentLevel = getUpgradeLevel(save.upgrades, definition.id);
    if (currentLevel !== displayedLevel) return { ok: false, message: 'LEVEL CHANGED • SELECT AGAIN' };
    if (currentLevel >= definition.maxLevel) return { ok: false, message: 'MAX LEVEL' };
    const cost = getUpgradeCost(definition.baseCost, definition.growth, currentLevel);
    if (!SaveSystem.spendCredits(cost, 'upgrade')) {
      return { ok: false, message: `NEED ${(cost - save.credits).toLocaleString()} MORE CREDITS` };
    }
    SaveSystem.setUpgradeLevel(definition.id, currentLevel + 1);
    AudioManager.get().playSfx('menu');
    return { ok: true, message: 'UPGRADE INSTALLED' };
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
    AudioManager.get().playSfx('menu');
    return { ok: true, message: 'ITEM UNLOCKED • EQUIPPED' };
  }

  private equipCosmetic(item: CosmeticOption): { ok: boolean; message: string } {
    const save = SaveSystem.get();
    if (!save.unlockedCosmetics.includes(item.id) && item.cost !== 0) return { ok: false, message: 'ITEM IS LOCKED' };
    SaveSystem.unlockCosmetic(item.id);
    SaveSystem.equipCosmetic(item.category, item.id);
    AudioManager.get().playSfx('menu');
    return { ok: true, message: 'COSMETIC EQUIPPED' };
  }
}
