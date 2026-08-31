import Phaser from 'phaser';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import { createModCardView, MOD_RARITY_COLORS } from '../mods/ModCardView.ts';
import type { ModCardInstance, ModCategory, ModSlot } from '../mods/types.ts';
import { buildModArchiveAnalytics, type ModArchiveAnalytics } from '../mods/ModArchiveAnalytics.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { disableButton } from '../utils/ui';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { rollModDrop } from '../mods/ModDropService.ts';
import { getInfusionOperationCost, getInfusionRemovalCost, MOD_INFUSIONS } from '../mods/infusions.ts';
import { getModCopyCounts, getRecyclableUnupgradedDuplicates } from '../mods/ModInventoryService.ts';
import {
  buildModOperationStatus,
  calculateModOperationStatusRect,
  MOD_OPERATION_STATUS_DURATION_MS,
  type ModOperationStatusTone
} from '../mods/ModOperationStatus.ts';
import { showConfirmDialog, type LocalModalHandle } from '../utils/localSaveUi.ts';
import { resolveModCollectionReturnRoute, type ModCollectionReturnRequest } from '../mods/ModCollectionNavigation.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import {
  createModArchivePageButton,
  createModArchivePageReadout,
  createModArchiveCommandTelemetry,
  createModArchiveTerminal,
  createModCollectionButton,
  createModCollectionFrame,
  createModOperationStatusConsole,
  createModCollectionShell,
  createModSelectedInspector,
  createModSelectedTracePanel,
  getModCollectionChromeLayout,
  playModArchiveRefresh,
  type ModSelectedInspectorData
} from '../ui/ModCollectionUi.ts';
import {
  calculateModArchiveTerminalLayout,
  getModArchivePageCount
} from '../ui/ModArchiveTerminalLayout.ts';
import { TutorialDirector } from '../tutorial/TutorialDirector.ts';
import { TutorialEventBus } from '../tutorial/TutorialEventBus.ts';
import { projectTutorialBoundsToViewport } from '../tutorial/TutorialTargeting.ts';
import { configureSceneUiNavigation, setSceneUiModalDepth } from '../input/UiNavigationController.ts';

type SortMode = 'acquired' | 'type' | 'rank' | 'rarity';
type FilterMode = 'all' | 'duplicates';
type CollectionCategory = 'all' | ModCategory | 'supreme';
const CATEGORIES: CollectionCategory[] = ['all', 'supreme', 'weapon', 'player', 'defense', 'bombSite', 'utility'];
const SORTS: SortMode[] = ['acquired', 'type', 'rank', 'rarity'];
const FILTERS: FilterMode[] = ['all', 'duplicates'];
const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, supreme: 5 } as const;

interface ModCollectionSceneData extends ModCollectionReturnRequest {
  selectedCardId?: string;
  initialCategory?: CollectionCategory;
  targetSlot?: ModSlot;
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
  private statusTone: ModOperationStatusTone = 'info';
  private statusExpiresAt = 0;
  private statusTimer: Phaser.Time.TimerEvent | null = null;
  private infusionModal: Phaser.GameObjects.Container | null = null;
  private bulkRecycleModal: LocalModalHandle | null = null;
  private infusionConfirmModal: LocalModalHandle | null = null;
  private infusionPage = 0;
  private returnScene: SceneKeyValue = SceneKeys.MainMenu;
  private resumePausedScene = false;
  private tutorialDirector: TutorialDirector | null = null;
  private archiveRefreshPending = false;
  private targetSlot: ModSlot | null = null;
  private walletUnsubscribe: (() => void) | null = null;
  private readonly handleEscape = (): void => {
    if (this.infusionConfirmModal) {
      this.infusionConfirmModal.destroy();
      this.infusionConfirmModal = null;
      setSceneUiModalDepth(this, this.infusionModal ? 30 : 0);
    } else if (this.bulkRecycleModal) {
      this.bulkRecycleModal.destroy();
      this.bulkRecycleModal = null;
    } else if (this.infusionModal) this.hideInfusionModal();
    else this.returnToPreviousScene();
  };

  constructor() { super(SceneKeys.Mods); }

  create(data?: ModCollectionSceneData): void {
    if (this.status && Date.now() >= this.statusExpiresAt) this.clearOperationStatus();
    this.statusTimer = null;
    setSceneUiModalDepth(this, 0);
    configureSceneUiNavigation(this, { onBack: this.handleEscape });
    const arenaCanResume = this.scene.isPaused(SceneKeys.Arena) && this.registry.has('arena-session');
    const returnRoute = resolveModCollectionReturnRoute(data, arenaCanResume);
    this.returnScene = returnRoute.returnScene;
    this.resumePausedScene = returnRoute.resumePausedScene;
    this.targetSlot = data?.targetSlot ?? null;
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
    const cards = this.sortedCards(mods.cards.filter((card) => {
      const definition = MOD_BY_ID.get(card.modId);
      const categoryMatches = category === 'all'
        || (category === 'supreme' ? definition?.rarity === 'supreme' : definition?.category === category);
      return categoryMatches && (filter === 'all' || recyclableDuplicateIds.has(card.instanceId));
    }), sort);
    const bulkPlasmaValue = recyclableDuplicates.reduce((total, card) => {
      const definition = MOD_BY_ID.get(card.modId);
      return total + (definition ? MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity] : 0);
    }, 0);
    const activeLoadout = mods.loadouts.find((loadout) => loadout.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const equippedCardIds = new Set(Object.values(activeLoadout?.cardSlots ?? {}).filter((cardId): cardId is string => typeof cardId === 'string'));
    if (!cards.some((card) => card.instanceId === this.selectedCardId)) this.selectedCardId = cards[0]?.instanceId ?? '';

    const wallet = SaveSystem.get();
    const shell = createModCollectionShell(this, width, height, [
      { label: 'OWNED CARDS', value: mods.cards.length.toLocaleString(), color: 0x62efff },
      { label: 'PLASMA CHIPS', value: mods.plasmaChips.toLocaleString(), color: 0xc877ff, delta: data?.currencyDeltas?.plasmaChips },
      { label: 'CORE TOKENS', value: wallet.coreTokens.toLocaleString(), color: 0xffc86b, delta: data?.currencyDeltas?.coreTokens },
      { label: 'FLUX CORES', value: wallet.fluxCores.toLocaleString(), color: 0x69ff9c, delta: data?.currencyDeltas?.fluxCores },
      { label: 'CREDITS', value: wallet.credits.toLocaleString(), color: 0xffed67, delta: data?.currencyDeltas?.credits }
    ]);
    this.walletUnsubscribe?.();
    this.walletUnsubscribe = SaveSystem.subscribeWalletChanges(({ current }) => {
      if (!this.scene.isActive()) return;
      shell.setReadoutValue('PLASMA CHIPS', current.plasmaChips.toLocaleString());
      shell.setReadoutValue('CORE TOKENS', current.coreTokens.toLocaleString());
      shell.setReadoutValue('FLUX CORES', current.fluxCores.toLocaleString());
      shell.setReadoutValue('CREDITS', current.credits.toLocaleString());
    }, false);

    const chromeLayout = getModCollectionChromeLayout(width, height);
    const { compact, toolbarTop, toolbarHeight, toolbarButtonY, toolbarButtonHeight, contentTop, returnInset } = chromeLayout;
    const detailWidth = Math.min(390, width * 0.3);
    const archiveLayout = calculateModArchiveTerminalLayout(width, height, contentTop, detailWidth);
    const pageCount = getModArchivePageCount(cards.length, archiveLayout.perPage);
    const maxPage = pageCount - 1;
    this.page = Math.min(this.page, maxPage);
    const analytics = buildModArchiveAnalytics({
      collection: mods,
      matchingCards: cards,
      equippedCardIds,
      recyclableCards: recyclableDuplicates,
      selectedCardId: this.selectedCardId,
      page: this.page,
      pageCount
    });
    const narrow = width < 800;
    const returnWidth = narrow ? 120 : Phaser.Math.Clamp(width * 0.18, 160, 220);
    const toolbarGap = narrow ? 10 : 16;
    const statusGap = narrow ? 8 : 14;
    const toolbarStart = narrow ? 20 : 28;
    const statusReserve = narrow
      ? Phaser.Math.Clamp(width * 0.27, 170, 270)
      : Phaser.Math.Clamp(width * 0.31, 280, 620);
    const toolbarAvailableWidth = width - returnWidth - statusReserve - toolbarStart - returnInset * 2 - statusGap - 8;
    const toolbarButtonWidth = Phaser.Math.Clamp((toolbarAvailableWidth - toolbarGap * 3) / 4, narrow ? 64 : 90, 230);
    const toolbarX = (index: number): number => toolbarStart + toolbarButtonWidth / 2 + index * (toolbarButtonWidth + toolbarGap);
    const toolbarRect = { x: 20, y: toolbarTop, width: width - 40, height: toolbarHeight };
    createModCollectionFrame(this, { x: 20, y: toolbarTop, width: width - 40, height: toolbarHeight }, 'COLLECTION CONTROLS // FILTER · SORT · SALVAGE', 0x55eaff);
    createModArchiveCommandTelemetry(this, toolbarRect, analytics);
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
    const returnX = width - returnWidth / 2 - returnInset;
    createModCollectionButton(this, returnX, toolbarButtonY, returnLabel, () => this.returnToPreviousScene(), returnWidth, 'return', { height: toolbarButtonHeight, fontSize: narrow ? 11 : 16 });
    const controlsRight = toolbarStart + toolbarButtonWidth * 4 + toolbarGap * 3;
    const statusLeft = controlsRight + statusGap;
    const statusRight = returnX - returnWidth / 2 - statusGap;
    const statusRect = calculateModOperationStatusRect(statusLeft, statusRight, toolbarTop, toolbarHeight, compact);
    const statusConsole = createModOperationStatusConsole(
      this,
      statusRect,
      this.status || 'AWAITING MODULE COMMAND',
      this.status ? this.statusTone : 'info'
    );
    if (this.status) {
      const remaining = Math.max(0, this.statusExpiresAt - Date.now());
      this.statusTimer = this.time.delayedCall(remaining, () => {
        this.clearOperationStatus();
        if (statusConsole.root.active) statusConsole.setStatus('AWAITING MODULE COMMAND', 'info');
      });
    }

    createModArchiveTerminal(this, archiveLayout, analytics);
    cards.slice(this.page * archiveLayout.perPage, (this.page + 1) * archiveLayout.perPage).forEach((card, index) => {
      const x = archiveLayout.cardGridLeft + archiveLayout.cardWidth / 2
        + (index % archiveLayout.columns) * (archiveLayout.cardWidth + archiveLayout.cardGapX);
      const y = archiveLayout.cardGridTop + archiveLayout.cardHeight / 2
        + Math.floor(index / archiveLayout.columns) * (archiveLayout.cardHeight + archiveLayout.cardGapY);
      const view = createModCardView(this, x, y, card, card.upgradeLevel, { width: archiveLayout.cardWidth, height: archiveLayout.cardHeight, selected: card.instanceId === this.selectedCardId, compact: true, equipped: equippedCardIds.has(card.instanceId), duplicateCount: Math.max(0, (copyCounts.get(card.modId) ?? 1) - 1), focusGroup: 'mod-collection-card-grid' });
      view.on('pointerdown', () => {
        AudioManager.get().playSfx('menu');
        this.selectedCardId = card.instanceId;
        this.restartCollection();
      });
    });
    if (!cards.length) this.add.text(
      archiveLayout.bay.x + archiveLayout.bay.width / 2,
      archiveLayout.bay.y + archiveLayout.bay.height / 2,
      filter === 'duplicates' ? 'NO DUPLICATE CARDS IN THIS GROUP' : 'NO COLLECTED CARDS IN THIS GROUP',
      { fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#607a8c' }
    ).setOrigin(0.5);
    const turnArchivePage = (direction: -1 | 1): void => {
      this.page = Phaser.Math.Clamp(this.page + direction, 0, maxPage);
      this.archiveRefreshPending = true;
      this.restartCollection();
    };
    configureSceneUiNavigation(this, {
      onBack: this.handleEscape,
      onPageLeft: () => turnArchivePage(-1),
      onPageRight: () => turnArchivePage(1)
    });
    const paginationY = archiveLayout.pagination.y + archiveLayout.pagination.height / 2;
    createModArchivePageButton(this, archiveLayout.previousButtonX, paginationY, 'previous', () => turnArchivePage(-1), archiveLayout.pageButtonWidth, archiveLayout.pageButtonHeight);
    createModArchivePageReadout(this, archiveLayout.pageReadoutX, paginationY, archiveLayout.pageReadoutWidth, this.page, pageCount);
    createModArchivePageButton(this, archiveLayout.nextButtonX, paginationY, 'next', () => turnArchivePage(1), archiveLayout.pageButtonWidth, archiveLayout.pageButtonHeight);
    if (this.archiveRefreshPending) {
      this.archiveRefreshPending = false;
      playModArchiveRefresh(this, archiveLayout.bay);
    }

    const selected = mods.cards.find((card) => card.instanceId === this.selectedCardId);
    this.createDetails(width - detailWidth / 2 - 20, contentTop, detailWidth, height - contentTop - 16, analytics, selected, selected ? equippedCardIds.has(selected.instanceId) : false, selected ? Math.max(0, (copyCounts.get(selected.modId) ?? 1) - 1) : 0);
    this.tutorialDirector = new TutorialDirector({
      scene: 'mods',
      resolveTarget: (target) => {
        const rect = target === 'mods.archive'
          ? archiveLayout.frame
          : target === 'mods.details'
            ? { x: width - detailWidth - 40, y: contentTop, width: detailWidth, height: height - contentTop - 16 }
            : null;
        if (!rect) return null;
        const canvas = this.game.canvas.getBoundingClientRect();
        return projectTutorialBoundsToViewport(rect, canvas, this.scale.width, this.scale.height);
      },
      setMode: () => undefined,
      onComplete: (sequenceId) => {
        if (sequenceId === 'onboarding.mod-collection' && this.scene.isActive()) {
          this.scene.start(SceneKeys.MainMenu);
        }
      }
    });
    // First-run Mod Collection teaching is state-driven and must work even if
    // the training reward inventory is empty. Contextual teaching still uses
    // the delayed collection-open event below.
    this.tutorialDirector.startEligible();
    window.setTimeout(() => {
      if (this.scene.isActive() && SaveSystem.getModCollection().cards.length > 0) TutorialEventBus.emit('ui.modCollectionOpened');
    }, 160);
    this.input.keyboard?.off('keydown-ESC', this.handleEscape);
    this.input.keyboard?.on('keydown-ESC', this.handleEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.handleEscape);
      this.infusionConfirmModal?.destroy();
      this.infusionConfirmModal = null;
      this.bulkRecycleModal?.destroy();
      this.bulkRecycleModal = null;
      this.tutorialDirector?.destroy();
      this.tutorialDirector = null;
      this.statusTimer?.remove(false);
      this.statusTimer = null;
      this.walletUnsubscribe?.();
      this.walletUnsubscribe = null;
    });
    if (import.meta.env.DEV) this.installDevKeys();
  }

  private createDetails(x: number, y: number, width: number, height: number, analytics: ModArchiveAnalytics, card?: ModCardInstance, equipped = false, duplicateCount = 0): void {
    const selectedDefinition = card ? MOD_BY_ID.get(card.modId) : undefined;
    const detailRect = { x: x - width / 2, y, width, height };
    createModCollectionFrame(this, detailRect, selectedDefinition ? `SELECTED MODULE // ${selectedDefinition.name.toUpperCase()}` : 'SELECTED MODULE // NO SIGNAL', selectedDefinition?.variant === 'corrupted' ? 0xff4fc8 : 0xff65c8);
    if (!card) {
      createModSelectedInspector(this, detailRect, null, null, analytics);
      return;
    }
    const definition = selectedDefinition!;
    const owned = SaveSystem.getModCollection().inventory[card.modId];
    const compactDetails = height < 650;
    const detailCardWidth = Math.min(210, width - 72, Phaser.Math.Clamp((height - (compactDetails ? 340 : 390)) / 1.4, compactDetails ? 118 : 145, 210));
    const detailCardHeight = detailCardWidth * 1.4;
    const detailCardTop = y + (compactDetails ? 52 : 58);
    const detailCardCenterY = detailCardTop + detailCardHeight / 2;
    const collection = SaveSystem.getModCollection();
    const selectedData: ModSelectedInspectorData = {
      rarity: definition.rarity,
      rarityColor: definition.variant === 'corrupted' ? 0xff36b9 : MOD_RARITY_COLORS[definition.rarity],
      category: definition.category,
      rank: card.upgradeLevel,
      duplicates: duplicateCount,
      equipped,
      infused: Boolean(card.infusionId),
      acquiredAt: card.acquiredAt,
      cardIndex: Math.max(1, collection.cards.findIndex((entry) => entry.instanceId === card.instanceId) + 1),
      totalCards: collection.cards.length,
      signalTrace: analytics.signalTrace
    };
    createModSelectedInspector(this, detailRect, {
      x: x - detailCardWidth / 2,
      y: detailCardTop,
      width: detailCardWidth,
      height: detailCardHeight
    }, selectedData, analytics);
    createModCardView(this, x, detailCardCenterY, card, card.upgradeLevel, {
      width: detailCardWidth,
      height: detailCardHeight,
      compact: false,
      interactive: false,
      equipped,
      duplicateCount
    });
    const corruptedText = definition.variant === 'corrupted' ? `\n+ ${definition.positiveEffect}\n− ${definition.negativeEffect}` : '';
    const supremeText = definition.rarity === 'supreme'
      ? `\nSUPREME OVERDRIVE ONLY // UNIVERSAL SLOT // MAX 2 ACTIVE\n${definition.supremeEffects?.map((effect) => effect.label).join('\n') ?? ''}`
      : '';
    const detailCopy = this.add.text(x, detailCardTop + detailCardHeight + 18, `${definition.rarity === 'supreme' ? 'SUPREME CLASS' : definition.category.toUpperCase()} • ${definition.rarity.toUpperCase()}\n${definition.description}${corruptedText}${supremeText}\nUPGRADES ${card.upgradeLevel}/3 • ${owned.duplicates} DUPLICATES`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compactDetails ? 16 : 18}px`, color: '#e8f8ff', align: 'center', lineSpacing: 3
    }).setOrigin(0.5, 0).setWordWrapWidth(width - 34, true);
    const activeSlots = SaveSystem.getModCollection().loadouts.find((loadout) => loadout.id === SaveSystem.getModCollection().activeLoadoutId)?.slots;
    const firstOpenSlot = activeSlots ? (Object.keys(activeSlots) as ModSlot[]).find((slot) => !activeSlots[slot]) : undefined;
    const categorySlot = this.targetSlot
      ?? (definition.rarity === 'supreme' ? firstOpenSlot ?? 'weapon' : definition.category === 'utility' ? null : definition.category as ModSlot);
    const buttonGap = compactDetails ? 38 : height < 650 ? 43 : 48;
    const buttonHeight = compactDetails ? 32 : 38;
    // The status feed now lives in the collection toolbar, leaving this lower
    // action bay dedicated to the selected module controls.
    const buttonStackBottomInset = compactDetails ? 28 : 34;
    const buttonY = y + height - buttonGap * 4 - buttonStackBottomInset;
    const traceHeight = height >= 760 ? 72 : 0;
    const traceTop = buttonY - traceHeight - (traceHeight > 0 ? 10 : 0);
    const availableDetailCopyHeight = Math.max(compactDetails ? 34 : 48, (traceHeight > 0 ? traceTop : buttonY) - detailCopy.y - 14);
    for (let fontSize = compactDetails ? 16 : 17; detailCopy.height > availableDetailCopyHeight && fontSize >= 15; fontSize -= 1) {
      detailCopy.setFontSize(fontSize);
    }
    if (detailCopy.height > availableDetailCopyHeight) {
      const maximumReadableLines = Phaser.Math.Clamp(
        Math.floor((availableDetailCopyHeight + 3) / 18),
        2,
        compactDetails ? 3 : 5
      );
      detailCopy.setMaxLines(maximumReadableLines);
    }
    if (traceHeight > 0) {
      createModSelectedTracePanel(this, {
        x: x - width / 2 + 18,
        y: traceTop,
        width: width - 36,
        height: traceHeight
      }, selectedData);
    }
    if (categorySlot) createModCollectionButton(this, x, buttonY, `Equip ${categorySlot}`, () => this.applyWithTutorialEvent('mods.equipped', () => SaveSystem.equipMod(categorySlot, definition.id, card.instanceId)), width - 40, 'standard', { height: buttonHeight, fontSize: compactDetails ? 12 : 16 });
    createModCollectionButton(this, x, buttonY + buttonGap, definition.rarity === 'supreme' ? 'Equip Supreme // Wildcard' : 'Equip Wildcard', () => this.applyWithTutorialEvent('mods.equipped', () => SaveSystem.equipMod('wildcard', definition.id, card.instanceId)), width - 40, 'standard', { height: buttonHeight, fontSize: compactDetails ? 12 : 16 });
    const nextUpgrade = card.upgradeLevel < 3 ? (card.upgradeLevel + 1) as 1 | 2 | 3 : null;
    const coreTokenCost = nextUpgrade ? MOD_BALANCE.rankCoreTokenCostsByRarity[definition.rarity][nextUpgrade] : 0;
    const upgradeLabel = nextUpgrade
      ? `Upgrade — ${MOD_BALANCE.rankCreditCosts[nextUpgrade].toLocaleString()} Credits${coreTokenCost > 0 ? `\n+ ${coreTokenCost.toLocaleString()} Core Tokens` : ''}`
      : 'Upgrade Card — MAX LEVEL';
    createModCollectionButton(this, x, buttonY + buttonGap * 2, upgradeLabel, () => {
      return nextUpgrade
        ? this.apply(() => SaveSystem.rankUpMod(definition.id, card.instanceId))
        : this.finishOperation({ ok: false, message: 'Mod card is already at maximum level.' });
    }, width - 40, 'utility', { height: buttonHeight, fontSize: compactDetails ? 11 : 14 });
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
    setSceneUiModalDepth(this, 30);
    const { width, height } = this.scale;
    // Keep the infusion terminal above the collection, but below the shared
    // 4000-depth confirmation dialog used for paid install/swap/remove actions.
    const root = this.add.container(0, 0).setDepth(3000);
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
      const operationCost = getInfusionOperationCost(card.infusionId, infusion.id);
      const affordable = SaveSystem.getModCollection().plasmaChips >= operationCost;
      const replacing = Boolean(card.infusionId && !installed);
      const rowAccent = installed ? 0x62ffae : 0x4bbfdb;
      root.add(this.add.rectangle(width / 2, rowY, panelWidth - 44, rowHeight, installed ? 0x103329 : 0x0c1a29, 0.95).setStrokeStyle(installed ? 2 : 1, rowAccent, installed ? 1 : 0.65));
      root.add(this.add.rectangle(width / 2, rowY - rowHeight / 2 + 4, panelWidth - 64, 2, rowAccent, installed ? 0.72 : 0.34));
      root.add(this.add.circle(panelLeft + 28, rowY, 3, rowAccent, 0.9));
      root.add(this.add.text(panelLeft + 52, rowY, infusion.icon, { fontFamily: 'Orbitron, sans-serif', fontSize: '34px', color: '#8ff7ff' }).setOrigin(0.5));
      root.add(this.add.text(copyX, rowY - 30, infusion.name.toUpperCase(), { fontFamily: 'Orbitron, sans-serif', fontSize: '17px', color: installed ? '#7dffb4' : '#e5fbff' }).setOrigin(0, 0.5));
      root.add(this.add.text(copyX, rowY - 15, infusion.description, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#c0d9e7', lineSpacing: 0
      }).setOrigin(0, 0).setWordWrapWidth(copyWidth, true).setMaxLines(2));
      root.add(this.add.text(copyX, rowY + rowHeight / 2 - 15, installed
        ? 'INSTALLED'
        : `${replacing ? 'RECONFIGURE' : 'INSTALL'} // ${operationCost} PLASMA CHIPS`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontStyle: 'bold', color: installed ? '#70ffad' : affordable ? '#ffd98a' : '#ff91a4' }).setOrigin(0, 0.5));
      const install = createModCollectionButton(this, installX, rowY, installed ? 'Installed' : affordable ? replacing ? 'Swap' : 'Install' : 'Not Enough Chips', () => {
        if (installed) return false;
        if (!affordable) return this.finishOperation({ ok: false, message: `Requires ${operationCost} Plasma Chips.` });
        this.confirmInfusionOperation(
          replacing ? 'RECONFIGURE COSMETIC INFUSION' : 'INSTALL COSMETIC INFUSION',
          `${replacing ? 'Replace the current infusion with' : 'Install'} ${infusion.name.toUpperCase()}?\n\nExact charge: ${operationCost} Plasma Chips.\nBalance after transaction: ${(SaveSystem.getModCollection().plasmaChips - operationCost).toLocaleString()} Plasma Chips.`,
          replacing ? 'Confirm Swap' : 'Confirm Install',
          () => this.apply(() => SaveSystem.infuseModCard(card.instanceId, infusion.id))
        );
        return true;
      }, installWidth, installed ? 'return' : affordable ? 'utility' : 'warning');
      if (installed) disableButton(install);
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
    if (card.infusionId) {
      const removalCost = getInfusionRemovalCost(card.infusionId);
      const canRemove = SaveSystem.getModCollection().plasmaChips >= removalCost;
      const bottomWidth = Phaser.Math.Clamp((panelWidth - 72) / 2, 150, 220);
      const bottomGap = 14;
      const removeButton = createModCollectionButton(this, width / 2 - bottomWidth / 2 - bottomGap / 2, closeY,
        canRemove ? `Remove // ${removalCost} Chips` : `Need ${removalCost} Chips`, () => {
          if (!canRemove) return this.finishOperation({ ok: false, message: `Requires ${removalCost} Plasma Chips.` });
          this.confirmInfusionOperation(
            'REMOVE COSMETIC INFUSION',
            `Remove the installed infusion from this Mod card?\n\nExact charge: ${removalCost} Plasma Chips.\nBalance after transaction: ${(SaveSystem.getModCollection().plasmaChips - removalCost).toLocaleString()} Plasma Chips.`,
            'Confirm Removal',
            () => this.apply(() => SaveSystem.removeModInfusion(card.instanceId))
          );
          return true;
        }, bottomWidth, canRemove ? 'warning' : 'return');
      root.add([
        removeButton,
        createModCollectionButton(this, width / 2 + bottomWidth / 2 + bottomGap / 2, closeY, 'Close', () => this.hideInfusionModal(), bottomWidth, 'return')
      ]);
    } else {
      root.add(createModCollectionButton(this, width / 2, closeY, 'Close', () => this.hideInfusionModal(), 220, 'return'));
    }
    this.infusionModal = root;
  }

  private confirmInfusionOperation(title: string, body: string, label: string, operation: () => void): void {
    this.infusionConfirmModal?.destroy();
    setSceneUiModalDepth(this, 50);
    this.infusionConfirmModal = showConfirmDialog(this, title, body, label, operation, 'Cancel', () => {
      this.infusionConfirmModal = null;
      setSceneUiModalDepth(this, this.infusionModal ? 30 : 0);
    });
  }

  private hideInfusionModal(): void {
    this.infusionConfirmModal?.destroy();
    this.infusionConfirmModal = null;
    this.infusionModal?.destroy(true);
    this.infusionModal = null;
    setSceneUiModalDepth(this, 0);
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
    const presentation = buildModOperationStatus(result, this.captureCurrencySnapshot());
    this.status = presentation.message;
    this.statusTone = presentation.tone;
    this.statusExpiresAt = Date.now() + MOD_OPERATION_STATUS_DURATION_MS;
    this.restartCollection(result.ok ? currencyDeltas : undefined);
    return result.ok;
  }

  private clearOperationStatus(): void {
    this.status = '';
    this.statusTone = 'info';
    this.statusExpiresAt = 0;
  }

  private restartCollection(currencyDeltas?: CurrencyDeltas): void {
    this.scene.restart({ returnScene: this.returnScene, resumePausedScene: this.resumePausedScene, currencyDeltas, targetSlot: this.targetSlot ?? undefined });
  }

  private returnToPreviousScene(): void {
    if (SaveSystem.getTutorialProgress().firstRunStage === 'mod-collection-teaching'
      && this.tutorialDirector?.isActiveSequence('onboarding.mod-collection')) return;
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
    this.input.keyboard?.once('keydown-I', () => console.info('[MOD RUNTIME]', new ModRuntime(SaveSystem.getModCollection(), undefined, SaveSystem.getPreferredProtocol()).snapshot(), SaveSystem.getModCollection()));
  }
}
