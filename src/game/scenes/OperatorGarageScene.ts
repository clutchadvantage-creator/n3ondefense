import Phaser from 'phaser';
import { COSMETICS, getCosmeticDisplayColor, getCosmeticTextureKey } from '../../data/cosmetics.ts';
import { createCosmeticPreview } from '../cosmetics/CosmeticPreview.ts';
import { MOD_FOCUS_CATEGORIES, MOD_FOCUS_LABELS, RUN_CONTRACT_IDS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { getRunSetupCost } from '../economy/EconomyService.ts';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys.ts';
import { calculateGarageLayout, type GarageRect } from '../garage/garageLayout.ts';
import { getGarageDockModels, getModLibraryEntries, getModLibraryProgress } from '../garage/GarageState.ts';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_RARITY_COLORS, createModCardView } from '../mods/ModCardView.ts';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol } from '../mods/modBalance.ts';
import type { ModCardInstance, ModCategory, ModDefinition, ModRarity, RunProtocolId } from '../mods/types.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import type { CosmeticOption } from '../types.ts';
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
    this.createGarageRoom(width, height);

    createButton(this, layout.safe + 72, 34, 'BACK', () => this.returnToPrevious(), 132).setDepth(80);
    this.add.text(width / 2, 18, 'OPERATOR GARAGE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 24 : 31}px`, color: '#67f7ff', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setDepth(70);
    this.add.text(width / 2, 50, 'LOADOUT WORKSTATION // NEXT DEPLOYMENT', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 13 : 16}px`, color: '#ff9bd9', letterSpacing: 1
    }).setOrigin(0.5, 0).setDepth(70);

    this.createConfigurationTerminal(layout.configTerminal, layout.compact);
    this.createWalletTerminal(layout.walletTerminal, layout.compact);
    this.createOperatorPreview(layout.operatorPreview, layout.compact);
    this.createModDocks(layout.cardWidth, layout.cardHeight, layout.dockCenters, layout.compact);
    this.createStations(layout.stationCenters, layout.stationWidth);

    if (this.status) {
      this.add.text(width / 2, height - layout.safe - 52, this.status, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontStyle: 'bold', color: this.status.startsWith('BLOCKED') ? '#ff94aa' : '#8effc3', align: 'center'
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

  private createGarageRoom(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x03070c, 1);
    this.add.grid(width / 2, height * 0.43, width, height * 0.76, 46, 46, 0x07111b, 0.15, 0x1c4453, 0.12);
    const room = this.add.graphics();
    room.fillStyle(0x07111a, 0.98).fillRect(0, height * 0.72, width, height * 0.28);
    room.lineStyle(2, 0x174452, 0.48);
    const vanishingX = width / 2;
    for (let x = -width; x <= width * 2; x += Math.max(70, width / 12)) room.lineBetween(x, height, vanishingX, height * 0.72);
    for (let y = height * 0.74; y < height; y += Math.max(24, height * 0.045)) room.lineBetween(0, y, width, y);
    room.lineStyle(6, 0x0e2631, 0.9).lineBetween(0, 66, width, 66);
    room.lineStyle(2, 0x42eafb, 0.35).lineBetween(0, 69, width, 69);
    room.lineStyle(8, 0x111a25, 1);
    room.lineBetween(width * 0.08, 70, width * 0.08, height * 0.69);
    room.lineBetween(width * 0.92, 70, width * 0.92, height * 0.69);
    room.lineStyle(3, 0xff4ac6, 0.26);
    room.beginPath(); room.moveTo(width * 0.07, 72); room.lineTo(width * 0.16, height * 0.22); room.lineTo(width * 0.13, height * 0.5); room.strokePath();
    room.lineStyle(3, 0x4bf5ff, 0.22);
    room.beginPath(); room.moveTo(width * 0.93, 72); room.lineTo(width * 0.84, height * 0.24); room.lineTo(width * 0.88, height * 0.51); room.strokePath();

    const ceilingLight = this.add.rectangle(width / 2, 73, Math.min(420, width * 0.42), 5, 0x56f2ff, 0.65).setDepth(2);
    this.tweens.add({ targets: ceilingLight, alpha: { from: 0.32, to: 0.85 }, duration: 2700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const fan = this.add.container(width * 0.86, height * 0.16).setDepth(2);
    fan.add(this.add.circle(0, 0, 29, 0x07121b, 0.85).setStrokeStyle(2, 0x2d7582, 0.42));
    const blades = this.add.graphics();
    blades.fillStyle(0x2e6874, 0.34);
    for (let index = 0; index < 4; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 90);
      const rotate = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(
        x * Math.cos(angle) - y * Math.sin(angle),
        x * Math.sin(angle) + y * Math.cos(angle)
      );
      const a = rotate(-4, -4);
      const b = rotate(5, -25);
      const c = rotate(8, -5);
      blades.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }
    fan.add(blades);
    this.tweens.add({ targets: blades, angle: 360, duration: 5400, repeat: -1, ease: 'Linear' });
    const scan = this.add.rectangle(width / 2, 74, width, 2, 0x67f7ff, 0.08).setDepth(5);
    this.tweens.add({ targets: scan, y: height * 0.7, duration: 4100, repeat: -1, ease: 'Linear' });
  }

  private terminalFrame(rect: GarageRect, title: string, color = 0x55efff): Phaser.GameObjects.Container {
    const root = this.add.container(rect.x, rect.y).setDepth(40);
    const roomy = rect.height >= 180;
    const headerHeight = roomy ? 35 : 29;
    const panel = this.add.rectangle(0, 0, rect.width, rect.height, 0x07131d, 0.9).setOrigin(0).setStrokeStyle(2, color, 0.58);
    const header = this.add.rectangle(0, 0, rect.width, headerHeight, color, 0.1).setOrigin(0).setStrokeStyle(1, color, 0.35);
    const label = this.add.text(13, roomy ? 8 : 7, title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: roomy ? '15px' : '12px', color: Phaser.Display.Color.IntegerToColor(color).rgba
    }).setOrigin(0);
    const led = this.add.circle(rect.width - 14, headerHeight / 2, roomy ? 4 : 3, 0x68ffac, 0.9);
    root.add([panel, header, label, led]);
    this.tweens.add({ targets: led, alpha: { from: 0.35, to: 1 }, duration: 1100, yoyo: true, repeat: -1 });
    return root;
  }

  private createConfigurationTerminal(rect: GarageRect, compact: boolean): void {
    const root = this.terminalFrame(rect, 'DEPLOYMENT CONFIGURATION');
    const roomy = !compact && rect.height >= 180;
    const highestRound = SaveSystem.getHighestRound();
    const requested = SaveSystem.getPreferredProtocol();
    const protocol = highestRound >= RUN_PROTOCOLS[requested].unlockHighestRound ? requested : 'normal';
    const setup = SaveSystem.getNextRunSetupSelection();
    const rows = [
      { label: 'PROTOCOL', value: RUN_PROTOCOLS[protocol].label, action: () => this.cycleProtocol(protocol) },
      { label: 'CONTRACT', value: setup.contract ? RUN_CONTRACTS[setup.contract].label : 'NO CONTRACT ACTIVE', action: () => this.cycleContract() },
      { label: 'SIGNAL', value: setup.modFocus ? MOD_FOCUS_LABELS[setup.modFocus] : 'NO SIGNAL ACTIVE', action: () => this.cycleSignal() }
    ];
    const startY = roomy ? 43 : 33;
    const rowGap = roomy ? 43 : 27;
    rows.forEach((row, index) => {
      const y = startY + index * rowGap;
      const hit = this.add.rectangle(7, y - 1, rect.width - 14, rowGap - 4, 0x102331, 0.5).setOrigin(0).setInteractive({ useHandCursor: true });
      const label = this.add.text(15, y + (roomy ? 7 : 5), row.label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: roomy ? '14px' : '11px', color: '#78adbf'
      }).setOrigin(0);
      const value = this.add.text(rect.width - 15, y + (roomy ? 4 : 3), row.value, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: roomy ? '17px' : '12px', fontStyle: 'bold', color: '#d6fbff'
      }).setOrigin(1, 0).setMaxLines(1);
      hit.on('pointerover', () => hit.setFillStyle(0x17374a, 0.75));
      hit.on('pointerout', () => hit.setFillStyle(0x102331, 0.5));
      hit.on('pointerdown', row.action);
      root.add([hit, label, value]);
    });
    if (roomy) {
      const cost = getRunSetupCost(setup);
      root.add(this.add.text(rect.width / 2, rect.height - 19, cost > 0 ? `NEXT RUN FEE // ${cost.toLocaleString()} CREDITS` : 'NEXT RUN FEE // FREE', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontStyle: 'bold', color: cost > 0 ? '#ffd077' : '#7fffc2'
      }).setOrigin(0.5));
    }
  }

  private createWalletTerminal(rect: GarageRect, compact: boolean): void {
    const root = this.terminalFrame(rect, 'DIGITAL WALLET', 0xff5bcf);
    const roomy = !compact && rect.height >= 180;
    const save = SaveSystem.get();
    const plasma = SaveSystem.getModCollection().plasmaChips;
    const values = [
      ['CREDITS', save.credits.toLocaleString(), '#7fffe5'],
      ['CORE TOKENS', save.coreTokens.toLocaleString(), '#ffd37b'],
      ['PLASMA CHIPS', plasma.toLocaleString(), '#db8fff']
    ] as const;
    values.forEach(([label, value, color], index) => {
      const y = (roomy ? 48 : 37) + index * (roomy ? 43 : 27);
      root.add(this.add.text(15, y, label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: roomy ? '15px' : '11px', color: '#7c9dad'
      }).setOrigin(0));
      root.add(this.add.text(rect.width - 15, y - 4, value, {
        fontFamily: 'Orbitron, sans-serif', fontSize: roomy ? '21px' : '14px', color
      }).setOrigin(1, 0));
    });
    if (roomy) root.add(this.add.text(rect.width / 2, rect.height - 18, `HIGHEST ROUND // ${SaveSystem.getHighestRound()}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#9bc4d3'
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
    const liftY = large ? 58 : compact ? 35 : 45;
    const lift = this.add.ellipse(0, liftY, large ? 198 : compact ? 120 : 154, large ? 38 : compact ? 24 : 31, 0x142a35, 0.82).setStrokeStyle(2, 0x58efff, 0.62);
    const glow = this.add.ellipse(0, liftY - (large ? 9 : 7), large ? 154 : compact ? 92 : 118, large ? 23 : compact ? 14 : 18, 0x5cf6ff, 0.2);
    const ringY = large ? -11 : -5;
    const ring = this.add.circle(0, ringY, large ? 60 : compact ? 38 : 49, 0x08131c, 0.44).setStrokeStyle(2, 0xff5bcf, 0.42);
    const shapeId = SaveSystem.getEquippedCosmeticId('playerShape') ?? 'player-circle';
    const texture = this.textures.exists(shapeId) ? shapeId : 'player-circle';
    const operative = this.add.image(0, ringY, texture).setScale(large ? 2.75 : compact ? 1.72 : 2.2);
    const tint = SaveSystem.getCosmeticColor('playerColor', this.time.now);
    operative.setTint(tint);
    const shape = COSMETICS.find((item) => item.id === shapeId)?.label ?? 'Operative';
    const caption = this.add.text(0, large ? 82 : compact ? 43 : 64, shape.toUpperCase(), {
      fontFamily: 'Rajdhani, sans-serif', fontSize: large ? '15px' : compact ? '11px' : '13px', fontStyle: 'bold', color: '#c9f3ff'
    }).setOrigin(0.5);
    root.add([lift, glow, ring, operative, caption]);
    this.operatorPreviewRoot = root;
    this.tweens.add({ targets: operative, y: { from: ringY - 4, to: ringY + 3 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: ring, angle: 360, alpha: { from: 0.28, to: 0.62 }, duration: 4800, repeat: -1, ease: 'Linear' });
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

  private createModDocks(cardWidth: number, cardHeight: number, centers: Array<{ x: number; y: number }>, compact: boolean): void {
    const mods = SaveSystem.getModCollection();
    const docks = getGarageDockModels(mods);
    docks.forEach((dock, index) => {
      const center = centers[index];
      const definition = dock.card ? MOD_BY_ID.get(dock.card.modId) : undefined;
      const color = definition ? MOD_RARITY_COLORS[definition.rarity] : 0x3e8999;
      const backing = this.add.rectangle(center.x, center.y, cardWidth + 12, cardHeight + 12, 0x06111a, 0.94).setStrokeStyle(2, color, dock.empty ? 0.42 : 0.8).setDepth(24);
      this.add.text(center.x, center.y - cardHeight / 2 - (compact ? 14 : 18), dock.label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 9 : 11}px`, fontStyle: 'bold', color: definition ? Phaser.Display.Color.IntegerToColor(color).rgba : '#79a9b6', align: 'center'
      }).setOrigin(0.5).setDepth(27).setWordWrapWidth(cardWidth + 18, true).setMaxLines(2);
      if (dock.card) {
        const view = createModCardView(this, center.x, center.y, dock.card, dock.card.upgradeLevel, { width: cardWidth, height: cardHeight, compact: true, equipped: true });
        view.setDepth(26).on('pointerdown', () => this.openCollection(dock.card?.instanceId));
      } else {
        const emptyHit = this.add.rectangle(center.x, center.y, cardWidth, cardHeight, 0x0a1923, 0.78).setStrokeStyle(1, 0x4bd7e9, 0.25).setInteractive({ useHandCursor: true }).setDepth(26);
        this.add.text(center.x, center.y - 13, '+', { fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 25 : 34}px`, color: '#376979' }).setOrigin(0.5).setDepth(27);
        this.add.text(center.x, center.y + 22, 'AWAITING\nMODULE', { fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 10 : 13}px`, color: '#638795', align: 'center' }).setOrigin(0.5).setDepth(27);
        emptyHit.on('pointerover', () => emptyHit.setStrokeStyle(2, 0x62efff, 0.72));
        emptyHit.on('pointerout', () => emptyHit.setStrokeStyle(1, 0x4bd7e9, 0.25));
        emptyHit.on('pointerdown', () => this.openCollection());
      }
      const actionY = center.y + cardHeight / 2 + 31;
      createButton(this, center.x, actionY, dock.card ? 'UNEQUIP' : 'BROWSE', () => {
        if (dock.card) {
          SaveSystem.unequipMod(dock.slot);
          this.audio.playSfx('menu');
          this.status = `SUCCESS // ${dock.label.replace('SLOT ', '').replace(' // ', ' ')} CLEARED`;
          this.scene.restart({ returnScene: this.returnScene });
        } else this.openCollection();
      }, cardWidth).setDepth(28);
      this.tweens.add({ targets: backing, alpha: { from: 0.7, to: 1 }, duration: 1800 + index * 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  }

  private createStations(centers: Array<{ x: number; y: number }>, width: number): void {
    const stations: Array<{ label: string; action: () => void }> = [
      { label: 'GEAR LOCKER', action: () => this.showCosmetics() },
      { label: 'OVERDRIVE', action: () => this.showOverdrive() },
      { label: 'MOD LIBRARY', action: () => this.showLibrary() },
      { label: 'MOD COLLECTION', action: () => this.openCollection() },
      { label: 'CONFIG PRESETS', action: () => this.showPresets() }
    ];
    stations.forEach((station, index) => {
      const button = createButton(this, centers[index].x, centers[index].y, station.label, () => {
        this.audio.playSfx('menu');
        station.action();
      }, width).setDepth(80);
      const led = this.add.circle(centers[index].x - width / 2 + 9, centers[index].y, 2, index % 2 ? 0xff5bcf : 0x62f4ff, 0.9).setDepth(82);
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
      view.setDepth(2002).setAlpha(entry.owned ? 1 : 0.48).on('pointerdown', () => { this.librarySelectedId = entry.definition.id; this.showLibrary(); });
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
      if (unlocked) panel.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const result = SaveSystem.setPreferredProtocol(id);
        this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? `${definition.label} SELECTED`}`;
        this.audio.playSfx('menu');
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
        this.audio.playSfx('menu');
        this.showPresets();
      }, panelWidth - 22));
      const load = createButton(this, x, y + panelHeight / 2 - 28, 'LOAD CONFIG', () => {
        const result = SaveSystem.loadGaragePreset(preset.id);
        this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? ''}`;
        this.audio.playSfx('menu');
        this.scene.restart({ returnScene: this.returnScene });
      }, panelWidth - 22);
      if (!preset.saved) disableButton(load);
      root.add(load);
    });
  }

  private cycleProtocol(current: RunProtocolId): void {
    const next = cycleUnlockedProtocol(current, SaveSystem.getHighestRound(), 1);
    const result = SaveSystem.setPreferredProtocol(next);
    this.status = `${result.ok ? 'SUCCESS' : 'BLOCKED'} // ${result.message ?? RUN_PROTOCOLS[next].label}`;
    this.audio.playSfx('menu');
    this.scene.restart({ returnScene: this.returnScene });
  }

  private cycleContract(): void {
    const setup = SaveSystem.getNextRunSetupSelection();
    const current = setup.contract ? RUN_CONTRACT_IDS.indexOf(setup.contract) : -1;
    SaveSystem.setNextRunSetupSelection({ ...setup, contract: current >= RUN_CONTRACT_IDS.length - 1 ? null : RUN_CONTRACT_IDS[current + 1] });
    this.audio.playSfx('menu');
    this.scene.restart({ returnScene: this.returnScene });
  }

  private cycleSignal(): void {
    const setup = SaveSystem.getNextRunSetupSelection();
    const current = setup.modFocus ? MOD_FOCUS_CATEGORIES.indexOf(setup.modFocus) : -1;
    SaveSystem.setNextRunSetupSelection({ ...setup, modFocus: current >= MOD_FOCUS_CATEGORIES.length - 1 ? null : MOD_FOCUS_CATEGORIES[current + 1] });
    this.audio.playSfx('menu');
    this.scene.restart({ returnScene: this.returnScene });
  }

  private openCollection(selectedCardId?: string): void {
    this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.Garage, selectedCardId });
  }

  private closeOverlay(): void {
    this.cosmeticPreviewColorTimer?.remove(false);
    this.cosmeticPreviewColorTimer = null;
    this.cosmeticPreviewColorTargets = [];
    this.overlay?.destroy(true);
    this.overlay = null;
  }

  private returnToPrevious(): void {
    this.scene.start(this.returnScene);
  }
}
