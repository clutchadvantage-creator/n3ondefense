import Phaser from 'phaser';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import { createModCardView } from '../mods/ModCardView.ts';
import type { ModCardInstance, ModCategory, ModSlot } from '../mods/types.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { disableButton } from '../utils/ui';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { rollModDrop } from '../mods/ModDropService.ts';
import { MOD_INFUSIONS } from '../mods/infusions.ts';
import { getModCopyCounts, getRecyclableUnupgradedDuplicates } from '../mods/ModInventoryService.ts';
import { showConfirmDialog, type LocalModalHandle } from '../utils/localSaveUi.ts';
import { resolveModCollectionReturnRoute, type ModCollectionReturnRequest } from '../mods/ModCollectionNavigation.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import {
  createModCollectionButton,
  createModCollectionFrame,
  createModCollectionShell,
  getModCollectionChromeLayout
} from '../ui/ModCollectionUi.ts';
import { TutorialDirector } from '../tutorial/TutorialDirector.ts';
import { TutorialEventBus } from '../tutorial/TutorialEventBus.ts';
import { projectTutorialBoundsToViewport } from '../tutorial/TutorialTargeting.ts';

type SortMode = 'acquired' | 'type' | 'rank' | 'rarity';
type FilterMode = 'all' | 'duplicates';
const CATEGORIES: Array<'all' | ModCategory> = ['all', 'weapon', 'player', 'defense', 'bombSite', 'utility'];
const SORTS: SortMode[] = ['acquired', 'type', 'rank', 'rarity'];
const FILTERS: FilterMode[] = ['all', 'duplicates'];
const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 } as const;

interface ModCollectionSceneData extends ModCollectionReturnRequest {
  selectedCardId?: string;
  initialCategory?: 'all' | ModCategory;
  currencyDeltas?: CurrencyDeltas;
}

interface CurrencySnapshot {
  credits: number;
  coreTokens: number;
  plasmaChips: number;
  fluxCores: number;
}

type CurrencyDeltas = Partial<Record<keyof CurrencySnapshot, number>>;

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
  private tutorialDirector: TutorialDirector | null = null;
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
    if (data?.initialCategory && CATEGORIES.includes(data.initialCategory)) {
      this.categoryIndex = CATEGORIES.indexOf(data.initialCategory);
      this.filterIndex = 0;
      this.page = 0;
    }
    const { width, height } = this.scale;
    const mods = SaveSystem.getModCollection();
    const category = CATEGORIES[this.categoryIndex];
    const sort = SORTS[this.sortIndex];
    const filter = FILTERS[this.filterIndex];
    const copyCounts = getModCopyCounts(mods.cards);
    const recyclableDuplicates = getRecyclableUnupgradedDuplicates(mods);
    const recyclableDuplicateIds = new Set(recyclableDuplicates.map((card) => card.instanceId));
    const cards = this.sortedCards(mods.cards.filter((card) =>
      (category === 'all' || MOD_BY_ID.get(card.modId)?.category === category)
      && (filter === 'all' || recyclableDuplicateIds.has(card.instanceId))
    ), sort);
    const bulkPlasmaValue = recyclableDuplicates.reduce((total, card) => {
      const definition = MOD_BY_ID.get(card.modId);
      return total + (definition ? MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity] : 0);
    }, 0);
    const activeLoadout = mods.loadouts.find((loadout) => loadout.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const equippedCardIds = new Set(Object.values(activeLoadout?.cardSlots ?? {}).filter((cardId): cardId is string => typeof cardId === 'string'));
    if (!cards.some((card) => card.instanceId === this.selectedCardId)) this.selectedCardId = cards[0]?.instanceId ?? '';

    const wallet = SaveSystem.get();
    createModCollectionShell(this, width, height, [
      { label: 'OWNED CARDS', value: mods.cards.length.toLocaleString(), color: 0x62efff },
      { label: 'PLASMA CHIPS', value: mods.plasmaChips.toLocaleString(), color: 0xc877ff, delta: data?.currencyDeltas?.plasmaChips },
      { label: 'CORE TOKENS', value: wallet.coreTokens.toLocaleString(), color: 0xffc86b, delta: data?.currencyDeltas?.coreTokens },
      { label: 'FLUX CORES', value: wallet.fluxCores.toLocaleString(), color: 0x69ff9c, delta: data?.currencyDeltas?.fluxCores },
      { label: 'CREDITS', value: wallet.credits.toLocaleString(), color: 0xffed67, delta: data?.currencyDeltas?.credits }
    ]);

    const chromeLayout = getModCollectionChromeLayout(width, height);
    const { compact, toolbarTop, toolbarHeight, toolbarButtonY, toolbarButtonHeight, contentTop, returnInset } = chromeLayout;
    const narrow = width < 800;
    const returnWidth = narrow ? 120 : Phaser.Math.Clamp(width * 0.18, 160, 220);
    const toolbarGap = narrow ? 8 : 12;
    const toolbarStart = narrow ? 18 : 24;
    const toolbarAvailableWidth = width - returnWidth - toolbarStart - returnInset * 2 - 8;
    const toolbarButtonWidth = Phaser.Math.Clamp((toolbarAvailableWidth - toolbarGap * 3) / 4, narrow ? 80 : 108, 230);
    const toolbarX = (index: number): number => toolbarStart + toolbarButtonWidth / 2 + index * (toolbarButtonWidth + toolbarGap);
    createModCollectionFrame(this, { x: 20, y: toolbarTop, width: width - 40, height: toolbarHeight }, 'COLLECTION CONTROLS // FILTER · SORT · SALVAGE', 0x55eaff);
    createModCollectionButton(this, toolbarX(0), toolbarButtonY, `Group: ${category === 'all' ? 'ALL' : category.toUpperCase()}`, () => { this.categoryIndex = (this.categoryIndex + 1) % CATEGORIES.length; this.page = 0; this.restartCollection(); }, toolbarButtonWidth, 'standard', { height: toolbarButtonHeight });
    createModCollectionButton(this, toolbarX(1), toolbarButtonY, `Sort: ${sort.toUpperCase()}`, () => { this.sortIndex = (this.sortIndex + 1) % SORTS.length; this.page = 0; this.restartCollection(); }, toolbarButtonWidth, 'standard', { height: toolbarButtonHeight });
    createModCollectionButton(this, toolbarX(2), toolbarButtonY, `Filter: ${filter.toUpperCase()}`, () => { this.filterIndex = (this.filterIndex + 1) % FILTERS.length; this.page = 0; this.restartCollection(); }, toolbarButtonWidth, 'standard', { height: toolbarButtonHeight });
    const recycleAll = createModCollectionButton(this, toolbarX(3), toolbarButtonY, `Recycle Rank-0\n${recyclableDuplicates.length} Cards +${bulkPlasmaValue}◆`, () => this.confirmBulkRecycle(recyclableDuplicates.length, bulkPlasmaValue), toolbarButtonWidth, 'warning', { height: toolbarButtonHeight, fontSize: compact ? 12 : 14 });
    if (!recyclableDuplicates.length) disableButton(recycleAll);
    const returnLabel = this.returnScene === SceneKeys.Arena
      ? 'Back To Pause Menu'
      : this.returnScene === SceneKeys.RoundFinished
        ? 'Back To Level Complete'
        : this.returnScene === SceneKeys.Garage
          ? 'Back To Garage'
          : 'Main Menu';
    createModCollectionButton(this, width - returnWidth / 2 - returnInset, toolbarButtonY, returnLabel, () => this.returnToPreviousScene(), returnWidth, 'return', { height: toolbarButtonHeight, fontSize: narrow ? 11 : 16 });

    const detailWidth = Math.min(390, width * 0.3);
    const gridLeft = 34;
    const gridRight = width - detailWidth - 46;
    const cardWidth = Phaser.Math.Clamp((gridRight - gridLeft - 48) / 4, 112, 148);
    const cardHeight = cardWidth * 1.4;
    const columns = Math.max(2, Math.floor((gridRight - gridLeft) / (cardWidth + 14)));
    const rows = Math.max(1, Math.floor((height - contentTop - 80) / (cardHeight + 14)));
    const perPage = columns * rows;
    const maxPage = Math.max(0, Math.ceil(cards.length / perPage) - 1);
    this.page = Math.min(this.page, maxPage);
    createModCollectionFrame(this, {
      x: 20,
      y: contentTop,
      width: gridRight - 4,
      height: height - contentTop - 16
    }, `OWNED MOD ARCHIVE // ${cards.length} MATCHING CARDS`, 0x55eaff);
    cards.slice(this.page * perPage, (this.page + 1) * perPage).forEach((card, index) => {
      const x = gridLeft + cardWidth / 2 + (index % columns) * (cardWidth + 14);
      const y = contentTop + 40 + cardHeight / 2 + Math.floor(index / columns) * (cardHeight + 14);
      const view = createModCardView(this, x, y, card, card.upgradeLevel, { width: cardWidth, height: cardHeight, selected: card.instanceId === this.selectedCardId, compact: true, equipped: equippedCardIds.has(card.instanceId), duplicateCount: Math.max(0, (copyCounts.get(card.modId) ?? 1) - 1) });
      view.on('pointerdown', () => {
        AudioManager.get().playSfx('menu');
        this.selectedCardId = card.instanceId;
        this.restartCollection();
      });
    });
    if (!cards.length) this.add.text((gridLeft + gridRight) / 2, height / 2, filter === 'duplicates' ? 'NO DUPLICATE CARDS IN THIS GROUP' : 'NO COLLECTED CARDS IN THIS GROUP', { fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#607a8c' }).setOrigin(0.5);
    createModCollectionButton(this, gridLeft + 70, height - 36, '◀', () => { this.page = Math.max(0, this.page - 1); this.restartCollection(); }, 90, 'standard', { height: 34 });
    this.add.text((gridLeft + gridRight) / 2, height - 36, `PAGE ${this.page + 1} / ${maxPage + 1}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#a8c8d9' }).setOrigin(0.5);
    createModCollectionButton(this, gridRight - 70, height - 36, '▶', () => { this.page = Math.min(maxPage, this.page + 1); this.restartCollection(); }, 90, 'standard', { height: 34 });

    const selected = mods.cards.find((card) => card.instanceId === this.selectedCardId);
    this.createDetails(width - detailWidth / 2 - 20, contentTop, detailWidth, height - contentTop - 16, selected, selected ? equippedCardIds.has(selected.instanceId) : false, selected ? Math.max(0, (copyCounts.get(selected.modId) ?? 1) - 1) : 0);
    this.tutorialDirector = new TutorialDirector({
      scene: 'mods',
      resolveTarget: (target) => {
        const rect = target === 'mods.archive'
          ? { x: 20, y: contentTop, width: gridRight - 4, height: height - contentTop - 16 }
          : target === 'mods.details'
            ? { x: width - detailWidth - 40, y: contentTop, width: detailWidth, height: height - contentTop - 16 }
            : null;
        if (!rect) return null;
        const canvas = this.game.canvas.getBoundingClientRect();
        return projectTutorialBoundsToViewport(rect, canvas, this.scale.width, this.scale.height);
      },
      setMode: () => undefined
    });
    window.setTimeout(() => {
      if (this.scene.isActive() && SaveSystem.getModCollection().cards.length > 0) TutorialEventBus.emit('ui.modCollectionOpened');
    }, 160);
    this.input.keyboard?.off('keydown-ESC', this.handleEscape);
    this.input.keyboard?.on('keydown-ESC', this.handleEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.handleEscape);
      this.tutorialDirector?.destroy();
      this.tutorialDirector = null;
    });
    if (import.meta.env.DEV) this.installDevKeys();
  }

  private createDetails(x: number, y: number, width: number, height: number, card?: ModCardInstance, equipped = false, duplicateCount = 0): void {
    const selectedDefinition = card ? MOD_BY_ID.get(card.modId) : undefined;
    createModCollectionFrame(this, { x: x - width / 2, y, width, height }, selectedDefinition ? `SELECTED MODULE // ${selectedDefinition.name.toUpperCase()}` : 'SELECTED MODULE // NO SIGNAL', selectedDefinition?.variant === 'corrupted' ? 0xff4fc8 : 0xff65c8);
    if (!card) {
      this.add.text(x, y + 80, 'SELECT A COLLECTED CARD', { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#7895a8' }).setOrigin(0.5);
      return;
    }
    const definition = selectedDefinition!;
    const owned = SaveSystem.getModCollection().inventory[card.modId];
    const compactDetails = height < 520;
    const detailCardWidth = Math.min(220, width - 56, Phaser.Math.Clamp((height - (compactDetails ? 320 : 360)) / 1.4, compactDetails ? 118 : 145, 220));
    const detailCardHeight = detailCardWidth * 1.4;
    const detailCardCenterY = y + 42 + detailCardHeight / 2;
    createModCardView(this, x, detailCardCenterY, card, card.upgradeLevel, {
      width: detailCardWidth,
      height: detailCardHeight,
      compact: false,
      interactive: false,
      equipped,
      duplicateCount
    });
    const corruptedText = definition.variant === 'corrupted' ? `\n+ ${definition.positiveEffect}\n− ${definition.negativeEffect}` : '';
    const detailCopy = this.add.text(x, y + 52 + detailCardHeight, `${definition.category.toUpperCase()} • ${definition.rarity.toUpperCase()}\n${definition.description}${corruptedText}\nUPGRADES ${card.upgradeLevel}/3 • ${owned.duplicates} DUPLICATES`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#e8f8ff', align: 'center', lineSpacing: 2
    }).setOrigin(0.5, 0).setWordWrapWidth(width - 34, true);
    const categorySlot = definition.category === 'utility' ? null : definition.category as ModSlot;
    const buttonGap = compactDetails ? 38 : height < 650 ? 43 : 48;
    const buttonHeight = compactDetails ? 32 : 38;
    const buttonY = y + height - buttonGap * 4 - (compactDetails ? 50 : 58);
    const availableDetailCopyHeight = Math.max(compactDetails ? 34 : 48, buttonY - detailCopy.y - 14);
    for (let fontSize = 16; detailCopy.height > availableDetailCopyHeight && fontSize >= 14; fontSize -= 1) {
      detailCopy.setFontSize(fontSize);
    }
    if (detailCopy.height > availableDetailCopyHeight) {
      detailCopy.setMaxLines(Math.max(height < 650 ? 2 : 4, Math.floor(availableDetailCopyHeight / 17)));
    }
    if (categorySlot) createModCollectionButton(this, x, buttonY, `Equip ${categorySlot}`, () => this.applyWithTutorialEvent('mods.equipped', () => SaveSystem.equipMod(categorySlot, definition.id, card.instanceId)), width - 40, 'standard', { height: buttonHeight, fontSize: compactDetails ? 12 : 16 });
    createModCollectionButton(this, x, buttonY + buttonGap, 'Equip Wildcard', () => this.applyWithTutorialEvent('mods.equipped', () => SaveSystem.equipMod('wildcard', definition.id, card.instanceId)), width - 40, 'standard', { height: buttonHeight, fontSize: compactDetails ? 12 : 16 });
    const nextUpgrade = card.upgradeLevel < 3 ? (card.upgradeLevel + 1) as 1 | 2 | 3 : null;
    const coreTokenCost = nextUpgrade ? MOD_BALANCE.rankCoreTokenCostsByRarity[definition.rarity][nextUpgrade] : 0;
    const upgradeLabel = nextUpgrade
      ? `Upgrade — ${MOD_BALANCE.rankCreditCosts[nextUpgrade].toLocaleString()} Credits${coreTokenCost > 0 ? `\n+ ${coreTokenCost.toLocaleString()} Core Tokens` : ''}`
      : 'Upgrade Card — MAX LEVEL';
    const upgradeButton = createModCollectionButton(this, x, buttonY + buttonGap * 2, upgradeLabel, () => {
      return nextUpgrade ? this.apply(() => SaveSystem.rankUpMod(definition.id, card.instanceId)) : false;
    }, width - 40, 'utility', { height: buttonHeight, fontSize: compactDetails ? 11 : 14 });
    if (!nextUpgrade) disableButton(upgradeButton);
    const sell = MOD_BALANCE.duplicateCreditValueByRarity[definition.rarity];
    const chips = MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity];
    const actionRowWidth = width - 40;
    const actionGap = 8;
    const actionButtonWidth = (actionRowWidth - actionGap * 2) / 3;
    const actionLeft = x - actionRowWidth / 2;
    const actionY = buttonY + buttonGap * 3;
    createModCollectionButton(this, actionLeft + actionButtonWidth / 2, actionY, `Sell +${sell}C`, () => this.apply(() => SaveSystem.sellDuplicateMod(card.instanceId)), actionButtonWidth, 'warning', { height: buttonHeight, fontSize: compactDetails ? 10 : 13 });
    createModCollectionButton(this, actionLeft + actionButtonWidth * 1.5 + actionGap, actionY, `Recycle +${chips}◆`, () => this.apply(() => SaveSystem.recycleDuplicateMod(card.instanceId)), actionButtonWidth, 'warning', { height: buttonHeight, fontSize: compactDetails ? 9 : 12 });
    createModCollectionButton(this, actionLeft + actionButtonWidth * 2.5 + actionGap * 2, actionY, 'Delete', () => this.apply(() => SaveSystem.deleteModCard(card.instanceId)), actionButtonWidth, 'warning', { height: buttonHeight, fontSize: compactDetails ? 10 : 13 });
    createModCollectionButton(this, x, buttonY + buttonGap * 4, card.infusionId ? 'Change Infusion' : 'Infuse Card', () => this.showInfusionModal(card), width - 40, 'utility', { height: buttonHeight, fontSize: compactDetails ? 12 : 16 });
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
    const panelPoints = [
      18, 0, panelWidth - 18, 0, panelWidth, 18, panelWidth, panelHeight - 18,
      panelWidth - 18, panelHeight, 18, panelHeight, 0, panelHeight - 18, 0, 18
    ];
    const panelShadow = this.add.polygon(width / 2 + 7, height / 2 + 8, panelPoints, 0x000000, 0.64);
    const panelChassis = this.add.polygon(width / 2, height / 2, panelPoints, 0x07111b, 0.995).setStrokeStyle(2, 0x55eaff, 0.82);
    const panelGlass = this.add.rectangle(width / 2, height / 2, panelWidth - 24, panelHeight - 24, 0x081925, 0.82).setStrokeStyle(1, 0xff65c8, 0.22);
    const headerBand = this.add.rectangle(width / 2, panelTop + 24, panelWidth - 34, 38, 0x0c2330, 0.96).setStrokeStyle(1, 0x55eaff, 0.28);
    const topRail = this.add.rectangle(width / 2, panelTop + 6, panelWidth - 52, 4, 0xff65c8, 0.68);
    const leftRail = this.add.rectangle(panelLeft + 8, height / 2, 3, panelHeight - 52, 0xff65c8, 0.5);
    const rightRail = this.add.rectangle(panelRight - 8, height / 2, 3, panelHeight - 52, 0x55eaff, 0.44);
    root.add([blocker, panelShadow, panelChassis, panelGlass, headerBand, topRail, leftRail, rightRail]);
    root.add(this.add.text(panelLeft + 26, panelTop + 14, 'INFUSION TERMINAL // COSMETIC CHANNEL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#7dcbd7', letterSpacing: 1
    }).setOrigin(0, 0));
    root.add(this.add.text(width / 2, panelTop + 50, 'SELECT COSMETIC INFUSION', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.round(Phaser.Math.Clamp(panelWidth * 0.034, 22, 28))}px`, color: '#69f5ff'
    }).setOrigin(0.5));
    root.add(this.add.text(width / 2, panelTop + 82, `Available Plasma Chips: ${SaveSystem.getModCollection().plasmaChips}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#a7ffe8'
    }).setOrigin(0.5));
    root.add(this.add.text(width / 2, panelTop + 108, 'Infusions are optional visual and game-feel effects. They never alter combat, health, energy, abilities, rewards, or difficulty.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: panelWidth < 620 ? '14px' : '15px', color: '#b4cddd', align: 'center', lineSpacing: 1
    }).setOrigin(0.5, 0).setWordWrapWidth(panelWidth - 72, true).setMaxLines(2));

    const infusionsPerPage = panelHeight >= 560 ? 3 : panelHeight >= 440 ? 2 : 1;
    const pageCount = Math.max(1, Math.ceil(MOD_INFUSIONS.length / infusionsPerPage));
    this.infusionPage = Phaser.Math.Clamp(this.infusionPage, 0, pageCount - 1);
    const visibleInfusions = MOD_INFUSIONS.slice(this.infusionPage * infusionsPerPage, (this.infusionPage + 1) * infusionsPerPage);
    const pageY = panelBottom - 92;
    const closeY = panelBottom - 32;
    const rowsTop = panelTop + (panelHeight < 500 ? 142 : 156);
    const rowsBottom = pageY - 34;
    const rowSlotHeight = (rowsBottom - rowsTop) / visibleInfusions.length;
    const rowHeight = Phaser.Math.Clamp(rowSlotHeight - 10, panelHeight < 500 ? 74 : 88, 112);
    const installWidth = Phaser.Math.Clamp(panelWidth * 0.24, 150, 190);
    const installX = panelRight - 26 - installWidth / 2;
    const copyX = panelLeft + 92;
    const copyWidth = Math.max(150, installX - installWidth / 2 - copyX - 18);
    visibleInfusions.forEach((infusion, index) => {
      const rowY = rowsTop + rowSlotHeight * (index + 0.5);
      const installed = card.infusionId === infusion.id;
      const affordable = SaveSystem.getModCollection().plasmaChips >= infusion.plasmaCost;
      const rowAccent = installed ? 0x62ffae : 0x4bbfdb;
      root.add(this.add.rectangle(width / 2, rowY, panelWidth - 44, rowHeight, installed ? 0x103329 : 0x0c1a29, 0.95).setStrokeStyle(installed ? 2 : 1, rowAccent, installed ? 1 : 0.65));
      root.add(this.add.rectangle(width / 2, rowY - rowHeight / 2 + 4, panelWidth - 64, 2, rowAccent, installed ? 0.72 : 0.34));
      root.add(this.add.circle(panelLeft + 28, rowY, 3, rowAccent, 0.9));
      root.add(this.add.text(panelLeft + 52, rowY, infusion.icon, { fontFamily: 'Orbitron, sans-serif', fontSize: '34px', color: '#8ff7ff' }).setOrigin(0.5));
      root.add(this.add.text(copyX, rowY - 30, infusion.name.toUpperCase(), { fontFamily: 'Orbitron, sans-serif', fontSize: '17px', color: installed ? '#7dffb4' : '#e5fbff' }).setOrigin(0, 0.5));
      root.add(this.add.text(copyX, rowY - 15, infusion.description, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#c0d9e7', lineSpacing: 0
      }).setOrigin(0, 0).setWordWrapWidth(copyWidth, true).setMaxLines(2));
      root.add(this.add.text(copyX, rowY + rowHeight / 2 - 15, installed ? 'INSTALLED' : `${infusion.plasmaCost} PLASMA CHIPS`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontStyle: 'bold', color: installed ? '#70ffad' : affordable ? '#ffd98a' : '#ff91a4' }).setOrigin(0, 0.5));
      const install = createModCollectionButton(this, installX, rowY, installed ? 'Installed' : affordable ? 'Install' : 'Not Enough Chips', () => {
        return !installed && affordable ? this.apply(() => SaveSystem.infuseModCard(card.instanceId, infusion.id)) : false;
      }, installWidth, installed ? 'return' : affordable ? 'utility' : 'warning');
      if (installed || !affordable) disableButton(install);
      root.add(install);
    });

    const previousPage = createModCollectionButton(this, width / 2 - 132, pageY, '◀', () => {
      this.infusionPage -= 1;
      this.showInfusionModal(card, true);
    }, 82, 'standard');
    const nextPage = createModCollectionButton(this, width / 2 + 132, pageY, '▶', () => {
      this.infusionPage += 1;
      this.showInfusionModal(card, true);
    }, 82, 'standard');
    if (this.infusionPage === 0) disableButton(previousPage);
    if (this.infusionPage >= pageCount - 1) disableButton(nextPage);
    root.add([
      previousPage,
      this.add.text(width / 2, pageY, `PAGE ${this.infusionPage + 1} / ${pageCount}`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#bdeeff'
      }).setOrigin(0.5),
      nextPage
    ]);
    root.add(createModCollectionButton(this, width / 2, closeY, 'Close', () => this.hideInfusionModal(), 220, 'return'));
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

  private apply(operation: () => { ok: boolean; message?: string }): boolean {
    const before = this.captureCurrencySnapshot();
    return this.finishOperation(operation(), this.calculateCurrencyDeltas(before));
  }

  private applyWithTutorialEvent(event: string, operation: () => { ok: boolean; message?: string }): boolean {
    const before = this.captureCurrencySnapshot();
    const result = operation();
    if (result.ok) TutorialEventBus.emit(event);
    return this.finishOperation(result, this.calculateCurrencyDeltas(before));
  }

  private captureCurrencySnapshot(): CurrencySnapshot {
    const wallet = SaveSystem.get();
    return {
      credits: wallet.credits,
      coreTokens: wallet.coreTokens,
      plasmaChips: SaveSystem.getModCollection().plasmaChips,
      fluxCores: wallet.fluxCores
    };
  }

  private calculateCurrencyDeltas(before: CurrencySnapshot): CurrencyDeltas {
    const after = this.captureCurrencySnapshot();
    const deltas: CurrencyDeltas = {};
    for (const key of Object.keys(before) as Array<keyof CurrencySnapshot>) {
      const delta = after[key] - before[key];
      if (delta !== 0) deltas[key] = delta;
    }
    return deltas;
  }

  private finishOperation(result: { ok: boolean; message?: string }, currencyDeltas: CurrencyDeltas = {}): boolean {
    this.status = `${result.ok ? 'Success' : 'Blocked'}: ${result.message ?? ''}`;
    this.restartCollection(result.ok ? currencyDeltas : undefined);
    return result.ok;
  }

  private restartCollection(currencyDeltas?: CurrencyDeltas): void {
    this.scene.restart({ returnScene: this.returnScene, resumePausedScene: this.resumePausedScene, currencyDeltas });
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
