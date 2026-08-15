import Phaser from 'phaser';
import { COSMETICS, getCosmeticDisplayColor, getCosmeticTextureKey } from '../../data/cosmetics.ts';
import { createCosmeticPreview } from '../cosmetics/CosmeticPreview.ts';
import { ECONOMY_BALANCE, MOD_FOCUS_CATEGORIES, MOD_FOCUS_LABELS, RUN_CONTRACT_IDS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { getRunSetupCost } from '../economy/EconomyService.ts';
import type { RunSetupSelection } from '../economy/types.ts';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys.ts';
import { calculateGarageLayout, type GarageRect } from '../garage/garageLayout.ts';
import {
  addTerminalMount,
  createGarageEnvironment,
  createModWorkbench,
  createStationHousing
} from '../garage/GarageEnvironment.ts';
import { getGarageDockModels, getModLibraryEntries, getModLibraryProgress } from '../garage/GarageState.ts';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_RARITY_COLORS, createModCardView } from '../mods/ModCardView.ts';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol } from '../mods/modBalance.ts';
import type { ModCardInstance, ModCategory, ModDefinition, ModRarity, RunProtocolId } from '../mods/types.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import type { CosmeticOption } from '../types.ts';
import { createModCollectionFrame } from '../ui/ModCollectionUi.ts';
import { createButton, disableButton } from '../utils/ui.ts';

interface OperatorGarageSceneData { returnScene?: SceneKeyValue }
type LibraryOwnershipFilter = 'all' | 'owned' | 'unowned' | 'corrupted';

const LIBRARY_CATEGORIES: Array<'all' | ModCategory> = ['all', 'weapon', 'player', 'defense', 'bombSite', 'utility'];
const LIBRARY_RARITIES: Array<'all' | ModRarity> = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
const LIBRARY_OWNERSHIP: LibraryOwnershipFilter[] = ['all', 'owned', 'unowned', 'corrupted'];
const COSMETIC_CATEGORIES = Array.from(new Set(COSMETICS.map((item) => item.category)));
const COSMETIC_CATEGORY_LABELS: Record<CosmeticOption['category'], string> = {
  playerColor: 'OPERATIVE COLOR', playerShape: 'OPERATIVE FRAME', projectileColor: 'PROJECTILE COLOR', projectileShape: 'PROJECTILE SHAPE',
  trailColor: 'MOVEMENT TRAIL', bombColor: 'CHARGE COLOR', turretSkin: 'TURRET SKIN', fenceStyle: 'FENCE STYLE', dashTrail: 'DASH TRAIL'
};

const syntheticLibraryCard = (definition: ModDefinition): ModCardInstance => ({
  instanceId: `library-${definition.id}`,
  modId: definition.id,
  acquiredAt: new Date(0).toISOString(),
  upgradeLevel: 0
});

export class OperatorGarageScene extends Phaser.Scene {
  private readonly audio = AudioManager.get();
  private returnScene: SceneKeyValue = SceneKeys.MainMenu;
  private overlay: Phaser.GameObjects.Container | null = null;
  private readonly overlayAnimatedTargets: Phaser.GameObjects.GameObject[] = [];
  private operatorPreviewRoot: Phaser.GameObjects.Container | null = null;
  private operatorPreviewColorTimer: Phaser.Time.TimerEvent | null = null;
  private operatorPreviewLayout: { rect: GarageRect; compact: boolean } | null = null;
  private cosmeticPreviewColorTimer: Phaser.Time.TimerEvent | null = null;
  private cosmeticPreviewColorTargets: Array<{ item: CosmeticOption; setColor: (color: number) => void }> = [];
  private status = '';
  private libraryCategoryIndex = 0;
  private libraryRarityIndex = 0;
  private libraryOwnershipIndex = 0;
  private libraryPage = 0;
  private librarySelectedId = MOD_DEFINITIONS[0]?.id ?? '';
  private cosmeticCategoryIndex = 0;
  private cosmeticPage = 0;
  private readonly handleEscape = (): void => {
    if (this.overlay) this.closeOverlay();
    else this.returnToPrevious();
  };
  private readonly handleResize = (): void => {
    this.scene.restart({ returnScene: this.returnScene });
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
    this.audio.startMusicLoop();
    const { width, height } = this.scale;
    const layout = calculateGarageLayout(width, height);
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
    this.createStations(layout.stationCenters, layout.stationWidth, layout.stationHeight);

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
    });
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
    const root = this.terminalFrame(rect, 'DEPLOYMENT CONFIGURATION');
    const roomy = !compact && rect.height >= 180;
    const contentScale = roomy ? Phaser.Math.Clamp(rect.width / 400, 1, 1.36) : 1;
    const highestRound = SaveSystem.getHighestRound();
    const requested = SaveSystem.getPreferredProtocol();
    const protocol = highestRound >= RUN_PROTOCOLS[requested].unlockHighestRound ? requested : 'normal';
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
      hit.on('pointerover', () => {
        hit.setFillStyle(0x17374a, 0.75);
        this.audio.playSfx('menuHover');
      });
      hit.on('pointerout', () => hit.setFillStyle(0x102331, 0.5));
      hit.on('pointerdown', () => {
        row.action();
        this.audio.playSfx('menu');
      });
      root.add([hit, label, value]);
    });
    if (roomy) {
      const cost = getRunSetupCost(setup);
      root.add(this.add.text(rect.width / 2, rect.height - 19, cost > 0 ? `NEXT RUN FEE // ${cost.toLocaleString()} CREDITS` : 'NEXT RUN FEE // FREE', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${Math.round(15 * contentScale)}px`, fontStyle: 'bold', color: cost > 0 ? '#ffd077' : '#7fffc2'
      }).setOrigin(0.5));
    }
  }

  private createWalletTerminal(rect: GarageRect, compact: boolean): void {
    const root = this.terminalFrame(rect, 'DIGITAL WALLET', 0xff5bcf);
    const roomy = !compact && rect.height >= 180;
    const contentScale = roomy ? Phaser.Math.Clamp(rect.width / 400, 1, 1.36) : 1;
    const save = SaveSystem.get();
    const plasma = SaveSystem.getModCollection().plasmaChips;
    const values = [
      ['CREDITS', save.credits.toLocaleString(), '#7fffe5'],
      ['CORE TOKENS', save.coreTokens.toLocaleString(), '#ffd37b'],
      ['PLASMA CHIPS', plasma.toLocaleString(), '#db8fff'],
      ['FLUX CORES', save.fluxCores.toLocaleString(), '#76ff9e']
    ] as const;
    values.forEach(([label, value, color], index) => {
      const y = (roomy ? 42 * contentScale : 31) + index * (roomy ? 36 * contentScale : 23);
      root.add(this.add.text(15 * contentScale, y, label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${roomy ? Math.round(15 * contentScale) : 11}px`, color: '#93b8c7'
      }).setOrigin(0));
      root.add(this.add.text(rect.width - 15 * contentScale, y - 4 * contentScale, value, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${roomy ? Math.round(21 * contentScale) : 14}px`, color
      }).setOrigin(1, 0));
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
    const texture = this.textures.exists(shapeId) ? shapeId : 'player-circle';
    const operative = this.add.image(0, ringY, texture).setScale(large ? 2.75 : compact ? 1.72 : 2.2);
    const tint = SaveSystem.getCosmeticColor('playerColor', this.time.now);
    operative.setTint(tint);
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
    if (SaveSystem.isPrismCosmetic('playerColor')) {
      this.operatorPreviewColorTimer = this.time.addEvent({
        delay: 90,
        loop: true,
        callback: () => operative.active && operative.setTint(SaveSystem.getCosmeticColor('playerColor', this.time.now))
      });
    }
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
        const view = createModCardView(this, center.x, center.y, dock.card, dock.card.upgradeLevel, { width: cardWidth, height: cardHeight, compact: compactCard, equipped: true });
        view.setDepth(26).on('pointerdown', () => {
          this.audio.playSfx('menu');
          this.openCollection(dock.card?.instanceId);
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
          this.openCollection();
        });
      }
      const actionY = center.y + cardHeight / 2 + actionButtonGap + actionButtonHeight / 2;
      createButton(this, center.x, actionY, dock.card ? 'UNEQUIP' : 'BROWSE', () => {
        if (dock.card) {
          SaveSystem.unequipMod(dock.slot);
          this.status = `SUCCESS // ${dock.label.replace('SLOT ', '').replace(' // ', ' ')} CLEARED`;
          this.scene.restart({ returnScene: this.returnScene });
        } else this.openCollection();
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
      { label: 'CONFIG PRESETS', action: () => this.showPresets() }
    ];
    stations.forEach((station, index) => {
      createStationHousing(this, centers[index], width, index, height);
      const button = createButton(this, centers[index].x, centers[index].y, station.label, () => {
        station.action();
      }, width, 'menu', {
        height,
        fontSize: Phaser.Math.Clamp(height * 0.34, 16, 21),
        horizontalPadding: 28
      }).setDepth(80);
      const led = this.add.circle(centers[index].x - width / 2 + 11, centers[index].y, Phaser.Math.Clamp(height * 0.045, 2, 3), index % 2 ? 0xff5bcf : 0x62f4ff, 0.9).setDepth(82);
      this.tweens.add({ targets: led, alpha: { from: 0.25, to: 1 }, duration: 850 + index * 180, yoyo: true, repeat: -1 });
      button.setDepth(80);
    });
  }

  private createOverlay(title: string): Phaser.GameObjects.Container {
    this.closeOverlay();
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
    const close = createButton(this, width - closeWidth / 2 - closeRightInset, closeY, 'CLOSE', () => this.closeOverlay(), closeWidth);
    root.add([blocker, panel, scanlines, heading, close]);
    this.overlay = root;
    return root;
  }

  private showRunConfiguration(): void {
    const root = this.createOverlay('RUN CONFIGURATION // ONE-RUN SETUP');
    const { width, height } = this.scale;
    const setup = SaveSystem.getNextRunSetupSelection();
    const totalCost = getRunSetupCost(setup);
    const narrow = width < 900;
    const columnGap = narrow ? 12 : 28;
    const columnWidth = Math.min(narrow ? (width - 40 - columnGap) * 0.5 : 620, (width - 64 - columnGap) * 0.5);
    const leftX = width / 2 - (columnWidth + columnGap) / 2;
    const rightX = width / 2 + (columnWidth + columnGap) / 2;
    const panelTop = narrow ? 108 : 120;
    const panelHeight = height - panelTop - 24;

    const summary = totalCost > 0
      ? `CURRENT RUN FEE // ${totalCost.toLocaleString()} CREDITS  //  CHARGED ONCE WHEN DEPLOYMENT STARTS`
      : 'CURRENT RUN FEE // FREE  //  STANDARD DROP AND CHALLENGE RULES';
    const summaryY = narrow ? 82 : 80;
    const summaryWidth = Math.max(260, Math.min(width - 340, 1040));
    const summaryRail = this.add.rectangle(width / 2, summaryY, summaryWidth, narrow ? 28 : 32, 0x071722, 0.94)
      .setStrokeStyle(1, totalCost > 0 ? 0xffbd68 : 0x6effae, 0.34);
    const summaryEdge = this.add.rectangle(width / 2 - summaryWidth / 2 + 5, summaryY, 3, narrow ? 20 : 24, totalCost > 0 ? 0xff5bcf : 0x55efff, 0.72);
    const summaryLed = this.add.circle(width / 2 + summaryWidth / 2 - 15, summaryY, 3, totalCost > 0 ? 0xffbd68 : 0x6effae, 0.95);
    root.add([summaryRail, summaryEdge, summaryLed]);
    root.add(this.add.text(width / 2, summaryY, summary, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 13 : 17}px`, fontStyle: 'bold',
      color: totalCost > 0 ? '#ffd17f' : '#82ffc1', align: 'center'
    }).setOrigin(0.5).setWordWrapWidth(summaryWidth - 42, true).setMaxLines(2));
    root.add(this.add.text(30, panelTop - 19, 'LOADOUT PROCUREMENT // TEMPORARY PARAMETERS', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 9 : 11}px`, color: '#69bdca', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0.5));
    root.add(this.add.text(width - 30, panelTop - 19, 'NEXT DEPLOYMENT LINK // STANDBY', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 9 : 11}px`, color: '#72ffad', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(1, 0.5));

    const createColumn = (centerX: number, title: string, accent: number): void => {
      const frame = createModCollectionFrame(this, {
        x: centerX - columnWidth / 2,
        y: panelTop,
        width: columnWidth,
        height: panelHeight
      }, title, accent);
      const lowerRail = this.add.rectangle(centerX, panelTop + panelHeight - 8, columnWidth - 34, 2, accent, 0.24);
      root.add([frame, lowerRail]);
      this.overlayAnimatedTargets.push(...frame.list);
    };
    createColumn(leftX, 'SIGNAL // FOCUSED MOD HUNT', 0x55efff);
    createColumn(rightX, 'CONTRACT // ENGAGEMENT RULES', 0xff5bcf);

    root.add(this.add.text(leftX, panelTop + (narrow ? 42 : 50), `Signals weight one Mod category ${ECONOMY_BALANCE.modFocus.categoryWeightMultiplier}x without changing rarity or total drop quantity.`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 11 : 15}px`, color: '#a9d3df', align: 'center',
      wordWrap: { width: columnWidth - 34, useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(3));

    const signalOptions: Array<{ id: RunSetupSelection['modFocus']; label: string }> = [
      { id: null, label: 'NO SIGNAL // STANDARD DROPS' },
      ...MOD_FOCUS_CATEGORIES.map((id) => ({ id, label: MOD_FOCUS_LABELS[id].toUpperCase() }))
    ];
    const signalStartY = panelTop + (narrow ? 92 : 108);
    const signalGap = Phaser.Math.Clamp((panelHeight - (narrow ? 112 : 136)) / signalOptions.length, narrow ? 39 : 46, 56);
    signalOptions.forEach((option, index) => {
      const selected = setup.modFocus === option.id;
      const fee = option.id ? `${ECONOMY_BALANCE.modFocus.cost.toLocaleString()}C` : 'FREE';
      const button = createButton(this, leftX, signalStartY + index * signalGap, `${selected ? '● ' : ''}${option.label}  //  ${fee}`, () => {
        SaveSystem.setNextRunSetupSelection({ ...setup, modFocus: option.id });
        this.status = `SUCCESS // ${option.id ? MOD_FOCUS_LABELS[option.id] : 'Signal removed'} configured for next deployment.`;
        this.scene.restart({ returnScene: this.returnScene });
        return true;
      }, columnWidth - 30, 'menu', { height: Math.min(40, signalGap - 5), fontSize: narrow ? 10 : 14 });
      if (selected) button.setAlpha(1);
      root.add(button);
    });

    root.add(this.add.text(rightX, panelTop + (narrow ? 42 : 50), 'Contracts modify encounter rules and rewards for the next deployment only.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 11 : 15}px`, color: '#d6b3ce', align: 'center',
      wordWrap: { width: columnWidth - 34, useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2));

    const contractOptions: Array<{ id: RunSetupSelection['contract']; label: string; description: string; cost: number }> = [
      { id: null, label: 'NO CONTRACT', description: 'Standard enemy, reward, and drop rules.', cost: 0 },
      ...RUN_CONTRACT_IDS.map((id) => ({ id, label: RUN_CONTRACTS[id].label.toUpperCase(), description: RUN_CONTRACTS[id].description, cost: RUN_CONTRACTS[id].cost }))
    ];
    const contractStartY = panelTop + (narrow ? 88 : 102);
    const contractGap = Phaser.Math.Clamp((panelHeight - (narrow ? 102 : 120)) / contractOptions.length, narrow ? 66 : 82, 106);
    contractOptions.forEach((option, index) => {
      const selected = setup.contract === option.id;
      const y = contractStartY + index * contractGap;
      const button = createButton(this, rightX, y, `${selected ? '● ' : ''}${option.label}  //  ${option.cost > 0 ? `${option.cost.toLocaleString()}C` : 'FREE'}`, () => {
        SaveSystem.setNextRunSetupSelection({ ...setup, contract: option.id });
        this.status = `SUCCESS // ${option.id ? RUN_CONTRACTS[option.id].label : 'Contract removed'} configured for next deployment.`;
        this.scene.restart({ returnScene: this.returnScene });
        return true;
      }, columnWidth - 30, 'menu', { height: narrow ? 34 : 40, fontSize: narrow ? 10 : 14 });
      root.add(button);
      root.add(this.add.text(rightX, y + (narrow ? 20 : 24), option.description, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 9 : 13}px`, color: '#9fb9c5', align: 'center',
        wordWrap: { width: columnWidth - 40, useAdvancedWrap: true }
      }).setOrigin(0.5, 0).setMaxLines(narrow ? 2 : 3));
    });
    this.overlayAnimatedTargets.push(summaryLed);
    this.tweens.add({ targets: summaryLed, alpha: { from: 0.25, to: 1 }, duration: 760, yoyo: true, repeat: -1 });
  }

  private showLibrary(): void {
    const root = this.createOverlay('MOD LIBRARY // SYSTEM DATABASE');
    const { width, height } = this.scale;
    const mods = SaveSystem.getModCollection();
    const progress = getModLibraryProgress(mods);
    const category = LIBRARY_CATEGORIES[this.libraryCategoryIndex];
    const rarity = LIBRARY_RARITIES[this.libraryRarityIndex];
    const ownership = LIBRARY_OWNERSHIP[this.libraryOwnershipIndex];
    const allEntries = getModLibraryEntries(mods);
    const entries = allEntries.filter(({ definition, owned }) =>
      (category === 'all' || definition.category === category)
      && (rarity === 'all' || definition.rarity === rarity)
      && (ownership === 'all' || ownership === 'owned' && owned || ownership === 'unowned' && !owned || ownership === 'corrupted' && definition.variant === 'corrupted')
    );
    if (!entries.some((entry) => entry.definition.id === this.librarySelectedId)) this.librarySelectedId = entries[0]?.definition.id ?? '';
    const toolbarWidth = Math.min(170, (width * 0.64 - 58) / 3);
    const toolbarY = 83;
    root.add(createButton(this, 20 + toolbarWidth / 2, toolbarY, `TYPE: ${category.toUpperCase()}`, () => { this.libraryCategoryIndex = (this.libraryCategoryIndex + 1) % LIBRARY_CATEGORIES.length; this.libraryPage = 0; this.showLibrary(); }, toolbarWidth));
    root.add(createButton(this, 28 + toolbarWidth * 1.5, toolbarY, `RARITY: ${rarity.toUpperCase()}`, () => { this.libraryRarityIndex = (this.libraryRarityIndex + 1) % LIBRARY_RARITIES.length; this.libraryPage = 0; this.showLibrary(); }, toolbarWidth));
    root.add(createButton(this, 36 + toolbarWidth * 2.5, toolbarY, `STATUS: ${ownership.toUpperCase()}`, () => { this.libraryOwnershipIndex = (this.libraryOwnershipIndex + 1) % LIBRARY_OWNERSHIP.length; this.libraryPage = 0; this.showLibrary(); }, toolbarWidth));
    root.add(this.add.text(46 + toolbarWidth * 3, toolbarY, `${progress.discovered} / ${progress.total} DISCOVERED`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: width < 760 ? '13px' : '17px', fontStyle: 'bold', color: '#9effc9'
    }).setOrigin(0, 0.5));

    const detailWidth = Phaser.Math.Clamp(width * 0.28, 190, 330);
    const gridLeft = 22;
    const gridRight = width - detailWidth - 28;
    const gridWidth = gridRight - gridLeft;
    const cardGap = 10;
    const columns = Math.max(2, Math.floor(gridWidth / 122));
    const cardWidth = Phaser.Math.Clamp((gridWidth - cardGap * (columns - 1)) / columns, 82, 118);
    const cardHeight = cardWidth * 1.4;
    const gridTop = 119;
    const rows = Math.max(1, Math.floor((height - gridTop - 58) / (cardHeight + cardGap)));
    const perPage = columns * rows;
    const maxPage = Math.max(0, Math.ceil(entries.length / perPage) - 1);
    this.libraryPage = Math.min(this.libraryPage, maxPage);
    entries.slice(this.libraryPage * perPage, (this.libraryPage + 1) * perPage).forEach((entry, index) => {
      const x = gridLeft + cardWidth / 2 + index % columns * (cardWidth + cardGap);
      const y = gridTop + cardHeight / 2 + Math.floor(index / columns) * (cardHeight + cardGap);
      const card = entry.card ?? syntheticLibraryCard(entry.definition);
      const view = createModCardView(this, x, y, card, card.upgradeLevel, { width: cardWidth, height: cardHeight, compact: true, selected: entry.definition.id === this.librarySelectedId });
      view.setDepth(2002).setAlpha(entry.owned ? 1 : 0.48).on('pointerdown', () => {
        this.audio.playSfx('menu');
        this.librarySelectedId = entry.definition.id;
        this.showLibrary();
      });
      root.add(view);
      if (!entry.owned) {
        const marker = this.add.text(x, y + cardHeight * 0.35, 'NOT OWNED', { fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.max(7, cardWidth * 0.07)}px`, color: '#ff9cac', backgroundColor: '#160812' }).setOrigin(0.5).setDepth(2004);
        root.add(marker);
      }
    });
    if (!entries.length) root.add(this.add.text((gridLeft + gridRight) / 2, height / 2, 'NO MODS MATCH THIS FILTER', { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#607d8b' }).setOrigin(0.5));
    const previous = createButton(this, gridLeft + 52, height - 35, '◀', () => { this.libraryPage = Math.max(0, this.libraryPage - 1); this.showLibrary(); }, 82);
    const next = createButton(this, gridRight - 52, height - 35, '▶', () => { this.libraryPage = Math.min(maxPage, this.libraryPage + 1); this.showLibrary(); }, 82);
    if (this.libraryPage === 0) disableButton(previous);
    if (this.libraryPage === maxPage) disableButton(next);
    root.add([previous, this.add.text((gridLeft + gridRight) / 2, height - 35, `PAGE ${this.libraryPage + 1} / ${maxPage + 1}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#add7e4' }).setOrigin(0.5), next]);
    const selected = entries.find((entry) => entry.definition.id === this.librarySelectedId) ?? allEntries.find((entry) => entry.definition.id === this.librarySelectedId);
    this.createLibraryDetails(root, width - detailWidth / 2 - 12, 112, detailWidth - 10, height - 132, selected?.definition, selected?.owned ?? false, selected?.card ?? null);
  }

  private createLibraryDetails(root: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number, definition?: ModDefinition, owned = false, ownedCard: ModCardInstance | null = null): void {
    root.add(this.add.rectangle(x, y + height / 2, width, height, 0x081722, 0.94).setStrokeStyle(2, definition ? MOD_RARITY_COLORS[definition.rarity] : 0x4edff1, 0.55));
    if (!definition) return;
    const card = ownedCard ?? syntheticLibraryCard(definition);
    const cardWidth = Math.min(174, width - 34, Math.max(104, (height - 150) / 1.4));
    const cardHeight = cardWidth * 1.4;
    const cardY = y + 12 + cardHeight / 2;
    const view = createModCardView(this, x, cardY, card, card.upgradeLevel, { width: cardWidth, height: cardHeight, interactive: false });
    view.setDepth(2003).setAlpha(owned ? 1 : 0.62);
    root.add(view);
    const copyY = cardY + cardHeight / 2 + 12;
    root.add(this.add.text(x, copyY, `${owned ? 'OWNED' : 'UNDISCOVERED'} // ${definition.category.toUpperCase()} // ${definition.rarity.toUpperCase()}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontStyle: 'bold', color: owned ? '#7effb6' : '#ff9daf', align: 'center' }).setOrigin(0.5, 0).setWordWrapWidth(width - 22, true));
    root.add(this.add.text(x, copyY + 24, definition.description, { fontFamily: 'Rajdhani, sans-serif', fontSize: width < 230 ? '12px' : '14px', color: '#c5deea', align: 'center', lineSpacing: 1 }).setOrigin(0.5, 0).setWordWrapWidth(width - 24, true).setMaxLines(5));
  }

  private showCosmetics(): void {
    const root = this.createOverlay('GEAR LOCKER // OWNED COSMETICS');
    const { width, height } = this.scale;
    const save = SaveSystem.get();
    const category = COSMETIC_CATEGORIES[this.cosmeticCategoryIndex];
    const owned = COSMETICS.filter((item) => item.category === category && save.unlockedCosmetics.includes(item.id));
    const equippedId = save.equippedCosmetics[category];
    const selectorWidth = Math.min(260, width - 220);
    root.add(createButton(this, 20 + selectorWidth / 2, 80, `LOCKER: ${COSMETIC_CATEGORY_LABELS[category]}`, () => { this.cosmeticCategoryIndex = (this.cosmeticCategoryIndex + 1) % COSMETIC_CATEGORIES.length; this.cosmeticPage = 0; this.showCosmetics(); }, selectorWidth));
    root.add(this.add.text(24, 108, `${owned.length} OWNED // STORE ITEMS DO NOT APPEAR UNTIL UNLOCKED`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#83b1c0' }).setOrigin(0));
    const previewWidth = Phaser.Math.Clamp(width * 0.26, 180, 300);
    const gridLeft = 22;
    const gridRight = width - previewWidth - 28;
    const itemWidth = Phaser.Math.Clamp((gridRight - gridLeft - 20) / 3, 112, 180);
    const columns = Math.max(2, Math.floor((gridRight - gridLeft) / (itemWidth + 10)));
    const itemHeight = 94;
    const rows = Math.max(1, Math.floor((height - 175) / (itemHeight + 10)));
    const perPage = columns * rows;
    const maxPage = Math.max(0, Math.ceil(owned.length / perPage) - 1);
    this.cosmeticPage = Math.min(this.cosmeticPage, maxPage);
    owned.slice(this.cosmeticPage * perPage, (this.cosmeticPage + 1) * perPage).forEach((item, index) => {
      const x = gridLeft + itemWidth / 2 + index % columns * (itemWidth + 10);
      const y = 152 + itemHeight / 2 + Math.floor(index / columns) * (itemHeight + 10);
      const equipped = item.id === equippedId;
      const color = getCosmeticDisplayColor(item, this.time.now);
      const panel = this.add.rectangle(x, y, itemWidth, itemHeight, 0x0a1823, 0.96).setStrokeStyle(equipped ? 3 : 1, equipped ? 0x66ffad : color, equipped ? 1 : 0.55).setInteractive({ useHandCursor: true });
      const visual = this.createLockerCosmeticVisual(item, x, y - 20, Math.min(76, itemWidth * 0.55), 38);
      const label = this.add.text(x, y + 7, item.label.toUpperCase(), { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#e4faff', align: 'center' }).setOrigin(0.5).setWordWrapWidth(itemWidth - 12, true).setMaxLines(2);
      const state = this.add.text(x, y + 35, equipped ? 'EQUIPPED' : 'OWNED // CLICK TO EQUIP', { fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', color: equipped ? '#70ffac' : '#89abba' }).setOrigin(0.5);
      panel.on('pointerover', () => this.audio.playSfx('menuHover'));
      panel.on('pointerdown', () => {
        SaveSystem.equipCosmetic(item.category, item.id);
        if (item.category === 'playerShape' || item.category === 'playerColor') this.refreshOperatorPreview();
        this.audio.playSfx('menu');
        this.status = `SUCCESS // ${item.label.toUpperCase()} EQUIPPED`;
        this.showCosmetics();
      });
      root.add([panel, visual, label, state]);
    });
    if (!owned.length) root.add(this.add.text((gridLeft + gridRight) / 2, height / 2, 'NO OWNED COSMETICS IN THIS LOCKER\nVISIT THE STORE TO UNLOCK ITEMS', { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#688694', align: 'center' }).setOrigin(0.5));
    const previous = createButton(this, gridLeft + 50, height - 35, '◀', () => { this.cosmeticPage = Math.max(0, this.cosmeticPage - 1); this.showCosmetics(); }, 82);
    const next = createButton(this, gridRight - 50, height - 35, '▶', () => { this.cosmeticPage = Math.min(maxPage, this.cosmeticPage + 1); this.showCosmetics(); }, 82);
    if (this.cosmeticPage === 0) disableButton(previous);
    if (this.cosmeticPage === maxPage) disableButton(next);
    root.add([previous, this.add.text((gridLeft + gridRight) / 2, height - 35, `PAGE ${this.cosmeticPage + 1} / ${maxPage + 1}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#add7e4' }).setOrigin(0.5), next]);
    this.createCosmeticLockerPreview(root, width - previewWidth / 2 - 12, 130, previewWidth - 12, height - 155, category, equippedId);
    this.startLockerPrismPreviewUpdates();
  }

  private createCosmeticLockerPreview(root: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number, category: CosmeticOption['category'], equippedId?: string): void {
    root.add(this.add.rectangle(x, y + height / 2, width, height, 0x07131d, 0.96).setStrokeStyle(2, 0xff5bcf, 0.5));
    root.add(this.add.text(x, y + 18, 'CURRENTLY EQUIPPED', { fontFamily: 'Orbitron, sans-serif', fontSize: '13px', color: '#ff9ddb' }).setOrigin(0.5));
    const item = COSMETICS.find((entry) => entry.id === equippedId);
    if (!item) {
      root.add(this.add.text(x, y + height / 2, 'NO ITEM EQUIPPED', { fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#7793a0' }).setOrigin(0.5));
      return;
    }
    root.add(this.createLockerCosmeticVisual(item, x, y + height * 0.42, width * 0.62, Math.min(130, height * 0.32)));
    root.add(this.add.text(x, y + height * 0.72, item.label.toUpperCase(), { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#e4fbff', align: 'center' }).setOrigin(0.5).setWordWrapWidth(width - 20, true));
    root.add(this.add.text(x, y + height * 0.83, COSMETIC_CATEGORY_LABELS[category], { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#94b4c2', align: 'center' }).setOrigin(0.5));
  }

  private createLockerCosmeticVisual(item: CosmeticOption, x: number, y: number, maxWidth: number, maxHeight: number): Phaser.GameObjects.Container {
    const operatorTextureKey = getCosmeticTextureKey(SaveSystem.getEquippedCosmeticId('playerShape'), 'player-circle');
    const projectileTextureKey = getCosmeticTextureKey(SaveSystem.getEquippedCosmeticId('projectileShape'), 'projectile-pulse');
    const preview = createCosmeticPreview(this, item, x, y, { maxWidth, maxHeight, operatorTextureKey, projectileTextureKey });
    if (item.colorMode === 'prism') this.cosmeticPreviewColorTargets.push({ item, setColor: preview.setColor });
    return preview.container;
  }

  private startLockerPrismPreviewUpdates(): void {
    if (!this.cosmeticPreviewColorTargets.length) return;
    this.cosmeticPreviewColorTimer = this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        const now = this.time.now;
        this.cosmeticPreviewColorTargets.forEach(({ item, setColor }) => setColor(getCosmeticDisplayColor(item, now)));
      }
    });
  }

  private showOverdrive(): void {
    const root = this.createOverlay('OVERDRIVE PROGRESSION TERMINAL');
    const { width, height } = this.scale;
    const highest = SaveSystem.getHighestRound();
    const current = SaveSystem.getPreferredProtocol();
    root.add(this.add.text(width < 760 ? (width - 118) / 2 : width / 2, 58, `HIGHEST ROUND ${highest} // SELECT ANY UNLOCKED PROTOCOL`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: width < 760 ? '13px' : '16px', color: '#a8d6e3'
    }).setOrigin(0.5));
    const protocols = RUN_PROTOCOL_IDS.slice(1);
    const columns = 2;
    const rows = Math.ceil(protocols.length / columns);
    const gap = 10;
    const cardWidth = Math.min(430, (width - 44 - gap * (columns - 1)) / columns);
    const availableHeight = height - 122;
    const cardHeight = Math.max(47, Math.min(72, (availableHeight - gap * (rows - 1)) / rows));
    protocols.forEach((id, index) => {
      const definition = RUN_PROTOCOLS[id];
      const unlocked = highest >= definition.unlockHighestRound;
      const selected = current === id;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = width / 2 + (column === 0 ? -(cardWidth + gap) / 2 : (cardWidth + gap) / 2);
      const y = 96 + cardHeight / 2 + row * (cardHeight + gap);
      const panel = this.add.rectangle(x, y, cardWidth, cardHeight, unlocked ? 0x0b2425 : 0x10141d, 0.95)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0xffb14d : unlocked ? 0x61ffab : 0x445765, selected ? 1 : 0.58);
      panel.setInteractive({ useHandCursor: true });
      panel.on('pointerover', () => this.audio.playSfx('menuHover'));
      panel.on('pointerdown', () => {
        if (!unlocked) {
          this.audio.playSfx('itemLocked');
          return;
        }
        const result = SaveSystem.setPreferredProtocol(id);
        this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? `${definition.label} SELECTED`}`;
        this.audio.playSfx(result.ok ? 'menu' : 'itemLocked');
        this.showOverdrive();
      });
      root.add(panel);
      root.add(this.add.text(x - cardWidth / 2 + 14, y - 13, definition.label.replace('OVERDRIVE ', ''), { fontFamily: 'Orbitron, sans-serif', fontSize: cardHeight < 56 ? '12px' : '15px', color: unlocked ? '#d9fff0' : '#778791' }).setOrigin(0, 0.5));
      root.add(this.add.text(x + cardWidth / 2 - 14, y - 13, selected ? 'ACTIVE' : unlocked ? 'UNLOCKED' : 'LOCKED', { fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', fontStyle: 'bold', color: selected ? '#ffb45f' : unlocked ? '#69ffac' : '#7b6b76' }).setOrigin(1, 0.5));
      root.add(this.add.text(x, y + 14, unlocked ? `START ROUND ${definition.startingRound}` : `CLEAR ROUND ${definition.unlockHighestRound} TO UNLOCK // ${Math.min(highest, definition.unlockHighestRound)} / ${definition.unlockHighestRound}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: cardHeight < 56 ? '10px' : '12px', color: unlocked ? '#8fbac4' : '#a87582', align: 'center' }).setOrigin(0.5));
    });
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
    const next = cycleUnlockedProtocol(current, SaveSystem.getHighestRound(), 1);
    const result = SaveSystem.setPreferredProtocol(next);
    this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? RUN_PROTOCOLS[next].label}`;
    this.scene.restart({ returnScene: this.returnScene });
    return result.ok;
  }

  private openCollection(selectedCardId?: string): void {
    this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.Garage, selectedCardId });
  }

  private closeOverlay(): void {
    this.cosmeticPreviewColorTimer?.remove(false);
    this.cosmeticPreviewColorTimer = null;
    this.cosmeticPreviewColorTargets = [];
    this.tweens.killTweensOf(this.overlayAnimatedTargets);
    this.overlayAnimatedTargets.length = 0;
    this.overlay?.destroy(true);
    this.overlay = null;
  }

  private returnToPrevious(): void {
    this.scene.start(this.returnScene);
  }
}
