import Phaser from 'phaser';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import { createModCardView } from '../mods/ModCardView.ts';
import type { ModCardInstance, ModCategory, ModSlot } from '../mods/types.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { createButton, disableButton } from '../utils/ui';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { rollModDrop } from '../mods/ModDropService.ts';
import { MOD_INFUSIONS } from '../mods/infusions.ts';
import { getModCopyCounts, getRecyclableUnupgradedDuplicates } from '../mods/ModInventoryService.ts';
import { showConfirmDialog, type LocalModalHandle } from '../utils/localSaveUi.ts';
import { resolveModCollectionReturnRoute, type ModCollectionReturnRequest } from '../mods/ModCollectionNavigation.ts';

type SortMode = 'acquired' | 'type' | 'rank' | 'rarity';
type FilterMode = 'all' | 'duplicates';
const CATEGORIES: Array<'all' | ModCategory> = ['all', 'weapon', 'player', 'defense', 'bombSite', 'utility'];
const SORTS: SortMode[] = ['acquired', 'type', 'rank', 'rarity'];
const FILTERS: FilterMode[] = ['all', 'duplicates'];
const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 } as const;

interface ModCollectionSceneData extends ModCollectionReturnRequest {
  selectedCardId?: string;
}

export class ModCollectionScene extends Phaser.Scene {
  private selectedCardId = '';
  private categoryIndex = 0;
  private sortIndex = 0;
  private filterIndex = 0;
  private page = 0;
  private status = '';
  private infusionModal: Phaser.GameObjects.Container | null = null;
  private bulkRecycleModal: LocalModalHandle | null = null;
  private infusionPage = 0;
  private returnScene: SceneKeyValue = SceneKeys.MainMenu;
  private resumePausedScene = false;
  private readonly handleEscape = (): void => {
    if (this.bulkRecycleModal) {
      this.bulkRecycleModal.destroy();
      this.bulkRecycleModal = null;
    } else if (this.infusionModal) this.hideInfusionModal();
    else this.returnToPreviousScene();
  };

  constructor() { super(SceneKeys.Mods); }

  create(data?: ModCollectionSceneData): void {
    const arenaCanResume = this.scene.isPaused(SceneKeys.Arena) && this.registry.has('arena-session');
    const returnRoute = resolveModCollectionReturnRoute(data, arenaCanResume);
    this.returnScene = returnRoute.returnScene;
    this.resumePausedScene = returnRoute.resumePausedScene;
    if (data?.selectedCardId) this.selectedCardId = data.selectedCardId;
    const { width, height } = this.scale;
    const mods = SaveSystem.getModCollection();
    const category = CATEGORIES[this.categoryIndex];
    const sort = SORTS[this.sortIndex];
    const filter = FILTERS[this.filterIndex];
    const copyCounts = getModCopyCounts(mods.cards);
    const cards = this.sortedCards(mods.cards.filter((card) =>
      (category === 'all' || MOD_BY_ID.get(card.modId)?.category === category)
      && (filter === 'all' || (copyCounts.get(card.modId) ?? 0) > 1)
    ), sort);
    const recyclableDuplicates = getRecyclableUnupgradedDuplicates(mods);
    const bulkPlasmaValue = recyclableDuplicates.reduce((total, card) => {
      const definition = MOD_BY_ID.get(card.modId);
      return total + (definition ? MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity] : 0);
    }, 0);
    const activeLoadout = mods.loadouts.find((loadout) => loadout.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const equippedCardIds = new Set(Object.values(activeLoadout?.cardSlots ?? {}).filter((cardId): cardId is string => typeof cardId === 'string'));
    if (!cards.some((card) => card.instanceId === this.selectedCardId)) this.selectedCardId = cards[0]?.instanceId ?? '';

    this.add.rectangle(width / 2, height / 2, width, height, 0x040811, 1);
    this.add.grid(width / 2, height / 2, width, height, 48, 48, 0x050b14, 0.2, 0x153447, 0.12);
    this.add.text(width / 2, 34, 'MOD CARD COLLECTION', { fontFamily: 'Orbitron, sans-serif', fontSize: '30px', color: '#68f7ff' }).setOrigin(0.5);
    const wallet = SaveSystem.get();
    this.add.text(width / 2, 64, `${mods.cards.length} CARDS  •  ${mods.plasmaChips.toLocaleString()} PLASMA CHIPS  •  ${wallet.coreTokens.toLocaleString()} CORE TOKENS  •  ${wallet.credits.toLocaleString()} CREDITS`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: width < 900 ? '16px' : '20px', fontStyle: 'bold', color: '#c0fff0', align: 'center'
    }).setOrigin(0.5).setWordWrapWidth(Math.max(280, width - 48), true).setMaxLines(2);

    const returnWidth = Phaser.Math.Clamp(width * 0.18, 160, 220);
    const toolbarGap = 10;
    const toolbarButtonWidth = Phaser.Math.Clamp((width - returnWidth - 76 - toolbarGap * 3) / 4, 108, 230);
    const toolbarStart = 24;
    const toolbarX = (index: number): number => toolbarStart + toolbarButtonWidth / 2 + index * (toolbarButtonWidth + toolbarGap);
    createButton(this, toolbarX(0), 104, `Group: ${category === 'all' ? 'ALL' : category.toUpperCase()}`, () => { this.categoryIndex = (this.categoryIndex + 1) % CATEGORIES.length; this.page = 0; this.restartCollection(); }, toolbarButtonWidth);
    createButton(this, toolbarX(1), 104, `Sort: ${sort.toUpperCase()}`, () => { this.sortIndex = (this.sortIndex + 1) % SORTS.length; this.page = 0; this.restartCollection(); }, toolbarButtonWidth);
    createButton(this, toolbarX(2), 104, `Filter: ${filter.toUpperCase()}`, () => { this.filterIndex = (this.filterIndex + 1) % FILTERS.length; this.page = 0; this.restartCollection(); }, toolbarButtonWidth);
    const recycleAll = createButton(this, toolbarX(3), 104, `Recycle Rank-0\n${recyclableDuplicates.length} Cards +${bulkPlasmaValue}◆`, () => this.confirmBulkRecycle(recyclableDuplicates.length, bulkPlasmaValue), toolbarButtonWidth);
    if (!recyclableDuplicates.length) disableButton(recycleAll);
    const returnLabel = this.returnScene === SceneKeys.Arena
      ? 'Back To Pause Menu'
      : this.returnScene === SceneKeys.RoundFinished
        ? 'Back To Level Complete'
        : this.returnScene === SceneKeys.Garage
          ? 'Back To Garage'
          : 'Main Menu';
    createButton(this, width - returnWidth / 2 - 16, 104, returnLabel, () => this.returnToPreviousScene(), returnWidth);

    const detailWidth = Math.min(360, width * 0.3);
    const gridLeft = 36;
    const gridRight = width - detailWidth - 42;
    const cardWidth = Phaser.Math.Clamp((gridRight - gridLeft - 48) / 4, 112, 148);
    const cardHeight = cardWidth * 1.4;
    const columns = Math.max(2, Math.floor((gridRight - gridLeft) / (cardWidth + 14)));
    const rows = Math.max(1, Math.floor((height - 230) / (cardHeight + 14)));
    const perPage = columns * rows;
    const maxPage = Math.max(0, Math.ceil(cards.length / perPage) - 1);
    this.page = Math.min(this.page, maxPage);
    cards.slice(this.page * perPage, (this.page + 1) * perPage).forEach((card, index) => {
      const x = gridLeft + cardWidth / 2 + (index % columns) * (cardWidth + 14);
      const y = 154 + cardHeight / 2 + Math.floor(index / columns) * (cardHeight + 14);
      const view = createModCardView(this, x, y, card, card.upgradeLevel, { width: cardWidth, height: cardHeight, selected: card.instanceId === this.selectedCardId, compact: true, equipped: equippedCardIds.has(card.instanceId), duplicateCount: Math.max(0, (copyCounts.get(card.modId) ?? 1) - 1) });
      view.on('pointerdown', () => { this.selectedCardId = card.instanceId; this.restartCollection(); });
    });
    if (!cards.length) this.add.text((gridLeft + gridRight) / 2, height / 2, filter === 'duplicates' ? 'NO DUPLICATE CARDS IN THIS GROUP' : 'NO COLLECTED CARDS IN THIS GROUP', { fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#607a8c' }).setOrigin(0.5);
    createButton(this, gridLeft + 70, height - 36, '◀', () => { this.page = Math.max(0, this.page - 1); this.restartCollection(); }, 90);
    this.add.text((gridLeft + gridRight) / 2, height - 36, `PAGE ${this.page + 1} / ${maxPage + 1}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#a8c8d9' }).setOrigin(0.5);
    createButton(this, gridRight - 70, height - 36, '▶', () => { this.page = Math.min(maxPage, this.page + 1); this.restartCollection(); }, 90);

    const selected = mods.cards.find((card) => card.instanceId === this.selectedCardId);
    this.createDetails(width - detailWidth / 2 - 20, 145, detailWidth, height - 180, selected, selected ? equippedCardIds.has(selected.instanceId) : false, selected ? Math.max(0, (copyCounts.get(selected.modId) ?? 1) - 1) : 0);
    this.input.keyboard?.off('keydown-ESC', this.handleEscape);
    this.input.keyboard?.on('keydown-ESC', this.handleEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-ESC', this.handleEscape));
    if (import.meta.env.DEV) this.installDevKeys();
  }

  private createDetails(x: number, y: number, width: number, height: number, card?: ModCardInstance, equipped = false, duplicateCount = 0): void {
    this.add.rectangle(x, y + height / 2, width, height, 0x08131f, 0.96).setStrokeStyle(2, 0x50dfff, 0.65);
    if (!card) {
      this.add.text(x, y + 80, 'SELECT A COLLECTED CARD', { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#7895a8' }).setOrigin(0.5);
      return;
    }
    const definition = MOD_BY_ID.get(card.modId)!;
    const owned = SaveSystem.getModCollection().inventory[card.modId];
    const detailCardWidth = Math.min(210, width - 56);
    const detailCardHeight = detailCardWidth * 1.4;
    const detailCardCenterY = y + 14 + detailCardHeight / 2;
    createModCardView(this, x, detailCardCenterY, card, card.upgradeLevel, {
      width: detailCardWidth,
      height: detailCardHeight,
      compact: false,
      interactive: false,
      equipped,
      duplicateCount
    });
    const corruptedText = definition.variant === 'corrupted' ? `\n+ ${definition.positiveEffect}\n− ${definition.negativeEffect}` : '';
    const detailCopy = this.add.text(x, y + 30 + detailCardHeight, `${definition.category.toUpperCase()} • ${definition.rarity.toUpperCase()}\n${definition.description}${corruptedText}\nUPGRADES ${card.upgradeLevel}/3 • ${owned.duplicates} DUPLICATES`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#e8f8ff', align: 'center', lineSpacing: 2
    }).setOrigin(0.5, 0).setWordWrapWidth(width - 34, true);
    const categorySlot = definition.category === 'utility' ? null : definition.category as ModSlot;
    const buttonGap = 48;
    const buttonY = y + height - 240;
    const availableDetailCopyHeight = Math.max(72, buttonY - detailCopy.y - 14);
    for (let fontSize = 16; detailCopy.height > availableDetailCopyHeight && fontSize >= 14; fontSize -= 1) {
      detailCopy.setFontSize(fontSize);
    }
    if (detailCopy.height > availableDetailCopyHeight) {
      detailCopy.setMaxLines(Math.max(4, Math.floor(availableDetailCopyHeight / 17)));
    }
    if (categorySlot) createButton(this, x, buttonY, `Equip ${categorySlot}`, () => this.apply(() => SaveSystem.equipMod(categorySlot, definition.id, card.instanceId)), width - 40);
    createButton(this, x, buttonY + buttonGap, 'Equip Wildcard', () => this.apply(() => SaveSystem.equipMod('wildcard', definition.id, card.instanceId)), width - 40);
    const nextUpgrade = card.upgradeLevel < 3 ? (card.upgradeLevel + 1) as 1 | 2 | 3 : null;
    const coreTokenCost = nextUpgrade ? MOD_BALANCE.rankCoreTokenCostsByRarity[definition.rarity][nextUpgrade] : 0;
    const upgradeLabel = nextUpgrade
      ? `Upgrade — ${MOD_BALANCE.rankCreditCosts[nextUpgrade].toLocaleString()} Credits${coreTokenCost > 0 ? `\n+ ${coreTokenCost.toLocaleString()} Core Tokens` : ''}`
      : 'Upgrade Card — MAX LEVEL';
    const upgradeButton = createButton(this, x, buttonY + buttonGap * 2, upgradeLabel, () => {
      if (nextUpgrade) this.apply(() => SaveSystem.rankUpMod(definition.id, card.instanceId));
    }, width - 40);
    if (!nextUpgrade) disableButton(upgradeButton);
    const sell = MOD_BALANCE.duplicateCreditValueByRarity[definition.rarity];
    const chips = MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity];
    const actionRowWidth = width - 40;
    const actionGap = 8;
    const actionButtonWidth = (actionRowWidth - actionGap * 2) / 3;
    const actionLeft = x - actionRowWidth / 2;
    const actionY = buttonY + buttonGap * 3;
    createButton(this, actionLeft + actionButtonWidth / 2, actionY, `Sell +${sell}C`, () => this.apply(() => SaveSystem.sellDuplicateMod(card.instanceId)), actionButtonWidth);
    createButton(this, actionLeft + actionButtonWidth * 1.5 + actionGap, actionY, `Recycle +${chips}◆`, () => this.apply(() => SaveSystem.recycleDuplicateMod(card.instanceId)), actionButtonWidth);
    createButton(this, actionLeft + actionButtonWidth * 2.5 + actionGap * 2, actionY, 'Delete', () => this.apply(() => SaveSystem.deleteModCard(card.instanceId)), actionButtonWidth);
    createButton(this, x, buttonY + buttonGap * 4, card.infusionId ? 'Change Infusion' : 'Infuse Card', () => this.showInfusionModal(card), width - 40);
    const statusText = this.add.text(x, y + height - 4, this.status, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: this.status.startsWith('Blocked') ? '#ff9bad' : '#9dffbf', align: 'center', lineSpacing: -2
    }).setOrigin(0.5, 1).setWordWrapWidth(width - 32, true).setMaxLines(2);
    if (this.status) this.time.delayedCall(2200, () => { this.status = ''; if (statusText.active) statusText.setText(''); });
  }

  private confirmBulkRecycle(cardCount: number, plasmaChips: number): void {
    if (cardCount <= 0) return;
    this.bulkRecycleModal?.destroy();
    this.bulkRecycleModal = showConfirmDialog(
      this,
      'RECYCLE ALL UNUPGRADED DUPLICATES',
      `Recycle ${cardCount} rank-0 duplicate card${cardCount === 1 ? '' : 's'} into ${plasmaChips} Plasma Chip${plasmaChips === 1 ? '' : 's'}?\n\nOne copy of every Mod will be kept, and cards with upgrade levels are never recycled. Rank-0 infused cards can be recycled because infusions are cosmetic rather than upgrades.`,
      'Recycle All',
      () => {
        this.bulkRecycleModal = null;
        this.apply(() => SaveSystem.recycleAllUnupgradedDuplicates());
      },
      'Cancel',
      () => { this.bulkRecycleModal = null; }
    );
  }

  private showInfusionModal(card: ModCardInstance, preservePage = false): void {
    if (!preservePage) this.infusionPage = 0;
    this.hideInfusionModal();
    const { width, height } = this.scale;
    const root = this.add.container(0, 0).setDepth(6000);
    const blocker = this.add.rectangle(width / 2, height / 2, width, height, 0x02050b, 0.88).setInteractive();
    const panelWidth = Math.min(900, width - 16);
    const panelHeight = Math.min(680, height - 16);
    const panelLeft = width / 2 - panelWidth / 2;
    const panelRight = width / 2 + panelWidth / 2;
    const panelTop = height / 2 - panelHeight / 2;
    const panelBottom = height / 2 + panelHeight / 2;
    root.add([blocker, this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x091522, 0.99).setStrokeStyle(3, 0x55e9ff, 0.95)]);
    root.add(this.add.text(width / 2, panelTop + 36, 'SELECT COSMETIC INFUSION', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.round(Phaser.Math.Clamp(panelWidth * 0.034, 22, 28))}px`, color: '#69f5ff'
    }).setOrigin(0.5));
    root.add(this.add.text(width / 2, panelTop + 72, `Available Plasma Chips: ${SaveSystem.getModCollection().plasmaChips}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#a7ffe8'
    }).setOrigin(0.5));
    root.add(this.add.text(width / 2, panelTop + 98, 'Infusions are optional visual and game-feel effects. They never alter combat, health, energy, abilities, rewards, or difficulty.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: panelWidth < 620 ? '14px' : '15px', color: '#b4cddd', align: 'center', lineSpacing: 1
    }).setOrigin(0.5, 0).setWordWrapWidth(panelWidth - 72, true).setMaxLines(2));

    const infusionsPerPage = panelHeight >= 560 ? 3 : panelHeight >= 440 ? 2 : 1;
    const pageCount = Math.max(1, Math.ceil(MOD_INFUSIONS.length / infusionsPerPage));
    this.infusionPage = Phaser.Math.Clamp(this.infusionPage, 0, pageCount - 1);
    const visibleInfusions = MOD_INFUSIONS.slice(this.infusionPage * infusionsPerPage, (this.infusionPage + 1) * infusionsPerPage);
    const pageY = panelBottom - 92;
    const closeY = panelBottom - 32;
    const rowsTop = panelTop + 146;
    const rowsBottom = pageY - 34;
    const rowSlotHeight = (rowsBottom - rowsTop) / visibleInfusions.length;
    const rowHeight = Phaser.Math.Clamp(rowSlotHeight - 10, 88, 112);
    const installWidth = Phaser.Math.Clamp(panelWidth * 0.24, 150, 190);
    const installX = panelRight - 26 - installWidth / 2;
    const copyX = panelLeft + 92;
    const copyWidth = Math.max(150, installX - installWidth / 2 - copyX - 18);
    visibleInfusions.forEach((infusion, index) => {
      const rowY = rowsTop + rowSlotHeight * (index + 0.5);
      const installed = card.infusionId === infusion.id;
      const affordable = SaveSystem.getModCollection().plasmaChips >= infusion.plasmaCost;
      root.add(this.add.rectangle(width / 2, rowY, panelWidth - 44, rowHeight, installed ? 0x103329 : 0x0c1a29, 0.95).setStrokeStyle(installed ? 3 : 1, installed ? 0x62ffae : 0x4bbfdb, installed ? 1 : 0.65));
      root.add(this.add.text(panelLeft + 52, rowY, infusion.icon, { fontFamily: 'Orbitron, sans-serif', fontSize: '34px', color: '#8ff7ff' }).setOrigin(0.5));
      root.add(this.add.text(copyX, rowY - 30, infusion.name.toUpperCase(), { fontFamily: 'Orbitron, sans-serif', fontSize: '17px', color: installed ? '#7dffb4' : '#e5fbff' }).setOrigin(0, 0.5));
      root.add(this.add.text(copyX, rowY - 15, infusion.description, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#c0d9e7', lineSpacing: 0
      }).setOrigin(0, 0).setWordWrapWidth(copyWidth, true).setMaxLines(2));
      root.add(this.add.text(copyX, rowY + rowHeight / 2 - 15, installed ? 'INSTALLED' : `${infusion.plasmaCost} PLASMA CHIPS`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontStyle: 'bold', color: installed ? '#70ffad' : affordable ? '#ffd98a' : '#ff91a4' }).setOrigin(0, 0.5));
      const install = createButton(this, installX, rowY, installed ? 'Installed' : affordable ? 'Install' : 'Not Enough Chips', () => {
        if (!installed) this.apply(() => SaveSystem.infuseModCard(card.instanceId, infusion.id));
      }, installWidth);
      if (installed || !affordable) disableButton(install);
      root.add(install);
    });

    const previousPage = createButton(this, width / 2 - 132, pageY, '◀', () => {
      this.infusionPage -= 1;
      this.showInfusionModal(card, true);
    }, 82);
    const nextPage = createButton(this, width / 2 + 132, pageY, '▶', () => {
      this.infusionPage += 1;
      this.showInfusionModal(card, true);
    }, 82);
    if (this.infusionPage === 0) disableButton(previousPage);
    if (this.infusionPage >= pageCount - 1) disableButton(nextPage);
    root.add([
      previousPage,
      this.add.text(width / 2, pageY, `PAGE ${this.infusionPage + 1} / ${pageCount}`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#bdeeff'
      }).setOrigin(0.5),
      nextPage
    ]);
    root.add(createButton(this, width / 2, closeY, 'Close', () => this.hideInfusionModal(), 220));
    this.infusionModal = root;
  }

  private hideInfusionModal(): void {
    this.infusionModal?.destroy(true);
    this.infusionModal = null;
  }

  private sortedCards(cards: ModCardInstance[], sort: SortMode): ModCardInstance[] {
    return [...cards].sort((a, b) => {
      const ad = MOD_BY_ID.get(a.modId)!; const bd = MOD_BY_ID.get(b.modId)!;
      if (sort === 'type') return ad.category.localeCompare(bd.category) || ad.name.localeCompare(bd.name);
      if (sort === 'rank') return b.upgradeLevel - a.upgradeLevel;
      if (sort === 'rarity') return RARITY_ORDER[bd.rarity] - RARITY_ORDER[ad.rarity];
      return b.acquiredAt.localeCompare(a.acquiredAt);
    });
  }

  private apply(operation: () => { ok: boolean; message?: string }): void { const result = operation(); this.status = `${result.ok ? 'Success' : 'Blocked'}: ${result.message ?? ''}`; this.restartCollection(); }

  private restartCollection(): void {
    this.scene.restart({ returnScene: this.returnScene, resumePausedScene: this.resumePausedScene });
  }

  private returnToPreviousScene(): void {
    if (this.returnScene === SceneKeys.Arena && this.resumePausedScene) {
      const arenaCanResume = this.scene.isPaused(SceneKeys.Arena) && this.registry.has('arena-session');
      if (!arenaCanResume) {
        this.returnScene = SceneKeys.MainMenu;
        this.resumePausedScene = false;
        this.scene.start(SceneKeys.MainMenu);
        return;
      }
      const returnTarget = this.scene.get(this.returnScene);
      this.scene.resume(this.returnScene);
      returnTarget.events.emit('return-from-mod-collection');
      this.scene.stop();
      return;
    }
    this.scene.start(this.returnScene);
  }

  private installDevKeys(): void {
    this.input.keyboard?.once('keydown-G', () => { SaveSystem.addMod(MOD_DEFINITIONS.find((mod) => mod.id === (MOD_BY_ID.get(SaveSystem.getModCollection().cards.find((card) => card.instanceId === this.selectedCardId)?.modId ?? '')?.id))?.id ?? MOD_DEFINITIONS[0].id); this.restartCollection(); });
    this.input.keyboard?.once('keydown-X', () => { const mods = SaveSystem.getModCollection(); mods.inventory = {}; mods.cards = []; mods.plasmaChips = 0; mods.loadouts[0].slots = { weapon: null, player: null, defense: null, bombSite: null, wildcard: null }; mods.loadouts[0].cardSlots = { weapon: null, player: null, defense: null, bombSite: null, wildcard: null }; SaveSystem.persist(); this.restartCollection(); });
    this.input.keyboard?.once('keydown-T', () => { MOD_DEFINITIONS.forEach((mod) => { SaveSystem.addMod(mod.id); SaveSystem.addMod(mod.id); }); this.restartCollection(); });
    this.input.keyboard?.once('keydown-M', () => { const drop = rollModDrop({ source: 'milestone', round: 20, seed: Date.now(), sequence: 0, protocol: 'normal', guaranteed: true }); if (drop) SaveSystem.addMod(drop.id); this.restartCollection(); });
    this.input.keyboard?.once('keydown-I', () => console.info('[MOD RUNTIME]', new ModRuntime(SaveSystem.getModCollection()).snapshot(), SaveSystem.getModCollection()));
  }
}
