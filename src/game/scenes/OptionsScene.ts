import Phaser from 'phaser';
import { SFX_DEFINITIONS, type AudioSfxName } from '../config/audio';
import { ABILITY_ACTIONS, DEFAULT_ABILITY_BINDINGS, RESERVED_ABILITY_BINDINGS, bindingForKeyboardEvent, bindingForMouseButton, bindingLabel, type AbilityAction, type InputBinding } from '../config/controls';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import { pickJsonFile, showConfirmDialog, showInfoModal } from '../utils/localSaveUi';
import { createButton, playButtonJiggle } from '../utils/ui';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { mountFeedbackReportUi, type FeedbackReportHandle } from '../../ui/feedback/FeedbackReportUi';
import {
  DEFAULT_AIM_SETTINGS,
  DEFAULT_HUD_SETTINGS,
  HUD_ANIMATION_LEVELS,
  HUD_GLOW_LEVELS,
  RETICLE_COLOR_IDS,
  RETICLE_COLORS,
  RETICLE_STYLES,
  glowMultiplier,
  normalizeAimSettings,
  normalizeHudSettings,
  type AimSettings,
  type HudSettings,
  type ReticleColor
} from '../config/interfaceSettings';
import { drawReticle } from '../ui/ReticleRenderer';
import { drawHudAbilityIcon, drawHudResourceIcon } from '../systems/Hud';
import { TUTORIAL_REPLAY_GROUPS } from '../tutorial/TutorialRegistry.ts';
import { requestTutorialReplay, resetTutorialSequence, skipTutorialSequence } from '../tutorial/TutorialProgress.ts';
import { DEFAULT_CONTROLLER_SETTINGS, normalizeControllerSettings } from '../config/controllerSettings.ts';
import { configureSceneUiNavigation, registerUiFocusable } from '../input/UiNavigationController.ts';

type OptionsTabId = 'audio' | 'gameplay' | 'interface' | 'profile' | 'system';

interface OptionsTabDefinition {
  id: OptionsTabId;
  label: string;
}

interface OptionsSceneData {
  returnScene?: SceneKeyValue;
  resumeGameplay?: boolean;
  resumePausedScene?: boolean;
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
  setValue?: (value: number) => void;
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

interface TabScrollState {
  container: Phaser.GameObjects.Container;
  targets: ScrollInteractiveTarget[];
  offset: number;
  max: number;
  contentHeight: number;
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
  private resumePausedSceneOnEsc = false;
  private settingsPersistTimer: Phaser.Time.TimerEvent | null = null;
  private feedbackReportUi: FeedbackReportHandle | null = null;
  private cancelBindingCapture: (() => void) | null = null;
  private activeTab: OptionsTabId = 'audio';
  private readonly tabContainers = new Map<OptionsTabId, Phaser.GameObjects.Container>();
  private readonly tabVisuals = new Map<OptionsTabId, TabVisual>();
  private viewport: OptionsViewport = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  private contentMask: Phaser.Display.Masks.GeometryMask | null = null;
  private contentMaskShape: Phaser.GameObjects.Graphics | null = null;
  private readonly scrollStates = new Map<OptionsTabId, TabScrollState>();
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
    if (pointer.y < this.viewport.top || pointer.y > this.viewport.bottom) return;
    this.scrollActiveTab(deltaY * 0.75);
  };
  private readonly handleScrollUp = (): void => this.scrollActiveTab(-110);
  private readonly handleScrollDown = (): void => this.scrollActiveTab(110);
  private readonly handlePageUp = (): void => this.scrollActiveTab(-this.viewport.height * 0.72);
  private readonly handlePageDown = (): void => this.scrollActiveTab(this.viewport.height * 0.72);

  constructor() {
    super(SceneKeys.Options);
  }

  create(data?: OptionsSceneData): void {
    this.returnScene = data?.returnScene ?? SceneKeys.MainMenu;
    this.resumeGameplayOnEsc = data?.resumeGameplay === true;
    this.resumePausedSceneOnEsc = data?.resumePausedScene === true;
    this.resetTransientUiState();
    configureSceneUiNavigation(this, {
      onBack: () => this.handleEscReturn(),
      onTabLeft: () => this.cycleOptionsTab(-1),
      onTabRight: () => this.cycleOptionsTab(1),
      onScroll: (amount) => this.scrollActiveTab(amount)
    });

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
    this.createAudioTab(audio, save);
    this.createGameplayTab(this.requireTab('gameplay'), save);
    this.createInterfaceTab(this.requireTab('interface'), save);
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
    this.scrollStates.clear();
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
        playButtonJiggle(this, [background, label]);
        if (this.activeTab !== definition.id) background.setStrokeStyle(2, 0x5cecff, 0.9);
      });
      background.on('pointerout', () => this.refreshTabVisuals());
      const activate = (): void => {
        if (this.activeTab === definition.id) return;
        AudioManager.get().playSfx('menu');
        this.selectTab(definition.id);
      };
      background.on('pointerdown', activate);
      registerUiFocusable(this, background, {
        id: `options:tab:${definition.id}`,
        label: `${definition.label} TAB`,
        activate,
        group: 'options-tabs',
        defaultPriority: definition.id === 'audio' ? 20 : 0
      });
      this.tabVisuals.set(definition.id, { background, label });
    });
  }

  private cycleOptionsTab(direction: -1 | 1): void {
    const index = OPTIONS_TABS.findIndex((tab) => tab.id === this.activeTab);
    const next = OPTIONS_TABS[(index + direction + OPTIONS_TABS.length) % OPTIONS_TABS.length];
    this.selectTab(next.id);
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
    this.configureTabScrolling('audio', container, contentBottom);
  }

  private createGameplayTab(container: Phaser.GameObjects.Container, save: ReturnType<typeof SaveSystem.get>): void {
    const { left, top, width } = this.viewport;
    const centerX = left + width * 0.5;
    const innerWidth = width - 48;
    let y = top + 26;
    this.addSectionHeader(container, centerX, y, 'AIMING & CONTROLS', 'RETICLE / INPUT CALIBRATION');

    let aim = normalizeAimSettings(save.settings.aim);
    const panelTop = y + 25;
    const stacked = innerWidth < 760;
    const panelHeight = stacked ? 580 : 330;
    container.add(this.add.rectangle(centerX, panelTop + panelHeight * 0.5, innerWidth, panelHeight, 0x091522, 0.9)
      .setStrokeStyle(1, 0x3a9db2, 0.58));
    const controlWidth = Math.min(500, stacked ? innerWidth - 42 : innerWidth * 0.55);
    const controlLeft = stacked ? centerX - controlWidth * 0.5 : centerX - innerWidth * 0.5 + 24;
    const trackWidth = Phaser.Math.Clamp(controlWidth * 0.46, 145, 225);
    const trackX = controlLeft + controlWidth - trackWidth * 0.5 - 42;
    const labelWidth = Math.max(115, trackX - trackWidth * 0.5 - controlLeft - 12);
    const previewX = stacked ? centerX : centerX + innerWidth * 0.29;
    const previewY = stacked ? panelTop + 400 : panelTop + 154;
    const preview = this.createReticlePreview(container, previewX, previewY, aim);
    const commitAim = (): void => {
      SaveSystem.setSettings({ aim: { ...aim, reticle: { ...aim.reticle } } });
      preview.redraw(aim);
      this.scheduleSettingsPersist();
    };

    const sensitivity = this.createRangeSlider(container, 'gameplay', controlLeft, trackX, panelTop + 43, 'MOUSE SENSITIVITY', aim.mouseSensitivity, 0.35, 2, trackWidth, (value) => {
      aim = { ...aim, mouseSensitivity: value };
      commitAim();
    }, (value) => value.toFixed(2), labelWidth);
    const reticleSize = this.createRangeSlider(container, 'gameplay', controlLeft, trackX, panelTop + 91, 'RETICLE SIZE', aim.reticle.size, 0.6, 1.8, trackWidth, (value) => {
      aim = { ...aim, reticle: { ...aim.reticle, size: value } };
      commitAim();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const reticleOpacity = this.createRangeSlider(container, 'gameplay', controlLeft, trackX, panelTop + 139, 'RETICLE OPACITY', aim.reticle.opacity, 0.3, 1, trackWidth, (value) => {
      aim = { ...aim, reticle: { ...aim.reticle, opacity: value } };
      commitAim();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const style = this.createCycleSelector(container, 'gameplay', controlLeft, panelTop + 185, controlWidth, 'RETICLE STYLE', RETICLE_STYLES, aim.reticle.style, (value) => {
      aim = { ...aim, reticle: { ...aim.reticle, style: value } };
      commitAim();
    });
    const glow = this.createCycleSelector(container, 'gameplay', controlLeft, panelTop + 229, controlWidth, 'RETICLE GLOW', HUD_GLOW_LEVELS, aim.reticle.glow, (value) => {
      aim = { ...aim, reticle: { ...aim.reticle, glow: value } };
      commitAim();
    });
    const colorSelector = this.createColorSelector(container, 'gameplay', controlLeft, panelTop + 276, controlWidth, aim.reticle.color, (value) => {
      aim = { ...aim, reticle: { ...aim.reticle, color: value } };
      commitAim();
    });
    const resetY = stacked ? panelTop + 548 : panelTop + 282;
    const reset = this.addTabButton(container, previewX, resetY, 'Reset Aim Settings', () => {
      aim = normalizeAimSettings(DEFAULT_AIM_SETTINGS);
      sensitivity.setValue?.(aim.mouseSensitivity);
      reticleSize.setValue?.(aim.reticle.size);
      reticleOpacity.setValue?.(aim.reticle.opacity);
      style.setValue(aim.reticle.style);
      glow.setValue(aim.reticle.glow);
      colorSelector.setValue(aim.reticle.color);
      commitAim();
      SaveSystem.persist();
    }, Phaser.Math.Clamp(innerWidth * 0.34, 190, 260));
    this.registerScrollTarget('gameplay', reset, resetY, 22);

    y = panelTop + panelHeight + 22;
    this.addSectionHeader(container, centerX, y, 'CONTROLLER', 'STANDARD GAMEPAD CALIBRATION');
    const controllerBottom = this.createControllerSettingsPanel(container, centerX, y + 32, innerWidth, save.settings.controller);
    y = controllerBottom + 22;
    this.addSectionHeader(container, centerX, y, 'CONTROLS / GAMEPLAY REFERENCE', 'CURRENT PROFILE BINDINGS');
    const referenceBottom = this.createGameplayReferencePanel(container, centerX, y + 34, innerWidth);
    const keybindBottom = this.createKeybindPanel(container, centerX, referenceBottom + 12, innerWidth);
    const tutorialBottom = this.createTutorialSettingsPanel(container, centerX, keybindBottom + 18, innerWidth, save.settings.contextualTutorials);
    this.configureTabScrolling('gameplay', container, tutorialBottom + 22);
  }

  private createControllerSettingsPanel(
    container: Phaser.GameObjects.Container,
    centerX: number,
    topY: number,
    contentWidth: number,
    initial: ReturnType<typeof normalizeControllerSettings>
  ): number {
    const panelWidth = Math.min(contentWidth, 900);
    const panelHeight = 226;
    const controlWidth = Math.min(panelWidth - 44, 650);
    const controlLeft = centerX - controlWidth * 0.5;
    const trackWidth = Phaser.Math.Clamp(controlWidth * 0.38, 160, 230);
    const trackX = controlLeft + controlWidth - trackWidth * 0.5 - 42;
    const labelWidth = Math.max(150, trackX - trackWidth * 0.5 - controlLeft - 14);
    container.add(this.add.rectangle(centerX, topY + panelHeight * 0.5, panelWidth, panelHeight, 0x091522, 0.9)
      .setStrokeStyle(1, 0x3a9db2, 0.58));
    container.add(this.add.text(centerX, topY + 12, 'Xbox / XInput, PlayStation, and standard browser-mapped controllers', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#91bdca', align: 'center'
    }).setOrigin(0.5, 0));

    let controller = normalizeControllerSettings(initial);
    const commit = (): void => {
      SaveSystem.setSettings({ controller: { ...controller } });
      this.scheduleSettingsPersist();
    };
    const leftDeadZone = this.createRangeSlider(container, 'gameplay', controlLeft, trackX, topY + 60, 'MOVE STICK DEAD ZONE', controller.leftStickDeadZone, 0.05, 0.45, trackWidth, (value) => {
      controller = { ...controller, leftStickDeadZone: value };
      commit();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const rightDeadZone = this.createRangeSlider(container, 'gameplay', controlLeft, trackX, topY + 104, 'AIM STICK DEAD ZONE', controller.rightStickDeadZone, 0.05, 0.45, trackWidth, (value) => {
      controller = { ...controller, rightStickDeadZone: value };
      commit();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const aimSensitivity = this.createRangeSlider(container, 'gameplay', controlLeft, trackX, topY + 148, 'CONTROLLER AIM SENSITIVITY', controller.aimSensitivity, 0.5, 2, trackWidth, (value) => {
      controller = { ...controller, aimSensitivity: value };
      commit();
    }, (value) => value.toFixed(2), labelWidth);
    const reset = this.addTabButton(container, centerX, topY + 195, 'RESET CONTROLLER SETTINGS', () => {
      controller = normalizeControllerSettings(DEFAULT_CONTROLLER_SETTINGS);
      leftDeadZone.setValue?.(controller.leftStickDeadZone);
      rightDeadZone.setValue?.(controller.rightStickDeadZone);
      aimSensitivity.setValue?.(controller.aimSensitivity);
      commit();
      SaveSystem.persist();
    }, Math.min(310, panelWidth - 44));
    this.registerScrollTarget('gameplay', reset, topY + 195, 22);
    return topY + panelHeight;
  }

  private createTutorialSettingsPanel(
    container: Phaser.GameObjects.Container,
    centerX: number,
    topY: number,
    contentWidth: number,
    initialContextual: boolean
  ): number {
    const panelWidth = Math.min(contentWidth, 900);
    const compact = panelWidth < 680;
    const rowGap = 48;
    const columns = compact ? 1 : 2;
    const replayRows = Math.ceil(TUTORIAL_REPLAY_GROUPS.length / columns);
    const panelHeight = 118 + replayRows * rowGap + 58;
    container.add(this.add.rectangle(centerX, topY + panelHeight * 0.5, panelWidth, panelHeight, 0x091522, 0.9)
      .setStrokeStyle(1, 0x3a9db2, 0.58));
    container.add(this.add.text(centerX, topY + 15, 'TRAINING & CONTEXTUAL GUIDANCE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '17px', color: '#69f4ff'
    }).setOrigin(0.5, 0));
    container.add(this.add.text(centerX, topY + 42, 'Replay a module on its next relevant screen. Live training uses your current key bindings.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#9fc7d5', align: 'center'
    }).setOrigin(0.5, 0));

    let contextual = initialContextual;
    const toggle = this.addTabButton(container, centerX, topY + 82, `CONTEXTUAL TIPS: ${contextual ? 'ON' : 'OFF'}`, () => {
      contextual = !contextual;
      SaveSystem.setSettings({ contextualTutorials: contextual });
      const label = toggle.getByName('button-label') as Phaser.GameObjects.Text | null;
      label?.setText(`CONTEXTUAL TIPS: ${contextual ? 'ON' : 'OFF'}`);
    }, Math.min(330, panelWidth - 44));
    this.registerScrollTarget('gameplay', toggle, topY + 82, 22);

    const buttonWidth = compact ? panelWidth - 42 : (panelWidth - 58) / 2;
    const startY = topY + 128;
    TUTORIAL_REPLAY_GROUPS.forEach((group, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = columns === 1 ? centerX : centerX + (column === 0 ? -(buttonWidth + 12) / 2 : (buttonWidth + 12) / 2);
      const y = startY + row * rowGap;
      const button = this.addTabButton(container, x, y, `REPLAY // ${group.label}`, () => {
        if (group.sequenceId === 'progression.mod-collection' && SaveSystem.getModCollection().cards.length === 0) {
          showInfoModal(this, 'TRAINING UNAVAILABLE', 'Recover at least one Mod before replaying the Mod Collection training module.', [{ label: 'ACKNOWLEDGED', onClick: () => undefined }]);
          return;
        }
        SaveSystem.updateTutorialProgress((state) => {
          requestTutorialReplay(state, group.sequenceId);
          if ('followups' in group) {
            for (const sequenceId of group.followups) resetTutorialSequence(state, sequenceId);
          }
        });
        showInfoModal(this, 'TRAINING QUEUED', group.sequenceId.startsWith('onboarding.')
          ? 'This training module will begin during your next deployment.'
          : 'This training module will begin on its relevant menu screen.', [{ label: 'ACKNOWLEDGED', onClick: () => undefined }]);
      }, buttonWidth);
      this.registerScrollTarget('gameplay', button, y, 22);
    });

    const skipY = startY + replayRows * rowGap + 4;
    const skip = this.addTabButton(container, centerX, skipY, 'SKIP INITIAL DEPLOYMENT TRAINING', () => {
      SaveSystem.updateTutorialProgress((state) => {
        for (const sequenceId of ['onboarding.basic-controls', 'onboarding.defense', 'onboarding.hud']) {
          skipTutorialSequence(state, sequenceId);
        }
      });
      showInfoModal(this, 'TRAINING UPDATED', 'Initial deployment training is marked complete. Individual modules can still be replayed here.', [{ label: 'ACKNOWLEDGED', onClick: () => undefined }]);
    }, Math.min(390, panelWidth - 44));
    this.registerScrollTarget('gameplay', skip, skipY, 22);
    return topY + panelHeight;
  }

  private createGameplayReferencePanel(container: Phaser.GameObjects.Container, centerX: number, topY: number, contentWidth: number): number {
    const panelWidth = Math.min(contentWidth, 900);
    const compact = this.viewport.height < 620;
    const panelHeight = compact ? 82 : 108;
    container.add(this.add.rectangle(centerX, topY + panelHeight * 0.5, panelWidth, panelHeight, 0x091522, 0.9)
      .setStrokeStyle(1, 0x3a9db2, 0.58));
    container.add(this.add.text(centerX, topY + 13, 'CORE CONTROLS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 13 : 16}px`, color: '#69f4ff'
    }).setOrigin(0.5, 0));
    container.add(this.add.text(centerX, topY + (compact ? 34 : 39), 'WASD  MOVE    ·    MOUSE  AIM    ·    LMB  FIRE    ·    E  PLANT / INTERACT    ·    1 / 2 / 3  SELECT ABILITY    ·    ESC  PAUSE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 12 : 15}px`, color: '#dff8ff', align: 'center', fontStyle: 'bold',
      wordWrap: { width: panelWidth - 34, useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2));
    const bindings = SaveSystem.get().settings.abilityBindings;
    const abilities = ABILITY_ACTIONS.map(({ action, label }) => `${bindingLabel(bindings[action])} ${label.toUpperCase()}`).join('    ·    ');
    container.add(this.add.text(centerX, topY + (compact ? 62 : 78), abilities, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 11 : 14}px`, color: '#ffb9e5', align: 'center',
      wordWrap: { width: panelWidth - 34, useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2));
    return topY + panelHeight;
  }

  private createInterfaceTab(container: Phaser.GameObjects.Container, save: ReturnType<typeof SaveSystem.get>): void {
    const { left, top, width } = this.viewport;
    const centerX = left + width * 0.5;
    const innerWidth = width - 48;
    let hud = normalizeHudSettings(save.settings.hud);
    let buttonJiggle = Phaser.Math.Clamp(save.settings.buttonJiggle, 0, 1);
    const headerY = top + 26;
    this.addSectionHeader(container, centerX, headerY, 'HUD CUSTOMIZATION', 'PERIMETER DISPLAY CALIBRATION');
    const panelTop = headerY + 25;
    const stacked = innerWidth < 760;
    const panelHeight = stacked ? 810 : 418;
    container.add(this.add.rectangle(centerX, panelTop + panelHeight * 0.5, innerWidth, panelHeight, 0x091522, 0.9)
      .setStrokeStyle(1, 0x3a9db2, 0.58));
    const controlWidth = Math.min(510, stacked ? innerWidth - 42 : innerWidth * 0.56);
    const controlLeft = stacked ? centerX - controlWidth * 0.5 : centerX - innerWidth * 0.5 + 24;
    const trackWidth = Phaser.Math.Clamp(controlWidth * 0.45, 145, 220);
    const trackX = controlLeft + controlWidth - trackWidth * 0.5 - 42;
    const labelWidth = Math.max(115, trackX - trackWidth * 0.5 - controlLeft - 12);
    const previewX = stacked ? centerX : centerX + innerWidth * 0.29;
    const previewY = stacked ? panelTop + 535 : panelTop + 176;
    const preview = this.createHudPreview(container, previewX, previewY, hud);
    const commitHud = (): void => {
      SaveSystem.setSettings({ hud: { ...hud } });
      preview.redraw(hud);
      this.scheduleSettingsPersist();
    };

    const hudScale = this.createRangeSlider(container, 'interface', controlLeft, trackX, panelTop + 38, 'HUD SCALE', hud.scale, 0.75, 1.4, trackWidth, (value) => {
      hud = { ...hud, scale: value }; commitHud();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const panelOpacity = this.createRangeSlider(container, 'interface', controlLeft, trackX, panelTop + 82, 'PANEL OPACITY', hud.panelOpacity, 0.2, 1, trackWidth, (value) => {
      hud = { ...hud, panelOpacity: value }; commitHud();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const backgroundOpacity = this.createRangeSlider(container, 'interface', controlLeft, trackX, panelTop + 126, 'BACKGROUND OPACITY', hud.backgroundOpacity, 0.2, 1, trackWidth, (value) => {
      hud = { ...hud, backgroundOpacity: value }; commitHud();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const textScale = this.createRangeSlider(container, 'interface', controlLeft, trackX, panelTop + 170, 'HUD TEXT SCALE', hud.textScale, 0.85, 1.25, trackWidth, (value) => {
      hud = { ...hud, textScale: value }; commitHud();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const edgePosition = this.createRangeSlider(container, 'interface', controlLeft, trackX, panelTop + 214, 'HUD EDGE POSITION', hud.edgePosition, 0, 1, trackWidth, (value) => {
      hud = { ...hud, edgePosition: value }; commitHud();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const glow = this.createCycleSelector(container, 'interface', controlLeft, panelTop + 260, controlWidth, 'HUD GLOW', HUD_GLOW_LEVELS, hud.glow, (value) => {
      hud = { ...hud, glow: value }; commitHud();
    });
    const animation = this.createCycleSelector(container, 'interface', controlLeft, panelTop + 305, controlWidth, 'HUD ANIMATION', HUD_ANIMATION_LEVELS, hud.animation, (value) => {
      hud = { ...hud, animation: value }; commitHud();
    });
    this.createRangeSlider(container, 'interface', controlLeft, trackX, panelTop + 350, 'BUTTON JIGGLE', buttonJiggle, 0, 1, trackWidth, (value) => {
      buttonJiggle = value;
      SaveSystem.setSettings({ buttonJiggle });
      this.scheduleSettingsPersist();
    }, (value) => `${Math.round(value * 100)}%`, labelWidth);
    const resetY = stacked ? panelTop + 735 : panelTop + 350;
    const reset = this.addTabButton(container, previewX, resetY, 'Reset HUD Settings', () => {
      hud = normalizeHudSettings(DEFAULT_HUD_SETTINGS);
      hudScale.setValue?.(hud.scale);
      panelOpacity.setValue?.(hud.panelOpacity);
      backgroundOpacity.setValue?.(hud.backgroundOpacity);
      textScale.setValue?.(hud.textScale);
      edgePosition.setValue?.(hud.edgePosition);
      glow.setValue(hud.glow);
      animation.setValue(hud.animation);
      commitHud();
      SaveSystem.persist();
    }, Phaser.Math.Clamp(innerWidth * 0.36, 195, 270));
    this.registerScrollTarget('interface', reset, resetY, 22);
    container.add(this.add.text(centerX, panelTop + panelHeight - 21, 'Critical health, objective, and cooldown warnings remain readable at every presentation level.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: '#789baa', align: 'center'
    }).setOrigin(0.5));
    this.configureTabScrolling('interface', container, panelTop + panelHeight + 18);
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
    this.applyTabScroll(tab);
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

  private configureTabScrolling(tab: OptionsTabId, container: Phaser.GameObjects.Container, contentBottom: number): void {
    const contentHeight = contentBottom - this.viewport.top;
    const previous = this.scrollStates.get(tab);
    this.scrollStates.set(tab, {
      container,
      targets: previous?.targets ?? [],
      offset: previous?.offset ?? 0,
      max: Math.max(0, contentHeight - this.viewport.height + 8),
      contentHeight
    });
    this.ensureScrollIndicator();
  }

  private registerScrollTarget(tab: OptionsTabId, target: Phaser.GameObjects.GameObject, centerY: number, halfHeight: number): void {
    const state = this.scrollStates.get(tab) ?? {
      container: this.requireTab(tab), targets: [], offset: 0, max: 0, contentHeight: this.viewport.height
    };
    state.targets.push({ target, centerY, halfHeight });
    this.scrollStates.set(tab, state);
  }

  private ensureScrollIndicator(): void {
    if (this.scrollTrack) return;
    const trackHeight = Math.max(120, this.viewport.height - 28);
    this.scrollTrackTop = this.viewport.top + 14;
    const x = this.viewport.right - 12;
    this.scrollTrack = this.add.rectangle(x, this.scrollTrackTop + trackHeight * 0.5, 5, trackHeight, 0x18324b, 0.84)
      .setStrokeStyle(1, 0x4baccb, 0.65).setDepth(130);
    this.scrollThumb = this.add.rectangle(x, this.scrollTrackTop + 28, 8, 46, 0x62efff, 0.94)
      .setStrokeStyle(1, 0xffffff, 0.75).setDepth(131);
    this.scrollLabel = this.add.text(x - 10, this.viewport.bottom - 10, 'SCROLL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: '#78cfe7'
    }).setOrigin(1, 0.5).setDepth(131);
  }

  private scrollActiveTab(delta: number): void {
    const state = this.scrollStates.get(this.activeTab);
    if (!state || state.max <= 0 || this.cancelBindingCapture) return;
    state.offset = Phaser.Math.Clamp(state.offset + delta, 0, state.max);
    this.applyTabScroll(this.activeTab);
  }

  private applyTabScroll(tab: OptionsTabId): void {
    const state = this.scrollStates.get(tab);
    if (!state) return;
    state.container.y = -state.offset;
    if (tab === this.activeTab && this.scrollThumb) {
      const trackHeight = Math.max(120, this.viewport.height - 28);
      const thumbHeight = Math.max(46, trackHeight * (this.viewport.height / Math.max(this.viewport.height, state.contentHeight)));
      this.scrollThumb.setDisplaySize(8, thumbHeight);
      this.scrollTrackRange = trackHeight - thumbHeight;
      const ratio = state.max > 0 ? state.offset / state.max : 0;
      this.scrollThumb.y = this.scrollTrackTop + thumbHeight * 0.5 + this.scrollTrackRange * ratio;
    }
    for (const entry of state.targets) {
      const visibleY = entry.centerY - state.offset;
      const enabled = this.activeTab === tab
        && visibleY - entry.halfHeight >= this.viewport.top + 3
        && visibleY + entry.halfHeight <= this.viewport.bottom - 3;
      this.setGameObjectInputEnabled(entry.target, enabled);
    }
  }

  private updateScrollVisibility(): void {
    const visible = (this.scrollStates.get(this.activeTab)?.max ?? 0) > 0;
    this.scrollTrack?.setVisible(visible);
    this.scrollThumb?.setVisible(visible);
    this.scrollLabel?.setVisible(visible);
  }

  private setGameObjectInputEnabled(object: Phaser.GameObjects.GameObject, enabled: boolean): void {
    if (object.input) object.input.enabled = enabled;
    if (object instanceof Phaser.GameObjects.Container) {
      for (const child of object.list) this.setGameObjectInputEnabled(child, enabled);
    }
  }

  private createKeybindPanel(container: Phaser.GameObjects.Container, centerX: number, topY: number, contentWidth: number): number {
    const panelWidth = Math.min(contentWidth, 900);
    // This tab scrolls, so keep the control grid's geometry stable instead of
    // squeezing the footer upward into the Dash row on short viewports.
    const panelHeight = 260;
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
        playButtonJiggle(this, [background, value]);
      });
      hit.on('pointerout', () => background.setStrokeStyle(1, 0xff7adf, 0.8));
      hit.on('pointerdown', () => {
        AudioManager.get().playSfx('menu');
        this.beginBindingCapture(action, bindings, valueLabels, status);
      });
      container.add([actionLabel, background, value, hit]);
      this.registerScrollTarget('gameplay', hit, y, 16);
    });

    const resetY = topY + 206;
    const reset = this.add.text(centerX + panelWidth * 0.25 + 62, resetY, 'RESET DEFAULTS', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#ffcf91', backgroundColor: '#172238', padding: { x: 18, y: 5 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    reset.on('pointerover', () => {
      AudioManager.get().playSfx('menuHover');
      playButtonJiggle(this, reset);
    });
    reset.on('pointerdown', () => {
      AudioManager.get().playSfx('menu');
      this.cancelBindingCapture?.();
      Object.assign(bindings, DEFAULT_ABILITY_BINDINGS);
      for (const { action } of ABILITY_ACTIONS) valueLabels.get(action)?.setText(bindingLabel(bindings[action]));
      SaveSystem.setSettings({ abilityBindings: { ...bindings } });
      SaveSystem.persist();
      status.setText('Default ability bindings restored.').setColor('#8fffc4');
    });
    registerUiFocusable(this, reset, {
      id: 'options:gameplay:reset-ability-bindings',
      label: 'RESET DEFAULT ABILITY BINDINGS',
      destructive: true,
      activate: () => {
        this.cancelBindingCapture?.();
        Object.assign(bindings, DEFAULT_ABILITY_BINDINGS);
        for (const { action } of ABILITY_ACTIONS) valueLabels.get(action)?.setText(bindingLabel(bindings[action]));
        SaveSystem.setSettings({ abilityBindings: { ...bindings } });
        SaveSystem.persist();
        status.setText('Default ability bindings restored.').setColor('#8fffc4');
        AudioManager.get().playSfx('menu');
      },
      scroll: (amount) => this.scrollActiveTab(amount)
    });
    container.add(reset);
    this.registerScrollTarget('gameplay', reset, resetY, 18);
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
      `Profile: ${preview.preview.save.profile.name}\nCredits: ${preview.preview.save.wallet.credits}\nCore Tokens: ${preview.preview.save.wallet.coreTokens}\nFlux Cores: ${preview.preview.save.wallet.fluxCores}\nHighest Round: ${preview.preview.save.progress.highestRound}`,
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
    if (this.resumePausedSceneOnEsc && this.scene.isPaused(this.returnScene)) {
      this.scene.resume(this.returnScene);
      this.scene.stop();
      return;
    }
    this.scene.start(this.returnScene);
  }

  private createRangeSlider(
    container: Phaser.GameObjects.Container,
    tab: OptionsTabId,
    labelX: number,
    trackX: number,
    y: number,
    label: string,
    initial: number,
    minimum: number,
    maximum: number,
    trackWidth: number,
    onChange: (value: number) => void,
    format: (value: number) => string,
    labelWidth: number
  ): SliderParts {
    const minX = trackX - trackWidth * 0.5;
    const maxX = trackX + trackWidth * 0.5;
    const labelText = this.add.text(labelX, y, label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#dbf5ff',
      wordWrap: { width: labelWidth, useAdvancedWrap: true }
    }).setOrigin(0, 0.5).setMaxLines(2);
    const track = this.add.rectangle(trackX, y, trackWidth, 10, 0x1e2b45, 1).setStrokeStyle(1, 0x53dfff, 0.9);
    const fill = this.add.rectangle(minX, y, 0, 8, 0x5be7ff, 1).setOrigin(0, 0.5);
    const knob = this.add.circle(minX, y, 10, 0xff7adf, 1).setStrokeStyle(1, 0xffffff, 0.9);
    const valueText = this.add.text(maxX + 39, y, '', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#ffeeb8'
    }).setOrigin(0.5);
    const hit = this.add.rectangle(trackX, y, trackWidth + 24, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    let currentValue = Phaser.Math.Clamp(initial, minimum, maximum);
    const setValue = (rawValue: number): void => {
      const value = Phaser.Math.Clamp(rawValue, minimum, maximum);
      currentValue = value;
      const ratio = (value - minimum) / Math.max(0.0001, maximum - minimum);
      fill.width = trackWidth * ratio;
      knob.x = minX + trackWidth * ratio;
      valueText.setText(format(value));
    };
    const updateFromPointer = (worldX: number): void => {
      const ratio = Phaser.Math.Clamp((worldX - minX) / trackWidth, 0, 1);
      const value = minimum + (maximum - minimum) * ratio;
      setValue(value);
      onChange(value);
    };
    hit.on('pointerover', () => AudioManager.get().playSfx('menuHover'));
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => updateFromPointer(pointer.worldX));
    hit.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) updateFromPointer(pointer.worldX);
    });
    registerUiFocusable(this, hit, {
      id: `options:${tab}:slider:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      adjust: (direction) => {
        const increment = (maximum - minimum) / 20;
        const value = Phaser.Math.Clamp(currentValue + direction * increment, minimum, maximum);
        setValue(value);
        onChange(value);
      },
      scroll: (amount) => this.scrollActiveTab(amount)
    });
    setValue(initial);
    container.add([labelText, track, fill, knob, valueText, hit]);
    this.registerScrollTarget(tab, hit, y, 17);
    return { fill, knob, valueText, hit, setValue };
  }

  private createCycleSelector<T extends string>(
    container: Phaser.GameObjects.Container,
    tab: OptionsTabId,
    leftX: number,
    y: number,
    width: number,
    label: string,
    values: readonly T[],
    initial: T,
    onChange: (value: T) => void
  ): { setValue: (value: T) => void } {
    const labelWidth = Math.min(175, width * 0.42);
    const controlX = leftX + labelWidth + (width - labelWidth) * 0.5;
    const controlWidth = Math.max(160, width - labelWidth - 8);
    container.add(this.add.text(leftX, y, label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#dbf5ff'
    }).setOrigin(0, 0.5));
    const back = this.add.rectangle(controlX, y, controlWidth, 31, 0x101d31, 0.96).setStrokeStyle(1, 0x4fcfe9, 0.68);
    const valueText = this.add.text(controlX, y, '', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '13px', color: '#fff0ba'
    }).setOrigin(0.5);
    const previous = this.add.rectangle(controlX - controlWidth * 0.5 + 18, y, 35, 31, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    const next = this.add.rectangle(controlX + controlWidth * 0.5 - 18, y, 35, 31, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    const previousText = this.add.text(previous.x, y, '<', { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#65efff' }).setOrigin(0.5);
    const nextText = this.add.text(next.x, y, '>', { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#65efff' }).setOrigin(0.5);
    let current = values.includes(initial) ? initial : values[0];
    const setValue = (value: T): void => {
      current = values.includes(value) ? value : values[0];
      valueText.setText(current.replaceAll('-', ' ').toUpperCase());
    };
    const step = (direction: number): void => {
      const index = values.indexOf(current);
      setValue(values[(index + direction + values.length) % values.length]);
      AudioManager.get().playSfx('menu');
      onChange(current);
    };
    previous.on('pointerover', () => {
      AudioManager.get().playSfx('menuHover');
      playButtonJiggle(this, previousText);
    });
    next.on('pointerover', () => {
      AudioManager.get().playSfx('menuHover');
      playButtonJiggle(this, nextText);
    });
    previous.on('pointerdown', () => step(-1));
    next.on('pointerdown', () => step(1));
    registerUiFocusable(this, back, {
      id: `options:${tab}:selector:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      activate: () => step(1),
      adjust: (direction) => step(direction),
      scroll: (amount) => this.scrollActiveTab(amount)
    });
    setValue(initial);
    container.add([back, valueText, previous, next, previousText, nextText]);
    this.registerScrollTarget(tab, previous, y, 16);
    this.registerScrollTarget(tab, next, y, 16);
    return { setValue };
  }

  private createColorSelector(
    container: Phaser.GameObjects.Container,
    tab: OptionsTabId,
    leftX: number,
    y: number,
    width: number,
    initial: ReticleColor,
    onChange: (value: ReticleColor) => void
  ): { setValue: (value: ReticleColor) => void } {
    container.add(this.add.text(leftX, y, 'RETICLE COLOR', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#dbf5ff'
    }).setOrigin(0, 0.5));
    const startX = leftX + Math.min(190, width * 0.46);
    const spacing = Math.min(38, (width - (startX - leftX) - 12) / RETICLE_COLOR_IDS.length);
    const rings = new Map<ReticleColor, Phaser.GameObjects.Arc>();
    let current = initial;
    const setValue = (value: ReticleColor): void => {
      current = value;
      for (const [id, ring] of rings) ring.setStrokeStyle(id === current ? 3 : 1, id === current ? 0xffffff : RETICLE_COLORS[id], id === current ? 1 : 0.6);
    };
    RETICLE_COLOR_IDS.forEach((id, index) => {
      const x = startX + index * spacing;
      const ring = this.add.circle(x, y, 10, RETICLE_COLORS[id], 0.88).setStrokeStyle(1, RETICLE_COLORS[id], 0.6).setInteractive({ useHandCursor: true });
      ring.on('pointerover', () => {
        AudioManager.get().playSfx('menuHover');
        playButtonJiggle(this, ring);
      });
      ring.on('pointerdown', () => {
        if (current === id) return;
        AudioManager.get().playSfx('menu');
        setValue(id);
        onChange(id);
      });
      registerUiFocusable(this, ring, {
        id: `options:${tab}:reticle-color:${id}`,
        label: `RETICLE COLOR ${id}`,
        activate: () => {
          if (current === id) return;
          setValue(id);
          onChange(id);
        },
        scroll: (amount) => this.scrollActiveTab(amount)
      });
      rings.set(id, ring);
      container.add(ring);
      this.registerScrollTarget(tab, ring, y, 13);
    });
    setValue(initial);
    return { setValue };
  }

  private createReticlePreview(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    initial: AimSettings
  ): { redraw: (settings: AimSettings) => void } {
    const root = this.add.container(x, y);
    const frame = this.add.rectangle(0, 0, 300, 226, 0x050c15, 0.88).setStrokeStyle(1, 0x3dd9ef, 0.62);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x2b7080, 0.16);
    for (let n = -120; n <= 120; n += 30) grid.lineBetween(n, -78, n, 78);
    for (let n = -60; n <= 60; n += 30) grid.lineBetween(-120, n, 120, n);
    const title = this.add.text(0, -91, 'LIVE RETICLE PREVIEW', { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#69f4ff' }).setOrigin(0.5);
    const graphic = this.add.graphics();
    const detail = this.add.text(0, 91, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#89adba' }).setOrigin(0.5);
    root.add([frame, grid, title, graphic, detail]);
    container.add(root);
    const redraw = (settings: AimSettings): void => {
      drawReticle(graphic, 0, 0, settings.reticle);
      detail.setText(`${settings.reticle.style.replaceAll('-', ' ').toUpperCase()} // ${Math.round(settings.reticle.size * 100)}% // ${settings.reticle.color.toUpperCase()}`);
    };
    redraw(initial);
    return { redraw };
  }

  private createHudPreview(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    initial: HudSettings
  ): { redraw: (settings: HudSettings) => void } {
    const root = this.add.container(x, y);
    const back = this.add.rectangle(0, 0, 330, 270, 0x040a12, 0.9).setStrokeStyle(1, 0x3dd9ef, 0.58);
    const frame = this.add.graphics();
    const title = this.add.text(0, -118, 'LIVE HUD PREVIEW', { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#69f4ff' }).setOrigin(0.5);
    const hp = this.add.rectangle(-118, -70, 105, 8, 0xff5578, 1).setOrigin(0, 0.5);
    const energy = this.add.rectangle(-118, -51, 82, 8, 0x42f2ff, 1).setOrigin(0, 0.5);
    const objective = this.add.text(0, -65, 'SITE B // DEFEND\n00:42', { fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#dffcff', align: 'center' }).setOrigin(0.5);
    const resourceIcon = this.add.graphics().setPosition(79, -61);
    drawHudResourceIcon(resourceIcon, 'coreTokens', 0xffc86b);
    const resource = this.add.text(96, -61, '248', { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: '#ffd48c' }).setOrigin(0, 0.5);
    const radar = this.add.graphics();
    radar.lineStyle(1, 0x56edff, 0.58).strokeCircle(-103, 54, 32).lineStyle(1, 0x56edff, 0.2).lineBetween(-135, 54, -71, 54).lineBetween(-103, 22, -103, 86);
    const abilities: Phaser.GameObjects.Graphics[] = [];
    (['fence', 'turret', 'mine', 'shield'] as const).forEach((id, index) => {
      const icon = this.add.graphics().setPosition(-27 + index * 52, 52);
      drawHudAbilityIcon(icon, id);
      abilities.push(icon);
    });
    const detail = this.add.text(0, 111, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#89adba' }).setOrigin(0.5);
    root.add([back, frame, title, hp, energy, objective, resourceIcon, resource, radar, ...abilities, detail]);
    container.add(root);
    const redraw = (rawSettings: HudSettings): void => {
      const settings = normalizeHudSettings(rawSettings);
      this.tweens.killTweensOf(root);
      root.setAlpha(1).setY(y);
      const glow = glowMultiplier(settings.glow);
      frame.clear();
      frame.fillStyle(0x06111b, 0.76 * settings.panelOpacity).fillRoundedRect(-139, -91, 278, 64, 5);
      frame.fillStyle(0x0a1d29, 0.48 * settings.backgroundOpacity).fillRect(-132, -82, 264, 46);
      frame.lineStyle(1 + glow * 0.5, 0x56edff, 0.48 + glow * 0.16).strokeRoundedRect(-139, -91, 278, 64, 5);
      frame.fillStyle(0x06111b, 0.76 * settings.panelOpacity).fillRoundedRect(-52, 15, 190, 76, 5);
      frame.lineStyle(1 + glow * 0.45, 0xff61cf, 0.5 + glow * 0.14).strokeRoundedRect(-52, 15, 190, 76, 5);
      const previewScale = Phaser.Math.Linear(0.86, 1.08, (settings.scale - 0.75) / 0.65);
      const inset = (1 - settings.edgePosition) * 8;
      hp.setPosition(-118 + inset, -70);
      energy.setPosition(-118 + inset, -51);
      resourceIcon.setPosition(79 - inset, -61);
      resource.setPosition(96 - inset, -61);
      radar.setPosition(inset, 0);
      abilities.forEach((icon, index) => icon.setPosition(-27 + index * 52 - inset * 0.45, 52));
      for (const object of [hp, energy, objective, resourceIcon, resource, radar, ...abilities]) object.setScale(previewScale);
      objective.setFontSize(Math.round(12 * settings.textScale));
      resource.setFontSize(Math.round(14 * settings.textScale));
      detail.setText(`${Math.round(settings.scale * 100)}% SCALE // ${Math.round(settings.textScale * 100)}% TEXT // ${Math.round(settings.edgePosition * 100)}% EDGE // ${settings.glow.toUpperCase()} GLOW`);
      if (settings.animation !== 'off') {
        this.tweens.add({ targets: root, y: y - (settings.animation === 'reduced' ? 1 : 3), duration: settings.animation === 'reduced' ? 1600 : 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    };
    redraw(initial);
    return { redraw };
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

    let currentValue = Phaser.Math.Clamp(initial, 0, 1);
    const applyValue = (rawValue: number): void => {
      const value = Phaser.Math.Clamp(rawValue, 0, 1);
      currentValue = value;
      fill.width = trackWidth * value;
      knob.x = minX + trackWidth * value;
      valueText.setText(`${Math.round(value * 100)}%`);
      onChange(value);
      AudioManager.get().refreshMix();
    };
    const updateFromPointer = (worldX: number): void => {
      const clampedX = Phaser.Math.Clamp(worldX, minX, maxX);
      const value = Phaser.Math.Clamp((clampedX - minX) / trackWidth, 0, 1);
      applyValue(value);
    };
    hit.on('pointerover', () => AudioManager.get().playSfx('menuHover'));
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => updateFromPointer(pointer.worldX));
    hit.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) updateFromPointer(pointer.worldX);
    });
    registerUiFocusable(this, hit, {
      id: `options:audio:slider:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      defaultPriority: label === 'MASTER VOLUME' ? 30 : 0,
      adjust: (direction) => applyValue(currentValue + direction * 0.05),
      scroll: (amount) => this.scrollActiveTab(amount)
    });
    container.add([labelText, track, fill, knob, valueText, hit]);
    this.registerScrollTarget('audio', hit, y, 17);
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
    this.scrollStates.clear();
    this.tabContainers.clear();
    this.tabVisuals.clear();
  }
}
