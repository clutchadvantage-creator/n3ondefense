import Phaser from 'phaser';
import { SFX_DEFINITIONS, type AudioSfxName } from '../config/audio';
import { ABILITY_ACTIONS, DEFAULT_ABILITY_BINDINGS, RESERVED_ABILITY_BINDINGS, bindingForKeyboardEvent, bindingForMouseButton, bindingLabel, type AbilityAction, type InputBinding } from '../config/controls';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import { pickJsonFile, showConfirmDialog, showInfoModal } from '../utils/localSaveUi';
import { createButton } from '../utils/ui';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { mountFeedbackReportUi, type FeedbackReportHandle } from '../../ui/feedback/FeedbackReportUi';

type OptionsTabId = 'audio' | 'gameplay' | 'interface' | 'profile' | 'system';

interface OptionsTabDefinition {
  id: OptionsTabId;
  label: string;
}

interface OptionsSceneData {
  returnScene?: SceneKeyValue;
  resumeGameplay?: boolean;
}

interface OptionsViewport {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface SliderParts {
  fill: Phaser.GameObjects.Rectangle;
  knob: Phaser.GameObjects.Arc;
  valueText: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
}

interface TabVisual {
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface ScrollInteractiveTarget {
  target: Phaser.GameObjects.GameObject;
  centerY: number;
  halfHeight: number;
}

const OPTIONS_TABS: readonly OptionsTabDefinition[] = [
  { id: 'audio', label: 'AUDIO' },
  { id: 'gameplay', label: 'GAMEPLAY' },
  { id: 'interface', label: 'INTERFACE' },
  { id: 'profile', label: 'PROFILE' },
  { id: 'system', label: 'SYSTEM' }
] as const;

export class OptionsScene extends Phaser.Scene {
  private returnScene: SceneKeyValue = SceneKeys.MainMenu;
  private resumeGameplayOnEsc = false;
  private settingsPersistTimer: Phaser.Time.TimerEvent | null = null;
  private feedbackReportUi: FeedbackReportHandle | null = null;
  private cancelBindingCapture: (() => void) | null = null;
  private activeTab: OptionsTabId = 'audio';
  private readonly tabContainers = new Map<OptionsTabId, Phaser.GameObjects.Container>();
  private readonly tabVisuals = new Map<OptionsTabId, TabVisual>();
  private viewport: OptionsViewport = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  private contentMask: Phaser.Display.Masks.GeometryMask | null = null;
  private contentMaskShape: Phaser.GameObjects.Graphics | null = null;
  private audioContainer: Phaser.GameObjects.Container | null = null;
  private readonly audioInteractiveTargets: ScrollInteractiveTarget[] = [];
  private audioScrollOffset = 0;
  private audioScrollMax = 0;
  private scrollThumb: Phaser.GameObjects.Rectangle | null = null;
  private scrollTrack: Phaser.GameObjects.Rectangle | null = null;
  private scrollLabel: Phaser.GameObjects.Text | null = null;
  private scrollTrackTop = 0;
  private scrollTrackRange = 0;

  private readonly handleOptionsWheel = (
    pointer: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number
  ): void => {
    if (this.activeTab !== 'audio' || pointer.y < this.viewport.top || pointer.y > this.viewport.bottom) return;
    this.scrollAudio(deltaY * 0.75);
  };
  private readonly handleScrollUp = (): void => this.scrollAudio(-110);
  private readonly handleScrollDown = (): void => this.scrollAudio(110);
  private readonly handlePageUp = (): void => this.scrollAudio(-this.viewport.height * 0.72);
  private readonly handlePageDown = (): void => this.scrollAudio(this.viewport.height * 0.72);

  constructor() {
    super(SceneKeys.Options);
  }

  create(data?: OptionsSceneData): void {
    this.returnScene = data?.returnScene ?? SceneKeys.MainMenu;
    this.resumeGameplayOnEsc = data?.resumeGameplay === true;
    this.resetTransientUiState();

    const { width, height } = this.scale;
    const centerX = width * 0.5;
    const safeX = Math.max(18, Math.min(40, width * 0.035));
    const contentWidth = Math.min(width - safeX * 2, 1120);
    const contentTop = height < 650 ? 122 : 132;
    const contentBottom = height - 20;
    this.viewport = {
      left: centerX - contentWidth * 0.5,
      right: centerX + contentWidth * 0.5,
      top: contentTop,
      bottom: contentBottom,
      width: contentWidth,
      height: Math.max(260, contentBottom - contentTop)
    };

    this.feedbackReportUi = mountFeedbackReportUi(getGameUiRoot(), { showLaunchButton: false });
    this.createBackground(width, height, centerX);
    this.createContentViewport();
    this.createTabBar(centerX, contentWidth, height);

    for (const definition of OPTIONS_TABS) {
      const container = this.add.container(0, 0).setDepth(20);
      if (this.contentMask) container.setMask(this.contentMask);
      this.tabContainers.set(definition.id, container);
    }

    const save = SaveSystem.get();
    const audio = this.requireTab('audio');
    this.audioContainer = audio;
    this.createAudioTab(audio, save);
    this.createGameplayTab(this.requireTab('gameplay'));
    this.createInterfaceTab(this.requireTab('interface'));
    this.createProfileTab(this.requireTab('profile'));
    this.createSystemTab(this.requireTab('system'));
    this.selectTab('audio');

    this.input.keyboard?.on('keydown-ESC', this.handleEscReturn, this);
    this.input.keyboard?.on('keydown-UP', this.handleScrollUp);
    this.input.keyboard?.on('keydown-DOWN', this.handleScrollDown);
    this.input.keyboard?.on('keydown-PAGE_UP', this.handlePageUp);
    this.input.keyboard?.on('keydown-PAGE_DOWN', this.handlePageDown);
    this.input.on('wheel', this.handleOptionsWheel);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownOptions, this);
  }

  private resetTransientUiState(): void {
    this.activeTab = 'audio';
    this.tabContainers.clear();
    this.tabVisuals.clear();
    this.audioInteractiveTargets.length = 0;
    this.audioScrollOffset = 0;
    this.audioScrollMax = 0;
    this.scrollThumb = null;
    this.scrollTrack = null;
    this.scrollLabel = null;
    this.contentMask = null;
    this.contentMaskShape = null;
  }

  private createBackground(width: number, height: number, centerX: number): void {
    this.add.rectangle(centerX, height * 0.5, width, height, 0x050811, 1).setDepth(-100);
    const grid = this.add.graphics().setDepth(-90);
    grid.lineStyle(1, 0x123247, 0.18);
    for (let x = 0; x <= width; x += 64) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += 64) grid.lineBetween(0, y, width, y);
    this.add.text(centerX, height < 650 ? 30 : 36, 'OPTIONS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${height < 650 ? 31 : 38}px`, color: '#58efff'
    }).setOrigin(0.5).setDepth(110);
    this.add.text(centerX, height < 650 ? 57 : 68, 'OPERATOR CONFIGURATION // LOCAL PROFILE SETTINGS', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${height < 650 ? 14 : 16}px`, color: '#8cbac8'
    }).setOrigin(0.5).setDepth(110);
  }

  private createContentViewport(): void {
    const { left, top, width, height } = this.viewport;
    this.add.rectangle(left + width * 0.5, top + height * 0.5, width, height, 0x08121e, 0.9)
      .setStrokeStyle(2, 0x39dff4, 0.58).setDepth(2);
    this.add.rectangle(left + width * 0.5, top + 3, width - 8, 2, 0xff5bcf, 0.38).setDepth(3);
    this.contentMaskShape = this.make.graphics({ x: 0, y: 0 });
    this.contentMaskShape.fillStyle(0xffffff, 1).fillRect(left + 3, top + 3, width - 6, height - 6);
    this.contentMask = this.contentMaskShape.createGeometryMask();
  }

  private createTabBar(centerX: number, contentWidth: number, height: number): void {
    const gap = contentWidth < 760 ? 4 : 8;
    const tabWidth = (contentWidth - gap * (OPTIONS_TABS.length - 1)) / OPTIONS_TABS.length;
    const tabHeight = height < 650 ? 35 : 40;
    const y = this.viewport.top - tabHeight * 0.5 - 7;
    const left = centerX - contentWidth * 0.5;
    OPTIONS_TABS.forEach((definition, index) => {
      const x = left + tabWidth * 0.5 + index * (tabWidth + gap);
      const background = this.add.rectangle(x, y, tabWidth, tabHeight, 0x101c2b, 0.96)
        .setStrokeStyle(1, 0x397a8d, 0.72).setInteractive({ useHandCursor: true }).setDepth(120);
      const label = this.add.text(x, y, definition.label, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${contentWidth < 720 ? 12 : 15}px`, color: '#86adba'
      }).setOrigin(0.5).setDepth(121);
      background.on('pointerover', () => {
        AudioManager.get().playSfx('menuHover');
        if (this.activeTab !== definition.id) background.setStrokeStyle(2, 0x5cecff, 0.9);
      });
      background.on('pointerout', () => this.refreshTabVisuals());
      background.on('pointerdown', () => {
        if (this.activeTab === definition.id) return;
        AudioManager.get().playSfx('menu');
        this.selectTab(definition.id);
      });
      this.tabVisuals.set(definition.id, { background, label });
    });
  }

  private createAudioTab(container: Phaser.GameObjects.Container, save: ReturnType<typeof SaveSystem.get>): void {
    const { left, right, top, width } = this.viewport;
    const centerX = left + width * 0.5;
    const innerLeft = left + (width < 760 ? 20 : 30);
    const innerRight = right - (width < 760 ? 30 : 42);
    const innerWidth = innerRight - innerLeft;
    let y = top + 30;

    this.addSectionHeader(container, centerX, y, 'GLOBAL AUDIO', 'PRIMARY MIXER');
    const globalPanelTop = y + 25;
    const globalPanelHeight = 164;
    container.add(this.add.rectangle(centerX, globalPanelTop + globalPanelHeight * 0.5, innerWidth, globalPanelHeight, 0x0b1725, 0.88)
      .setStrokeStyle(1, 0x3a9db2, 0.48));
    const globalLabelX = innerLeft + 22;
    const globalTrackWidth = Phaser.Math.Clamp(innerWidth * 0.42, 180, 390);
    const globalTrackX = innerRight - globalTrackWidth * 0.5 - 54;
    this.createSlider(container, globalLabelX, globalTrackX, globalPanelTop + 34, 'MASTER VOLUME', save.settings.masterVolume, globalTrackWidth, (value) => {
      SaveSystem.setSettings({ masterVolume: value });
      this.scheduleSettingsPersist();
    }, Math.max(130, globalTrackX - globalTrackWidth * 0.5 - globalLabelX - 18));
    this.createSlider(container, globalLabelX, globalTrackX, globalPanelTop + 80, 'MUSIC VOLUME', save.settings.musicVolume, globalTrackWidth, (value) => {
      SaveSystem.setSettings({ musicVolume: value });
      this.scheduleSettingsPersist();
    }, Math.max(130, globalTrackX - globalTrackWidth * 0.5 - globalLabelX - 18));
    this.createSlider(container, globalLabelX, globalTrackX, globalPanelTop + 126, 'SFX VOLUME', save.settings.sfxVolume, globalTrackWidth, (value) => {
      SaveSystem.setSettings({ sfxVolume: value });
      this.scheduleSettingsPersist();
    }, Math.max(130, globalTrackX - globalTrackWidth * 0.5 - globalLabelX - 18));

    y = globalPanelTop + globalPanelHeight + 34;
    this.addSectionHeader(container, centerX, y, 'INDIVIDUAL SOUNDS', `${SFX_DEFINITIONS.length} MIX CHANNELS`);
    const twoColumns = width >= 780;
    const columnGap = twoColumns ? 34 : 0;
    const columnCount = twoColumns ? 2 : 1;
    const columnWidth = (innerWidth - columnGap * (columnCount - 1)) / columnCount;
    const rowCount = Math.ceil(SFX_DEFINITIONS.length / columnCount);
    const rowGap = 43;
    const soundsTop = y + 28;
    const soundsPanelHeight = rowCount * rowGap + 28;
    container.add(this.add.rectangle(centerX, soundsTop + soundsPanelHeight * 0.5, innerWidth, soundsPanelHeight, 0x091522, 0.84)
      .setStrokeStyle(1, 0x315c70, 0.55));

    SFX_DEFINITIONS.forEach((definition, index) => {
      const column = Math.floor(index / rowCount);
      const row = index % rowCount;
      const columnLeft = innerLeft + column * (columnWidth + columnGap);
      const trackWidth = Phaser.Math.Clamp(columnWidth * (twoColumns ? 0.36 : 0.46), 130, 210);
      const trackX = columnLeft + columnWidth - trackWidth * 0.5 - 42;
      const labelX = columnLeft + 15;
      const labelWidth = Math.max(100, trackX - trackWidth * 0.5 - labelX - 12);
      this.createSlider(
        container,
        labelX,
        trackX,
        soundsTop + 25 + row * rowGap,
        definition.label.toUpperCase(),
        save.settings.soundVolumes[definition.key],
        trackWidth,
        (value) => this.updateSoundVolume(definition.key, value),
        labelWidth
      );
    });

    const contentBottom = soundsTop + soundsPanelHeight + 18;
    this.configureAudioScrolling(contentBottom);
  }

  private createGameplayTab(container: Phaser.GameObjects.Container): void {
    const centerX = this.viewport.left + this.viewport.width * 0.5;
    const top = this.viewport.top + 26;
    this.addSectionHeader(container, centerX, top, 'PLAYER INPUT', 'GAMEPLAY CONTROLS');
    const keybindBottom = this.createKeybindPanel(container, centerX, top + 34, this.viewport.width - 48);
    if (keybindBottom + 42 < this.viewport.bottom) {
      container.add(this.add.text(centerX, keybindBottom + 27, 'ADDITIONAL GAMEPLAY SETTINGS COMING ONLINE', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#628796'
      }).setOrigin(0.5));
    }
  }

  private createInterfaceTab(container: Phaser.GameObjects.Container): void {
    const centerX = this.viewport.left + this.viewport.width * 0.5;
    const centerY = this.viewport.top + this.viewport.height * 0.5;
    container.add(this.add.rectangle(centerX, centerY, Math.min(720, this.viewport.width - 64), Math.min(250, this.viewport.height - 64), 0x0b1725, 0.84)
      .setStrokeStyle(1, 0x3a9db2, 0.5));
    container.add(this.add.text(centerX, centerY - 42, 'INTERFACE SYSTEMS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '24px', color: '#69f4ff'
    }).setOrigin(0.5));
    container.add(this.add.text(centerX, centerY + 12, 'ADDITIONAL INTERFACE SETTINGS COMING ONLINE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', color: '#9dbcc7', align: 'center'
    }).setOrigin(0.5));
    container.add(this.add.text(centerX, centerY + 48, 'UI scale, HUD scale, and reticle controls will report here when available.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#617f8d', align: 'center',
      wordWrap: { width: Math.min(620, this.viewport.width - 100), useAdvancedWrap: true }
    }).setOrigin(0.5));
  }

  private createProfileTab(container: Phaser.GameObjects.Container): void {
    const centerX = this.viewport.left + this.viewport.width * 0.5;
    const panelWidth = Math.min(780, this.viewport.width - 52);
    const panelHeight = Math.min(350, this.viewport.height - 44);
    const panelTop = this.viewport.top + 22;
    container.add(this.add.rectangle(centerX, panelTop + panelHeight * 0.5, panelWidth, panelHeight, 0x0b1725, 0.9)
      .setStrokeStyle(1, 0x3a9db2, 0.56));
    container.add(this.add.text(centerX, panelTop + 30, 'LOCAL SAVE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '25px', color: '#69f4ff'
    }).setOrigin(0.5));

    const profile = SaveSystem.getActiveProfileSummary();
    container.add(this.add.text(centerX, panelTop + 67, profile ? `Active Profile: ${profile.name}` : 'No active profile selected.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '21px', color: '#e4f9ff'
    }).setOrigin(0.5));
    const storageMessage = SaveSystem.getStorageMessage();
    if (storageMessage) {
      container.add(this.add.text(centerX, panelTop + 91, storageMessage, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: '#ff9aa8', align: 'center',
        wordWrap: { width: panelWidth - 48, useAdvancedWrap: true }
      }).setOrigin(0.5));
    }

    const buttonWidth = Math.min(250, (panelWidth - 68) * 0.5);
    const buttonGap = 18;
    const leftX = centerX - (buttonWidth + buttonGap) * 0.5;
    const rightX = centerX + (buttonWidth + buttonGap) * 0.5;
    const buttonStartY = panelTop + (storageMessage ? 132 : 112);
    this.addTabButton(container, leftX, buttonStartY, 'Local Save Info', () => this.showLocalSaveInfo(), buttonWidth);
    this.addTabButton(container, rightX, buttonStartY, 'Switch Profile', () => this.scene.start(SceneKeys.LocalProfiles), buttonWidth);
    this.addTabButton(container, leftX, buttonStartY + 52, 'Export Save', () => { void SaveSystem.exportActiveProfile(); }, buttonWidth);
    this.addTabButton(container, rightX, buttonStartY + 52, 'Import Save', () => { void this.importSave(); }, buttonWidth);
    this.addTabButton(container, leftX, buttonStartY + 104, 'Restore Backup', () => this.restoreBackup(), buttonWidth);
    this.addTabButton(container, rightX, buttonStartY + 104, 'Reset Progress', () => this.resetProgress(), buttonWidth);
    container.add(this.add.text(centerX, panelTop + panelHeight - 26, 'Settings and progression are saved to this browser-local profile.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#9fcbe0'
    }).setOrigin(0.5));
  }

  private createSystemTab(container: Phaser.GameObjects.Container): void {
    const centerX = this.viewport.left + this.viewport.width * 0.5;
    const panelWidth = Math.min(680, this.viewport.width - 60);
    const centerY = this.viewport.top + this.viewport.height * 0.5;
    container.add(this.add.rectangle(centerX, centerY, panelWidth, Math.min(330, this.viewport.height - 56), 0x0b1725, 0.9)
      .setStrokeStyle(1, 0x3a9db2, 0.56));
    container.add(this.add.text(centerX, centerY - 112, 'SYSTEM ACTIONS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '24px', color: '#69f4ff'
    }).setOrigin(0.5));
    this.addTabButton(container, centerX, centerY - 56, 'Replay Splash Screen', () => {
      this.scene.launch(SceneKeys.Splash, {
        replay: true,
        returnScene: this.returnScene,
        resumeGameplay: this.resumeGameplayOnEsc,
        returnToOptions: this.returnScene !== SceneKeys.Arena
      });
      this.scene.bringToTop(SceneKeys.Splash);
      this.scene.stop();
    }, 310);
    this.addTabButton(container, centerX, centerY - 4, 'Suggestions / Bug Reports', () => this.feedbackReportUi?.open(), 310);
    this.addTabButton(container, centerX, centerY + 48, 'Back to Main Menu', () => this.scene.start(SceneKeys.MainMenu), 310);
    container.add(this.add.text(centerX, centerY + 104, 'ESC returns to the screen that opened Options.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#718f9c'
    }).setOrigin(0.5));
  }

  private addSectionHeader(container: Phaser.GameObjects.Container, x: number, y: number, title: string, detail: string): void {
    container.add(this.add.text(x, y, title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '21px', color: '#69f4ff'
    }).setOrigin(0.5));
    container.add(this.add.text(x + Math.min(330, this.viewport.width * 0.34), y + 1, detail, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#668a98'
    }).setOrigin(1, 0.5));
  }

  private addTabButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    onClick: () => unknown,
    width: number
  ): Phaser.GameObjects.Container {
    const button = createButton(this, x, y, label, onClick, width);
    container.add(button);
    return button;
  }

  private requireTab(tab: OptionsTabId): Phaser.GameObjects.Container {
    const container = this.tabContainers.get(tab);
    if (!container) throw new Error(`Missing Options tab container: ${tab}`);
    return container;
  }

  private selectTab(tab: OptionsTabId): void {
    if (this.activeTab === 'gameplay' && tab !== 'gameplay') this.cancelBindingCapture?.();
    this.activeTab = tab;
    for (const definition of OPTIONS_TABS) {
      const container = this.requireTab(definition.id);
      const selected = definition.id === tab;
      container.setVisible(selected).setActive(selected);
      this.setContainerInputEnabled(container, selected);
    }
    this.refreshTabVisuals();
    this.updateScrollVisibility();
    if (tab === 'audio') this.applyAudioScroll();
  }

  private refreshTabVisuals(): void {
    for (const definition of OPTIONS_TABS) {
      const visual = this.tabVisuals.get(definition.id);
      if (!visual) continue;
      const selected = definition.id === this.activeTab;
      visual.background.setFillStyle(selected ? 0x133043 : 0x101c2b, selected ? 1 : 0.96)
        .setStrokeStyle(selected ? 2 : 1, selected ? 0x64f2ff : 0x397a8d, selected ? 1 : 0.72);
      visual.label.setColor(selected ? '#efffff' : '#86adba');
    }
  }

  private setContainerInputEnabled(container: Phaser.GameObjects.Container, enabled: boolean): void {
    const visit = (object: Phaser.GameObjects.GameObject): void => {
      if (object.input) object.input.enabled = enabled;
      if (object instanceof Phaser.GameObjects.Container) {
        for (const child of object.list) visit(child);
      }
    };
    visit(container);
  }

  private configureAudioScrolling(contentBottom: number): void {
    const contentHeight = contentBottom - this.viewport.top;
    this.audioScrollMax = Math.max(0, contentHeight - this.viewport.height + 8);
    if (this.audioScrollMax <= 0) return;
    const trackHeight = Math.max(120, this.viewport.height - 28);
    const thumbHeight = Math.max(46, trackHeight * (this.viewport.height / contentHeight));
    this.scrollTrackTop = this.viewport.top + 14;
    this.scrollTrackRange = trackHeight - thumbHeight;
    const x = this.viewport.right - 12;
    this.scrollTrack = this.add.rectangle(x, this.scrollTrackTop + trackHeight * 0.5, 5, trackHeight, 0x18324b, 0.84)
      .setStrokeStyle(1, 0x4baccb, 0.65).setDepth(130);
    this.scrollThumb = this.add.rectangle(x, this.scrollTrackTop + thumbHeight * 0.5, 8, thumbHeight, 0x62efff, 0.94)
      .setStrokeStyle(1, 0xffffff, 0.75).setDepth(131);
    this.scrollLabel = this.add.text(x - 10, this.viewport.bottom - 10, 'SCROLL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: '#78cfe7'
    }).setOrigin(1, 0.5).setDepth(131);
  }

  private scrollAudio(delta: number): void {
    if (this.activeTab !== 'audio' || this.audioScrollMax <= 0 || this.cancelBindingCapture) return;
    this.audioScrollOffset = Phaser.Math.Clamp(this.audioScrollOffset + delta, 0, this.audioScrollMax);
    this.applyAudioScroll();
  }

  private applyAudioScroll(): void {
    if (!this.audioContainer) return;
    this.audioContainer.y = -this.audioScrollOffset;
    if (this.scrollThumb) {
      const ratio = this.audioScrollMax > 0 ? this.audioScrollOffset / this.audioScrollMax : 0;
      this.scrollThumb.y = this.scrollTrackTop + this.scrollThumb.height * 0.5 + this.scrollTrackRange * ratio;
    }
    for (const entry of this.audioInteractiveTargets) {
      if (!entry.target.input) continue;
      const visibleY = entry.centerY - this.audioScrollOffset;
      entry.target.input.enabled = this.activeTab === 'audio'
        && visibleY - entry.halfHeight >= this.viewport.top + 3
        && visibleY + entry.halfHeight <= this.viewport.bottom - 3;
    }
  }

  private updateScrollVisibility(): void {
    const visible = this.activeTab === 'audio' && this.audioScrollMax > 0;
    this.scrollTrack?.setVisible(visible);
    this.scrollThumb?.setVisible(visible);
    this.scrollLabel?.setVisible(visible);
  }

  private createKeybindPanel(container: Phaser.GameObjects.Container, centerX: number, topY: number, contentWidth: number): number {
    const panelWidth = Math.min(contentWidth, 900);
    const panelHeight = Math.min(260, this.viewport.height - 82);
    const panelCenterY = topY + panelHeight * 0.5;
    container.add(this.add.rectangle(centerX, panelCenterY, panelWidth, panelHeight, 0x0b1422, 0.92)
      .setStrokeStyle(2, 0x53dfff, 0.72));
    container.add(this.add.text(centerX, topY + 25, 'CUSTOM ABILITY KEYBINDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '21px', color: '#69f4ff'
    }).setOrigin(0.5));

    const status = this.add.text(centerX, topY + 59, 'Select a binding, then press a key or mouse button. WASD, E, Esc, F8, and primary fire are reserved.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#a9cfe0', align: 'center', lineSpacing: 3,
      wordWrap: { width: panelWidth - 64, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
    container.add(status);
    const bindings = { ...SaveSystem.get().settings.abilityBindings };
    const valueLabels = new Map<AbilityAction, Phaser.GameObjects.Text>();

    ABILITY_ACTIONS.forEach(({ action, label }, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = centerX + (column === 0 ? -panelWidth * 0.25 : panelWidth * 0.25);
      const y = topY + 126 + row * 40;
      const actionLabel = this.add.text(x - 104, y, label.toUpperCase(), {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#dff8ff'
      }).setOrigin(0, 0.5);
      const background = this.add.rectangle(x + 62, y, 164, 29, 0x14223a, 0.98).setStrokeStyle(1, 0xff7adf, 0.8);
      const value = this.add.text(x + 62, y, bindingLabel(bindings[action]), {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#fff0ba'
      }).setOrigin(0.5);
      valueLabels.set(action, value);
      const hit = this.add.rectangle(x + 62, y, 164, 31, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        background.setStrokeStyle(2, 0x69f4ff, 1);
        AudioManager.get().playSfx('menuHover');
      });
      hit.on('pointerout', () => background.setStrokeStyle(1, 0xff7adf, 0.8));
      hit.on('pointerdown', () => {
        AudioManager.get().playSfx('menu');
        this.beginBindingCapture(action, bindings, valueLabels, status);
      });
      container.add([actionLabel, background, value, hit]);
    });

    const reset = this.add.text(centerX + panelWidth * 0.25 + 62, topY + panelHeight - 34, 'RESET DEFAULTS', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#ffcf91', backgroundColor: '#172238', padding: { x: 18, y: 5 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    reset.on('pointerover', () => AudioManager.get().playSfx('menuHover'));
    reset.on('pointerdown', () => {
      AudioManager.get().playSfx('menu');
      this.cancelBindingCapture?.();
      Object.assign(bindings, DEFAULT_ABILITY_BINDINGS);
      for (const { action } of ABILITY_ACTIONS) valueLabels.get(action)?.setText(bindingLabel(bindings[action]));
      SaveSystem.setSettings({ abilityBindings: { ...bindings } });
      SaveSystem.persist();
      status.setText('Default ability bindings restored.').setColor('#8fffc4');
    });
    container.add(reset);
    return topY + panelHeight;
  }

  private beginBindingCapture(
    action: AbilityAction,
    bindings: Record<AbilityAction, InputBinding>,
    labels: Map<AbilityAction, Phaser.GameObjects.Text>,
    status: Phaser.GameObjects.Text
  ): void {
    this.cancelBindingCapture?.();
    status.setText(`Listening for ${action.toUpperCase()} - press a key or mouse button. Esc cancels.`).setColor('#fff0a8');
    labels.get(action)?.setText('PRESS INPUT...');

    const finish = (binding: InputBinding | null, message?: string): void => {
      cleanup();
      if (!binding) {
        labels.get(action)?.setText(bindingLabel(bindings[action]));
        status.setText(message ?? 'Binding cancelled.').setColor('#a9cfe0');
        return;
      }
      const conflict = ABILITY_ACTIONS.find((entry) => entry.action !== action && bindings[entry.action] === binding);
      if (conflict) {
        labels.get(action)?.setText(bindingLabel(bindings[action]));
        status.setText(`${bindingLabel(binding)} is already assigned to ${conflict.label}.`).setColor('#ff9aaa');
        return;
      }
      bindings[action] = binding;
      labels.get(action)?.setText(bindingLabel(binding));
      SaveSystem.setSettings({ abilityBindings: { ...bindings } });
      SaveSystem.persist();
      status.setText(`${action.toUpperCase()} bound to ${bindingLabel(binding)}.`).setColor('#8fffc4');
    };
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') return finish(null);
      const binding = bindingForKeyboardEvent(event);
      if (RESERVED_ABILITY_BINDINGS.has(binding)) return finish(null, `${event.code.replace('Key', '')} is reserved for core controls.`);
      finish(binding);
    };
    const onMouse = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.button === 2) {
        window.addEventListener('contextmenu', (contextEvent) => {
          contextEvent.preventDefault();
          contextEvent.stopImmediatePropagation();
        }, { capture: true, once: true });
      }
      const binding = bindingForMouseButton(event.button);
      if (binding === 'Mouse:0') return finish(null, 'Primary mouse is reserved for firing.');
      finish(binding, binding ? undefined : 'That mouse button is not supported.');
    };
    const cleanup = (): void => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      this.cancelBindingCapture = null;
    };
    const cancel = (): void => finish(null);
    this.cancelBindingCapture = cancel;
    window.setTimeout(() => {
      if (this.cancelBindingCapture !== cancel) return;
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('mousedown', onMouse, true);
    }, 0);
  }

  private updateSoundVolume(key: AudioSfxName, value: number): void {
    const current = SaveSystem.get().settings.soundVolumes;
    SaveSystem.setSettings({ soundVolumes: { ...current, [key]: value } });
    this.scheduleSettingsPersist();
  }

  private scheduleSettingsPersist(): void {
    this.settingsPersistTimer?.remove();
    this.settingsPersistTimer = this.time.delayedCall(140, () => {
      SaveSystem.persist();
      this.settingsPersistTimer = null;
    });
  }

  private showLocalSaveInfo(): void {
    showInfoModal(
      this,
      'LOCAL SAVE INFORMATION',
      'Your profile and progress are stored only in this browser. Your save will not automatically appear on another device or browser. Clearing site data, private browsing, browser cleanup tools, or uninstalling the browser may remove your save. Use Export Save to create a backup. You can import that backup into another browser or device.',
      [
        { label: 'Export Active Profile', onClick: () => { void SaveSystem.exportActiveProfile(); }, width: 240 },
        { label: 'Close', onClick: () => undefined, width: 160 }
      ]
    );
  }

  private async importSave(): Promise<void> {
    const raw = await pickJsonFile();
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const preview = SaveSystem.previewImport(parsed);
    if (!preview.ok || !preview.preview) return;
    showInfoModal(
      this,
      'IMPORT SAVE PREVIEW',
      `Profile: ${preview.preview.save.profile.name}\nCredits: ${preview.preview.save.wallet.credits}\nCore Tokens: ${preview.preview.save.wallet.coreTokens}\nHighest Round: ${preview.preview.save.progress.highestRound}`,
      [
        { label: 'Import As New Profile', onClick: () => { void SaveSystem.importProfile(parsed, 'new'); }, width: 240 },
        { label: 'Replace Active Profile', onClick: () => { const active = SaveSystem.getActiveProfileSummary(); if (active) void SaveSystem.importProfile(parsed, 'replace', active.id); }, width: 250 },
        { label: 'Close', onClick: () => undefined, width: 160 }
      ]
    );
  }

  private restoreBackup(): void {
    const active = SaveSystem.getActiveProfileSummary();
    if (active) SaveSystem.restoreBackup(active.id);
  }

  private resetProgress(): void {
    const active = SaveSystem.getActiveProfileSummary();
    if (!active) return;
    showConfirmDialog(this, 'Reset Progress?', `Reset "${active.name}" to default wallet, upgrades, cosmetics, and progression while preserving the profile name?`, 'Reset Progress', () => {
      void SaveSystem.resetProgress(active.id);
    });
  }

  private handleEscReturn(): void {
    if (this.returnScene === SceneKeys.Arena) {
      this.scene.resume(SceneKeys.Arena);
      if (this.resumeGameplayOnEsc) this.scene.get(SceneKeys.Arena).events.emit('resume-from-options');
      this.scene.stop();
      return;
    }
    this.scene.start(this.returnScene);
  }

  private createSlider(
    container: Phaser.GameObjects.Container,
    labelX: number,
    trackX: number,
    y: number,
    label: string,
    initial: number,
    trackWidth: number,
    onChange: (value: number) => void,
    labelWidth: number
  ): SliderParts {
    const minX = trackX - trackWidth * 0.5;
    const maxX = trackX + trackWidth * 0.5;
    const labelText = this.add.text(labelX, y, label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#dbf5ff',
      wordWrap: { width: labelWidth, useAdvancedWrap: true }
    }).setOrigin(0, 0.5).setMaxLines(2);
    const track = this.add.rectangle(trackX, y, trackWidth, 10, 0x1e2b45, 1).setStrokeStyle(1, 0x53dfff, 0.9);
    const fill = this.add.rectangle(minX, y, trackWidth * initial, 8, 0x5be7ff, 1).setOrigin(0, 0.5);
    const knob = this.add.circle(minX + trackWidth * initial, y, 10, 0xff7adf, 1).setStrokeStyle(1, 0xffffff, 0.9);
    const valueText = this.add.text(maxX + 32, y, `${Math.round(initial * 100)}%`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#ffeeb8'
    }).setOrigin(0.5);
    const hit = this.add.rectangle(trackX, y, trackWidth + 24, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true });

    const updateFromPointer = (worldX: number): void => {
      const clampedX = Phaser.Math.Clamp(worldX, minX, maxX);
      const value = Phaser.Math.Clamp((clampedX - minX) / trackWidth, 0, 1);
      fill.width = trackWidth * value;
      knob.x = clampedX;
      valueText.setText(`${Math.round(value * 100)}%`);
      onChange(value);
      AudioManager.get().refreshMix();
    };
    hit.on('pointerover', () => AudioManager.get().playSfx('menuHover'));
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => updateFromPointer(pointer.worldX));
    hit.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) updateFromPointer(pointer.worldX);
    });
    container.add([labelText, track, fill, knob, valueText, hit]);
    this.audioInteractiveTargets.push({ target: hit, centerY: y, halfHeight: 17 });
    return { fill, knob, valueText, hit };
  }

  private shutdownOptions(): void {
    this.settingsPersistTimer?.remove();
    this.settingsPersistTimer = null;
    this.feedbackReportUi?.destroy();
    this.feedbackReportUi = null;
    this.cancelBindingCapture?.();
    this.cancelBindingCapture = null;
    SaveSystem.persist();
    this.input.keyboard?.off('keydown-ESC', this.handleEscReturn, this);
    this.input.keyboard?.off('keydown-UP', this.handleScrollUp);
    this.input.keyboard?.off('keydown-DOWN', this.handleScrollDown);
    this.input.keyboard?.off('keydown-PAGE_UP', this.handlePageUp);
    this.input.keyboard?.off('keydown-PAGE_DOWN', this.handlePageDown);
    this.input.off('wheel', this.handleOptionsWheel);
    this.contentMask?.destroy();
    this.contentMask = null;
    this.contentMaskShape?.destroy();
    this.contentMaskShape = null;
    this.audioInteractiveTargets.length = 0;
    this.tabContainers.clear();
    this.tabVisuals.clear();
  }
}
