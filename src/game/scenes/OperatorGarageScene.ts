import Phaser from 'phaser';
import { COSMETICS, getCosmeticById, getCosmeticDisplayColor, getCosmeticTextureKey } from '../../data/cosmetics.ts';
import { createCosmeticPreview } from '../cosmetics/CosmeticPreview.ts';
import { ECONOMY_BALANCE, MOD_FOCUS_CATEGORIES, MOD_FOCUS_LABELS, RUN_CONTRACT_IDS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { getRunSetupCost } from '../economy/EconomyService.ts';
import type { RunSetupSelection } from '../economy/types.ts';
import {
  CURRENCY_EXCHANGE_RATES,
  getCurrencyExchangeRate,
  getMaximumExchangeSpend,
  quoteCurrencyExchange,
  type ExchangeCurrency
} from '../economy/CurrencyExchange.ts';
import { getExchangeRoundTrip, type EconomyAnalyticsSnapshot } from '../economy/EconomyAnalytics.ts';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys.ts';
import { calculateGarageLayout, type GarageRect } from '../garage/garageLayout.ts';
import {
  GEAR_LOCKER_CATEGORY_LABELS,
  createGearLockerCategoryIcon,
  createGearLockerPanel,
  formatCosmeticColorCode
} from '../garage/GearLockerUi.ts';
import { calculateGearLockerLayout, type GearLockerLayout } from '../garage/gearLockerLayout.ts';
import { calculateModLibraryLayout, resolveModLibraryPage } from '../garage/modLibraryLayout.ts';
import {
  addTerminalMount,
  createGarageEnvironment,
  createModWorkbench,
  createStationHousing
} from '../garage/GarageEnvironment.ts';
import { getGarageDockModels, getModLibraryEntries, getModLibraryProgress } from '../garage/GarageState.ts';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { filterModDatabaseEntries, getModDatabaseEntry, type ModDatabaseStatusFilter } from '../mods/ModDatabaseService.ts';
import { ModDatabaseViewer } from '../mods/ModDatabaseViewer.ts';
import { MOD_RARITY_COLORS, createModCardView } from '../mods/ModCardView.ts';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol, isRunProtocolUnlocked } from '../mods/modBalance.ts';
import type { ModCardInstance, ModCategory, ModRarity, ModSlot, RunProtocolId } from '../mods/types.ts';
import {
  describeRecalibrationSlot,
  formatCalibrationModifier,
  getRecalibrationCandidatePool,
  getRecalibrationSlots,
  PLASMA_RECALIBRATION_BALANCE,
  resolveCalibrationModifier,
  type PlasmaRecalibrationCandidate
} from '../mods/PlasmaRecalibration.ts';
import { countEquippedSupremeMods, MAX_EQUIPPED_SUPREME_MODS } from '../mods/ModLoadoutRules.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import type { CosmeticOption } from '../types.ts';
import { createModCollectionButton, createModCollectionFrame, createModOperationStatusConsole, getModCollectionFrameHeaderHeight } from '../ui/ModCollectionUi.ts';
import type { ModOperationStatusTone } from '../mods/ModOperationStatus.ts';
import { createRunConfigurationConsole } from '../ui/RunConfigurationConsoleUi.ts';
import { createButton, disableButton } from '../utils/ui.ts';
import { TutorialDirector } from '../tutorial/TutorialDirector.ts';
import { TutorialEventBus } from '../tutorial/TutorialEventBus.ts';
import { projectTutorialBoundsToViewport } from '../tutorial/TutorialTargeting.ts';
import { calculateProtocolTerminalVerticalLayout } from '../garage/protocolTerminalLayout.ts';
import {
  ECONOMY_DISPLAY_FONT,
  ECONOMY_FONT,
  addMetric,
  createEconomyPanel,
  drawDonut,
  drawHorizontalBars,
  drawLineChart,
  drawProgressBar,
  drawVerticalBars,
  formatEconomyNumber,
  type EconomyConsoleRect
} from '../garage/EconomyConsoleUi.ts';
import { getSupremeStage, isSupremeProtocol } from '../progression/SupremeProgression.ts';
import {
  configureSceneUiNavigation,
  registerUiFocusable,
  setSceneUiModalDepth
} from '../input/UiNavigationController.ts';

interface OperatorGarageSceneData { returnScene?: SceneKeyValue; openRunConfiguration?: boolean }

const LIBRARY_CATEGORIES: Array<'all' | ModCategory> = ['all', 'weapon', 'player', 'defense', 'bombSite', 'utility'];
const LIBRARY_RARITIES: Array<'all' | ModRarity> = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'supreme'];
const LIBRARY_OWNERSHIP: ModDatabaseStatusFilter[] = ['all', 'owned', 'discovered', 'undiscovered', 'corrupted'];
const COSMETIC_CATEGORIES = Array.from(new Set(COSMETICS.map((item) => item.category)));
const syntheticLibraryCard = (definition: (typeof MOD_DEFINITIONS)[number]): ModCardInstance => ({
  instanceId: `library-${definition.id}`,
  modId: definition.id,
  acquiredAt: new Date(0).toISOString(),
  upgradeLevel: 0
});

const createConsoleChamferPoints = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0,
  width, cut, width, height - cut,
  width - cut, height, cut, height,
  0, height - cut, 0, cut
];

const EXCHANGE_CURRENCIES: readonly ExchangeCurrency[] = ['credits', 'coreTokens', 'plasmaChips', 'fluxCores'];
const EXCHANGE_CURRENCY_LABELS: Record<ExchangeCurrency, string> = {
  credits: 'CREDITS', coreTokens: 'CORE TOKENS', plasmaChips: 'PLASMA CHIPS', fluxCores: 'FLUX CORES'
};
const EXCHANGE_CURRENCY_COLORS: Record<ExchangeCurrency, number> = {
  credits: 0x7fffe5, coreTokens: 0xffd37b, plasmaChips: 0xdb8fff, fluxCores: 0x76ff9e
};
const ECONOMY_TABS = ['MARKET', 'PROGRESSION', 'COMMERCE', 'MOD ECONOMY'] as const;

export class OperatorGarageScene extends Phaser.Scene {
  private readonly audio = AudioManager.get();
  private returnScene: SceneKeyValue = SceneKeys.MainMenu;
  private overlay: Phaser.GameObjects.Container | null = null;
  private readonly overlayAnimatedTargets: Phaser.GameObjects.GameObject[] = [];
  private operatorPreviewRoot: Phaser.GameObjects.Container | null = null;
  private operatorPreviewColorTimer: Phaser.Time.TimerEvent | null = null;
  private operatorPreviewLayout: { rect: GarageRect; compact: boolean } | null = null;
  private readonly configurationValueTexts = new Map<'contract' | 'signal', Phaser.GameObjects.Text>();
  private configurationFeeText: Phaser.GameObjects.Text | null = null;
  private configurationPersistenceText: Phaser.GameObjects.Text | null = null;
  private readonly walletValueTexts = new Map<ExchangeCurrency, Phaser.GameObjects.Text>();
  private cosmeticPreviewColorTimer: Phaser.Time.TimerEvent | null = null;
  private tutorialDirector: TutorialDirector | null = null;
  private readonly tutorialTargets = new Map<string, Phaser.GameObjects.Container>();
  private cosmeticPreviewColorTargets: Array<{ item: CosmeticOption; setColor: (color: number) => void; update?: (timeMs: number) => void }> = [];
  private status = '';
  private libraryCategoryIndex = 0;
  private libraryRarityIndex = 0;
  private libraryOwnershipIndex = 0;
  private libraryPage = 0;
  private librarySelectedId = MOD_DEFINITIONS[0]?.id ?? '';
  private libraryViewer: ModDatabaseViewer | null = null;
  private recalibrationCandidate: PlasmaRecalibrationCandidate | null = null;
  private recalibrationCardId: string | null = null;
  private recalibrationProcessing = false;
  private recalibrationRevealTimer: Phaser.Time.TimerEvent | null = null;
  private recalibrationStatus: { message: string; tone: ModOperationStatusTone } = {
    message: 'SELECT AN OWNED MOD // PLASMA LINK READY', tone: 'info'
  };
  private protocolTerminalFamily: 'overdrive' | 'supreme' | null = null;
  private cosmeticCategoryIndex = 0;
  private cosmeticPage = 0;
  private exchangeSource: ExchangeCurrency = 'credits';
  private exchangeTarget: ExchangeCurrency = 'coreTokens';
  private exchangeAmount = 200;
  private exchangeConfirmLockedUntil = 0;
  private exchangeConfirmationArmed = true;
  private economyConsoleTabIndex = 0;
  private readonly handleEscape = (): void => {
    if (this.overlay) {
      this.clearRecalibrationSession();
      this.closeOverlay();
    }
    else this.returnToPrevious();
  };
  private readonly handleResize = (): void => {
    this.scene.restart({ returnScene: this.returnScene });
  };
  private readonly handleLibraryWheel = (pointer: Phaser.Input.Pointer, _currentlyOver: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void => {
    if (this.libraryViewer?.containsDetailPoint(pointer.x, pointer.y)) this.libraryViewer.scrollBy(deltaY * 0.72);
  };

  constructor() { super(SceneKeys.Garage); }

  create(data?: OperatorGarageSceneData): void {
    try {
      SaveSystem.get();
    } catch {
      this.scene.start(SceneKeys.LocalProfiles);
      return;
    }
    this.returnScene = data?.returnScene ?? SceneKeys.MainMenu;
    setSceneUiModalDepth(this, 0);
    configureSceneUiNavigation(this, {
      onBack: this.handleEscape,
      onScroll: (amount) => this.libraryViewer?.scrollBy(amount)
    });
    this.audio.startMusicLoop();
    const { width, height } = this.scale;
    const layout = calculateGarageLayout(width, height);
    this.tutorialTargets.clear();
    createGarageEnvironment(this, layout);
    createModWorkbench(
      this,
      layout.cardWidth,
      layout.cardHeight,
      layout.dockCenters,
      layout.compact,
      layout.dockActionHeight,
      layout.dockActionGap,
      layout.workbenchTopPadding
    );

    const headerScale = layout.compact ? 1 : Phaser.Math.Clamp(layout.uiScale, 0.86, 1.2);
    createButton(
      this,
      layout.safe + 79 * headerScale,
      34 * headerScale,
      'BACK',
      () => this.returnToPrevious(),
      148 * headerScale,
      'menu',
      { height: 46 * headerScale, fontSize: 18 * headerScale }
    ).setDepth(80);
    this.add.text(width / 2, 18, 'OPERATOR GARAGE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 24 : Math.round(38 * headerScale)}px`, color: '#67f7ff', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setDepth(70);
    this.add.text(width / 2, layout.compact ? 50 : 57 * headerScale, 'LOADOUT WORKSTATION // NEXT DEPLOYMENT', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 13 : Math.round(19 * headerScale)}px`, color: '#ff9bd9', letterSpacing: 1
    }).setOrigin(0.5, 0).setDepth(70);

    this.createConfigurationTerminal(layout.configTerminal, layout.compact);
    this.createWalletTerminal(layout.walletTerminal, layout.compact);
    this.createOperatorPreview(layout.operatorPreview, layout.compact);
    this.createModDocks(
      layout.cardWidth,
      layout.cardHeight,
      layout.dockCenters,
      layout.compact,
      layout.dockActionHeight,
      layout.dockActionGap
    );
    const activeLoadout = SaveSystem.getModCollection().loadouts.find((loadout) => loadout.id === SaveSystem.getModCollection().activeLoadoutId)
      ?? SaveSystem.getModCollection().loadouts[0];
    const supremeCount = activeLoadout ? countEquippedSupremeMods(activeLoadout.slots) : 0;
    const supremeModeActive = isSupremeProtocol(SaveSystem.getPreferredProtocol());
    this.add.text(
      layout.dockCenters.at(-1)!.x + layout.cardWidth / 2 - 8,
      layout.dockCenters[0].y - layout.cardHeight / 2 - layout.workbenchTopPadding + 11,
      supremeModeActive
        ? `SUPREME CAPACITY // ${supremeCount} / ${MAX_EQUIPPED_SUPREME_MODS}`
        : `SUPREME MODULES OFFLINE // ${supremeCount} STORED`,
      {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: `${layout.compact ? 9 : Phaser.Math.Clamp(layout.cardWidth * 0.06, 11, 14)}px`,
        fontStyle: 'bold',
        color: !supremeModeActive ? '#849da6' : supremeCount >= MAX_EQUIPPED_SUPREME_MODS ? '#ff8bdc' : '#b9fbff'
      }
    ).setOrigin(1, 0.5).setDepth(21);
    this.createStations(layout.stationCenters, layout.stationWidth, layout.stationHeight);

    this.tutorialDirector = new TutorialDirector({
      scene: 'garage',
      resolveTarget: (target) => {
        const rect = target === 'garage.configuration'
          ? layout.configTerminal
          : target === 'garage.loadout'
            ? {
                x: layout.dockCenters[0].x - layout.cardWidth / 2 - 12,
                y: layout.dockCenters[0].y - layout.cardHeight / 2 - 34,
                width: layout.dockCenters.at(-1)!.x - layout.dockCenters[0].x + layout.cardWidth + 24,
                height: layout.cardHeight + layout.dockActionGap + layout.dockActionHeight + 48
              }
            : target === 'garage.overdrive'
              ? {
                  x: layout.stationCenters[1].x - layout.stationWidth / 2,
                  y: layout.stationCenters[1].y - layout.stationHeight / 2,
                  width: layout.stationWidth,
                  height: layout.stationHeight
                }
              : target === 'garage.mod-collection'
                ? this.tutorialTargets.get(target)?.getBounds() ?? null
                : null;
        if (!rect) return null;
        const canvas = this.game.canvas.getBoundingClientRect();
        return projectTutorialBoundsToViewport(rect, canvas, this.scale.width, this.scale.height);
      },
      setMode: () => undefined
    });
    this.tutorialDirector.startEligible();
    window.setTimeout(() => {
      if (!this.scene.isActive()) return;
      TutorialEventBus.emit('ui.garageSceneOpened');
      if (SaveSystem.getHighestRound() >= RUN_PROTOCOLS.overdrive.unlockHighestRound) TutorialEventBus.emit('progression.overdriveUnlocked');
    }, 180);

    if (this.status) {
      this.add.text(width / 2, layout.stationCenters[0].y - layout.stationHeight / 2 - 32, this.status, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 14 : Math.round(17 * layout.uiScale)}px`, fontStyle: 'bold', color: this.status.startsWith('BLOCKED') ? '#ff94aa' : '#8effc3', align: 'center'
      }).setOrigin(0.5).setDepth(90).setWordWrapWidth(width - 60, true).setMaxLines(2);
    }

    this.input.keyboard?.off('keydown-ESC', this.handleEscape);
    this.input.keyboard?.on('keydown-ESC', this.handleEscape);
    this.scale.off('resize', this.handleResize, this);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.handleEscape);
      this.scale.off('resize', this.handleResize, this);
      this.closeOverlay();
      this.destroyOperatorPreview();
      this.tutorialDirector?.destroy();
      this.tutorialDirector = null;
    });
    if (data?.openRunConfiguration) this.time.delayedCall(0, () => this.showRunConfiguration());
  }

  private terminalFrame(rect: GarageRect, title: string, color = 0x55efff): Phaser.GameObjects.Container {
    const root = this.add.container(rect.x, rect.y).setDepth(40);
    const roomy = rect.height >= 180;
    const contentScale = roomy ? Phaser.Math.Clamp(rect.width / 400, 1, 1.36) : 1;
    const headerHeight = Math.round(roomy ? 35 * contentScale : 29);
    const panel = this.add.rectangle(0, 0, rect.width, rect.height, 0x06111a, 0.94).setOrigin(0).setStrokeStyle(2, color, 0.62);
    const glass = this.add.rectangle(6, headerHeight + 5, rect.width - 12, rect.height - headerHeight - 11, color, 0.018)
      .setOrigin(0)
      .setStrokeStyle(1, 0x345563, 0.3);
    const scanlines = this.add.grid(
      7,
      headerHeight + 6,
      rect.width - 14,
      rect.height - headerHeight - 13,
      rect.width,
      roomy ? Math.round(8 * contentScale) : 6,
      0x000000,
      0,
      color,
      0.025
    ).setOrigin(0);
    const header = this.add.rectangle(0, 0, rect.width, headerHeight, color, 0.1).setOrigin(0).setStrokeStyle(1, color, 0.35);
    const label = this.add.text(13 * contentScale, roomy ? 8 * contentScale : 7, title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${roomy ? Math.round(15 * contentScale) : 12}px`, color: Phaser.Display.Color.IntegerToColor(color).rgba
    }).setOrigin(0);
    const led = this.add.circle(rect.width - 14 * contentScale, headerHeight / 2, roomy ? 4 * contentScale : 3, 0x68ffac, 0.9);
    const footerRail = this.add.rectangle(9, rect.height - 7, rect.width - 18, 2, color, 0.13).setOrigin(0);
    root.add([panel, glass, scanlines, header, label, led, footerRail]);
    addTerminalMount(this, root, rect, color);
    this.tweens.add({ targets: led, alpha: { from: 0.35, to: 1 }, duration: 1100, yoyo: true, repeat: -1 });
    return root;
  }

  private createConfigurationTerminal(rect: GarageRect, compact: boolean): void {
    this.configurationValueTexts.clear();
    this.configurationFeeText = null;
    this.configurationPersistenceText = null;
    const root = this.terminalFrame(rect, 'DEPLOYMENT CONFIGURATION');
    const roomy = !compact && rect.height >= 180;
    const contentScale = roomy ? Phaser.Math.Clamp(rect.width / 400, 1, 1.36) : 1;
    const highestRound = SaveSystem.getHighestRound();
    const requested = SaveSystem.getPreferredProtocol();
    const protocol = isRunProtocolUnlocked(requested, { highestRound, supremeHighestRound: SaveSystem.getSupremeHighestRound(), regularOverdriveCompleted: SaveSystem.hasCompletedRegularOverdrive() }) ? requested : 'normal';
    const setup = SaveSystem.getNextRunSetupSelection();
    const rows = [
      { label: 'PROTOCOL', value: RUN_PROTOCOLS[protocol].label, action: () => this.cycleProtocol(protocol) },
      { label: 'CONTRACT', value: `${setup.contract ? RUN_CONTRACTS[setup.contract].label : 'NO CONTRACT ACTIVE'}  [CHANGE]`, action: () => this.showRunConfiguration() },
      { label: 'SIGNAL', value: `${setup.modFocus ? MOD_FOCUS_LABELS[setup.modFocus] : 'NO SIGNAL ACTIVE'}  [CHANGE]`, action: () => this.showRunConfiguration() }
    ];
    const startY = roomy ? Math.round(43 * contentScale) : 33;
    const rowGap = roomy ? Math.round(43 * contentScale) : 27;
    rows.forEach((row, index) => {
      const y = startY + index * rowGap;
      const hit = this.add.rectangle(7, y - 1, rect.width - 14, rowGap - 4, 0x102331, 0.5).setOrigin(0).setInteractive({ useHandCursor: true });
      const label = this.add.text(15 * contentScale, y + (roomy ? 7 * contentScale : 1), row.label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${roomy ? Math.round(14 * contentScale) : 9}px`, color: '#8fc6d5'
      }).setOrigin(0);
      const value = this.add.text(roomy ? rect.width - 15 * contentScale : 15, y + (roomy ? 4 * contentScale : 10), row.value, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${roomy ? Math.round(17 * contentScale) : 10}px`, fontStyle: 'bold', color: '#e4fcff'
      }).setOrigin(roomy ? 1 : 0, 0).setMaxLines(1);
      if (row.label === 'CONTRACT' || row.label === 'SIGNAL') this.configurationValueTexts.set(row.label.toLowerCase() as 'contract' | 'signal', value);
      hit.on('pointerover', () => {
        hit.setFillStyle(0x17374a, 0.75);
        this.audio.playSfx('menuHover');
      });
      hit.on('pointerout', () => hit.setFillStyle(0x102331, 0.5));
      hit.on('pointerdown', () => {
        row.action();
        this.audio.playSfx('menu');
      });
      registerUiFocusable(this, hit, {
        label: `${row.label} ${row.value}`,
        activate: () => {
          row.action();
          this.audio.playSfx('menu');
        }
      });
      root.add([hit, label, value]);
    });
    if (roomy) {
      const cost = getRunSetupCost(setup);
      const saved = SaveSystem.getGarageState().savedDeploymentEnabled;
      this.configurationPersistenceText = this.add.text(rect.width / 2, rect.height - 36 * contentScale, saved ? 'SAVED CONFIGURATION // ACTIVE' : 'SAVED CONFIGURATION // OFF', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.round(10 * contentScale)}px`, fontStyle: 'bold', color: saved ? '#72ffae' : '#7895a2'
      }).setOrigin(0.5);
      this.configurationFeeText = this.add.text(rect.width / 2, rect.height - 17, cost > 0 ? `RUN COST // ${cost.toLocaleString()} CREDITS` : 'RUN COST // FREE', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${Math.round(14 * contentScale)}px`, fontStyle: 'bold', color: cost > 0 ? '#ffd077' : '#7fffc2'
      }).setOrigin(0.5);
      root.add([this.configurationPersistenceText, this.configurationFeeText]);
    }
  }

  private refreshConfigurationTerminalState(): void {
    const setup = SaveSystem.getNextRunSetupSelection();
    this.configurationValueTexts.get('contract')?.setText(`${setup.contract ? RUN_CONTRACTS[setup.contract].label : 'NO CONTRACT ACTIVE'}  [CHANGE]`);
    this.configurationValueTexts.get('signal')?.setText(`${setup.modFocus ? MOD_FOCUS_LABELS[setup.modFocus] : 'NO SIGNAL ACTIVE'}  [CHANGE]`);
    const cost = getRunSetupCost(setup);
    const saved = SaveSystem.getGarageState().savedDeploymentEnabled;
    this.configurationPersistenceText
      ?.setText(saved ? 'SAVED CONFIGURATION // ACTIVE' : 'SAVED CONFIGURATION // OFF')
      .setColor(saved ? '#72ffae' : '#7895a2');
    this.configurationFeeText
      ?.setText(cost > 0 ? `RUN COST // ${cost.toLocaleString()} CREDITS` : 'RUN COST // FREE')
      .setColor(cost > 0 ? '#ffd077' : '#7fffc2');
  }

  private createWalletTerminal(rect: GarageRect, compact: boolean): void {
    this.walletValueTexts.clear();
    const root = this.terminalFrame(rect, 'DIGITAL WALLET', 0xff5bcf);
    const roomy = !compact && rect.height >= 180;
    const contentScale = roomy ? Phaser.Math.Clamp(rect.width / 400, 1, 1.36) : 1;
    const save = SaveSystem.get();
    const plasma = SaveSystem.getModCollection().plasmaChips;
    const values = [
      ['credits', 'CREDITS', save.credits.toLocaleString(), '#7fffe5'],
      ['coreTokens', 'CORE TOKENS', save.coreTokens.toLocaleString(), '#ffd37b'],
      ['plasmaChips', 'PLASMA CHIPS', plasma.toLocaleString(), '#db8fff'],
      ['fluxCores', 'FLUX CORES', save.fluxCores.toLocaleString(), '#76ff9e']
    ] as const;
    values.forEach(([currency, label, value, color], index) => {
      const y = (roomy ? 42 * contentScale : 31) + index * (roomy ? 36 * contentScale : 23);
      root.add(this.add.text(15 * contentScale, y, label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${roomy ? Math.round(15 * contentScale) : 11}px`, color: '#93b8c7'
      }).setOrigin(0));
      const valueText = this.add.text(rect.width - 15 * contentScale, y - 4 * contentScale, value, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${roomy ? Math.round(21 * contentScale) : 14}px`, color
      }).setOrigin(1, 0);
      this.walletValueTexts.set(currency, valueText);
      root.add(valueText);
    });
    if (roomy && rect.height >= 210) root.add(this.add.text(rect.width / 2, rect.height - 18, `HIGHEST ROUND // ${SaveSystem.getHighestRound()}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${Math.round(15 * contentScale)}px`, fontStyle: 'bold', color: '#b7dce8'
    }).setOrigin(0.5));
  }

  private createOperatorPreview(rect: GarageRect, compact: boolean): void {
    this.operatorPreviewLayout = { rect: { ...rect }, compact };
    this.renderOperatorPreview();
  }

  private renderOperatorPreview(): void {
    if (!this.operatorPreviewLayout) return;
    this.destroyOperatorPreview();
    const { rect, compact } = this.operatorPreviewLayout;
    const large = !compact && rect.width >= 300 && rect.height >= 170;
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height * (large ? 0.48 : 0.52);
    const root = this.add.container(centerX, centerY).setDepth(35);
    const previewScale = large
      ? Phaser.Math.Clamp(Math.min(rect.width / 340, rect.height / 200), 1, 1.35)
      : 1;
    root.setScale(previewScale);
    const liftY = large ? 58 : compact ? 35 : 45;
    const bayWidth = large ? 258 : compact ? 142 : 192;
    const bayTop = large ? -82 : compact ? -44 : -61;
    const bayBottom = liftY + (large ? 27 : compact ? 18 : 22);
    const bay = this.add.graphics();
    bay.fillStyle(0x030910, 0.58).fillRoundedRect(-bayWidth / 2, bayTop, bayWidth, bayBottom - bayTop, large ? 10 : 6);
    bay.fillStyle(0x0e1d27, 0.72).fillRect(-bayWidth / 2 + 8, bayTop + 8, bayWidth - 16, bayBottom - bayTop - 17);
    bay.lineStyle(2, 0x31525f, 0.56).strokeRoundedRect(-bayWidth / 2, bayTop, bayWidth, bayBottom - bayTop, large ? 10 : 6);
    bay.lineStyle(2, 0x58efff, 0.25);
    bay.lineBetween(-bayWidth / 2 + 9, bayTop + 15, -bayWidth / 2 + 9, bayBottom - 12);
    bay.lineStyle(2, 0xff5bcf, 0.2);
    bay.lineBetween(bayWidth / 2 - 9, bayTop + 15, bayWidth / 2 - 9, bayBottom - 12);
    bay.lineStyle(1, 0x456977, 0.34);
    bay.lineBetween(-bayWidth * 0.32, bayTop + 12, -bayWidth * 0.32, bayBottom - 13);
    bay.lineBetween(bayWidth * 0.32, bayTop + 12, bayWidth * 0.32, bayBottom - 13);
    bay.fillStyle(0x58efff, 0.045).fillTriangle(-bayWidth * 0.34, bayTop + 10, -38, liftY - 4, 0, liftY - 4);
    bay.fillStyle(0xff5bcf, 0.035).fillTriangle(bayWidth * 0.34, bayTop + 10, 38, liftY - 4, 0, liftY - 4);
    const bayTag = this.add.text(0, bayTop + (large ? 8 : 6), 'BAY 01 // OPERATIVE LINK', {
      fontFamily: 'Orbitron, sans-serif', fontSize: large ? '9px' : compact ? '6px' : '8px', color: '#74b7c3', letterSpacing: 1
    }).setOrigin(0.5, 0);
    const liftShadow = this.add.ellipse(0, liftY + (large ? 8 : 5), large ? 220 : compact ? 132 : 172, large ? 42 : compact ? 26 : 34, 0x000000, 0.48);
    const liftBase = this.add.ellipse(0, liftY + (large ? 5 : 3), large ? 208 : compact ? 126 : 162, large ? 40 : compact ? 25 : 33, 0x0a151e, 0.96).setStrokeStyle(2, 0x294a56, 0.78);
    const lift = this.add.ellipse(0, liftY, large ? 198 : compact ? 120 : 154, large ? 38 : compact ? 24 : 31, 0x142a35, 0.86).setStrokeStyle(2, 0x58efff, 0.7);
    const glow = this.add.ellipse(0, liftY - (large ? 9 : 7), large ? 154 : compact ? 92 : 118, large ? 23 : compact ? 14 : 18, 0x5cf6ff, 0.23);
    const ringY = large ? -11 : -5;
    const outerRing = this.add.circle(0, ringY, large ? 67 : compact ? 42 : 54, 0x000000, 0).setStrokeStyle(1, 0x58efff, 0.24);
    const ring = this.add.circle(0, ringY, large ? 60 : compact ? 38 : 49, 0x08131c, 0.38).setStrokeStyle(2, 0xff5bcf, 0.48);
    const projectionScan = this.add.rectangle(0, bayTop + (large ? 29 : 19), large ? 112 : compact ? 68 : 88, 2, 0x6af6ff, 0.28);
    const shapeId = SaveSystem.getEquippedCosmeticId('playerShape') ?? 'player-circle';
    const appearance = SaveSystem.getOperativeFrameAppearance(this.time.now);
    const texture = this.textures.exists(appearance.textureKey) ? appearance.textureKey : appearance.frame.textureKey ?? 'player-circle';
    const operative = this.add.image(0, ringY, texture).setScale(large ? 2.75 : compact ? 1.72 : 2.2);
    if (appearance.tint === null && texture === appearance.textureKey) operative.clearTint();
    else operative.setTint(appearance.tint ?? appearance.primaryColor);
    const shape = COSMETICS.find((item) => item.id === shapeId)?.label ?? 'Operative';
    const caption = this.add.text(0, large ? 82 : compact ? 43 : 64, shape.toUpperCase(), {
      fontFamily: 'Rajdhani, sans-serif', fontSize: large ? '15px' : compact ? '11px' : '13px', fontStyle: 'bold', color: '#c9f3ff'
    }).setOrigin(0.5);
    root.add([bay, bayTag, liftShadow, liftBase, lift, glow, outerRing, ring, projectionScan, operative, caption]);
    this.operatorPreviewRoot = root;
    this.tweens.add({ targets: operative, y: { from: ringY - 4, to: ringY + 3 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: ring, alpha: { from: 0.28, to: 0.62 }, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: outerRing, scale: { from: 0.96, to: 1.05 }, alpha: { from: 0.12, to: 0.42 }, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: projectionScan,
      y: { from: bayTop + (large ? 29 : 19), to: liftY - (large ? 15 : 10) },
      alpha: { from: 0.08, to: 0.34 },
      duration: large ? 2600 : 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    if (appearance.mode === 'prism') {
      this.operatorPreviewColorTimer = this.time.addEvent({
        delay: 90,
        loop: true,
        callback: () => {
          const tint = SaveSystem.getOperativeFrameAppearance(this.time.now).tint;
          if (operative.active && tint !== null) operative.setTint(tint);
        }
      });
    }
  }

  private refreshWalletTerminalState(): void {
    const wallet = SaveSystem.get();
    const values: Record<ExchangeCurrency, number> = {
      credits: wallet.credits,
      coreTokens: wallet.coreTokens,
      plasmaChips: SaveSystem.getModCollection().plasmaChips,
      fluxCores: wallet.fluxCores
    };
    for (const currency of EXCHANGE_CURRENCIES) this.walletValueTexts.get(currency)?.setText(values[currency].toLocaleString());
  }

  private refreshOperatorPreview(): void {
    this.renderOperatorPreview();
  }

  private destroyOperatorPreview(): void {
    this.operatorPreviewColorTimer?.remove(false);
    this.operatorPreviewColorTimer = null;
    if (!this.operatorPreviewRoot) return;
    this.tweens.killTweensOf(this.operatorPreviewRoot.list);
    this.operatorPreviewRoot.destroy(true);
    this.operatorPreviewRoot = null;
  }

  private createModDocks(
    cardWidth: number,
    cardHeight: number,
    centers: Array<{ x: number; y: number }>,
    compact: boolean,
    actionButtonHeight: number,
    actionButtonGap: number
  ): void {
    const mods = SaveSystem.getModCollection();
    const docks = getGarageDockModels(mods);
    const supremeModeActive = isSupremeProtocol(SaveSystem.getPreferredProtocol());
    const compactCard = compact || cardWidth < 160;
    const readableScale = compact ? 1 : Phaser.Math.Clamp(cardWidth / 132, 1, 1.55);
    const slotLabelOffset = compact ? 14 : Phaser.Math.Clamp(cardWidth * 0.115, 17, 25);
    docks.forEach((dock, index) => {
      const center = centers[index];
      const definition = dock.card ? MOD_BY_ID.get(dock.card.modId) : undefined;
      const color = definition ? MOD_RARITY_COLORS[definition.rarity] : 0x3e8999;
      const backing = this.add.rectangle(center.x, center.y, cardWidth + 12, cardHeight + 12, 0x06111a, 0.94).setStrokeStyle(2, color, dock.empty ? 0.42 : 0.8).setDepth(24);
      const rails = this.add.graphics().setDepth(25);
      const railLeft = center.x - cardWidth / 2 - 8;
      const railRight = center.x + cardWidth / 2 + 8;
      const railTop = center.y - cardHeight / 2 - 7;
      const railBottom = center.y + cardHeight / 2 + 7;
      rails.fillStyle(0x172832, 0.98).fillRect(railLeft, railTop, 5, cardHeight + 14).fillRect(railRight - 5, railTop, 5, cardHeight + 14);
      rails.fillStyle(color, dock.empty ? 0.16 : 0.3).fillRect(railLeft + 1, railTop + 5, 1, cardHeight + 4).fillRect(railRight - 2, railTop + 5, 1, cardHeight + 4);
      rails.fillStyle(0x273e48, 0.92).fillRect(railLeft - 2, railTop, 9, 5).fillRect(railRight - 7, railTop, 9, 5);
      rails.fillStyle(0x273e48, 0.92).fillRect(railLeft - 2, railBottom - 5, 9, 5).fillRect(railRight - 7, railBottom - 5, 9, 5);
      const lock = this.add.circle(railRight - 2, railBottom + 5, compact ? 2 : Phaser.Math.Clamp(cardWidth * 0.025, 3, 5), dock.empty ? 0x416572 : 0x69ffae, dock.empty ? 0.42 : 0.9).setDepth(27);
      this.add.text(center.x, center.y - cardHeight / 2 - slotLabelOffset, dock.label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : Math.round(11 * readableScale)}px`, fontStyle: 'bold', color: definition ? Phaser.Display.Color.IntegerToColor(color).rgba : '#94c2cd', align: 'center'
      }).setOrigin(0.5).setDepth(27).setWordWrapWidth(cardWidth + 24, true).setMaxLines(2);
      if (dock.card) {
        const supremeOffline = definition?.rarity === 'supreme' && !supremeModeActive;
        const view = createModCardView(this, center.x, center.y, dock.card, dock.card.upgradeLevel, {
          width: cardWidth,
          height: cardHeight,
          compact: compactCard,
          equipped: !supremeOffline,
          focusId: `garage:loadout:${dock.slot}`,
          focusDefaultPriority: index === 0 ? 30 : 0
        });
        if (supremeOffline) {
          view.setAlpha(0.52);
          this.add.text(center.x, center.y, 'OFFLINE\nSUPREME ONLY', {
            fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 9 : Math.round(11 * readableScale)}px`,
            fontStyle: 'bold', color: '#ff9fe1', align: 'center', backgroundColor: '#02070add'
          }).setOrigin(0.5).setPadding(8, 5).setDepth(27);
        }
        view.setDepth(26).on('pointerdown', () => {
          this.audio.playSfx('menu');
          this.openCollection(dock.card?.instanceId, definition?.rarity === 'supreme' ? 'supreme' : definition?.category ?? 'all', dock.slot);
        });
      } else {
        const emptyHit = this.add.rectangle(center.x, center.y, cardWidth, cardHeight, 0x0a1923, 0.78).setStrokeStyle(1, 0x4bd7e9, 0.25).setInteractive({ useHandCursor: true }).setDepth(26);
        this.add.text(center.x, center.y - 13 * readableScale, '+', { fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 25 : Math.round(34 * readableScale)}px`, color: '#4d8796' }).setOrigin(0.5).setDepth(27);
        this.add.text(center.x, center.y + 22 * readableScale, 'AWAITING\nMODULE', { fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 10 : Math.round(13 * readableScale)}px`, fontStyle: 'bold', color: '#83aab5', align: 'center' }).setOrigin(0.5).setDepth(27);
        emptyHit.on('pointerover', () => {
          emptyHit.setStrokeStyle(2, 0x62efff, 0.72);
          this.audio.playSfx('menuHover');
        });
        emptyHit.on('pointerout', () => emptyHit.setStrokeStyle(1, 0x4bd7e9, 0.25));
        emptyHit.on('pointerdown', () => {
          this.audio.playSfx('menu');
          this.openCollection(undefined, dock.slot === 'wildcard' ? 'all' : dock.slot, dock.slot);
        });
        registerUiFocusable(this, emptyHit, {
          id: `garage:loadout:${dock.slot}`,
          label: `${dock.label} awaiting module`,
          defaultPriority: index === 0 ? 30 : 0,
          activate: () => {
            this.audio.playSfx('menu');
            this.openCollection(undefined, dock.slot === 'wildcard' ? 'all' : dock.slot, dock.slot);
          }
        });
      }
      const actionY = center.y + cardHeight / 2 + actionButtonGap + actionButtonHeight / 2;
      createButton(this, center.x, actionY, dock.card ? 'UNEQUIP' : 'BROWSE', () => {
        if (dock.card) {
          SaveSystem.unequipMod(dock.slot);
          this.status = `SUCCESS // ${dock.label.replace('SLOT ', '').replace(' // ', ' ')} CLEARED`;
          this.scene.restart({ returnScene: this.returnScene });
        } else this.openCollection(undefined, dock.slot === 'wildcard' ? 'all' : dock.slot, dock.slot);
      }, cardWidth, 'menu', {
        height: actionButtonHeight,
        fontSize: compact ? 16 : Phaser.Math.Clamp(17 * readableScale, 17, 21)
      }).setDepth(28);
      this.tweens.add({ targets: backing, alpha: { from: 0.7, to: 1 }, duration: 1800 + index * 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: lock, alpha: { from: dock.empty ? 0.18 : 0.4, to: dock.empty ? 0.48 : 1 }, duration: 950 + index * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  }

  private createStations(centers: Array<{ x: number; y: number }>, width: number, height: number): void {
    const stations: Array<{ label: string; action: () => void }> = [
      { label: 'GEAR LOCKER', action: () => this.showCosmetics() },
      { label: 'OVERDRIVE', action: () => this.showOverdrive() },
      { label: 'MOD LIBRARY', action: () => this.showLibrary() },
      { label: 'MOD COLLECTION', action: () => this.openCollection() },
      { label: 'CONFIG PRESETS', action: () => this.showPresets() },
      { label: 'CURRENCY EXCHANGE', action: () => {
        this.exchangeConfirmationArmed = true;
        this.showCurrencyExchange();
      } }
    ];
    stations.forEach((station, index) => {
      createStationHousing(this, centers[index], width, index, height);
      const button = createButton(this, centers[index].x, centers[index].y, station.label, () => {
        if (station.label === 'MOD COLLECTION') TutorialEventBus.emit('ui.modCollectionSelected');
        station.action();
      }, width, 'menu', {
        height,
        fontSize: Phaser.Math.Clamp(height * 0.34, 16, 21),
        horizontalPadding: 28
      }).setDepth(80);
      if (station.label === 'MOD COLLECTION') this.tutorialTargets.set('garage.mod-collection', button);
      const led = this.add.circle(centers[index].x - width / 2 + 11, centers[index].y, Phaser.Math.Clamp(height * 0.045, 2, 3), index % 2 ? 0xff5bcf : 0x62f4ff, 0.9).setDepth(82);
      this.tweens.add({ targets: led, alpha: { from: 0.25, to: 1 }, duration: 850 + index * 180, yoyo: true, repeat: -1 });
      button.setDepth(80);
    });
  }

  private createOverlay(title: string): Phaser.GameObjects.Container {
    this.closeOverlay();
    setSceneUiModalDepth(this, 30);
    const { width, height } = this.scale;
    const root = this.add.container(0, 0).setDepth(2000);
    const blocker = this.add.rectangle(width / 2, height / 2, width, height, 0x01040a, 0.94).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, width - 16, height - 16, 0x06111b, 0.985).setStrokeStyle(2, 0x54efff, 0.8);
    const scanlines = this.add.grid(width / 2, height / 2, width - 20, height - 20, width, 6, 0x000000, 0, 0x57eafa, 0.035);
    const narrow = width < 760;
    const headingX = narrow ? (width - 118) / 2 : width / 2;
    const heading = this.add.text(headingX, 20, title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${narrow ? 18 : Phaser.Math.Clamp(width * 0.027, 21, 30)}px`, color: '#65f5ff', fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    const closeWidth = narrow ? 104 : 128;
    const closeRightInset = narrow ? 18 : 30;
    const closeY = narrow ? 48 : 50;
    const close = createButton(this, width - closeWidth / 2 - closeRightInset, closeY, 'CLOSE', () => {
      this.clearRecalibrationSession();
      this.closeOverlay();
    }, closeWidth);
    root.add([blocker, panel, scanlines, heading, close]);
    this.overlay = root;
    return root;
  }

  private runConfigurationFocusTarget: string | null = null;

  private showRunConfiguration(): void {
    const focusTarget = this.runConfigurationFocusTarget;
    this.runConfigurationFocusTarget = null;
    const root = this.createOverlay('RUN CONFIGURATION // ONE-RUN SETUP');
    const { width, height } = this.scale;
    const setup = SaveSystem.getNextRunSetupSelection();
    const garageState = SaveSystem.getGarageState();
    const totalCost = getRunSetupCost(setup);
    const save = SaveSystem.get();
    const modCollection = SaveSystem.getModCollection();
    const contract = setup.contract ? RUN_CONTRACTS[setup.contract] : null;
    const consoleView = createRunConfigurationConsole(this, root, width, height, {
      setup,
      savedDeploymentEnabled: garageState.savedDeploymentEnabled,
      totalCost,
      signalMultiplier: ECONOMY_BALANCE.modFocus.categoryWeightMultiplier,
      contractLabel: contract?.label ?? 'No Contract',
      contractCreditMultiplier: contract?.creditRewardMultiplier ?? 1,
      contractEnemyHealthMultiplier: contract?.enemyHealthMultiplier ?? 1,
      contractSpawnCadenceMultiplier: contract?.spawnCadenceMultiplier ?? 1,
      wallet: {
        credits: save.credits,
        coreTokens: save.coreTokens,
        plasmaChips: modCollection.plasmaChips,
        fluxCores: save.fluxCores
      }
    });
    const {
      density,
      compact,
      leftX,
      rightX,
      columnWidth,
      statusY,
      statusHeight,
      panelTop,
      selectionStartY,
      signalGap,
      contractGap,
      typography
    } = consoleView.layout;
    this.overlayAnimatedTargets.push(...consoleView.animatedTargets);

    const systemWidth = Math.min(columnWidth - 8, density === 'compressed' ? 330 : compact ? 420 : 500);
    const systemX = consoleView.layout.outerMargin + systemWidth * 0.5;
    const persistenceButton = createButton(
      this,
      systemX,
      statusY + statusHeight * 0.16,
      garageState.savedDeploymentEnabled ? 'KEEP CONFIGURATION ACTIVE // ON' : 'KEEP CONFIGURATION ACTIVE // OFF',
      () => {
        const result = SaveSystem.setSavedDeploymentEnabled(!garageState.savedDeploymentEnabled);
        this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? ''}`;
        this.refreshConfigurationTerminalState();
        this.runConfigurationFocusTarget = 'persistence';
        this.showRunConfiguration();
        return result.ok;
      },
      systemWidth - 32,
      'menu',
      {
        height: Math.min(34, statusHeight * 0.46),
        fontSize: typography.diagnosticLabel,
        horizontalPadding: 24,
        focusModalDepth: 30,
        focusDefaultPriority: focusTarget === 'persistence' ? 90 : 45,
        focusLabel: `KEEP CONFIGURATION ACTIVE ${garageState.savedDeploymentEnabled ? 'ON' : 'OFF'}`
      }
    );
    root.add(persistenceButton);

    const feeSummary = totalCost > 0
      ? `RUN FEE // ${totalCost.toLocaleString()} CREDITS // CHARGED ON DEPLOYMENT`
      : 'RUN FEE // FREE // STANDARD PARAMETERS';
    root.add(this.add.text(width / 2, statusY - statusHeight / 2 - 15, feeSummary, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.runFee}px`, fontStyle: 'bold',
      color: totalCost > 0 ? '#ffd27d' : '#75ffb1', align: 'center', letterSpacing: 2,
      backgroundColor: '#030a11'
    }).setOrigin(0.5).setPadding(12, 3));

    root.add(this.add.text(leftX, panelTop + (density === 'compressed' ? 42 : 48), `Program a category frequency at ${ECONOMY_BALANCE.modFocus.categoryWeightMultiplier.toFixed(1)}x weighting. Rarity and total drop quantity remain unchanged.`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.introduction}px`, color: '#b8dde7', align: 'center',
      wordWrap: { width: columnWidth - 38, useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2));

    const signalOptions: Array<{ id: RunSetupSelection['modFocus']; label: string }> = [
      { id: null, label: 'NO SIGNAL // STANDARD DROPS' },
      ...MOD_FOCUS_CATEGORIES.map((id) => ({ id, label: MOD_FOCUS_LABELS[id].toUpperCase() }))
    ];
    const signalStartY = selectionStartY;
    signalOptions.forEach((option, index) => {
      const selected = setup.modFocus === option.id;
      const fee = option.id ? `${ECONOMY_BALANCE.modFocus.cost.toLocaleString()}C` : 'FREE';
      const y = signalStartY + index * signalGap;
      const rowWidth = columnWidth - (compact ? 30 : 54);
      const indicator = this.add.rectangle(
        leftX - rowWidth / 2 + 7,
        y,
        selected ? 5 : 2,
        Math.min(density === 'compressed' ? 28 : compact ? 36 : 42, signalGap - 7),
        selected ? 0x55efff : 0x315563,
        selected ? 0.95 : 0.35
      );
      const icon = this.add.text(leftX - rowWidth / 2 + 24, y, option.id ? option.id.slice(0, 1).toUpperCase() : '0', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${typography.selectionMarker}px`, fontStyle: 'bold',
        color: selected ? '#b9fbff' : '#557b88'
      }).setOrigin(0.5);
      root.add([indicator, icon]);
      const button = createButton(this, leftX, y, `${selected ? 'SIGNAL LOCKED // ' : ''}${option.label}  //  ${fee}`, () => {
        const result = SaveSystem.setNextRunSetupSelection({ ...setup, modFocus: option.id });
        if (!result.ok) return false;
        this.status = `SUCCESS // ${option.id ? MOD_FOCUS_LABELS[option.id] : 'Signal removed'} configured for next deployment.`;
        this.refreshConfigurationTerminalState();
        // Rebuild only the overlay so its selected state and diagnostics update
        // while the player remains in Run Configuration until choosing Close.
        this.runConfigurationFocusTarget = `signal:${option.id ?? 'none'}`;
        this.showRunConfiguration();
        return true;
      }, rowWidth, 'menu', {
        height: Math.min(density === 'compressed' ? 36 : compact ? 42 : 48, signalGap - 6),
        fontSize: typography.selection,
        horizontalPadding: compact ? 34 : 52,
        focusModalDepth: 30,
        focusDefaultPriority: focusTarget === `signal:${option.id ?? 'none'}` ? 90 : selected ? 35 : 0,
        focusLabel: `SIGNAL ${option.label}`,
        focusGroup: 'run-configuration-signals'
      });
      root.add(button);
    });

    root.add(this.add.text(rightX, panelTop + (density === 'compressed' ? 42 : 48), 'Load one-run engagement rules. Threat and real reward parameters update in the embedded diagnostics.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.introduction}px`, color: '#e1bed6', align: 'center',
      wordWrap: { width: columnWidth - 38, useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2));

    const contractOptions: Array<{ id: RunSetupSelection['contract']; label: string; description: string; cost: number }> = [
      { id: null, label: 'NO CONTRACT', description: 'Standard enemy, reward, and drop rules.', cost: 0 },
      ...RUN_CONTRACT_IDS.map((id) => ({
        id,
        label: RUN_CONTRACTS[id].label.toUpperCase(),
        description: RUN_CONTRACTS[id].description,
        cost: RUN_CONTRACTS[id].cost
      }))
    ];
    const contractStartY = selectionStartY;
    contractOptions.forEach((option, index) => {
      const selected = setup.contract === option.id;
      const y = contractStartY + index * contractGap;
      const rowWidth = columnWidth - (compact ? 30 : 54);
      const indicator = this.add.rectangle(
        rightX - rowWidth / 2 + 7,
        y,
        selected ? 5 : 2,
        density === 'compressed' ? 28 : compact ? 36 : 42,
        selected ? 0xff5bcf : 0x513548,
        selected ? 0.96 : 0.35
      );
      const threat = this.add.text(rightX + rowWidth / 2 - 15, y, option.id ? 'ARM' : 'BASE', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${typography.selectionMarker}px`, fontStyle: 'bold',
        color: selected ? '#ff9fe5' : '#6d7583'
      }).setOrigin(1, 0.5);
      root.add([indicator, threat]);
      const button = createButton(this, rightX, y, `${selected ? 'PROTOCOL ARMED // ' : ''}${option.label}  //  ${option.cost > 0 ? `${option.cost.toLocaleString()}C` : 'FREE'}`, () => {
        const result = SaveSystem.setNextRunSetupSelection({ ...setup, contract: option.id });
        if (!result.ok) return false;
        this.status = `SUCCESS // ${option.id ? RUN_CONTRACTS[option.id].label : 'Contract removed'} configured for next deployment.`;
        this.refreshConfigurationTerminalState();
        // Keep the console open so Signal and Contract can be configured in a
        // single visit; Close remains the only route back to the Garage.
        this.runConfigurationFocusTarget = `contract:${option.id ?? 'none'}`;
        this.showRunConfiguration();
        return true;
      }, rowWidth, 'menu', {
        height: density === 'compressed' ? 36 : compact ? 42 : 48,
        fontSize: typography.selection,
        horizontalPadding: compact ? 46 : 64,
        focusModalDepth: 30,
        focusDefaultPriority: focusTarget === `contract:${option.id ?? 'none'}` ? 90 : selected ? 35 : 0,
        focusLabel: `CONTRACT ${option.label}`,
        focusGroup: 'run-configuration-contracts'
      });
      root.add(button);
      root.add(this.add.text(rightX, y + (density === 'compressed' ? 21 : compact ? 26 : 31), option.description, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.selectionDescription}px`, color: '#c5dce5', align: 'center',
        wordWrap: { width: columnWidth - 38, useAdvancedWrap: true }
      }).setOrigin(0.5, 0).setMaxLines(1));
    });
  }

  private showLibrary(): void {
    configureSceneUiNavigation(this, { onBack: this.handleEscape });
    const root = this.createOverlay('MOD LIBRARY // SYSTEM DATABASE');
    const { width, height } = this.scale;
    const layout = calculateModLibraryLayout(width, height);
    const mods = SaveSystem.getModCollection();
    const progress = getModLibraryProgress(mods);
    const category = LIBRARY_CATEGORIES[this.libraryCategoryIndex];
    const rarity = LIBRARY_RARITIES[this.libraryRarityIndex];
    const ownership = LIBRARY_OWNERSHIP[this.libraryOwnershipIndex];
    const allEntries = getModLibraryEntries(mods);
    const entries = filterModDatabaseEntries(allEntries, { category, rarity, status: ownership });
    const toolbarGap = layout.compact ? 8 : 12;
    const toolbarControls = [
      { label: `TYPE: ${category.toUpperCase()}`, action: () => { this.libraryCategoryIndex = (this.libraryCategoryIndex + 1) % LIBRARY_CATEGORIES.length; } },
      { label: `RARITY: ${rarity.toUpperCase()}`, action: () => { this.libraryRarityIndex = (this.libraryRarityIndex + 1) % LIBRARY_RARITIES.length; } },
      { label: `STATUS: ${ownership.toUpperCase()}`, action: () => { this.libraryOwnershipIndex = (this.libraryOwnershipIndex + 1) % LIBRARY_OWNERSHIP.length; } }
    ];
    toolbarControls.forEach((control, index) => {
      const x = layout.grid.x + layout.toolbarButtonWidth / 2 + index * (layout.toolbarButtonWidth + toolbarGap);
      root.add(createModCollectionButton(this, x, layout.toolbarY, control.label, () => {
        control.action();
        this.libraryPage = 0;
        this.showLibrary();
      }, layout.toolbarButtonWidth, index === 2 ? 'utility' : 'standard', {
        height: layout.toolbarButtonHeight,
        fontSize: layout.compact ? 11 : 13,
        focusGroup: 'mod-library-toolbar'
      }));
    });
    const recalibrationX = layout.grid.x + layout.toolbarButtonWidth / 2 + 3 * (layout.toolbarButtonWidth + toolbarGap);
    root.add(createModCollectionButton(this, recalibrationX, layout.toolbarY, 'PLASMA RECALIBRATION', () => {
      const selected = entries.find((entry) => entry.definition.id === this.librarySelectedId) ?? entries[0];
      if (!selected) {
        this.audio.playSfx('itemLocked');
        return false;
      }
      this.showPlasmaRecalibration(selected.definition.id);
      return true;
    }, layout.toolbarButtonWidth, 'utility', {
      height: layout.toolbarButtonHeight,
      fontSize: layout.compact ? 9 : 11,
      focusDefaultPriority: 24,
      focusGroup: 'mod-library-toolbar'
    }));

    root.add(createModCollectionFrame(this, layout.grid, 'DATABASE INDEX // THREE-ROW ARCHIVE', 0x55eaff));
    const frameHeaderHeight = getModCollectionFrameHeaderHeight(layout.grid.height);
    root.add(this.add.text(layout.grid.x + layout.grid.width - 36, layout.grid.y + frameHeaderHeight / 2 + 1, `${progress.discovered} / ${progress.total} DISCOVERED`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 13 : 16}px`, fontStyle: 'bold', color: '#9effc9'
    }).setOrigin(1, 0.5));

    const pageSlice = resolveModLibraryPage(entries, this.libraryPage, layout.perPage, this.librarySelectedId, (entry) => entry.definition.id);
    const pageCount = pageSlice.pageCount;
    this.libraryPage = pageSlice.page;
    this.librarySelectedId = pageSlice.selectedId;
    const pageEntries = pageSlice.entries;
    const usedWidth = layout.columns * layout.cardWidth + (layout.columns - 1) * layout.cardGapX;
    const cardStartX = layout.grid.x + (layout.grid.width - usedWidth) / 2;
    pageEntries.forEach((entry, index) => {
      const x = cardStartX + layout.cardWidth / 2 + index % layout.columns * (layout.cardWidth + layout.cardGapX);
      const y = layout.gridContentTop + layout.cardHeight / 2 + Math.floor(index / layout.columns) * (layout.cardHeight + layout.cardGapY);
      const card = entry.card ?? syntheticLibraryCard(entry.definition);
      const view = createModCardView(this, x, y, card, card.upgradeLevel, {
        width: layout.cardWidth,
        height: layout.cardHeight,
        compact: true,
        selected: entry.definition.id === this.librarySelectedId,
        rankLabel: entry.owned ? undefined : 'R—',
        focusGroup: 'mod-library-card-grid'
      });
      view.setDepth(2002).setAlpha(entry.status === 'owned' ? 1 : entry.status === 'discovered' ? 0.72 : 0.48).on('pointerdown', () => {
        this.audio.playSfx('menu');
        this.librarySelectedId = entry.definition.id;
        this.showLibrary();
      });
      root.add(view);
      if (entry.status !== 'owned') {
        const marker = this.add.text(x, y + layout.cardHeight * 0.36, entry.status === 'discovered' ? 'DISCOVERED // NOT OWNED' : 'UNDISCOVERED', {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(layout.cardWidth * 0.064, 8, 11)}px`,
          color: entry.status === 'discovered' ? '#ffd676' : '#ff9cac', backgroundColor: '#160812'
        }).setOrigin(0.5).setDepth(2004).setPadding(5, 2);
        root.add(marker);
      }
    });
    if (!entries.length) root.add(this.add.text(layout.grid.x + layout.grid.width / 2, layout.grid.y + layout.grid.height / 2, 'NO MODS MATCH THIS FILTER', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 15 : 18}px`, color: '#607d8b'
    }).setOrigin(0.5));
    const previous = createModCollectionButton(this, layout.grid.x + 58, layout.paginationY, '◀', () => {
      this.libraryPage = Math.max(0, this.libraryPage - 1);
      this.showLibrary();
    }, layout.compact ? 82 : 96, 'standard', { height: layout.compact ? 34 : 40, fontSize: layout.compact ? 13 : 16 });
    const next = createModCollectionButton(this, layout.grid.x + layout.grid.width - 58, layout.paginationY, '▶', () => {
      this.libraryPage = Math.min(pageCount - 1, this.libraryPage + 1);
      this.showLibrary();
    }, layout.compact ? 82 : 96, 'standard', { height: layout.compact ? 34 : 40, fontSize: layout.compact ? 13 : 16 });
    if (this.libraryPage === 0) disableButton(previous);
    if (this.libraryPage === pageCount - 1) disableButton(next);
    root.add([previous, this.add.text(layout.grid.x + layout.grid.width / 2, layout.paginationY, `PAGE ${this.libraryPage + 1} / ${pageCount}  //  ${layout.columns} × 3`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 14 : 17}px`, color: '#add7e4', fontStyle: 'bold'
    }).setOrigin(0.5), next]);

    const selected = pageEntries.find((entry) => entry.definition.id === this.librarySelectedId);
    if (selected) {
      this.libraryViewer = new ModDatabaseViewer(this, root, layout.viewer, selected);
      const dossierFocus = this.add.rectangle(
        layout.viewer.x + layout.viewer.width / 2,
        layout.viewer.y + layout.viewer.height / 2,
        layout.viewer.width,
        layout.viewer.height,
        0xffffff,
        0.001
      );
      registerUiFocusable(this, dossierFocus, {
        label: 'Selected Mod Technical Dossier',
        scroll: (amount) => this.libraryViewer?.scrollBy(amount),
        defaultPriority: -10
      });
      root.add(dossierFocus);
      this.input.on('wheel', this.handleLibraryWheel);
    } else {
      root.add(this.add.rectangle(layout.viewer.x, layout.viewer.y, layout.viewer.width, layout.viewer.height, 0x06131e, 0.975)
        .setOrigin(0, 0).setStrokeStyle(2, 0x55eaff, 0.5));
      root.add(this.add.text(layout.viewer.x + layout.viewer.width / 2, layout.viewer.y + layout.viewer.height / 2, 'SELECT A MOD DATABASE ENTRY', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 14 : 18}px`, color: '#6c95a3'
      }).setOrigin(0.5));
    }
  }

  private showPlasmaRecalibration(modId: string): void {
    const root = this.createOverlay('PLASMA RECALIBRATION // MODULE ENGINEERING');
    const { width, height } = this.scale;
    const compact = width < 1250 || height < 760;
    const mods = SaveSystem.getModCollection();
    const entry = getModDatabaseEntry(mods, modId);
    if (!entry) {
      this.recalibrationStatus = { message: 'MODULE DEFINITION NOT FOUND', tone: 'error' };
      return;
    }
    const card = entry.card;
    const slots = getRecalibrationSlots(entry.definition);
    const eligibleSlots = slots.filter((slot) => !slot.protected);
    const pool = card ? getRecalibrationCandidatePool(entry.definition, card) : [];
    const safe = compact ? 22 : 34;
    const statusY = compact ? 82 : 88;
    const status = createModOperationStatusConsole(this, {
      x: width * .25,
      y: statusY,
      width: width * .5,
      height: compact ? 54 : 62
    }, this.recalibrationStatus.message, this.recalibrationStatus.tone);
    root.add(status.root);

    const contentTop = statusY + (compact ? 68 : 80);
    const contentBottom = height - (compact ? 78 : 92);
    const gap = compact ? 12 : 20;
    const usable = width - safe * 2 - gap * 2;
    const leftWidth = usable * .27;
    const centerWidth = usable * .37;
    const rightWidth = usable - leftWidth - centerWidth;
    const panelHeight = contentBottom - contentTop;
    const leftRect = { x: safe, y: contentTop, width: leftWidth, height: panelHeight };
    const centerRect = { x: safe + leftWidth + gap, y: contentTop, width: centerWidth, height: panelHeight };
    const rightRect = { x: centerRect.x + centerWidth + gap, y: contentTop, width: rightWidth, height: panelHeight };
    root.add(createModCollectionFrame(this, leftRect, 'SELECTED MODULE', 0x55eaff));
    root.add(createModCollectionFrame(this, centerRect, 'CURRENT CONFIGURATION // REPLACEMENT SLOTS', 0xdb8fff));
    root.add(createModCollectionFrame(this, rightRect, 'PLASMA INJECTION CONTROL', 0xff5bcf));

    const displayCard = card ?? syntheticLibraryCard(entry.definition);
    const cardWidth = Math.min(leftWidth - 42, panelHeight * .62 / 1.4, compact ? 205 : 260);
    const cardView = createModCardView(this, leftRect.x + leftWidth / 2, leftRect.y + panelHeight * .42, displayCard, displayCard.upgradeLevel, {
      width: cardWidth, height: cardWidth * 1.4, interactive: false, compact: false,
      rankLabel: card ? undefined : 'R—'
    }).setAlpha(card ? 1 : .54);
    root.add(cardView);
    root.add(this.add.text(leftRect.x + leftWidth / 2, leftRect.y + panelHeight * .78,
      `${entry.definition.name.toUpperCase()}\n${entry.definition.rarity.toUpperCase()} // ${card ? `RANK ${card.upgradeLevel}/3` : 'NOT OWNED'}\n\nSTAT CAPACITY // ${slots.length} / ${slots.length}`,
      { fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 15 : 19}px`, color: '#dff9ff', fontStyle: 'bold', align: 'center', lineSpacing: 5,
        wordWrap: { width: leftWidth - 30, useAdvancedWrap: true } }).setOrigin(.5, 0));

    const slotTop = centerRect.y + (compact ? 58 : 68);
    const slotHeight = Math.min(compact ? 74 : 92, Math.max(58, (panelHeight * .54) / Math.max(1, slots.length)));
    if (!slots.length) {
      root.add(this.add.text(centerRect.x + centerWidth / 2, centerRect.y + panelHeight / 2,
        'IDENTITY-LOCKED MODULE\nNO ORDINARY STAT SLOTS ARE SAFE TO REPLACE', {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 13 : 16}px`, color: '#ffadbe', align: 'center', lineSpacing: 8
        }).setOrigin(.5));
    }
    slots.forEach((slot, index) => {
      const y = slotTop + index * (slotHeight + (compact ? 8 : 12));
      const protectedSlot = slot.protected;
      const back = this.add.rectangle(centerRect.x + centerWidth / 2, y + slotHeight / 2, centerWidth - 28, slotHeight,
        protectedSlot ? 0x24121a : 0x0a2029, .94).setStrokeStyle(1, protectedSlot ? 0xff668e : 0x69efff, .62);
      const label = this.add.text(centerRect.x + 24, y + 10, `STAT ${slot.slotIndex + 1} // ${protectedSlot ? 'CORRUPTED IDENTITY LOCK' : 'RECALIBRATABLE'}`, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 10 : 12}px`, color: protectedSlot ? '#ff8baa' : '#75efff', fontStyle: 'bold'
      }).setOrigin(0);
      const value = this.add.text(centerRect.x + 24, y + slotHeight - 12,
        card ? describeRecalibrationSlot(entry.definition, card, slot, card.upgradeLevel) : slot.label, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 15 : 19}px`, color: '#ecfbff', fontStyle: 'bold',
          wordWrap: { width: centerWidth - 48, useAdvancedWrap: true }
        }).setOrigin(0, 1);
      root.add([back, label, value]);
    });

    const reserve = mods.plasmaChips;
    const projected = Math.max(0, reserve - PLASMA_RECALIBRATION_BALANCE.rollCost);
    root.add(this.add.text(rightRect.x + 22, rightRect.y + 64,
      `PLASMA RESERVE\n${reserve.toLocaleString()} PC\n\nROLL COST\n${PLASMA_RECALIBRATION_BALANCE.rollCost} PC\n\nPROJECTED RESERVE\n${projected.toLocaleString()} PC`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 17 : 22}px`, color: '#e8f8ff', fontStyle: 'bold', lineSpacing: 6
      }).setOrigin(0));

    const candidate = this.recalibrationCardId === card?.instanceId ? this.recalibrationCandidate : null;
    if (this.recalibrationProcessing) {
      const scan = this.add.text(rightRect.x + rightWidth / 2, rightRect.y + panelHeight * .58,
        'PLASMA INJECTION\nMODULE SCAN\nATTRIBUTE DESTABILIZATION...', {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 13 : 17}px`, color: '#dc8fff', fontStyle: 'bold', align: 'center', lineSpacing: 10
        }).setOrigin(.5);
      root.add(scan);
      this.tweens.add({ targets: scan, alpha: { from: .35, to: 1 }, scaleX: { from: .97, to: 1.03 }, duration: 210, yoyo: true, repeat: -1 });
    } else if (candidate && card) {
      const modifier = resolveCalibrationModifier(candidate);
      const qualityColor: Record<string, string> = {
        optimal: '#78ffc4', enhanced: '#83f3ff', stable: '#dff6ff', degraded: '#ffca72', misaligned: '#ff739d'
      };
      root.add(this.add.text(rightRect.x + rightWidth / 2, rightRect.y + panelHeight * .49,
        `${candidate.quality.toUpperCase()}\n${modifier ? formatCalibrationModifier(modifier, card.upgradeLevel) : ''} ${candidate.stat.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()}\n\nSELECT STAT TO REPLACE`, {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 13 : 17}px`, color: qualityColor[candidate.quality], fontStyle: 'bold', align: 'center', lineSpacing: 8,
          wordWrap: { width: rightWidth - 30, useAdvancedWrap: true }
        }).setOrigin(.5));
      eligibleSlots.forEach((slot, index) => {
        const buttonWidth = eligibleSlots.length === 1 ? rightWidth - 34 : (rightWidth - 46) / 2;
        const column = eligibleSlots.length === 1 ? 0 : index % 2;
        const row = eligibleSlots.length === 1 ? 0 : Math.floor(index / 2);
        const buttonX = eligibleSlots.length === 1
          ? rightRect.x + rightWidth / 2
          : rightRect.x + 17 + buttonWidth / 2 + column * (buttonWidth + 12);
        const buttonY = rightRect.y + panelHeight - (compact ? 146 : 166) + row * (compact ? 38 : 44);
        root.add(createModCollectionButton(this, buttonX, buttonY, `REPLACE STAT ${slot.slotIndex + 1}`, () => {
          const result = SaveSystem.applyPlasmaRecalibration(card.instanceId, slot.slotIndex, candidate);
          this.recalibrationStatus = { message: result.message ?? 'RECALIBRATION COMPLETE', tone: result.ok ? 'success' : 'error' };
          if (result.ok) {
            this.recalibrationCandidate = null;
            this.recalibrationCardId = null;
          }
          this.showPlasmaRecalibration(modId);
          return result.ok;
        }, buttonWidth, 'utility', { height: compact ? 34 : 38, fontSize: compact ? 9 : 11 }));
      });
      root.add(createModCollectionButton(this, rightRect.x + rightWidth / 2, rightRect.y + panelHeight - 34, 'KEEP CURRENT', () => {
        this.recalibrationCandidate = null;
        this.recalibrationCardId = null;
        this.recalibrationStatus = { message: 'CURRENT CALIBRATION RETAINED // ROLL COST SPENT', tone: 'warning' };
        this.showPlasmaRecalibration(modId);
      }, rightWidth - 34, 'standard', { height: compact ? 36 : 42, fontSize: compact ? 11 : 13 }));
    } else {
      const canRoll = Boolean(card && eligibleSlots.length && pool.length && reserve >= PLASMA_RECALIBRATION_BALANCE.rollCost);
      const rollButton = createModCollectionButton(this, rightRect.x + rightWidth / 2, rightRect.y + panelHeight - (compact ? 80 : 92),
        `RECALIBRATE // ${PLASMA_RECALIBRATION_BALANCE.rollCost} PC`, () => {
          if (this.recalibrationProcessing || !card) return false;
          this.recalibrationProcessing = true;
          const result = SaveSystem.rollPlasmaRecalibration(card.instanceId);
          if (!result.ok || !result.candidate) {
            this.recalibrationProcessing = false;
            this.recalibrationStatus = { message: result.message ?? 'RECALIBRATION BLOCKED', tone: 'error' };
            this.audio.playSfx('itemLocked');
            this.showPlasmaRecalibration(modId);
            return false;
          }
          this.recalibrationStatus = { message: 'PLASMA INJECTION ACTIVE // ATTRIBUTE DESTABILIZING', tone: 'info' };
          this.recalibrationCardId = card.instanceId;
          this.recalibrationCandidate = result.candidate;
          this.showPlasmaRecalibration(modId);
          this.recalibrationRevealTimer = this.time.delayedCall(PLASMA_RECALIBRATION_BALANCE.revealDurationMs, () => {
            this.recalibrationRevealTimer = null;
            this.recalibrationProcessing = false;
            this.recalibrationStatus = { message: `${result.candidate!.quality.toUpperCase()} CALIBRATION GENERATED // CHOOSE A STAT SLOT`, tone: 'success' };
            this.showPlasmaRecalibration(modId);
          });
          return true;
        }, rightWidth - 34, 'utility', { height: compact ? 42 : 50, fontSize: compact ? 12 : 15 });
      if (!canRoll) disableButton(rollButton);
      root.add(rollButton);
      if (!card || !eligibleSlots.length || !pool.length || reserve < PLASMA_RECALIBRATION_BALANCE.rollCost) {
        const reason = !card ? 'OWNED MOD REQUIRED'
          : !eligibleSlots.length || !pool.length ? 'NO SAFE RECALIBRATION ATTRIBUTES'
            : `INSUFFICIENT PLASMA CHIPS — ${PLASMA_RECALIBRATION_BALANCE.rollCost} REQUIRED`;
        root.add(this.add.text(rightRect.x + rightWidth / 2, rightRect.y + panelHeight * .63, reason, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 14 : 17}px`, color: '#ff96ae', fontStyle: 'bold', align: 'center',
          wordWrap: { width: rightWidth - 34, useAdvancedWrap: true }
        }).setOrigin(.5));
      }
    }

    root.add(createModCollectionButton(this, width / 2, height - (compact ? 28 : 34), 'BACK TO MOD LIBRARY', () => {
      this.clearRecalibrationSession();
      this.showLibrary();
    }, compact ? 220 : 280, 'return', { height: compact ? 38 : 44, fontSize: compact ? 12 : 14 }));
    configureSceneUiNavigation(this, { onBack: () => { this.clearRecalibrationSession(); this.showLibrary(); } });
  }

  private clearRecalibrationSession(): void {
    this.recalibrationRevealTimer?.remove(false);
    this.recalibrationRevealTimer = null;
    this.recalibrationCandidate = null;
    this.recalibrationCardId = null;
    this.recalibrationProcessing = false;
    this.recalibrationStatus = { message: 'SELECT AN OWNED MOD // PLASMA LINK READY', tone: 'info' };
  }

  private showCosmetics(): void {
    const { width } = this.scale;
    const layout = calculateGearLockerLayout(this.scale.width, this.scale.height, COSMETIC_CATEGORIES.length);
    const root = this.createGearLockerOverlay(layout);
    configureSceneUiNavigation(this, {
      onTabLeft: () => {
        this.cosmeticCategoryIndex = (this.cosmeticCategoryIndex - 1 + COSMETIC_CATEGORIES.length) % COSMETIC_CATEGORIES.length;
        this.cosmeticPage = 0;
        this.showCosmetics();
      },
      onTabRight: () => {
        this.cosmeticCategoryIndex = (this.cosmeticCategoryIndex + 1) % COSMETIC_CATEGORIES.length;
        this.cosmeticPage = 0;
        this.showCosmetics();
      }
    });
    const save = SaveSystem.get();
    const category = COSMETIC_CATEGORIES[this.cosmeticCategoryIndex];
    const owned = COSMETICS.filter((item) => item.category === category && save.unlockedCosmetics.includes(item.id));
    const equippedId = save.equippedCosmetics[category];

    this.createCosmeticCategoryNavigation(root, layout);

    const inventoryFrame = createGearLockerPanel(this, layout.inventory, {
      title: `OWNED MODULES // ${GEAR_LOCKER_CATEGORY_LABELS[category]}`,
      accent: 0x55efff
    });
    root.add(inventoryFrame);
    this.trackGearLockerPanel(inventoryFrame);

    const countY = layout.inventory.y + (layout.compact ? 50 : 58);
    root.add(this.add.text(layout.inventory.x + 22, countY, `${owned.length} OWNED`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 11 : 14}px`, color: '#68f4ff', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0.5));
    root.add(this.add.text(layout.inventory.x + layout.inventory.width - 22, countY, 'STORE ITEMS REMAIN HIDDEN UNTIL UNLOCKED', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 9 : 12}px`, color: '#739ba9', fontStyle: 'bold', letterSpacing: layout.compact ? 0 : 1
    }).setOrigin(1, 0.5));

    const gridGap = layout.compact ? 8 : 12;
    const gridPadding = layout.compact ? 14 : 20;
    const gridWidth = layout.inventory.width - gridPadding * 2;
    const minimumCardWidth = layout.compact ? 124 : 146;
    const columns = Phaser.Math.Clamp(Math.floor((gridWidth + gridGap) / (minimumCardWidth + gridGap)), 2, 8);
    const itemWidth = (gridWidth - gridGap * (columns - 1)) / columns;
    const gridTop = countY + (layout.compact ? 18 : 24);
    const gridBottom = layout.inventory.y + layout.inventory.height - (layout.compact ? 14 : 20);
    const availableCardHeight = Math.max(210, gridBottom - gridTop);
    const itemHeight = Math.min(
      availableCardHeight,
      Phaser.Math.Clamp(itemWidth * 2.32, layout.compact ? 245 : 280, layout.compact ? 350 : 430)
    );
    const perPage = columns;
    const maxPage = Math.max(0, Math.ceil(owned.length / perPage) - 1);
    this.cosmeticPage = Math.min(this.cosmeticPage, maxPage);
    owned.slice(this.cosmeticPage * perPage, (this.cosmeticPage + 1) * perPage).forEach((item, index) => {
      const x = layout.inventory.x + gridPadding + itemWidth / 2 + index * (itemWidth + gridGap);
      const y = gridTop + availableCardHeight / 2;
      root.add(this.createCosmeticLockerCard(item, x, y, itemWidth, itemHeight, item.id === equippedId, layout.compact));
    });

    if (!owned.length) {
      root.add(this.add.text(layout.inventory.x + layout.inventory.width / 2, gridTop + availableCardHeight / 2, 'NO OWNED COSMETICS IN THIS LOCKER\nVISIT THE STORE TO UNLOCK ITEMS', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 13 : 17}px`, color: '#688e9d', align: 'center', lineSpacing: 8
      }).setOrigin(0.5));
    }

    const pagerCenter = layout.inventory.x + layout.inventory.width / 2;
    const pagerOffset = layout.compact ? 88 : 118;
    const previous = createModCollectionButton(this, pagerCenter - pagerOffset, layout.footerY, '<', () => {
      this.cosmeticPage = Math.max(0, this.cosmeticPage - 1);
      this.showCosmetics();
    }, layout.compact ? 70 : 90, 'standard', { height: layout.footerHeight - 10, fontSize: layout.compact ? 18 : 24 });
    const next = createModCollectionButton(this, pagerCenter + pagerOffset, layout.footerY, '>', () => {
      this.cosmeticPage = Math.min(maxPage, this.cosmeticPage + 1);
      this.showCosmetics();
    }, layout.compact ? 70 : 90, 'standard', { height: layout.footerHeight - 10, fontSize: layout.compact ? 18 : 24 });
    if (this.cosmeticPage === 0) disableButton(previous);
    if (this.cosmeticPage === maxPage) disableButton(next);
    root.add([previous, next]);
    root.add(this.add.text(pagerCenter, layout.footerY, `PAGE ${this.cosmeticPage + 1} / ${maxPage + 1}`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 11 : 14}px`, color: '#add7e4', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5));
    root.add(this.add.text(layout.safe + 22, layout.footerY, 'LOCKER STATUS\nACTIVE  //  LOCAL VAULT', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 9 : 11}px`, color: '#70ffad', fontStyle: 'bold', lineSpacing: 2
    }).setOrigin(0, 0.5));
    root.add(this.add.text(width - layout.safe - 22, layout.footerY, 'DATA NODE\nSYNCED  //  PROFILE LINK', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 9 : 11}px`, color: '#72ceda', fontStyle: 'bold', align: 'right', lineSpacing: 2
    }).setOrigin(1, 0.5));

    this.createCosmeticLockerPreview(root, layout, category, equippedId);
    this.startLockerPrismPreviewUpdates();
  }

  private createGearLockerOverlay(layout: GearLockerLayout): Phaser.GameObjects.Container {
    this.closeOverlay();
    setSceneUiModalDepth(this, 30);
    const { width, height } = this.scale;
    const root = this.add.container(0, 0).setDepth(2000);
    const blocker = this.add.rectangle(width / 2, height / 2, width, height, 0x01050a, 0.995).setInteractive();
    const grid = this.add.grid(width / 2, height / 2, width, height, layout.compact ? 34 : 46, layout.compact ? 34 : 46, 0x02080e, 0.2, 0x1b5263, 0.11);
    const shellWidth = width - layout.safe * 2;
    const shellHeight = height - layout.safe * 2;
    const shellPoints = createConsoleChamferPoints(shellWidth, shellHeight, layout.compact ? 12 : 22);
    const shadow = this.add.polygon(width / 2 + 6, height / 2 + 7, shellPoints, 0x000000, 0.68);
    const chassis = this.add.polygon(width / 2, height / 2, shellPoints, 0x06101a, 0.97).setStrokeStyle(2, 0x55efff, 0.72);
    const inner = this.add.rectangle(width / 2, height / 2, shellWidth - 20, shellHeight - 20, 0x06131c, 0.62).setStrokeStyle(1, 0xff5bcf, 0.2);
    const topRail = this.add.rectangle(width / 2, layout.safe + 8, shellWidth - 58, 4, 0x55efff, 0.6);
    const leftRail = this.add.rectangle(layout.safe + 8, height / 2, 3, shellHeight - 54, 0xff5bcf, 0.42);
    const rightRail = this.add.rectangle(width - layout.safe - 8, height / 2, 3, shellHeight - 54, 0x55efff, 0.38);
    root.add([blocker, grid, shadow, chassis, inner, topRail, leftRail, rightRail]);

    const utilityY = layout.safe + (layout.compact ? 14 : 17);
    root.add(this.add.text(layout.safe + 32, utilityY, '// GARAGE TERMINAL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 9 : 12}px`, color: '#6edce8', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0.5));
    root.add(this.add.text(width / 2, utilityY, 'SECURE LINK  /////  ONLINE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 8 : 10}px`, color: '#6effac', fontStyle: 'bold', letterSpacing: 2
    }).setOrigin(0.5));
    const secureLed = this.add.circle(width / 2 + (layout.compact ? 90 : 126), utilityY, 3, 0x6effac, 0.92);
    root.add(secureLed);
    this.overlayAnimatedTargets.push(secureLed);
    this.tweens.add({ targets: secureLed, alpha: { from: 0.2, to: 1 }, duration: 720, yoyo: true, repeat: -1 });

    const titleSize = layout.compact ? 22 : Phaser.Math.Clamp(width * 0.026, 30, 42);
    const titleLeft = this.add.text(0, layout.titleY, 'GEAR LOCKER', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#69f5ff', fontStyle: 'bold', shadow: { color: '#2aeaff', blur: 8, fill: true }
    }).setOrigin(0, 0.5);
    const titleSlash = this.add.text(0, layout.titleY, '//', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#ff62c9', fontStyle: 'bold', shadow: { color: '#ff2da9', blur: 7, fill: true }
    }).setOrigin(0, 0.5);
    const titleRight = this.add.text(0, layout.titleY, 'OWNED COSMETICS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#69f5ff', fontStyle: 'bold', shadow: { color: '#2aeaff', blur: 8, fill: true }
    }).setOrigin(0, 0.5);
    const titleGap = layout.compact ? 8 : 12;
    const totalTitleWidth = titleLeft.width + titleSlash.width + titleRight.width + titleGap * 2;
    const titleStart = width / 2 - totalTitleWidth / 2;
    titleLeft.setX(titleStart);
    titleSlash.setX(titleStart + titleLeft.width + titleGap);
    titleRight.setX(titleSlash.x + titleSlash.width + titleGap);
    root.add([titleLeft, titleSlash, titleRight]);

    const titleUnderlight = this.add.rectangle(width / 2, layout.titleY + titleSize * 0.7, Math.min(width * 0.52, 860), 2, 0x55efff, 0.42);
    root.add(titleUnderlight);
    this.overlayAnimatedTargets.push(titleUnderlight);
    this.tweens.add({ targets: titleUnderlight, alpha: { from: 0.2, to: 0.65 }, duration: 1900, yoyo: true, repeat: -1 });

    const close = createModCollectionButton(this, width - layout.safe - (layout.compact ? 62 : 86), layout.safe + (layout.compact ? 27 : 34), 'CLOSE // X', () => this.closeOverlay(), layout.compact ? 112 : 152, 'utility', {
      height: layout.compact ? 38 : 48, fontSize: layout.compact ? 12 : 16
    });
    root.add(close);

    const sweep = this.add.rectangle(layout.safe + 18, height / 2, 2, shellHeight - 44, 0x55efff, 0.06);
    root.add(sweep);
    this.overlayAnimatedTargets.push(sweep);
    this.tweens.add({ targets: sweep, x: width - layout.safe - 18, alpha: { from: 0.015, to: 0.1 }, duration: 4800, repeat: -1, repeatDelay: 2400, ease: 'Sine.easeInOut' });

    this.overlay = root;
    return root;
  }

  private createCosmeticCategoryNavigation(root: Phaser.GameObjects.Container, layout: GearLockerLayout): void {
    const total = COSMETIC_CATEGORIES.length;
    const visible = layout.visibleCategoryCount;
    const maxStart = Math.max(0, total - visible);
    const start = Phaser.Math.Clamp(this.cosmeticCategoryIndex - Math.floor(visible / 2), 0, maxStart);
    const visibleCategories = COSMETIC_CATEGORIES.slice(start, start + visible);
    const arrowGap = layout.compact ? 8 : 12;
    const leftArrowX = layout.categoryLeft + layout.categoryArrowWidth / 2;
    const rightArrowX = layout.categoryRight - layout.categoryArrowWidth / 2;
    const previous = createModCollectionButton(this, leftArrowX, layout.categoryY, '<', () => {
      this.cosmeticCategoryIndex = Math.max(0, this.cosmeticCategoryIndex - 1);
      this.cosmeticPage = 0;
      this.showCosmetics();
    }, layout.categoryArrowWidth, 'standard', { height: layout.categoryHeight, fontSize: layout.compact ? 18 : 24, horizontalPadding: 4 });
    const next = createModCollectionButton(this, rightArrowX, layout.categoryY, '>', () => {
      this.cosmeticCategoryIndex = Math.min(total - 1, this.cosmeticCategoryIndex + 1);
      this.cosmeticPage = 0;
      this.showCosmetics();
    }, layout.categoryArrowWidth, 'standard', { height: layout.categoryHeight, fontSize: layout.compact ? 18 : 24, horizontalPadding: 4 });
    if (this.cosmeticCategoryIndex === 0) disableButton(previous);
    if (this.cosmeticCategoryIndex === total - 1) disableButton(next);
    root.add([previous, next]);

    const tabsLeft = layout.categoryLeft + layout.categoryArrowWidth + arrowGap;
    const tabsRight = layout.categoryRight - layout.categoryArrowWidth - arrowGap;
    const tabGap = layout.compact ? 5 : 8;
    const tabWidth = (tabsRight - tabsLeft - tabGap * (visibleCategories.length - 1)) / visibleCategories.length;
    visibleCategories.forEach((category, index) => {
      const categoryIndex = start + index;
      const active = categoryIndex === this.cosmeticCategoryIndex;
      const x = tabsLeft + tabWidth / 2 + index * (tabWidth + tabGap);
      const button = createModCollectionButton(this, x, layout.categoryY, GEAR_LOCKER_CATEGORY_LABELS[category], () => {
        this.cosmeticCategoryIndex = categoryIndex;
        this.cosmeticPage = 0;
        this.showCosmetics();
      }, tabWidth, 'standard', {
        height: layout.categoryHeight,
        fontSize: layout.compact ? 9 : Phaser.Math.Clamp(tabWidth / 12, 10, 13),
        horizontalPadding: layout.compact ? 16 : 24,
        focusGroup: 'gear-locker-categories'
      });
      button.setAlpha(active ? 1 : 0.66);
      const label = button.getByName('button-label') as Phaser.GameObjects.Text | null;
      label?.setX(layout.compact ? 7 : 10);
      const icon = createGearLockerCategoryIcon(this, category, -tabWidth / 2 + (layout.compact ? 14 : 19), -7, active ? 0x73f7ff : 0x6299a8, layout.compact ? 0.62 : 0.75);
      const activeRail = this.add.rectangle(0, layout.categoryHeight / 2 - 5, Math.max(24, tabWidth - 24), active ? 4 : 2, active ? 0x55efff : 0x315766, active ? 0.95 : 0.35);
      button.add([icon, activeRail]);
      if (active) {
        this.overlayAnimatedTargets.push(activeRail);
        this.tweens.add({ targets: activeRail, alpha: { from: 0.45, to: 1 }, duration: 960, yoyo: true, repeat: -1 });
      }
      root.add(button);
    });
  }

  private createCosmeticLockerCard(
    item: CosmeticOption,
    x: number,
    y: number,
    width: number,
    height: number,
    equipped: boolean,
    compact: boolean
  ): Phaser.GameObjects.Container {
    const root = this.add.container(x, y);
    const itemColor = getCosmeticDisplayColor(item, this.time.now);
    const accent = equipped ? 0xffd84f : itemColor;
    const points = createConsoleChamferPoints(width, height, Math.min(12, width * 0.08));
    const shadow = this.add.polygon(5, 7, points, 0x000000, 0.55);
    const chassis = this.add.polygon(0, 0, points, equipped ? 0x17170a : 0x08151f, 0.985)
      .setStrokeStyle(equipped ? 3 : 1, accent, equipped ? 0.98 : 0.58);
    const glass = this.add.rectangle(0, 0, width - 14, height - 14, equipped ? 0x17190d : 0x07131d, 0.84)
      .setStrokeStyle(1, accent, equipped ? 0.45 : 0.18);
    const scanlines = this.add.grid(0, 0, width - 18, height - 18, width, compact ? 7 : 9, 0x000000, 0, accent, 0.028);
    const topRail = this.add.rectangle(0, -height / 2 + 6, width - 24, equipped ? 4 : 2, accent, equipped ? 0.95 : 0.52);
    const sideRail = this.add.rectangle(-width / 2 + 6, 0, 2, height - 34, accent, equipped ? 0.72 : 0.3);
    root.add([shadow, chassis, glass, scanlines, topRail, sideRail]);

    if (equipped) {
      const badgeWidth = Math.min(width - 28, compact ? 84 : 104);
      const badge = this.add.rectangle(width / 2 - badgeWidth / 2 - 7, -height / 2 + (compact ? 16 : 19), badgeWidth, compact ? 22 : 26, 0x2b2405, 0.96)
        .setStrokeStyle(1, 0xffd84f, 0.78);
      const badgeText = this.add.text(badge.x, badge.y, 'EQUIPPED  /', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 8 : 10}px`, color: '#ffe465', fontStyle: 'bold'
      }).setOrigin(0.5);
      const check = this.add.text(width / 2 - 15, badge.y, 'V', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 11 : 14}px`, color: '#fff36b', fontStyle: 'bold'
      }).setOrigin(0.5);
      root.add([badge, badgeText, check]);
      this.overlayAnimatedTargets.push(topRail);
      this.tweens.add({ targets: topRail, alpha: { from: 0.5, to: 1 }, duration: 1050, yoyo: true, repeat: -1 });
    } else {
      for (let node = 0; node < 3; node += 1) {
        root.add(this.add.circle(-width / 2 + 16 + node * 10, -height / 2 + 16, 3, itemColor, node === 0 ? 0.9 : 0.25).setStrokeStyle(1, itemColor, 0.8));
      }
    }

    const visual = this.createLockerCosmeticVisual(item, 0, -height * 0.18, width * 0.66, Math.min(height * 0.28, compact ? 82 : 116));
    const visualHalo = this.add.circle(0, -height * 0.18, Math.min(width * 0.32, height * 0.14), itemColor, equipped ? 0.07 : 0.035)
      .setStrokeStyle(1, itemColor, equipped ? 0.48 : 0.26);
    root.add([visualHalo, visual]);

    const label = this.add.text(0, height * 0.14, item.label.toUpperCase(), {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(width / 11, compact ? 10 : 11, compact ? 13 : 15)}px`,
      color: equipped ? '#fff0a1' : '#e6faff', fontStyle: 'bold', align: 'center', lineSpacing: -1
    }).setOrigin(0.5).setWordWrapWidth(width - 20, true).setMaxLines(2);
    const category = this.add.text(0, height * 0.29, GEAR_LOCKER_CATEGORY_LABELS[item.category], {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: '#73aebc', fontStyle: 'bold', letterSpacing: compact ? 0 : 1
    }).setOrigin(0.5).setMaxLines(1);
    const idLabel = this.add.text(-width / 2 + 13, height / 2 - (compact ? 40 : 48), `ID // ${item.id.toUpperCase()}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 7 : 9}px`, color: '#416d79', fontStyle: 'bold'
    }).setOrigin(0, 0.5).setMaxLines(1);
    const state = this.add.text(0, height / 2 - (compact ? 19 : 23), equipped ? 'EQUIPPED // SYSTEM LINKED' : 'OWNED // CLICK TO EQUIP', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, color: equipped ? '#ffe56b' : '#77c9d4', fontStyle: 'bold', letterSpacing: compact ? 0 : 1
    }).setOrigin(0.5);
    root.add([label, category, idLabel, state]);

    const hit = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      this.audio.playSfx('menuHover');
      chassis.setStrokeStyle(equipped ? 3 : 2, accent, 1);
      this.tweens.killTweensOf(root);
      this.tweens.add({ targets: root, scaleX: 1.018, scaleY: 1.018, y: y - 3, duration: 120, ease: 'Sine.easeOut' });
    });
    hit.on('pointerout', () => {
      chassis.setStrokeStyle(equipped ? 3 : 1, accent, equipped ? 0.98 : 0.58);
      this.tweens.killTweensOf(root);
      this.tweens.add({ targets: root, scaleX: 1, scaleY: 1, y, duration: 130, ease: 'Sine.easeOut' });
    });
    hit.on('pointerdown', () => {
      SaveSystem.equipCosmetic(item.category, item.id);
      if (item.category === 'playerShape' || item.category === 'playerColor') this.refreshOperatorPreview();
      this.audio.playSfx('menu');
      this.status = `SUCCESS // ${item.label.toUpperCase()} EQUIPPED`;
      this.showCosmetics();
    });
    registerUiFocusable(this, root, {
      label: `${item.label} ${equipped ? 'equipped' : 'owned cosmetic'}`,
      group: 'gear-locker-card-grid',
      defaultPriority: equipped ? 40 : 0,
      activate: () => {
        SaveSystem.equipCosmetic(item.category, item.id);
        if (item.category === 'playerShape' || item.category === 'playerColor') this.refreshOperatorPreview();
        this.audio.playSfx('menu');
        this.status = `SUCCESS // ${item.label.toUpperCase()} EQUIPPED`;
        this.showCosmetics();
      }
    });
    root.add(hit);
    return root;
  }

  private createCosmeticLockerPreview(
    root: Phaser.GameObjects.Container,
    layout: GearLockerLayout,
    category: CosmeticOption['category'],
    equippedId?: string
  ): void {
    const rect = layout.preview;
    const panel = createGearLockerPanel(this, rect, {
      title: '// CURRENTLY EQUIPPED', accent: 0xff5bcf, titleAccent: 0xff73d0, reinforced: true
    });
    root.add(panel);
    this.trackGearLockerPanel(panel);
    const item = COSMETICS.find((entry) => entry.id === equippedId);
    if (!item) {
      root.add(this.add.text(rect.x + rect.width / 2, rect.y + rect.height / 2, 'NO ITEM EQUIPPED', {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 13 : 17}px`, color: '#7793a0'
      }).setOrigin(0.5));
      return;
    }

    const accent = getCosmeticDisplayColor(item, this.time.now);
    const chamberX = rect.x + (layout.compact ? 18 : 24);
    const chamberY = rect.y + (layout.compact ? 48 : 58);
    const chamberWidth = rect.width - (layout.compact ? 36 : 48);
    const chamberHeight = rect.height * (layout.compact ? 0.53 : 0.57);
    const chamber = this.add.rectangle(chamberX, chamberY, chamberWidth, chamberHeight, 0x030a10, 0.98)
      .setOrigin(0, 0).setStrokeStyle(1, 0x55efff, 0.45);
    const chamberGrid = this.add.grid(chamberX + chamberWidth / 2, chamberY + chamberHeight / 2, chamberWidth - 8, chamberHeight - 8, 26, 26, 0x02080d, 0.15, accent, 0.055);
    const haze = this.add.ellipse(chamberX + chamberWidth / 2, chamberY + chamberHeight * 0.78, chamberWidth * 0.76, chamberHeight * 0.3, accent, 0.055);
    const beam = this.add.triangle(chamberX + chamberWidth / 2, chamberY + chamberHeight * 0.62, 0, chamberHeight * 0.5, chamberWidth * 0.34, chamberHeight * 0.5, chamberWidth * 0.17, 0, accent, 0.06);
    const ringY = chamberY + chamberHeight * 0.79;
    const outerRing = this.add.ellipse(chamberX + chamberWidth / 2, ringY, chamberWidth * 0.66, Math.max(20, chamberHeight * 0.12), 0x06131b, 0.96).setStrokeStyle(3, accent, 0.82);
    const innerRing = this.add.ellipse(chamberX + chamberWidth / 2, ringY, chamberWidth * 0.48, Math.max(14, chamberHeight * 0.08), accent, 0.08).setStrokeStyle(1, 0x70f5ff, 0.78);
    const coreRing = this.add.ellipse(chamberX + chamberWidth / 2, ringY, chamberWidth * 0.28, Math.max(9, chamberHeight * 0.05), accent, 0.14).setStrokeStyle(1, accent, 0.95);
    const scanner = this.add.rectangle(chamberX + 4, chamberY + 10, chamberWidth - 8, 2, accent, 0.18).setOrigin(0, 0.5);
    root.add([chamber, chamberGrid, haze, beam, outerRing, innerRing, coreRing, scanner]);

    const controlsX = chamberX + (layout.compact ? 14 : 18);
    ['EYE', 'ROT', 'SCAN', 'LINK'].forEach((label, index) => {
      const controlY = chamberY + 24 + index * (layout.compact ? 31 : 38);
      const control = this.add.rectangle(controlsX, controlY, layout.compact ? 24 : 30, layout.compact ? 24 : 30, index === 0 ? 0x250f25 : 0x08141e, 0.92)
        .setStrokeStyle(1, index === 0 ? 0xff5bcf : 0x426573, index === 0 ? 0.75 : 0.45);
      const glyph = this.add.text(controlsX, controlY, label.slice(0, 1), {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 8 : 10}px`, color: index === 0 ? '#ff9bdc' : '#6f929e', fontStyle: 'bold'
      }).setOrigin(0.5);
      root.add([control, glyph]);
    });

    const visualY = chamberY + chamberHeight * 0.46;
    const visual = this.createLockerCosmeticVisual(item, chamberX + chamberWidth / 2, visualY, chamberWidth * 0.58, chamberHeight * 0.38);
    visual.setAlpha(0).setScale(0.82);
    root.add(visual);
    this.overlayAnimatedTargets.push(visual, outerRing, innerRing, coreRing, scanner);
    this.tweens.add({ targets: visual, alpha: 1, scaleX: 1, scaleY: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: visual, y: visualY - (layout.compact ? 4 : 7), duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: outerRing, angle: 360, duration: 8800, repeat: -1 });
    this.tweens.add({ targets: innerRing, angle: -360, duration: 6200, repeat: -1 });
    this.tweens.add({ targets: coreRing, scaleX: { from: 0.9, to: 1.08 }, scaleY: { from: 0.9, to: 1.08 }, alpha: { from: 0.45, to: 1 }, duration: 980, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: scanner, y: chamberY + chamberHeight - 10, alpha: { from: 0.06, to: 0.3 }, duration: 2600, yoyo: true, repeat: -1, repeatDelay: 800 });

    for (let particleIndex = 0; particleIndex < 6; particleIndex += 1) {
      const particleX = chamberX + chamberWidth * (0.34 + particleIndex * 0.065);
      const particle = this.add.circle(particleX, ringY - 4, particleIndex % 2 ? 2 : 1.5, accent, 0.45);
      root.add(particle);
      this.overlayAnimatedTargets.push(particle);
      this.tweens.add({
        targets: particle,
        y: visualY - chamberHeight * (0.18 + (particleIndex % 3) * 0.08),
        alpha: { from: 0.1, to: 0.72 },
        duration: 1250 + particleIndex * 170,
        delay: particleIndex * 120,
        yoyo: true,
        repeat: -1,
        repeatDelay: 420
      });
    }

    const infoTop = chamberY + chamberHeight + (layout.compact ? 12 : 18);
    root.add(this.add.text(rect.x + rect.width / 2, infoTop, item.label.toUpperCase(), {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 14 : Phaser.Math.Clamp(rect.width / 24, 16, 21)}px`,
      color: item.colorMode === 'prism' ? '#ffe66c' : '#e9fbff', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5, 0).setWordWrapWidth(rect.width - 36, true).setMaxLines(2));
    root.add(this.add.text(rect.x + rect.width / 2, infoTop + (layout.compact ? 31 : 39), GEAR_LOCKER_CATEGORY_LABELS[category], {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 11 : 14}px`, color: '#86abb8', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5, 0));

    const dataY = rect.y + rect.height - (layout.compact ? 47 : 58);
    const dataLeft = rect.x + (layout.compact ? 16 : 22);
    const dataWidth = rect.width - (layout.compact ? 32 : 44);
    const cellGap = layout.compact ? 5 : 7;
    const cellWidth = (dataWidth - cellGap * 2) / 3;
    const dataValues = [
      { label: 'COLOR CODE', value: item.colorMode === 'prism' ? 'DYNAMIC' : item.colorMode === 'native' ? 'NATIVE' : formatCosmeticColorCode(item.color), color: accent },
      { label: 'ACCESS CLASS', value: item.priceTier?.toUpperCase() ?? (item.currency === 'coreTokens' ? 'CORE ISSUE' : 'STANDARD'), color: 0x79ddeb },
      { label: 'LOAD STATE', value: 'EQUIPPED', color: 0xffd84f }
    ];
    dataValues.forEach((entry, index) => {
      const dataX = dataLeft + index * (cellWidth + cellGap);
      const cell = this.add.rectangle(dataX, dataY, cellWidth, layout.compact ? 38 : 46, 0x07141e, 0.94).setOrigin(0, 0.5).setStrokeStyle(1, entry.color, 0.32);
      const label = this.add.text(dataX + 8, dataY - (layout.compact ? 9 : 11), entry.label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 7 : 9}px`, color: '#668b97', fontStyle: 'bold'
      }).setOrigin(0, 0.5);
      const value = this.add.text(dataX + 8, dataY + (layout.compact ? 7 : 9), entry.value, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 8 : 10}px`, color: Phaser.Display.Color.IntegerToColor(entry.color).rgba, fontStyle: 'bold'
      }).setOrigin(0, 0.5).setMaxLines(1);
      root.add([cell, label, value]);
    });
  }

  private trackGearLockerPanel(panel: Phaser.GameObjects.Container): void {
    const targets = panel.getData('animatedTargets') as Phaser.GameObjects.GameObject[] | undefined;
    if (targets) this.overlayAnimatedTargets.push(...targets);
  }

  private createLockerCosmeticVisual(item: CosmeticOption, x: number, y: number, maxWidth: number, maxHeight: number): Phaser.GameObjects.Container {
    const operatorTextureKey = getCosmeticTextureKey(SaveSystem.getEquippedCosmeticId('playerShape'), 'player-circle');
    const operatorFrameId = SaveSystem.getEquippedCosmeticId('playerShape');
    const operativeColorId = SaveSystem.getEquippedCosmeticId('playerColor');
    const projectileTextureKey = getCosmeticTextureKey(SaveSystem.getEquippedCosmeticId('projectileShape'), 'projectile-pulse');
    const preview = createCosmeticPreview(this, item, x, y, { maxWidth, maxHeight, operatorTextureKey, operatorFrameId, operativeColorId, projectileTextureKey });
    const dynamicColor = item.category === 'playerShape' ? getCosmeticById(operativeColorId) : item;
    if (dynamicColor?.colorMode === 'prism' || preview.update) this.cosmeticPreviewColorTargets.push({ item: dynamicColor ?? item, setColor: preview.setColor, update: preview.update });
    return preview.container;
  }

  private startLockerPrismPreviewUpdates(): void {
    if (!this.cosmeticPreviewColorTargets.length) return;
    this.cosmeticPreviewColorTimer = this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        const now = this.time.now;
        this.cosmeticPreviewColorTargets.forEach(({ item, setColor, update }) => {
          if (item.colorMode === 'prism') setColor(getCosmeticDisplayColor(item, now));
          update?.(now);
        });
      }
    });
  }

  private showOverdrive(requestedFamily?: 'overdrive' | 'supreme'): void {
    const current = SaveSystem.getPreferredProtocol();
    this.protocolTerminalFamily = requestedFamily
      ?? (RUN_PROTOCOLS[current].family === 'supreme' ? 'supreme' : this.protocolTerminalFamily ?? 'overdrive');
    const root = this.createOverlay(this.protocolTerminalFamily === 'supreme'
      ? 'SUPREME OVERDRIVE // CONSTELLATION TERMINAL'
      : 'OVERDRIVE PROGRESSION TERMINAL');
    configureSceneUiNavigation(this, {
      onTabLeft: () => this.showOverdrive('overdrive'),
      onTabRight: () => this.showOverdrive('supreme')
    });
    const { width, height } = this.scale;
    const highest = SaveSystem.getHighestRound();
    const supremeHighest = SaveSystem.getSupremeHighestRound();
    const narrow = width < 760;
    const outerMargin = narrow ? 14 : 28;
    const frameTop = narrow ? 94 : 104;
    const frameWidth = width - outerMargin * 2;
    const frameHeight = height - frameTop - (narrow ? 12 : 20);
    const activeLabel = RUN_PROTOCOLS[current].family !== 'normal'
      ? RUN_PROTOCOLS[current].label
      : 'NORMAL PROTOCOL';

    const statusWidth = Math.min(width - (narrow ? 160 : 300), 1040);
    const statusY = narrow ? 70 : 78;
    const statusRail = this.add.rectangle(width / 2, statusY, statusWidth, narrow ? 28 : 34, 0x071722, 0.95)
      .setStrokeStyle(1, 0x55efff, 0.32);
    const statusEdge = this.add.rectangle(width / 2 - statusWidth / 2 + 5, statusY, 3, narrow ? 20 : 25, 0xff5bcf, 0.78);
    const statusLed = this.add.circle(width / 2 + statusWidth / 2 - 14, statusY, 3, 0x67ffad, 0.96);
    const statusText = this.add.text(width / 2, statusY, `CLEARANCE // ROUND ${highest}  //  SUPREME ${supremeHighest}     ACTIVE // ${activeLabel}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 11 : 16}px`, color: '#bfeaf3', fontStyle: 'bold', letterSpacing: narrow ? 0 : 1
    }).setOrigin(0.5).setMaxLines(1);
    root.add([statusRail, statusEdge, statusLed, statusText]);
    this.overlayAnimatedTargets.push(statusLed);
    this.tweens.add({ targets: statusLed, alpha: { from: 0.24, to: 1 }, duration: 820, yoyo: true, repeat: -1 });

    const progressionFrame = createModCollectionFrame(this, {
      x: outerMargin,
      y: frameTop,
      width: frameWidth,
      height: frameHeight
    }, 'PROTOCOL LADDER // CONSTELLATION CLEARANCE MATRIX', 0x55efff);
    root.add(progressionFrame);
    this.overlayAnimatedTargets.push(...progressionFrame.list);

    const terminalLayout = calculateProtocolTerminalVerticalLayout(
      frameTop,
      frameHeight,
      getModCollectionFrameHeaderHeight(frameHeight),
      narrow
    );
    const familyButtonWidth = narrow ? Math.min(134, frameWidth * .27) : 190;
    const overdriveButton = createButton(this, outerMargin + 22 + familyButtonWidth * .5, terminalLayout.switchRowY, 'OVERDRIVE', () => this.showOverdrive('overdrive'), familyButtonWidth, 'menu', { height: terminalLayout.switchButtonHeight });
    const supremeButton = createButton(this, outerMargin + 30 + familyButtonWidth * 1.5, terminalLayout.switchRowY, 'SUPREME', () => this.showOverdrive('supreme'), familyButtonWidth, 'menu', { height: terminalLayout.switchButtonHeight });
    overdriveButton.setAlpha(this.protocolTerminalFamily === 'overdrive' ? 1 : .58);
    supremeButton.setAlpha(this.protocolTerminalFamily === 'supreme' ? 1 : .58);
    const instruction = this.add.text(width - outerMargin - 22, terminalLayout.switchRowY, 'SELECT ANY UNLOCKED PROTOCOL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 9 : 12}px`, color: '#75ffb3', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(1, 0.5);
    root.add([overdriveButton, supremeButton, instruction]);

    const protocols = RUN_PROTOCOL_IDS.filter((id) => RUN_PROTOCOLS[id].family === this.protocolTerminalFamily);
    const columns = 2;
    const rows = Math.ceil(protocols.length / columns);
    const columnGap = narrow ? 7 : 18;
    const rowGap = narrow ? 6 : 11;
    const cardWidth = Math.min(720, (frameWidth - (narrow ? 24 : 54) - columnGap) / columns);
    const cardsTop = terminalLayout.cardsTop;
    const cardsBottom = terminalLayout.cardsBottom;
    const availableHeight = cardsBottom - cardsTop;
    const cardHeight = Phaser.Math.Clamp((availableHeight - rowGap * (rows - 1)) / rows, narrow ? 48 : 58, 118);
    const usedHeight = cardHeight * rows + rowGap * (rows - 1);
    const firstCenterY = cardsTop + Math.max(0, (availableHeight - usedHeight) / 2) + cardHeight / 2;
    protocols.forEach((id, index) => {
      const definition = RUN_PROTOCOLS[id];
      const unlocked = isRunProtocolUnlocked(id, { highestRound: highest, supremeHighestRound: supremeHighest, regularOverdriveCompleted: SaveSystem.hasCompletedRegularOverdrive() });
      const selected = current === id;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = width / 2 + (column === 0 ? -(cardWidth + columnGap) / 2 : (cardWidth + columnGap) / 2);
      const y = firstCenterY + row * (cardHeight + rowGap);
      const accent = selected
        ? 0xffb45f
        : unlocked
          ? definition.family === 'supreme' ? (column === 0 ? 0xe8ffff : 0xff72e6) : (column === 0 ? 0x55efff : 0x68ffad)
          : 0x75506f;
      const framePoints = createConsoleChamferPoints(cardWidth, cardHeight, Math.min(13, cardHeight * 0.18));
      const shadow = this.add.polygon(x + 4, y + 5, framePoints, 0x000000, 0.5);
      const chassis = this.add.polygon(x, y, framePoints, unlocked ? 0x081a24 : 0x0a1018, 0.98)
        .setStrokeStyle(selected ? 2 : 1, accent, selected ? 0.95 : 0.55);
      const innerWidth = cardWidth - (narrow ? 12 : 18);
      const innerHeight = cardHeight - (narrow ? 10 : 14);
      const inner = this.add.rectangle(x, y, innerWidth, innerHeight, unlocked ? 0x0a2028 : 0x11131c, unlocked ? 0.83 : 0.9)
        .setStrokeStyle(1, accent, selected ? 0.4 : 0.18);
      const topRail = this.add.rectangle(x, y - cardHeight / 2 + 5, cardWidth - 28, 3, accent, selected ? 0.9 : 0.52);
      const sideEdge = this.add.rectangle(x - cardWidth / 2 + 7, y, 3, cardHeight - 22, column === 0 ? 0xff5bcf : 0x55efff, unlocked ? 0.48 : 0.18);
      const tierRadius = Phaser.Math.Clamp(cardHeight * 0.22, narrow ? 10 : 13, 24);
      const tierX = x - cardWidth / 2 + (narrow ? 22 : 34);
      const tierBadge = this.add.circle(tierX, y, tierRadius, selected ? 0x2b2114 : unlocked ? 0x09222a : 0x15131d, 1)
        .setStrokeStyle(2, accent, unlocked ? 0.76 : 0.35);
      const tierText = this.add.text(tierX, y, `${definition.family === 'supreme' ? definition.startingRound : String(definition.tier).padStart(2, '0')}`, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(cardHeight * 0.16, 8, 15)}px`, color: unlocked ? '#e8ffff' : '#786c7a', fontStyle: 'bold'
      }).setOrigin(0.5);
      const textLeft = tierX + tierRadius + (narrow ? 7 : 14);
      const nameY = y - cardHeight * 0.18;
      const tierName = this.add.text(textLeft, nameY, definition.label, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(cardHeight * 0.16, narrow ? 8 : 10, 18)}px`,
        color: unlocked ? '#dffcff' : '#756d7b', fontStyle: 'bold'
      }).setOrigin(0, 0.5).setMaxLines(1);
      const stateText = this.add.text(x + cardWidth / 2 - (narrow ? 10 : 17), nameY, selected ? 'ACTIVE' : unlocked ? 'UNLOCKED' : 'LOCKED', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${Phaser.Math.Clamp(cardHeight * 0.14, 8, 14)}px`, fontStyle: 'bold',
        color: selected ? '#ffc070' : unlocked ? '#75ffb1' : '#a46f82'
      }).setOrigin(1, 0.5);
      const detail = this.add.text(textLeft, y + cardHeight * 0.13, unlocked
        ? `DEPLOYMENT START // ROUND ${definition.startingRound}`
        : `CLEAR ROUND ${definition.unlockHighestRound} TO UNLOCK`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${Phaser.Math.Clamp(cardHeight * 0.13, 8, 13)}px`, color: unlocked ? '#8fc4d1' : '#b27b8c', fontStyle: 'bold'
      }).setOrigin(0, 0.5).setMaxLines(1);

      const progressLeft = textLeft;
      const progressRight = x + cardWidth / 2 - (narrow ? 10 : 17);
      const progressWidth = Math.max(24, progressRight - progressLeft);
      const progressY = y + cardHeight / 2 - (narrow ? 7 : 11);
      const supremeStage = getSupremeStage(id);
      const progressValue = supremeStage?.unlockSource === 'supreme'
        ? supremeHighest
        : SaveSystem.hasCompletedRegularOverdrive() ? definition.unlockHighestRound : 0;
      const progressRatio = unlocked ? 1 : Phaser.Math.Clamp(progressValue / definition.unlockHighestRound, 0, 1);
      const progressTrack = this.add.rectangle(progressLeft, progressY, progressWidth, narrow ? 2 : 4, 0x02070c, 1)
        .setOrigin(0, 0.5).setStrokeStyle(1, accent, 0.22);
      const progressFill = this.add.rectangle(progressLeft, progressY, Math.max(1, progressWidth * progressRatio), narrow ? 2 : 4, accent, unlocked ? 0.72 : 0.42)
        .setOrigin(0, 0.5);
      const led = this.add.circle(x + cardWidth / 2 - 9, y - cardHeight / 2 + 8, narrow ? 2 : 3, accent, selected ? 1 : 0.72);
      const hitZone = this.add.rectangle(x, y, cardWidth, cardHeight, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hitZone.on('pointerover', () => {
        this.audio.playSfx('menuHover');
        inner.setFillStyle(unlocked ? 0x0d2a33 : 0x171622, 0.96);
        topRail.setAlpha(1);
      });
      hitZone.on('pointerout', () => {
        inner.setFillStyle(unlocked ? 0x0a2028 : 0x11131c, unlocked ? 0.83 : 0.9);
        topRail.setAlpha(selected ? 0.9 : 0.52);
      });
      hitZone.on('pointerdown', () => {
        if (!unlocked) {
          this.audio.playSfx('itemLocked');
          return;
        }
        const result = SaveSystem.setPreferredProtocol(id);
        this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? `${definition.label} SELECTED`}`;
        this.audio.playSfx(result.ok ? 'menu' : 'itemLocked');
        this.showOverdrive(definition.family === 'supreme' ? 'supreme' : 'overdrive');
      });
      registerUiFocusable(this, hitZone, {
        label: `${definition.label} ${unlocked ? selected ? 'active' : 'unlocked' : 'locked'}`,
        group: 'overdrive-protocol-grid',
        locked: () => !unlocked,
        defaultPriority: selected ? 60 : unlocked ? 10 : 0
      });
      root.add([shadow, chassis, inner, topRail, sideEdge, tierBadge, tierText, tierName, stateText, detail, progressTrack, progressFill, led, hitZone]);
      this.overlayAnimatedTargets.push(led);
      this.tweens.add({ targets: led, alpha: { from: selected ? 0.35 : 0.2, to: 1 }, duration: 720 + index * 45, yoyo: true, repeat: -1 });
    });
  }

  private showCurrencyExchange(): void {
    const root = this.createOverlay('ECONOMY CONSOLE // MARKET NODE');
    const { width, height } = this.scale;
    const compact = width < 1180 || height < 760;
    const analytics = SaveSystem.getEconomyAnalytics();
    if (this.exchangeSource === this.exchangeTarget) {
      this.exchangeTarget = EXCHANGE_CURRENCIES.find((currency) => currency !== this.exchangeSource) ?? 'coreTokens';
    }
    this.createEconomyConsoleHeader(root, analytics, compact);
    const bodyTop = compact ? 250 : 286;
    const bodyBottom = height - (compact ? 42 : 50);
    const body: EconomyConsoleRect = { x: compact ? 14 : 24, y: bodyTop, width: width - (compact ? 28 : 48), height: Math.max(300, bodyBottom - bodyTop) };
    const tab = ECONOMY_TABS[this.economyConsoleTabIndex];
    if (tab === 'MARKET') this.renderEconomyMarket(root, analytics, body, compact);
    else if (tab === 'PROGRESSION') this.renderEconomyProgression(root, analytics, body, compact);
    else if (tab === 'COMMERCE') this.renderEconomyCommerce(root, analytics, body, compact);
    else this.renderEconomyMods(root, analytics, body, compact);
    this.createEconomyTicker(root, analytics, height);
    configureSceneUiNavigation(this, {
      onBack: this.handleEscape,
      onTabLeft: () => this.switchEconomyConsoleTab(-1),
      onTabRight: () => this.switchEconomyConsoleTab(1)
    });
  }

  private switchEconomyConsoleTab(direction: number): void {
    this.economyConsoleTabIndex = (this.economyConsoleTabIndex + direction + ECONOMY_TABS.length) % ECONOMY_TABS.length;
    this.exchangeConfirmationArmed = true;
    this.status = '';
    this.showCurrencyExchange();
  }

  private createEconomyConsoleHeader(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, compact: boolean): void {
    const { width } = this.scale;
    root.add(this.add.text(width / 2, compact ? 52 : 59, `OPERATIVE PORTFOLIO   //   ${CURRENCY_EXCHANGE_RATES.length} EXCHANGE PAIRS ACTIVE   //   WALLET VERIFIED`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#a5cad5', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5, 0));
    const tabY = compact ? 82 : 91;
    const tabGap = compact ? 5 : 10;
    const tabWidth = Math.min(compact ? 180 : 230, (width - 60 - tabGap * 3) / 4);
    ECONOMY_TABS.forEach((label, index) => {
      const x = width / 2 + (index - 1.5) * (tabWidth + tabGap);
      const selected = index === this.economyConsoleTabIndex;
      root.add(this.add.rectangle(x, tabY, tabWidth + 3, compact ? 34 : 40, selected ? 0x12323c : 0x07131d, 0.96)
        .setStrokeStyle(selected ? 2 : 1, selected ? 0x62efff : 0x385e6d, selected ? 0.95 : 0.5));
      root.add(createButton(this, x, tabY, label, () => {
        this.economyConsoleTabIndex = index;
        this.exchangeConfirmationArmed = true;
        this.status = '';
        this.showCurrencyExchange();
      }, tabWidth, 'menu', { height: compact ? 32 : 40, fontSize: compact ? 13 : 16, focusModalDepth: 30, focusDefaultPriority: selected ? 35 : 0, focusGroup: 'economy-console-tabs' }));
    });

    const walletTop = compact ? 106 : 119;
    const walletHeight = compact ? 132 : 150;
    const margin = compact ? 14 : 24;
    const gap = compact ? 6 : 10;
    const cardWidth = (width - margin * 2 - gap * 3) / 4;
    analytics.portfolio.forEach((entry, index) => {
      const x = margin + index * (cardWidth + gap);
      const card = createEconomyPanel(this, root, { x, y: walletTop, width: cardWidth, height: walletHeight }, entry.label, entry.color, `${entry.percentage.toFixed(1)}% PORTFOLIO`);
      addMetric(this, card, 18, compact ? 43 : 48, 'CURRENT BALANCE', entry.balance.toLocaleString(), entry.color);
      const liquidationY = compact ? 90 : 94;
      card.add(this.add.text(cardWidth - 16, liquidationY, `${formatEconomyNumber(entry.creditEquivalent)} CR`, {
        fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 13 : 18}px`, color: '#efffff', fontStyle: 'bold'
      }).setOrigin(1, 0));
      card.add(this.add.text(cardWidth - 16, liquidationY + (compact ? 17 : 23), compact ? 'LIQUIDATION VALUE' : `LIQUIDATION VALUE\n${entry.purpose}`, {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 10 : 12}px`, color: '#9ab9c4', fontStyle: 'bold', align: 'right', lineSpacing: 0
      }).setOrigin(1, 0));
    });
  }

  private renderEconomyMarket(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, body: EconomyConsoleRect, compact: boolean): void {
    const gap = compact ? 8 : 12;
    const transactionWidth = body.width * (compact ? 0.39 : 0.4);
    const portfolioWidth = body.width * (compact ? 0.27 : 0.27);
    const transactionRect = { x: body.x, y: body.y, width: transactionWidth, height: body.height };
    const portfolioRect = { x: body.x + transactionWidth + gap, y: body.y, width: portfolioWidth - gap, height: body.height };
    const matrixRect = { x: portfolioRect.x + portfolioRect.width + gap, y: body.y, width: body.x + body.width - (portfolioRect.x + portfolioRect.width + gap), height: body.height };
    this.renderExchangeTransaction(root, analytics, transactionRect, compact);
    this.renderPortfolioAnalytics(root, analytics, portfolioRect, compact);
    this.renderExchangeMatrix(root, analytics, matrixRect, compact);
  }

  private renderExchangeTransaction(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, rect: EconomyConsoleRect, compact: boolean): void {
    const panel = createEconomyPanel(this, root, rect, 'SECURE EXCHANGE EXECUTION', 0x62efff, 'ATOMIC LEDGER');
    const short = rect.height < 440;
    const rate = getCurrencyExchangeRate(this.exchangeSource, this.exchangeTarget)!;
    if (this.exchangeAmount <= 0 || this.exchangeAmount % rate.sourceUnits !== 0) this.exchangeAmount = rate.sourceUnits;
    const quote = quoteCurrencyExchange(analytics.wallet, this.exchangeSource, this.exchangeTarget, this.exchangeAmount);
    const cycleCurrency = (role: 'source' | 'target'): void => {
      const current = role === 'source' ? this.exchangeSource : this.exchangeTarget;
      let index = EXCHANGE_CURRENCIES.indexOf(current);
      do index = (index + 1) % EXCHANGE_CURRENCIES.length;
      while (EXCHANGE_CURRENCIES[index] === (role === 'source' ? this.exchangeTarget : this.exchangeSource));
      if (role === 'source') this.exchangeSource = EXCHANGE_CURRENCIES[index];
      else this.exchangeTarget = EXCHANGE_CURRENCIES[index];
      this.exchangeAmount = getCurrencyExchangeRate(this.exchangeSource, this.exchangeTarget)?.sourceUnits ?? 1;
      this.exchangeConfirmationArmed = true; this.status = ''; this.showCurrencyExchange();
    };
    const innerWidth = rect.width - 34;
    const halfWidth = (innerWidth - 74) / 2;
    const accountY = rect.y + 88;
    (['source', 'target'] as const).forEach((role, index) => {
      const currency = role === 'source' ? this.exchangeSource : this.exchangeTarget;
      const x = rect.x + 17 + halfWidth / 2 + index * (halfWidth + 74);
      root.add(this.add.text(x, rect.y + 54, role === 'source' ? 'SOURCE ACCOUNT' : 'TARGET ACCOUNT', {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 14}px`, color: '#a2c3ce', fontStyle: 'bold'
      }).setOrigin(0.5));
      root.add(createButton(this, x, accountY, EXCHANGE_CURRENCY_LABELS[currency], () => cycleCurrency(role), halfWidth, 'menu', {
        height: compact ? 34 : 42, fontSize: compact ? 12 : 16, focusModalDepth: 30
      }));
      root.add(this.add.text(x, accountY + (compact ? 24 : 29), `BAL ${analytics.wallet[currency].toLocaleString()}`, {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 13}px`, color: Phaser.Display.Color.IntegerToColor(EXCHANGE_CURRENCY_COLORS[currency]).rgba, fontStyle: 'bold'
      }).setOrigin(0.5));
    });
    root.add(createButton(this, rect.x + rect.width / 2, accountY, 'SWAP', () => {
      [this.exchangeSource, this.exchangeTarget] = [this.exchangeTarget, this.exchangeSource];
      this.exchangeAmount = getCurrencyExchangeRate(this.exchangeSource, this.exchangeTarget)?.sourceUnits ?? 1;
      this.exchangeConfirmationArmed = true; this.status = ''; this.showCurrencyExchange();
    }, compact ? 56 : 66, 'menu', { height: compact ? 32 : 38, fontSize: compact ? 11 : 13, focusModalDepth: 30 }));
    const routePulse = this.add.circle(rect.x + 17 + halfWidth, accountY + (compact ? 34 : 42), 3, 0x7ffff2, 0.86);
    root.add(routePulse);
    this.overlayAnimatedTargets.push(routePulse);
    this.tweens.add({ targets: routePulse, x: rect.x + rect.width - 17 - halfWidth, alpha: { from: 0.25, to: 1 }, duration: 1250, repeat: -1, ease: 'Sine.easeInOut' });

    const amountY = rect.y + (compact ? 142 : 159);
    root.add(this.add.text(rect.x + rect.width / 2, amountY, 'SOURCE AMOUNT', { fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#9dbdc8', fontStyle: 'bold' }).setOrigin(0.5));
    root.add(this.add.text(rect.x + rect.width / 2, amountY + 17, this.exchangeAmount.toLocaleString(), {
      fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 23 : 32}px`, color: Phaser.Display.Color.IntegerToColor(EXCHANGE_CURRENCY_COLORS[this.exchangeSource]).rgba, fontStyle: 'bold'
    }).setOrigin(0.5, 0));
    const maxSpend = getMaximumExchangeSpend(analytics.wallet, this.exchangeSource, this.exchangeTarget);
    const actions: Array<{ label: string; amount: () => number }> = [
      { label: '-STEP', amount: () => Math.max(rate.sourceUnits, this.exchangeAmount - rate.sourceUnits) },
      { label: '+STEP', amount: () => this.exchangeAmount + rate.sourceUnits },
      { label: 'x5', amount: () => rate.sourceUnits * 5 }, { label: 'x10', amount: () => rate.sourceUnits * 10 },
      { label: 'MAX', amount: () => maxSpend || rate.sourceUnits }
    ];
    const actionGap = 5;
    const actionWidth = (rect.width - 34 - actionGap * 4) / 5;
    actions.forEach((action, index) => root.add(createButton(this, rect.x + 17 + actionWidth / 2 + index * (actionWidth + actionGap), amountY + (compact ? 65 : 78), action.label, () => {
      this.exchangeAmount = action.amount(); this.exchangeConfirmationArmed = true; this.status = ''; this.showCurrencyExchange();
    }, actionWidth, 'menu', { height: compact ? 30 : 36, fontSize: compact ? 10 : 13, focusModalDepth: 30, focusGroup: 'currency-exchange-amounts' })));

    const previewTop = amountY + (compact ? 91 : 113);
    panel.add(this.add.rectangle(17, previewTop - rect.y, rect.width - 34, short ? 52 : compact ? 98 : 121, quote.ok ? 0x113039 : 0x37131e, 0.88).setOrigin(0).setStrokeStyle(1, quote.ok ? 0x62efff : 0xff6f89, 0.52));
    const spent = quote.ok ? quote.spent : 0; const received = quote.ok ? quote.received : 0;
    const sourceAfter = analytics.wallet[this.exchangeSource] - spent;
    const targetAfter = analytics.wallet[this.exchangeTarget] + received;
    root.add(this.add.text(rect.x + rect.width / 2, previewTop + 10, quote.ok
      ? `${spent.toLocaleString()} ${EXCHANGE_CURRENCY_LABELS[this.exchangeSource]}  >>  ${received.toLocaleString()} ${EXCHANGE_CURRENCY_LABELS[this.exchangeTarget]}`
      : quote.message.toUpperCase(), { fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 13 : 17}px`, color: quote.ok ? '#efffff' : '#ff9bae', fontStyle: 'bold', align: 'center' }).setOrigin(0.5));
    if (!short) {
      root.add(this.add.text(rect.x + 27, previewTop + (compact ? 40 : 49), `SOURCE POST-TRADE\n${analytics.wallet[this.exchangeSource].toLocaleString()}  ->  ${sourceAfter.toLocaleString()}\n-${spent.toLocaleString()}`, {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 14}px`, color: '#ff9caf', fontStyle: 'bold', lineSpacing: 2
      }));
      root.add(this.add.text(rect.x + rect.width - 27, previewTop + (compact ? 40 : 49), `TARGET POST-TRADE\n${analytics.wallet[this.exchangeTarget].toLocaleString()}  ->  ${targetAfter.toLocaleString()}\n+${received.toLocaleString()}`, {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 14}px`, color: '#83ffb9', fontStyle: 'bold', align: 'right', lineSpacing: 2
      }).setOrigin(1, 0));
    }
    const confirmY = Math.min(rect.y + rect.height - (compact ? 42 : 49), previewTop + (short ? 75 : compact ? 129 : 158));
    const confirm = createButton(this, rect.x + rect.width / 2, confirmY, quote.ok
      ? this.exchangeConfirmationArmed ? 'CONFIRM SECURE EXCHANGE' : 'ADJUST TO EXCHANGE AGAIN' : 'EXCHANGE UNAVAILABLE', () => {
      if (!this.exchangeConfirmationArmed || this.time.now < this.exchangeConfirmLockedUntil) return false;
      this.exchangeConfirmLockedUntil = this.time.now + 450; this.exchangeConfirmationArmed = false;
      const result = SaveSystem.exchangeCurrency(this.exchangeSource, this.exchangeTarget, this.exchangeAmount);
      this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message}`;
      if (result.ok) this.refreshWalletTerminalState();
      this.showCurrencyExchange(); return result.ok;
    }, Math.min(rect.width - 42, compact ? 280 : 340), 'menu', { height: compact ? 38 : 46, fontSize: compact ? 13 : 16, focusModalDepth: 30, focusDefaultPriority: 50 });
    if (!quote.ok || !this.exchangeConfirmationArmed) disableButton(confirm);
    root.add(confirm);
    root.add(this.add.text(rect.x + rect.width / 2, rect.y + rect.height - 18, this.status || `FIXED RATE // ${rate.sourceUnits.toLocaleString()}:${rate.targetUnits.toLocaleString()} // LOSSY ROUTING`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 13}px`, color: this.status.startsWith('BLOCKED') ? '#ff91a4' : this.status ? '#76ffad' : '#8baab5', fontStyle: 'bold'
    }).setOrigin(0.5));
  }

  private renderPortfolioAnalytics(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, rect: EconomyConsoleRect, compact: boolean): void {
    const split = Math.max(230, rect.height * 0.54);
    const donutPanel = createEconomyPanel(this, root, { ...rect, height: split }, 'PORTFOLIO VALUE DISTRIBUTION', 0xff65c8, 'CR-EQUIVALENT');
    const radius = Phaser.Math.Clamp(Math.min(rect.width * 0.24, split * 0.22), 45, 78);
    drawDonut(this, donutPanel, rect.width / 2, 66 + radius, radius, analytics.portfolio.map((entry) => ({ label: entry.label, percentage: entry.percentage, color: entry.color })), formatEconomyNumber(analytics.totalPortfolioCreditEquivalent));
    const legendY = 77 + radius * 2;
    analytics.portfolio.forEach((entry, index) => {
      const y = legendY + index * (compact ? 23 : 27);
      donutPanel.add(this.add.rectangle(18, y + 4, 9, 9, entry.color, 0.95).setOrigin(0));
      donutPanel.add(this.add.text(34, y, `${entry.label}  ${entry.percentage.toFixed(1)}%`, { fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 14}px`, color: '#d7eaf0', fontStyle: 'bold' }));
      donutPanel.add(this.add.text(rect.width - 18, y, `${formatEconomyNumber(entry.creditEquivalent)} CR`, { fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 14}px`, color: '#effcff', fontStyle: 'bold' }).setOrigin(1, 0));
    });
    const spreadRect = { x: rect.x, y: rect.y + split + 10, width: rect.width, height: rect.height - split - 10 };
    const spreadPanel = createEconomyPanel(this, root, spreadRect, 'LIQUIDITY SPREAD', 0xffcc62, 'ROUND TRIP');
    const spread = getExchangeRoundTrip(this.exchangeSource, this.exchangeTarget);
    if (spread) {
      addMetric(this, spreadPanel, 18, 52, 'ROUND-TRIP RETENTION', `${spread.retentionPercentage.toFixed(1)}%`, 0x72ff9b);
      addMetric(this, spreadPanel, spreadRect.width - 18, 52, 'MARKET SPREAD', `${spread.spreadPercentage.toFixed(1)}%`, 0xff7f98, 'right');
      spreadPanel.add(this.add.text(18, 96, `${EXCHANGE_CURRENCY_LABELS[this.exchangeSource]} -> ${EXCHANGE_CURRENCY_LABELS[this.exchangeTarget]}\n${spread.forward.sourceUnits.toLocaleString()} : ${spread.forward.targetUnits.toLocaleString()}`, {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 14}px`, color: '#cfe2e9', fontStyle: 'bold', lineSpacing: 3
      }));
      spreadPanel.add(this.add.text(spreadRect.width - 18, 96, `${EXCHANGE_CURRENCY_LABELS[this.exchangeTarget]} -> ${EXCHANGE_CURRENCY_LABELS[this.exchangeSource]}\n${spread.reverse.sourceUnits.toLocaleString()} : ${spread.reverse.targetUnits.toLocaleString()}`, {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 14}px`, color: '#cfe2e9', fontStyle: 'bold', align: 'right', lineSpacing: 3
      }).setOrigin(1, 0));
    }
  }

  private renderExchangeMatrix(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, rect: EconomyConsoleRect, compact: boolean): void {
    const matrixHeight = Math.min(rect.height * 0.58, compact ? 330 : 390);
    const panel = createEconomyPanel(this, root, { ...rect, height: matrixHeight }, 'FULL EXCHANGE RATE MATRIX', 0x72ff9b, 'FIXED ROUTES');
    const labels = ['CR', 'CT', 'PC', 'FC'];
    const left = 18; const top = 66; const rowLabelWidth = compact ? 55 : 72;
    const cellWidth = (rect.width - left * 2 - rowLabelWidth) / 4;
    const rowHeight = (matrixHeight - top - 18) / 4;
    labels.forEach((label, index) => panel.add(this.add.text(left + rowLabelWidth + cellWidth * (index + 0.5), 49, label, {
      fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 12 : 14}px`, color: Phaser.Display.Color.IntegerToColor(EXCHANGE_CURRENCY_COLORS[EXCHANGE_CURRENCIES[index]]).rgba, fontStyle: 'bold'
    }).setOrigin(0.5)));
    EXCHANGE_CURRENCIES.forEach((source, row) => {
      panel.add(this.add.text(left, top + row * rowHeight + rowHeight / 2, labels[row], {
        fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 12 : 14}px`, color: Phaser.Display.Color.IntegerToColor(EXCHANGE_CURRENCY_COLORS[source]).rgba, fontStyle: 'bold'
      }).setOrigin(0, 0.5));
      EXCHANGE_CURRENCIES.forEach((target, column) => {
        const x = left + rowLabelWidth + column * cellWidth; const y = top + row * rowHeight;
        const selected = source === this.exchangeSource && target === this.exchangeTarget;
        const cell = this.add.rectangle(x, y, cellWidth - 3, rowHeight - 3, selected ? 0x245c61 : 0x0c222b, selected ? 0.92 : 0.58).setOrigin(0).setStrokeStyle(selected ? 2 : 1, selected ? 0x7ffff2 : 0x355865, selected ? 1 : 0.4);
        panel.add(cell);
        if (selected) {
          this.overlayAnimatedTargets.push(cell);
          this.tweens.add({ targets: cell, alpha: { from: 0.65, to: 1 }, duration: 900, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
        }
        const rate = source === target ? null : getCurrencyExchangeRate(source, target);
        panel.add(this.add.text(x + (cellWidth - 3) / 2, y + (rowHeight - 3) / 2, rate ? `${formatEconomyNumber(rate.sourceUnits)}:${formatEconomyNumber(rate.targetUnits)}` : '—', {
          fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 13}px`, color: selected ? '#ffffff' : '#d0e3e9', fontStyle: 'bold'
        }).setOrigin(0.5));
      });
    });
    const powerRect = { x: rect.x, y: rect.y + matrixHeight + 10, width: rect.width, height: rect.height - matrixHeight - 10 };
    const power = createEconomyPanel(this, root, powerRect, 'CURRENT PURCHASING POWER', 0xff65c8, 'LIVE WALLET');
    const values = [
      ['PERMANENT UPGRADES', analytics.purchasingPower.permanentUpgradeActions], ['COSMETICS', analytics.purchasingPower.cosmetics],
      ['MOD UPGRADES', analytics.purchasingPower.modUpgradeActions], ['INFUSION OPTIONS', analytics.purchasingPower.initialInfusionOptions]
    ] as const;
    values.forEach(([label, value], index) => addMetric(this, power, index % 2 ? powerRect.width - 18 : 18, 50 + Math.floor(index / 2) * 55, label, value.toLocaleString(), index % 2 ? 0xff65c8 : 0x62efff, index % 2 ? 'right' : 'left'));
    power.add(this.add.text(18, Math.min(powerRect.height - 28, 164), `ANOMALY CAPACITY // ${analytics.purchasingPower.anomalyEntriesAtMinimum} @ ${analytics.purchasingPower.anomalyMinimumCost} FC   |   ${analytics.purchasingPower.anomalyEntriesAtMaximum} @ ${analytics.purchasingPower.anomalyMaximumCost} FC`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 13}px`, color: '#86ffb5', fontStyle: 'bold'
    }));
  }

  private getEconomyColumns(body: EconomyConsoleRect, compact: boolean): EconomyConsoleRect[] {
    const gap = compact ? 8 : 12;
    const width = (body.width - gap * 2) / 3;
    return [0, 1, 2].map((index) => ({ x: body.x + index * (width + gap), y: body.y, width, height: body.height }));
  }

  private renderEconomyProgression(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, body: EconomyConsoleRect, compact: boolean): void {
    const [summaryRect, costsRect, futureRect] = this.getEconomyColumns(body, compact);
    const summary = createEconomyPanel(this, root, summaryRect, 'PERMANENT UPGRADE ECONOMY', 0x62efff, 'AUTHORITATIVE');
    addMetric(this, summary, 18, 52, 'UPGRADE COMPLETION', `${analytics.upgrades.currentLevels} / ${analytics.upgrades.maximumLevels}`, 0x62efff);
    addMetric(this, summary, summaryRect.width - 18, 52, 'REMAINING CREDIT COST', `${formatEconomyNumber(analytics.upgrades.remainingCredits)} CR`, 0xffcc62, 'right');
    addMetric(this, summary, 18, 103, 'AFFORDABLE ACTIONS', analytics.upgrades.affordableActions.toLocaleString(), 0x72ff9b);
    summary.add(this.add.text(18, 155, analytics.upgrades.nextUpgrade ? `NEXT // ${analytics.upgrades.nextUpgrade.label} L${analytics.upgrades.nextUpgrade.level} // ${analytics.upgrades.nextUpgrade.cost.toLocaleString()} CR` : 'NEXT // ALL PERMANENT UPGRADES MAXED', {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#e1f6fb', fontStyle: 'bold'
    }).setWordWrapWidth(summaryRect.width - 36, true));
    summary.add(this.add.text(18, 193, analytics.upgrades.mostExpensiveRemaining ? `HIGHEST REMAINING // ${analytics.upgrades.mostExpensiveRemaining.label} L${analytics.upgrades.mostExpensiveRemaining.level} // ${analytics.upgrades.mostExpensiveRemaining.cost.toLocaleString()} CR` : 'HIGHEST REMAINING // NONE', {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 14}px`, color: '#a9c5ce', fontStyle: 'bold'
    }).setWordWrapWidth(summaryRect.width - 36, true));
    analytics.upgrades.categories.forEach((category, index) => drawProgressBar(this, summary, 18, 245 + index * (compact ? 43 : 52), summaryRect.width - 36, category.label.toUpperCase(), category.completionPercentage, `${category.currentLevels}/${category.maximumLevels}`, index % 2 ? 0xff65c8 : 0x62efff));

    const costs = createEconomyPanel(this, root, costsRect, 'WHERE FUTURE CREDITS GO', 0xff65c8, 'REMAINING COST');
    if (analytics.upgrades.costCurve.length === 0) {
      const centerX = costsRect.width / 2;
      costs.add(this.add.text(centerX, compact ? 72 : 82, '100% COMPLETE', {
        fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 26 : 36}px`, color: '#72ff9b', fontStyle: 'bold'
      }).setOrigin(0.5, 0));
      costs.add(this.add.text(centerX, compact ? 111 : 131, 'ALL PERMANENT UPGRADES MAXED', {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 14 : 17}px`, color: '#e4fbff', fontStyle: 'bold', align: 'center'
      }).setOrigin(0.5, 0));
      costs.add(this.add.rectangle(18, compact ? 153 : 181, costsRect.width - 36, compact ? 58 : 70, 0x102b31, 0.88)
        .setOrigin(0).setStrokeStyle(1, 0x72ff9b, 0.58));
      costs.add(this.add.text(centerX, compact ? 163 : 193, 'TOTAL REMAINING COST', {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#a8c8d2', fontStyle: 'bold'
      }).setOrigin(0.5, 0));
      costs.add(this.add.text(centerX, compact ? 181 : 216, '0 CR', {
        fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 19 : 25}px`, color: '#72ff9b', fontStyle: 'bold'
      }).setOrigin(0.5, 0));
      const completionTop = compact ? 225 : 282;
      analytics.upgrades.categories.forEach((category, index) => drawProgressBar(
        this, costs, 18, completionTop + index * (compact ? 39 : 49), costsRect.width - 36,
        category.label.toUpperCase(), 100, `${category.maximumLevels}/${category.maximumLevels}`, index % 2 ? 0xff65c8 : 0x62efff
      ));
      costs.add(this.add.text(centerX, Math.min(costsRect.height - 36, completionTop + analytics.upgrades.categories.length * (compact ? 39 : 49) + 10), 'NO PERMANENT UPGRADE COST REMAINS', {
        fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#9fc0ca', fontStyle: 'bold'
      }).setOrigin(0.5, 0));
    } else {
      drawHorizontalBars(this, costs, { x: 18, y: 54, width: costsRect.width - 36, height: Math.min(245, costsRect.height * 0.42) }, analytics.upgrades.categories.map((category, index) => ({ label: category.label.toUpperCase(), value: category.remainingCredits, color: index % 2 ? 0xff65c8 : 0x62efff })), { suffix: ' CR' });
      costs.add(this.add.text(18, Math.min(330, costsRect.height * 0.5), 'PERMANENT UPGRADE COST CURVE', { fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#80f4ff', fontStyle: 'bold' }));
      drawLineChart(this, costs, { x: 18, y: Math.min(352, costsRect.height * 0.54), width: costsRect.width - 36, height: Math.max(110, costsRect.height - Math.min(352, costsRect.height * 0.54) - 18) }, analytics.upgrades.costCurve, 0x62efff, 'CREDITS');
    }

    const future = createEconomyPanel(this, root, futureRect, 'FINITE PROGRESSION VALUE REMAINING', 0xffcc62, 'CR-EQUIVALENT');
    const finiteTotal = analytics.finiteProgression.reduce((sum, point) => sum + point.value, 0);
    drawDonut(this, future, futureRect.width / 2, 140, Phaser.Math.Clamp(futureRect.width * 0.2, 48, 82), analytics.finiteProgression.map((point) => ({ label: point.label, percentage: finiteTotal ? point.value / finiteTotal * 100 : 0, color: point.color })), formatEconomyNumber(finiteTotal));
    drawHorizontalBars(this, future, { x: 18, y: 245, width: futureRect.width - 36, height: 150 }, analytics.finiteProgression, { normalizeLabel: 'FINITE CATALOG / OWNED PROGRESSION ONLY' });
    future.add(this.add.text(18, compact ? Math.min(430, Math.max(245, futureRect.height - 100)) : 430, `MOD CARDS // ${analytics.mods.cardCount}\nMAX RANK // ${analytics.mods.maxRankCards}\nUPGRADEABLE // ${analytics.mods.upgradeableCards}\nAFFORDABLE NOW // ${analytics.mods.affordableUpgradeActions}`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 13 : 16}px`, color: '#d5eaf0', fontStyle: 'bold', lineSpacing: 8
    }));
  }

  private renderEconomyCommerce(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, body: EconomyConsoleRect, compact: boolean): void {
    const [catalogRect, categoriesRect, curveRect] = this.getEconomyColumns(body, compact);
    const catalog = createEconomyPanel(this, root, catalogRect, 'STORE ECONOMY // CATALOG', 0xff65c8, 'INFORMATION ONLY');
    addMetric(this, catalog, 18, 52, 'OWNERSHIP COMPLETION', `${analytics.store.owned} / ${analytics.store.total}`, 0xff65c8);
    addMetric(this, catalog, catalogRect.width - 18, 52, 'COMPLETION', `${analytics.store.completionPercentage.toFixed(1)}%`, 0x62efff, 'right');
    addMetric(this, catalog, 18, 108, 'AFFORDABLE NOW', analytics.store.affordableNow.toLocaleString(), 0x72ff9b);
    catalog.add(this.add.text(18, 164, `REMAINING CATALOG VALUE\n${analytics.store.remainingCatalogCost.credits.toLocaleString()} CR\n${analytics.store.remainingCatalogCost.coreTokens.toLocaleString()} CT\n${analytics.store.remainingCatalogCost.plasmaChips.toLocaleString()} PC\n${formatEconomyNumber(analytics.store.remainingCatalogCost.creditEquivalent)} CR-EQUIVALENT`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 13 : 16}px`, color: '#e0f0f5', fontStyle: 'bold', lineSpacing: 7
    }));
    catalog.add(this.add.text(18, 285, `AFFORDABLE BY PRIMARY CURRENCY\nCREDITS  ${analytics.store.affordableByPrimaryCurrency.credits}\nCORE TOKENS  ${analytics.store.affordableByPrimaryCurrency.coreTokens}\nPLASMA CHIPS  ${analytics.store.affordableByPrimaryCurrency.plasmaChips}`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 13 : 15}px`, color: '#b2d0d9', fontStyle: 'bold', lineSpacing: 7
    }));
    const catalogPriceSummary = compact
      ? `CHEAPEST // ${analytics.store.cheapestUnowned ? `${analytics.store.cheapestUnowned.label}\n${analytics.store.cheapestUnowned.price}` : 'CATALOG COMPLETE'}\nBEST AFFORDABLE // ${analytics.store.mostExpensiveAffordable ? `${analytics.store.mostExpensiveAffordable.label}\n${analytics.store.mostExpensiveAffordable.price}` : 'NONE CURRENTLY'}`
      : `CHEAPEST UNOWNED\n${analytics.store.cheapestUnowned ? `${analytics.store.cheapestUnowned.label}\n${analytics.store.cheapestUnowned.price}` : 'CATALOG COMPLETE'}\n\nMOST EXPENSIVE AFFORDABLE\n${analytics.store.mostExpensiveAffordable ? `${analytics.store.mostExpensiveAffordable.label}\n${analytics.store.mostExpensiveAffordable.price}` : 'NONE CURRENTLY'}`;
    catalog.add(this.add.text(18, compact ? 375 : 390, catalogPriceSummary, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#def2f7', fontStyle: 'bold', lineSpacing: 5
    }).setWordWrapWidth(catalogRect.width - 36, true));

    const categories = createEconomyPanel(this, root, categoriesRect, 'COSMETIC MARKET VALUATION', 0x62efff, 'CR-EQUIVALENT');
    drawHorizontalBars(this, categories, { x: 18, y: 55, width: categoriesRect.width - 36, height: categoriesRect.height - 78 }, analytics.store.categories.map((category, index) => ({
      label: `${category.label.toUpperCase()} ${category.owned}/${category.count}`, value: category.averageCreditEquivalent,
      detail: `MIN ${formatEconomyNumber(category.minimumCreditEquivalent)} · AVG ${formatEconomyNumber(category.averageCreditEquivalent)} · MAX ${formatEconomyNumber(category.maximumCreditEquivalent)} · AFF ${category.affordable}`,
      color: index % 3 === 0 ? 0x62efff : index % 3 === 1 ? 0xff65c8 : 0xffcc62
    })), { maxRows: 9, normalizeLabel: 'BAR = AVERAGE CATEGORY VALUE // OWNED / TOTAL' });

    const curve = createEconomyPanel(this, root, curveRect, 'COSMETIC PRICE DISTRIBUTION', 0xffcc62, 'ORDERED CATALOG');
    drawLineChart(this, curve, { x: 18, y: 58, width: curveRect.width - 36, height: Math.min(300, curveRect.height * 0.47) }, analytics.store.priceCurve, 0xff65c8, 'CR-EQUIVALENT');
    curve.add(this.add.text(18, Math.min(390, curveRect.height * 0.58), `PURCHASING POWER\n${analytics.purchasingPower.cosmetics} COSMETICS AFFORDABLE\n${analytics.purchasingPower.permanentUpgradeActions} PERMANENT UPGRADES\n${analytics.purchasingPower.modUpgradeActions} MOD UPGRADES`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 13 : 16}px`, color: '#e0f2f7', fontStyle: 'bold', lineSpacing: 9
    }));
    curve.add(this.add.text(18, Math.min(520, curveRect.height - 100), 'TRANSACTION ROUTING', { fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 12 : 14}px`, color: '#70f4ff', fontStyle: 'bold' }));
    curve.add(this.add.text(18, Math.min(544, curveRect.height - 75), 'COSMETIC PURCHASES REMAIN IN THE COSMETIC STORE.\nTHIS CONSOLE IS A READ-ONLY CATALOG ANALYSIS.', {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 14}px`, color: '#9cb8c2', fontStyle: 'bold', lineSpacing: 5
    }).setWordWrapWidth(curveRect.width - 36, true));
  }

  private renderEconomyMods(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, body: EconomyConsoleRect, compact: boolean): void {
    const [modsRect, infusionRect, intelRect] = this.getEconomyColumns(body, compact);
    const mods = createEconomyPanel(this, root, modsRect, 'MOD PROGRESSION ECONOMY', 0x62efff, 'OWNED CARDS ONLY');
    addMetric(this, mods, 18, 52, 'OWNED DEFINITIONS', analytics.mods.ownedDefinitions.toLocaleString(), 0x62efff);
    addMetric(this, mods, modsRect.width - 18, 52, 'CARD INSTANCES', analytics.mods.cardCount.toLocaleString(), 0xff65c8, 'right');
    addMetric(this, mods, 18, 105, 'MAX-RANK CARDS', analytics.mods.maxRankCards.toLocaleString(), 0xffcc62);
    addMetric(this, mods, modsRect.width - 18, 105, 'UPGRADEABLE', analytics.mods.upgradeableCards.toLocaleString(), 0x72ff9b, 'right');
    mods.add(this.add.text(18, 158, `TOTAL REMAINING\n${analytics.mods.remainingCredits.toLocaleString()} CR + ${analytics.mods.remainingCoreTokens.toLocaleString()} CT\n${formatEconomyNumber(analytics.mods.remainingCreditEquivalent)} CR-EQUIVALENT`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 13 : 16}px`, color: '#e2f2f6', fontStyle: 'bold', lineSpacing: 6
    }));
    drawHorizontalBars(this, mods, { x: 18, y: 245, width: modsRect.width - 36, height: Math.min(245, modsRect.height - 270) }, analytics.mods.byRarity.filter((bucket) => bucket.cards > 0).map((bucket) => ({
      label: `${bucket.label} (${bucket.cards})`, value: bucket.remainingCreditEquivalent, color: bucket.id === 'legendary' ? 0xffb43f : bucket.id === 'supreme' ? 0xfff16a : bucket.id === 'corrupted' ? 0xff4fc8 : bucket.id === 'epic' ? 0xc86aff : bucket.id === 'rare' ? 0x51c8ff : bucket.id === 'uncommon' ? 0x63ff9b : 0xbcd5de
    })), { maxRows: 7, normalizeLabel: 'REMAINING RANK COST // CR-EQUIVALENT' });

    const infusion = createEconomyPanel(this, root, infusionRect, 'INFUSION / PLASMA ECONOMY', 0xd779ff, 'LIVE DEFINITIONS');
    addMetric(this, infusion, 18, 52, 'PLASMA BALANCE', analytics.infusions.plasmaBalance.toLocaleString(), 0xd779ff);
    addMetric(this, infusion, infusionRect.width - 18, 52, 'INFUSED MODS', analytics.infusions.installedCount.toLocaleString(), 0x62efff, 'right');
    infusion.add(this.add.text(18, 104, `MIN-COST INSTALLS  ${analytics.infusions.minimumCostInstallsAffordable}\nAVERAGE-COST INSTALLS  ${analytics.infusions.averageCostInstallsAffordable}\nSWAPS @ ${analytics.infusions.swapCost} PC  ${analytics.infusions.swapsAffordable}\nREMOVALS @ ${analytics.infusions.removalCost} PC  ${analytics.infusions.removalsAffordable}\nUNINFUSED ELIGIBLE  ${analytics.infusions.uninfusedEligibleCards}`, {
      fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#dfedf2', fontStyle: 'bold', lineSpacing: 6
    }));
    infusion.add(this.add.text(18, 225, `INSTALL COSTS // ${analytics.infusions.minimumInstallCost}-${analytics.infusions.maximumInstallCost} PC`, { fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 12 : 15}px`, color: '#e99cff', fontStyle: 'bold' }));
    drawVerticalBars(this, infusion, { x: 18, y: 275, width: infusionRect.width - 36, height: Math.min(210, infusionRect.height - 315) }, analytics.infusions.costs, analytics.infusions.plasmaBalance);

    const intel = createEconomyPanel(this, root, intelRect, 'MOD COST CURVE / ECONOMY INTEL', 0xffcc62, 'DETERMINISTIC');
    drawLineChart(this, intel, { x: 18, y: 58, width: intelRect.width - 36, height: compact ? Math.min(175, intelRect.height * 0.34) : Math.min(260, intelRect.height * 0.4) }, analytics.mods.costCurve, 0xffcc62, 'CR-EQUIVALENT');
    const intelTop = compact ? Math.min(260, intelRect.height * 0.55) : Math.min(355, intelRect.height * 0.48);
    analytics.intel.forEach((entry, index) => {
      const y = intelTop + index * (compact ? 50 : 58);
      intel.add(this.add.text(18, y, entry.label, { fontFamily: ECONOMY_FONT, fontSize: `${compact ? 12 : 14}px`, color: '#9bb7c1', fontStyle: 'bold' }));
      intel.add(this.add.text(intelRect.width - 18, y, entry.value, { fontFamily: ECONOMY_DISPLAY_FONT, fontSize: `${compact ? 14 : 18}px`, color: Phaser.Display.Color.IntegerToColor(entry.color).rgba, fontStyle: 'bold' }).setOrigin(1, 0));
      intel.add(this.add.text(18, y + 22, entry.detail, { fontFamily: ECONOMY_FONT, fontSize: `${compact ? 11 : 13}px`, color: '#d3e5eb', fontStyle: 'bold' }));
    });
  }

  private createEconomyTicker(root: Phaser.GameObjects.Container, analytics: EconomyAnalyticsSnapshot, height: number): void {
    const { width } = this.scale;
    const y = height - 25;
    const tickerHeight = 36;
    const clipLeft = 158;
    const clipRight = width - 22;
    root.add(this.add.rectangle(width / 2, y, width - 28, tickerHeight, 0x02080d, 0.98).setStrokeStyle(1, 0x62efff, 0.42));
    root.add(this.add.text(22, y, 'MARKET WIRE //', { fontFamily: ECONOMY_DISPLAY_FONT, fontSize: '13px', color: '#62efff', fontStyle: 'bold' }).setOrigin(0, 0.5));
    const ticker = this.add.text(clipLeft, y, analytics.ticker.join('     ◆     '), {
      fontFamily: ECONOMY_FONT, fontSize: '14px', color: '#b8d6df', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    const maskSource = this.add.graphics().fillStyle(0xffffff, 1)
      .fillRect(clipLeft, y - tickerHeight / 2 + 2, Math.max(1, clipRight - clipLeft), tickerHeight - 4)
      .setVisible(false);
    const tickerMask = maskSource.createGeometryMask();
    ticker.setMask(tickerMask);
    ticker.once(Phaser.GameObjects.Events.DESTROY, () => tickerMask.destroy());
    root.add([maskSource, ticker]);
    if (ticker.width > clipRight - clipLeft) {
      this.overlayAnimatedTargets.push(ticker);
      this.tweens.add({
        targets: ticker,
        x: clipLeft - ticker.width - 40,
        duration: Math.max(12_000, (ticker.width + clipRight - clipLeft) * 20),
        hold: 1_000,
        repeatDelay: 700,
        repeat: -1,
        ease: 'Linear'
      });
    }
  }

  private showPresets(): void {
    const root = this.createOverlay('CONFIGURATION WORKBENCH // PRESETS');
    const { width, height } = this.scale;
    const state = SaveSystem.getGarageState();
    const mods = SaveSystem.getModCollection();
    const columns = 3;
    const gap = Math.max(8, Math.min(18, width * 0.015));
    const panelWidth = Math.min(360, (width - 36 - gap * 2) / columns);
    const panelHeight = height - 128;
    state.presets.forEach((preset, index) => {
      const x = width / 2 + (index - 1) * (panelWidth + gap);
      const y = 92 + panelHeight / 2;
      const missing = Object.values(preset.cardSlots).filter((id) => id && !mods.cards.some((card) => card.instanceId === id)).length;
      root.add(this.add.rectangle(x, y, panelWidth, panelHeight, 0x081622, 0.97).setStrokeStyle(2, preset.saved ? 0x63efff : 0x3d6170, preset.saved ? 0.68 : 0.42));
      root.add(this.add.text(x, 108, preset.name, { fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(panelWidth * 0.08, 14, 20)}px`, color: preset.saved ? '#69f5ff' : '#7798a5' }).setOrigin(0.5));
      const installed = Object.values(preset.cardSlots).filter(Boolean).length;
      const protocol = preset.protocol ? RUN_PROTOCOLS[preset.protocol].label : 'NO PROTOCOL SAVED';
      const contract = preset.contract ? RUN_CONTRACTS[preset.contract].label : 'NO CONTRACT';
      const signal = preset.modFocus ? MOD_FOCUS_LABELS[preset.modFocus] : 'NO SIGNAL';
      root.add(this.add.text(x, 145, preset.saved
        ? `${installed} / 5 MODS\n${protocol}\n${contract}\n${signal}${missing ? `\n${missing} MISSING MOD${missing === 1 ? '' : 'S'}` : ''}`
        : 'EMPTY CONFIGURATION SLOT\n\nSAVE THE CURRENT WORKBENCH\nSTATE TO BEGIN.', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: panelWidth < 210 ? '12px' : '15px', color: missing ? '#ff9baa' : '#c4dce7', align: 'center', lineSpacing: 5
      }).setOrigin(0.5, 0).setWordWrapWidth(panelWidth - 24, true).setMaxLines(7));
      if (preset.savedAt) root.add(this.add.text(x, y + panelHeight / 2 - 112, `SAVED ${new Date(preset.savedAt).toLocaleDateString()}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', color: '#6f919f' }).setOrigin(0.5));
      root.add(createButton(this, x, y + panelHeight / 2 - 74, 'SAVE CURRENT CONFIG', () => {
        const result = SaveSystem.saveGaragePreset(preset.id);
        this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? ''}`;
        this.showPresets();
        return result.ok;
      }, panelWidth - 22));
      const load = createButton(this, x, y + panelHeight / 2 - 28, 'LOAD CONFIG', () => {
        const result = SaveSystem.loadGaragePreset(preset.id);
        this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? ''}`;
        this.scene.restart({ returnScene: this.returnScene });
        return result.ok;
      }, panelWidth - 22);
      if (!preset.saved) disableButton(load);
      root.add(load);
    });
  }

  private cycleProtocol(current: RunProtocolId): boolean {
    const next = cycleUnlockedProtocol(current, SaveSystem.getHighestRound(), 1, SaveSystem.getSupremeHighestRound(), SaveSystem.hasCompletedRegularOverdrive());
    const result = SaveSystem.setPreferredProtocol(next);
    this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? RUN_PROTOCOLS[next].label}`;
    this.scene.restart({ returnScene: this.returnScene });
    return result.ok;
  }

  private openCollection(selectedCardId?: string, initialCategory?: 'all' | ModCategory | 'supreme', targetSlot?: ModSlot): void {
    this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.Garage, selectedCardId, initialCategory, targetSlot });
  }

  private closeOverlay(): void {
    this.input.off('wheel', this.handleLibraryWheel);
    this.libraryViewer?.destroy();
    this.libraryViewer = null;
    this.recalibrationRevealTimer?.remove(false);
    this.recalibrationRevealTimer = null;
    this.cosmeticPreviewColorTimer?.remove(false);
    this.cosmeticPreviewColorTimer = null;
    this.cosmeticPreviewColorTargets = [];
    this.tweens.killTweensOf(this.overlayAnimatedTargets);
    this.overlayAnimatedTargets.length = 0;
    this.overlay?.destroy(true);
    this.overlay = null;
    setSceneUiModalDepth(this, 0);
    configureSceneUiNavigation(this, {
      onTabLeft: undefined,
      onTabRight: undefined,
      onPageLeft: undefined,
      onPageRight: undefined
    });
  }

  private returnToPrevious(): void {
    if (SaveSystem.getTutorialProgress().firstRunStage === 'garage-teaching'
      && this.tutorialDirector?.isActiveSequence('onboarding.garage')) return;
    this.scene.start(this.returnScene);
  }
}
