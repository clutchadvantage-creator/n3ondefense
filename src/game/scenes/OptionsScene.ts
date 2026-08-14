import Phaser from 'phaser';
import { SFX_DEFINITIONS, type AudioSfxName } from '../config/audio';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import { pickJsonFile, showConfirmDialog, showInfoModal } from '../utils/localSaveUi';
import { createButton } from '../utils/ui';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { mountFeedbackReportUi, type FeedbackReportHandle } from '../../ui/feedback/FeedbackReportUi';
import { ABILITY_ACTIONS, DEFAULT_ABILITY_BINDINGS, RESERVED_ABILITY_BINDINGS, bindingForKeyboardEvent, bindingForMouseButton, bindingLabel, type AbilityAction, type InputBinding } from '../config/controls';

interface SliderParts {
  fill: Phaser.GameObjects.Rectangle;
  knob: Phaser.GameObjects.Arc;
  valueText: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
}

interface OptionsSceneData {
  returnScene?: SceneKeyValue;
  resumeGameplay?: boolean;
}

export class OptionsScene extends Phaser.Scene {
  private returnScene: SceneKeyValue = SceneKeys.MainMenu;
  private resumeGameplayOnEsc = false;
  private settingsPersistTimer: Phaser.Time.TimerEvent | null = null;
  private feedbackReportUi: FeedbackReportHandle | null = null;
  private cancelBindingCapture: (() => void) | null = null;
  private scrollMax = 0;
  private scrollThumb: Phaser.GameObjects.Rectangle | null = null;
  private scrollTrackTop = 0;
  private scrollTrackRange = 0;
  private readonly handleOptionsWheel = (
    _pointer: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number
  ): void => this.scrollOptions(deltaY * 0.75);
  private readonly handleScrollUp = (): void => this.scrollOptions(-110);
  private readonly handleScrollDown = (): void => this.scrollOptions(110);
  private readonly handlePageUp = (): void => this.scrollOptions(-this.scale.height * 0.72);
  private readonly handlePageDown = (): void => this.scrollOptions(this.scale.height * 0.72);

  constructor() {
    super(SceneKeys.Options);
  }

  create(data?: OptionsSceneData): void {
    this.returnScene = data?.returnScene ?? SceneKeys.MainMenu;
    this.resumeGameplayOnEsc = data?.resumeGameplay === true;

    const { width, height } = this.scale;
    const centerX = width * 0.5;
    const contentWidth = Math.min(width - 80, 1120);
    const save = SaveSystem.get();
    const storageMessage = SaveSystem.getStorageMessage();
    this.feedbackReportUi = mountFeedbackReportUi(getGameUiRoot());

    this.add.rectangle(centerX, height * 0.5, width, height, 0x070a12, 1).setScrollFactor(0).setDepth(-100);
    this.add.text(centerX, 48, 'OPTIONS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '38px', color: '#58efff'
    }).setOrigin(0.5);
    this.add.text(centerX, 86, 'Audio Mixer', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '26px', color: '#ffd786'
    }).setOrigin(0.5);

    if (storageMessage) {
      this.add.text(centerX, 112, storageMessage, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#ff9aa8'
      }).setOrigin(0.5);
    }

    const mixerStartY = storageMessage ? 146 : 126;
    const masterLabelX = centerX - 250;
    const masterTrackX = centerX + 60;
    this.createSlider(masterLabelX, masterTrackX, mixerStartY, 'MASTER VOLUME', save.settings.masterVolume, 340, (value) => {
      SaveSystem.setSettings({ masterVolume: value });
      this.scheduleSettingsPersist();
    });
    this.createSlider(masterLabelX, masterTrackX, mixerStartY + 38, 'MUSIC VOLUME', save.settings.musicVolume, 340, (value) => {
      SaveSystem.setSettings({ musicVolume: value });
      this.scheduleSettingsPersist();
    });
    this.createSlider(masterLabelX, masterTrackX, mixerStartY + 76, 'SFX VOLUME', save.settings.sfxVolume, 340, (value) => {
      SaveSystem.setSettings({ sfxVolume: value });
      this.scheduleSettingsPersist();
    });

    const soundsTitleY = mixerStartY + 124;
    this.add.text(centerX, soundsTitleY, 'INDIVIDUAL SOUNDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '19px', color: '#69f4ff'
    }).setOrigin(0.5);

    const columnGap = 54;
    const columnWidth = (contentWidth - columnGap) * 0.5;
    const leftColumnX = centerX - (columnWidth + columnGap) * 0.5;
    const rightColumnX = centerX + (columnWidth + columnGap) * 0.5;
    const soundStartY = soundsTitleY + 42;
    const soundRowGap = 36;
    const soundRows = Math.ceil(SFX_DEFINITIONS.length * 0.5);

    SFX_DEFINITIONS.forEach((definition, index) => {
      const columnCenter = index < soundRows ? leftColumnX : rightColumnX;
      const row = index % soundRows;
      const labelX = columnCenter - columnWidth * 0.31;
      const trackX = columnCenter + columnWidth * 0.17;
      this.createSlider(
        labelX,
        trackX,
        soundStartY + row * soundRowGap,
        definition.label.toUpperCase(),
        save.settings.soundVolumes[definition.key],
        Math.max(150, columnWidth * 0.42),
        (value) => this.updateSoundVolume(definition.key, value)
      );
    });

    const navigationY = soundStartY + soundRowGap * soundRows + 22;
    createButton(this, centerX, navigationY, 'Replay Splash Screen', () => {
      this.scene.launch(SceneKeys.Splash, {
        replay: true,
        returnScene: this.returnScene,
        resumeGameplay: this.resumeGameplayOnEsc,
        returnToOptions: this.returnScene !== SceneKeys.Arena
      });
      this.scene.bringToTop(SceneKeys.Splash);
      this.scene.stop();
    }, 280);
    createButton(this, centerX, navigationY + 50, 'Back to Main Menu', () => this.scene.start(SceneKeys.MainMenu), 280);

    const localTitleY = navigationY + 108;
    this.add.text(centerX, localTitleY, 'LOCAL SAVE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '23px', color: '#69f4ff'
    }).setOrigin(0.5);

    const profile = SaveSystem.getActiveProfileSummary();
    this.add.text(centerX, localTitleY + 30, profile ? `Active Profile: ${profile.name}` : 'No active profile selected.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', color: '#d6f4ff'
    }).setOrigin(0.5);

    const buttonWidth = 220;
    const buttonGap = 24;
    const leftButtonX = centerX - (buttonWidth + buttonGap) * 0.5;
    const rightButtonX = centerX + (buttonWidth + buttonGap) * 0.5;
    const buttonStartY = localTitleY + 76;

    createButton(this, leftButtonX, buttonStartY, 'Local Save Info', () => this.showLocalSaveInfo(), buttonWidth);
    createButton(this, rightButtonX, buttonStartY, 'Switch Profile', () => this.scene.start(SceneKeys.LocalProfiles), buttonWidth);
    createButton(this, leftButtonX, buttonStartY + 52, 'Export Save', () => { void SaveSystem.exportActiveProfile(); }, buttonWidth);
    createButton(this, rightButtonX, buttonStartY + 52, 'Import Save', () => { void this.importSave(); }, buttonWidth);
    createButton(this, leftButtonX, buttonStartY + 104, 'Restore Backup', () => this.restoreBackup(), buttonWidth);
    createButton(this, rightButtonX, buttonStartY + 104, 'Reset Progress', () => this.resetProgress(), buttonWidth);

    const helperY = buttonStartY + 154;
    this.add.text(centerX, helperY, 'Settings are saved instantly to this browser-local profile.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', color: '#b8dbff'
    }).setOrigin(0.5);

    const keybindBottom = this.createKeybindPanel(centerX, helperY + 54, contentWidth);
    const designBottom = keybindBottom + 20;
    this.configureScrolling(width, height, designBottom);

    this.input.keyboard?.on('keydown-ESC', this.handleEscReturn, this);
    this.input.keyboard?.on('keydown-UP', this.handleScrollUp);
    this.input.keyboard?.on('keydown-DOWN', this.handleScrollDown);
    this.input.keyboard?.on('keydown-PAGE_UP', this.handlePageUp);
    this.input.keyboard?.on('keydown-PAGE_DOWN', this.handlePageDown);
    this.input.on('wheel', this.handleOptionsWheel);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
      this.scrollThumb = null;
    });
  }

  private configureScrolling(width: number, height: number, contentBottom: number): void {
    const bottomPadding = 30;
    const contentHeight = Math.max(height, contentBottom + bottomPadding);
    this.scrollMax = Math.max(0, contentHeight - height);
    this.cameras.main.setBounds(0, 0, width, contentHeight).setScroll(0, 0);
    if (this.scrollMax <= 0) return;

    const trackHeight = Math.max(120, height - 72);
    const thumbHeight = Math.max(48, trackHeight * (height / contentHeight));
    this.scrollTrackTop = (height - trackHeight) * 0.5;
    this.scrollTrackRange = trackHeight - thumbHeight;
    this.add.rectangle(width - 16, height * 0.5, 6, trackHeight, 0x18324b, 0.82)
      .setStrokeStyle(1, 0x4baccb, 0.65).setScrollFactor(0).setDepth(9000);
    this.scrollThumb = this.add.rectangle(width - 16, this.scrollTrackTop + thumbHeight * 0.5, 8, thumbHeight, 0x62efff, 0.92)
      .setStrokeStyle(1, 0xffffff, 0.75).setScrollFactor(0).setDepth(9001);
    this.add.text(width - 28, height - 18, 'SCROLL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#78cfe7'
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(9001);
  }

  private scrollOptions(delta: number): void {
    if (this.scrollMax <= 0 || this.cancelBindingCapture) return;
    const next = Phaser.Math.Clamp(this.cameras.main.scrollY + delta, 0, this.scrollMax);
    this.cameras.main.scrollY = next;
    if (!this.scrollThumb) return;
    const ratio = this.scrollMax > 0 ? next / this.scrollMax : 0;
    this.scrollThumb.y = this.scrollTrackTop + this.scrollThumb.height * 0.5 + this.scrollTrackRange * ratio;
  }

  private createKeybindPanel(centerX: number, topY: number, contentWidth: number): number {
    const panelWidth = Math.min(contentWidth, 900);
    const panelHeight = 248;
    const panelCenterY = topY + panelHeight * 0.5;
    this.add.rectangle(centerX, panelCenterY, panelWidth, panelHeight, 0x0b1422, 0.92)
      .setStrokeStyle(2, 0x53dfff, 0.72);
    this.add.text(centerX, topY + 24, 'CUSTOM ABILITY KEYBINDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#69f4ff'
    }).setOrigin(0.5);

    const status = this.add.text(centerX, topY + 58, 'Select a binding, then press a key or mouse button. WASD, E, Esc, F8, and primary fire are reserved.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', color: '#a9cfe0', align: 'center',
      lineSpacing: 3,
      wordWrap: { width: panelWidth - 64, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
    const bindings = { ...SaveSystem.get().settings.abilityBindings };
    const valueLabels = new Map<AbilityAction, Phaser.GameObjects.Text>();

    ABILITY_ACTIONS.forEach(({ action, label }, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = centerX + (column === 0 ? -panelWidth * 0.25 : panelWidth * 0.25);
      const y = topY + 124 + row * 40;
      this.add.text(x - 104, y, label.toUpperCase(), {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#dff8ff'
      }).setOrigin(0, 0.5);
      const bg = this.add.rectangle(x + 62, y, 164, 27, 0x14223a, 0.98).setStrokeStyle(1, 0xff7adf, 0.8);
      const value = this.add.text(x + 62, y, bindingLabel(bindings[action]), {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#fff0ba'
      }).setOrigin(0.5);
      valueLabels.set(action, value);
      const hit = this.add.rectangle(x + 62, y, 164, 29, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => bg.setStrokeStyle(2, 0x69f4ff, 1));
      hit.on('pointerout', () => bg.setStrokeStyle(1, 0xff7adf, 0.8));
      hit.on('pointerdown', () => {
        AudioManager.get().playSfx('menu');
        this.beginBindingCapture(action, bindings, valueLabels, status);
      });
    });

    const reset = this.add.text(centerX + panelWidth * 0.25 + 62, topY + 204, 'RESET DEFAULTS', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#ffcf91', backgroundColor: '#172238', padding: { x: 18, y: 5 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    reset.on('pointerdown', () => {
      AudioManager.get().playSfx('menu');
      this.cancelBindingCapture?.();
      Object.assign(bindings, DEFAULT_ABILITY_BINDINGS);
      for (const { action } of ABILITY_ACTIONS) valueLabels.get(action)?.setText(bindingLabel(bindings[action]));
      SaveSystem.setSettings({ abilityBindings: { ...bindings } });
      SaveSystem.persist();
      status.setText('Default ability bindings restored.').setColor('#8fffc4');
    });
    return topY + panelHeight;
  }

  private beginBindingCapture(
    action: AbilityAction,
    bindings: Record<AbilityAction, InputBinding>,
    labels: Map<AbilityAction, Phaser.GameObjects.Text>,
    status: Phaser.GameObjects.Text
  ): void {
    this.cancelBindingCapture?.();
    status.setText(`Listening for ${action.toUpperCase()} — press a key or mouse button. Esc cancels.`).setColor('#fff0a8');
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
    this.cancelBindingCapture = cleanup;
    window.setTimeout(() => {
      if (this.cancelBindingCapture !== cleanup) return;
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
    showConfirmDialog(this, 'Reset Progress?', `Reset “${active.name}” to default wallet, upgrades, cosmetics, and progression while preserving the profile name?`, 'Reset Progress', () => {
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
    labelX: number,
    trackX: number,
    y: number,
    label: string,
    initial: number,
    trackWidth: number,
    onChange: (value: number) => void
  ): SliderParts {
    const minX = trackX - trackWidth * 0.5;
    const maxX = trackX + trackWidth * 0.5;
    this.add.text(labelX, y, label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#dbf5ff'
    }).setOrigin(0.5);

    this.add.rectangle(trackX, y, trackWidth, 9, 0x1e2b45, 1).setStrokeStyle(1, 0x53dfff, 0.9);
    const fill = this.add.rectangle(minX, y, trackWidth * initial, 7, 0x5be7ff, 1).setOrigin(0, 0.5);
    const knob = this.add.circle(minX + trackWidth * initial, y, 9, 0xff7adf, 1).setStrokeStyle(1, 0xffffff, 0.9);
    const valueText = this.add.text(maxX + 34, y, `${Math.round(initial * 100)}%`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#ffeeb8'
    }).setOrigin(0.5);
    const hit = this.add.rectangle(trackX, y, trackWidth + 24, 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true });

    const updateFromPointer = (worldX: number): void => {
      const clampedX = Phaser.Math.Clamp(worldX, minX, maxX);
      const value = Phaser.Math.Clamp((clampedX - minX) / trackWidth, 0, 1);
      fill.width = trackWidth * value;
      knob.x = clampedX;
      valueText.setText(`${Math.round(value * 100)}%`);
      onChange(value);
      AudioManager.get().refreshMix();
    };
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => updateFromPointer(pointer.worldX));
    hit.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) updateFromPointer(pointer.worldX);
    });
    return { fill, knob, valueText, hit };
  }
}
