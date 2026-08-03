import Phaser from 'phaser';
import { SFX_DEFINITIONS, type AudioSfxName } from '../config/audio';
import { SPLASH_SESSION_KEY } from '../config/gameplay';
import { SceneKeys, type SceneKeyValue } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import { pickJsonFile, showConfirmDialog, showInfoModal } from '../utils/localSaveUi';
import { createButton } from '../utils/ui';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { mountFeedbackReportUi, type FeedbackReportHandle } from '../../ui/feedback/FeedbackReportUi';

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

    this.add.rectangle(centerX, height * 0.5, width, height, 0x070a12, 1);
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
      sessionStorage.removeItem(SPLASH_SESSION_KEY);
      this.scene.start(SceneKeys.Splash);
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

    const designBottom = helperY + 28;
    if (designBottom > height - 18) {
      this.cameras.main.setZoom(Math.max(0.72, (height - 18) / designBottom));
    }

    this.input.keyboard?.on('keydown-ESC', this.handleEscReturn, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.settingsPersistTimer?.remove();
      this.settingsPersistTimer = null;
      this.feedbackReportUi?.destroy();
      this.feedbackReportUi = null;
      SaveSystem.persist();
      this.input.keyboard?.off('keydown-ESC', this.handleEscReturn, this);
    });
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
