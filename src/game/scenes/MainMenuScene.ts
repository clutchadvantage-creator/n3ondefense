import Phaser from 'phaser';
import { GAME_TAGLINE, GAME_TITLE, OBJECTIVE_CONFIG } from '../config/gameplay';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton, enableButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol, getUnlockedProtocolIds } from '../mods/modBalance.ts';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { MOD_FOCUS_LABELS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { getRunSetupCost } from '../economy/EconomyService.ts';
import type { RunSetupSelection } from '../economy/types.ts';
import { formatWeeklyCountdown, type WeeklyOperationsSnapshot } from '../progression/WeeklyOperations.ts';

const MAIN_MENU_TIPS = [
  'Shoot through a placed fence to split and multiply your projectiles.',
  'Place turrets near bomb sites to help interrupt incoming defuse attempts.',
  'Visit the Store regularly so permanent upgrades keep pace with harder rounds.',
  'Abilities and weapon fire both consume energy. Watch your energy reserves.',
  'Infused Mods add optional visual flair to each session.',
  'Press F to place a turret.',
  'Press R to place a mine.',
  'Press Q to place a fence.',
  'Keep moving and watch every active bomb site for defuse attempts.',
  'Online runs submit eligible statistics to the online leaderboards.',
  'Local runs remain offline and do not submit statistics to online leaderboards.',
  'Press Escape during a run to pause the game and open the pause menu.',
  'Adjust master, music, sound-effect, and individual sound volumes in Options.',
  'Set custom ability key bindings in Options. Changes are saved to your active profile.',
  'Use the mouse wheel, arrow keys, or Page Up and Page Down to navigate the Options screen.',
  'Press Escape in Options, the Store, or Mod Collection to return to the previous screen.',
  'Use Options > Profile to select another operative or export a local save backup.',
  'The Store and Mod Collection are available after each completed round before you continue.',
  'Open Leaderboards from the main menu to review rankings from eligible online runs.',
  'The pause menu provides access to Options and your Mod Collection without ending the run.',
  'Visit the Operator Garage to inspect equipped Mods, cosmetics, presets, and Overdrive progress.',
  'Configure optional Signals and Contracts from the Operator Garage before deployment.',
  'You can replay the animated splash screen from the Options menu.',
  'Use the protocol arrows to choose among your unlocked starting tiers.'
] as const;

export class MainMenuScene extends Phaser.Scene {
  private readonly audio = AudioManager.get();

  constructor() {
    super(SceneKeys.MainMenu);
  }

  create(): void {
    this.audio.startMusicLoop();
    const { width, height } = this.scale;
    if (this.scene.isActive(SceneKeys.Arena) || this.scene.isPaused(SceneKeys.Arena)) this.scene.stop(SceneKeys.Arena);
    this.registry.remove('arena-session');
    RunTransitionManager.clearForMenu(this);

    this.add.rectangle(width / 2, height / 2, width, height, 0x070b11, 1);
    this.createAnimatedBackground(width, height);
    this.createArenaOverlay(width, height);
    this.createBranding(width, height);

    const profile = SaveSystem.getActiveProfileSummary();
    const requestedProtocol = profile ? SaveSystem.getPreferredProtocol() : 'normal';
    const protocol = profile && SaveSystem.getHighestRound() >= RUN_PROTOCOLS[requestedProtocol].unlockHighestRound
      ? requestedProtocol
      : 'normal';
    const protocolDefinition = RUN_PROTOCOLS[protocol];
    const equippedMods = profile ? new ModRuntime(SaveSystem.getModCollection()).snapshot() : [];
    const narrow = width < 1120;
    const short = height < 760;
    const tiny = height < 650;
    const centerX = narrow ? width * 0.34 : width * 0.5;

    const onlineStatus = this.add.text(centerX, tiny ? 82 : short ? 96 : 122, profile ? 'CHECKING ONLINE IDENTITY...' : 'CREATE A LOCAL PROFILE TO START', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${tiny ? 12 : short ? 14 : 17}px`, color: '#9fc8d8', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5).setWordWrapWidth(Math.max(240, width * (narrow ? 0.55 : 0.42)), true).setMaxLines(2);
    if (profile) {
      void OnlineRunManager.initializeIdentity(profile.id).then((status) => {
        if (!onlineStatus.active) return;
        const labels = {
          connected: 'ONLINE IDENTITY CONNECTED',
          none: 'ONLINE IDENTITY WILL BE CREATED WHEN YOU DEPLOY ONLINE',
          expired: 'ONLINE SESSION EXPIRED - DEPLOY ONLINE TO RECOVER',
          unavailable: 'ONLINE SERVICE UNAVAILABLE - LOCAL MODE REMAINS AVAILABLE'
        } as const;
        onlineStatus.setText(labels[status]).setColor(status === 'connected' ? '#8fffc4' : status === 'unavailable' ? '#ffbd85' : '#9fc8d8');
      });
    }

    const briefingWidth = Phaser.Math.Clamp(width * (narrow ? 0.34 : 0.215), narrow ? 230 : 330, 410);
    const briefingX = width - Math.max(12, width * 0.018) - briefingWidth / 2;
    const briefingTop = tiny ? 88 : short ? 114 : 142;
    const briefingHeight = Math.max(270, Math.min(short ? height - briefingTop - 14 : 540, height - briefingTop - 22));
    this.createOperativeBriefing(briefingX, briefingTop, briefingWidth, briefingHeight, profile?.name ?? null);

    const unlockedProtocols = profile ? getUnlockedProtocolIds(SaveSystem.getHighestRound()) : ['normal'] as const;
    const protocolLabelY = tiny ? 106 : short ? 126 : 154;
    const protocolY = tiny ? 132 : short ? 157 : 188;
    const protocolArrowWidth = tiny ? 38 : 44;
    const protocolGap = 8;
    const protocolWidth = Phaser.Math.Clamp(width * (narrow ? 0.34 : 0.17), 190, 320);
    const protocolArrowOffset = protocolWidth / 2 + protocolGap + protocolArrowWidth / 2;
    this.add.text(centerX, protocolLabelY, 'DEPLOYMENT PROTOCOL', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${tiny ? 10 : short ? 12 : 15}px`, color: '#78ddeb', letterSpacing: 1
    }).setOrigin(0.5);

    const selectProtocol = (direction: 1 | -1): boolean => {
      if (!profile) return true;
      const next = cycleUnlockedProtocol(protocol, SaveSystem.getHighestRound(), direction);
      if (next === protocol && unlockedProtocols.length === 1) {
        const nextLocked = RUN_PROTOCOL_IDS.find((id) => SaveSystem.getHighestRound() < RUN_PROTOCOLS[id].unlockHighestRound);
        if (nextLocked) onlineStatus.setText(`${RUN_PROTOCOLS[nextLocked].label} UNLOCKS AT ROUND ${RUN_PROTOCOLS[nextLocked].unlockHighestRound}`).setColor('#ffbd85');
        return false;
      }
      const result = SaveSystem.setPreferredProtocol(next);
      if (result.ok) {
        this.cameras.main.flash(90, 20, 0, 28, false);
        this.scene.restart();
      } else {
        onlineStatus.setText(result.message ?? 'PROTOCOL LOCKED').setColor('#ffbd85');
      }
      return result.ok;
    };

    const protocolHeight = tiny ? 40 : short ? 46 : 52;
    const protocolButton = createButton(this, centerX, protocolY, `${protocolDefinition.label}\nSTART ROUND ${protocolDefinition.startingRound}`, () => selectProtocol(1), protocolWidth, 'menu', {
      height: protocolHeight, fontSize: tiny ? 12 : short ? 14 : 16
    });
    const previousProtocolButton = createButton(this, centerX - protocolArrowOffset, protocolY, '<', () => selectProtocol(-1), protocolArrowWidth, 'menu', { height: protocolHeight });
    const nextProtocolButton = createButton(this, centerX + protocolArrowOffset, protocolY, '>', () => selectProtocol(1), protocolArrowWidth, 'menu', { height: protocolHeight });
    if (profile && unlockedProtocols.length === 1) {
      protocolButton.setAlpha(0.82);
      previousProtocolButton.setAlpha(0.82);
      nextProtocolButton.setAlpha(0.82);
    }

    const setupSelection = this.getRunSetupSelection();
    const setupCost = getRunSetupCost(setupSelection);
    const setupSummary = setupSelection.modFocus || setupSelection.contract
      ? `RUN CONFIG // SIGNAL: ${setupSelection.modFocus ? MOD_FOCUS_LABELS[setupSelection.modFocus].replace(' Signal', '').toUpperCase() : 'NONE'} // CONTRACT: ${setupSelection.contract ? RUN_CONTRACTS[setupSelection.contract].label.toUpperCase() : 'NONE'} // ${setupCost.toLocaleString()}C`
      : 'LOADOUT READY // STANDARD RUN CONFIGURATION // FREE';
    this.add.text(centerX, tiny ? 162 : short ? 188 : 225, setupSummary, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${tiny ? 9 : short ? 11 : 13}px`, color: setupCost > 0 ? '#ffd287' : '#78cbd7', align: 'center'
    }).setOrigin(0.5).setWordWrapWidth(protocolWidth + 100, true).setMaxLines(2);

    const menuStartY = tiny ? 195 : short ? 222 : 274;
    const menuRowGap = tiny ? 36 : short ? 43 : 51;
    const singleButtonWidth = Phaser.Math.Clamp(width * (narrow ? 0.38 : 0.19), 250, 370);
    const menuButtonHeight = tiny ? 31 : short ? 37 : 43;
    const primaryFrame = this.add.rectangle(centerX, menuStartY, singleButtonWidth + 12, menuButtonHeight + 10, 0x1be8ff, 0.055)
      .setStrokeStyle(1, 0x69f5ff, 0.45);
    this.tweens.add({ targets: primaryFrame, alpha: { from: 0.42, to: 0.9 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const startButton = createButton(this, centerX, menuStartY, 'DEPLOY ONLINE', () => {
      if (!profile) {
        this.scene.start(SceneKeys.LocalProfiles);
        return;
      }
      const selection = this.getRunSetupSelection();
      if (!SaveSystem.canAffordRunSetup(selection)) {
        onlineStatus.setText(`RUN CONFIGURATION REQUIRES ${getRunSetupCost(selection).toLocaleString()} CREDITS.`).setColor('#ff9aab');
        return false;
      }
      disableButton(startButton);
      void (async () => {
        onlineStatus.setText('CREATING SERVER-AUTHORIZED RUN...').setColor('#9fc8d8');
        const result = await OnlineRunManager.beginRun(profile.id, profile.name, protocol, equippedMods);
        if (!result.ok || result.seed === undefined) {
          onlineStatus.setText(`${result.message} CHOOSE LOCAL MODE OR RETRY.`).setColor('#ff9aab');
          enableButton(startButton);
          return;
        }
        const purchase = SaveSystem.purchaseRunSetup(selection);
        if (!purchase.ok) {
          OnlineRunManager.complete('quit');
          onlineStatus.setText(purchase.message.toUpperCase()).setColor('#ff9aab');
          enableButton(startButton);
          return;
        }
        const economySnapshot = SaveSystem.buildRunEconomySnapshot(selection, purchase.cost);
        this.clearRunSetupSelection();
        startArenaLoad(this, {
          reason: 'new-run',
          session: {
            baseSeed: result.seed,
            round: protocolDefinition.startingRound,
            objectiveMode: OBJECTIVE_CONFIG.defaultMode,
            protocol,
            runStartedAt: Date.now(),
            equippedMods,
            modsEarned: [],
            ...economySnapshot
          },
          message: 'Deploying server-authorized online operation...'
        });
      })();
      return true;
    }, singleButtonWidth, 'runStart', { height: menuButtonHeight + 2, fontSize: tiny ? 14 : short ? 16 : 19 });

    const localStartButton = createButton(this, centerX, menuStartY + menuRowGap, 'DEPLOY LOCAL', () => {
      if (!profile) {
        this.scene.start(SceneKeys.LocalProfiles);
        return;
      }
      disableButton(localStartButton);
      const selection = this.getRunSetupSelection();
      const purchase = SaveSystem.purchaseRunSetup(selection);
      if (!purchase.ok) {
        onlineStatus.setText(purchase.message.toUpperCase()).setColor('#ff9aab');
        enableButton(localStartButton);
        return false;
      }
      const economySnapshot = SaveSystem.buildRunEconomySnapshot(selection, purchase.cost);
      this.clearRunSetupSelection();
      OnlineRunManager.beginLocalRun();
      startArenaLoad(this, {
        reason: 'new-run',
        session: {
          baseSeed: Phaser.Math.Between(1, 999_999_999),
          round: protocolDefinition.startingRound,
          objectiveMode: OBJECTIVE_CONFIG.defaultMode,
          protocol,
          runStartedAt: Date.now(),
          equippedMods,
          modsEarned: [],
          ...economySnapshot
        },
        message: 'Building explicitly local operation...'
      });
      return true;
    }, singleButtonWidth, 'runStart', { height: menuButtonHeight, fontSize: tiny ? 13 : short ? 15 : 18 });

    const navPresentation = { height: menuButtonHeight, fontSize: tiny ? 13 : short ? 15 : 17 };
    createButton(this, centerX, menuStartY + menuRowGap * 2, 'OPERATOR GARAGE', () => this.scene.start(SceneKeys.Garage, { returnScene: SceneKeys.MainMenu }), singleButtonWidth, 'menu', navPresentation);
    createButton(this, centerX, menuStartY + menuRowGap * 3, 'MOD COLLECTION', () => this.scene.start(SceneKeys.Mods, {
      returnScene: SceneKeys.MainMenu,
      resumePausedScene: false
    }), singleButtonWidth, 'menu', navPresentation);
    createButton(this, centerX, menuStartY + menuRowGap * 4, 'STORE', () => this.scene.start(SceneKeys.Upgrades, {
      returnScene: SceneKeys.MainMenu,
      resumePausedScene: false
    }), singleButtonWidth, 'menu', navPresentation);
    createButton(this, centerX, menuStartY + menuRowGap * 5, 'LEADERBOARDS', () => this.scene.start(SceneKeys.OnlineLeaderboards), singleButtonWidth, 'menu', navPresentation);
    createButton(this, centerX, menuStartY + menuRowGap * 6, 'OPTIONS', () => this.scene.start(SceneKeys.Options, {
      returnScene: SceneKeys.MainMenu,
      resumeGameplay: false
    }), singleButtonWidth, 'menu', navPresentation);

    const lastMenuY = menuStartY + menuRowGap * 6;
    const tipBottom = Math.min(height - 22, lastMenuY + (tiny ? 62 : short ? 92 : 122));
    this.createTipRotator(centerX, Math.min(singleButtonWidth + 150, narrow ? width * 0.66 : 720), lastMenuY + (tiny ? 20 : 30), tipBottom);
    const storageMessage = SaveSystem.getStorageMessage();
    if (storageMessage && tipBottom < height - 28) {
      this.add.text(centerX, Math.min(height - 12, tipBottom + 16), storageMessage, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#ff9aa8', align: 'center',
        wordWrap: { width: singleButtonWidth + 100, useAdvancedWrap: true }
      }).setOrigin(0.5).setMaxLines(1);
    }
  }

  private createBranding(width: number, height: number): void {
    const tiny = height < 650;
    const short = height < 760;
    const y = tiny ? 12 : short ? 22 : 28;
    const size = tiny ? 25 : short ? 31 : Phaser.Math.Clamp(width * 0.027, 38, 48);
    const pinkGhost = this.add.text(width / 2 + 2, y + 1, GAME_TITLE, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${size}px`, color: '#ff5bcf', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD);
    const cyanGhost = this.add.text(width / 2 - 2, y - 1, GAME_TITLE, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${size}px`, color: '#55efff', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setAlpha(0.24).setBlendMode(Phaser.BlendModes.ADD);
    const title = this.add.text(width / 2, y, GAME_TITLE, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${size}px`, color: '#bafaff', fontStyle: 'bold',
      shadow: { color: '#29dfff', blur: 10, fill: true }
    }).setOrigin(0.5, 0);
    this.add.text(width / 2, y + size + (tiny ? 0 : 3), GAME_TAGLINE, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${tiny ? 13 : short ? 17 : 21}px`, color: '#f8c7f9', letterSpacing: 1
    }).setOrigin(0.5, 0);
    const rail = this.add.rectangle(width / 2, y + size + (tiny ? 22 : short ? 28 : 36), Math.min(470, width * 0.4), 2, 0x55efff, 0.34);
    this.tweens.add({ targets: title, alpha: { from: 0.82, to: 1 }, duration: 2300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: [cyanGhost, pinkGhost], x: '+=1', alpha: { from: 0.1, to: 0.3 }, duration: 1650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: rail, scaleX: { from: 0.76, to: 1 }, alpha: { from: 0.2, to: 0.55 }, duration: 1800, yoyo: true, repeat: -1 });
  }

  private createOperativeBriefing(x: number, top: number, panelWidth: number, panelHeight: number, profileName: string | null): void {
    const root = this.add.container(x + 18, top).setDepth(20).setAlpha(0);
    const compact = panelWidth < 300 || panelHeight < 430;
    const panel = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x07131f, 0.95)
      .setOrigin(0.5, 0).setStrokeStyle(2, 0x55e9ff, 0.76);
    const header = this.add.rectangle(0, 0, panelWidth, compact ? 44 : 54, 0x55e9ff, 0.075).setOrigin(0.5, 0);
    const welcome = this.add.text(0, compact ? 8 : 10, profileName ? `WELCOME, OPERATIVE ${profileName.toUpperCase()}` : 'OPERATIVE BRIEFING', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 11 : 15}px`, color: '#71f4ff', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5, 0).setWordWrapWidth(panelWidth - 30, true).setMaxLines(2);
    const sync = this.add.text(panelWidth / 2 - 12, compact ? 31 : 38, 'DATA SYNC', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 8 : 10}px`, color: '#ff78d2'
    }).setOrigin(1, 0);
    root.add([panel, header, welcome, sync]);

    if (!profileName) {
      root.add(this.add.text(0, panelHeight * 0.46, 'WEEKLY OPERATIONS\nSELECT AN OPERATIVE PROFILE TO ESTABLISH DATA LINK', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 13 : 18}px`, color: '#9abac7', align: 'center', lineSpacing: 8,
        wordWrap: { width: panelWidth - 38, useAdvancedWrap: true }
      }).setOrigin(0.5));
      this.tweens.add({ targets: root, x, alpha: 1, duration: 360, ease: 'Sine.easeOut' });
      return;
    }

    let snapshot: WeeklyOperationsSnapshot;
    try {
      snapshot = SaveSystem.getWeeklyOperations();
    } catch {
      root.add(this.add.text(0, panelHeight * 0.46, 'WEEKLY OPERATIONS\nDATA LINK UNAVAILABLE', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 14 : 19}px`, color: '#ffaeaf', align: 'center', lineSpacing: 9
      }).setOrigin(0.5));
      this.tweens.add({ targets: root, x, alpha: 1, duration: 360, ease: 'Sine.easeOut' });
      return;
    }

    const operationsTitleY = compact ? 53 : 66;
    root.add(this.add.text(0, operationsTitleY, snapshot.complete ? 'WEEKLY OPERATIONS COMPLETE' : 'WEEKLY OPERATIONS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 11 : 15}px`, color: snapshot.complete ? '#79ffae' : '#f0d6ff', fontStyle: 'bold'
    }).setOrigin(0.5, 0));

    const objectiveTop = compact ? 82 : 102;
    const footerSpace = compact ? 86 : 116;
    const objectiveGap = (panelHeight - objectiveTop - footerSpace) / Math.max(1, snapshot.objectives.length);
    const barWidth = panelWidth - (compact ? 28 : 42);
    snapshot.objectives.forEach((objective, index) => {
      const y = objectiveTop + index * objectiveGap;
      root.add(this.add.text(-barWidth / 2, y, `${objective.complete ? '✓' : '○'}  ${objective.title.toUpperCase()}`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 11 : 15}px`, color: objective.complete ? '#78ffae' : '#d8f6ff', fontStyle: 'bold'
      }).setOrigin(0, 0).setWordWrapWidth(barWidth, true).setMaxLines(1));
      root.add(this.add.text(barWidth / 2, y + (compact ? 15 : 20), objective.complete ? 'COMPLETE' : `${objective.current.toLocaleString()} / ${objective.target.toLocaleString()}`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 10 : 13}px`, color: objective.complete ? '#78ffae' : '#8fbac7'
      }).setOrigin(1, 0));
      const ratio = Math.min(1, objective.current / objective.target);
      root.add(this.add.rectangle(-barWidth / 2, y + (compact ? 31 : 39), barWidth, compact ? 3 : 5, 0x153243, 0.9).setOrigin(0, 0.5));
      root.add(this.add.rectangle(-barWidth / 2, y + (compact ? 31 : 39), Math.max(1, barWidth * ratio), compact ? 3 : 5, objective.complete ? 0x78ffae : 0x52eaff, 0.9).setOrigin(0, 0.5));
    });

    const rewardY = panelHeight - (compact ? 73 : 98);
    root.add(this.add.rectangle(0, rewardY - 8, panelWidth - 20, 1, 0xff5bcf, 0.35));
    root.add(this.add.text(0, rewardY, snapshot.complete && snapshot.rewardClaimed ? 'WEEKLY REWARD ACQUIRED' : 'WEEKLY COMPLETION REWARD', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 9 : 12}px`, color: snapshot.complete ? '#78ffae' : '#ff9bda'
    }).setOrigin(0.5, 0));
    root.add(this.add.text(0, rewardY + (compact ? 17 : 22), `${snapshot.reward.credits.toLocaleString()} CREDITS  +  ${snapshot.reward.coreTokens} CORE TOKEN${snapshot.reward.coreTokens === 1 ? '' : 'S'}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 11 : 15}px`, color: '#ffd287', fontStyle: 'bold'
    }).setOrigin(0.5, 0));
    const countdown = this.add.text(0, panelHeight - (compact ? 22 : 27), formatWeeklyCountdown(snapshot.endsAt), {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 10 : 13}px`, color: '#8ac7d5', fontStyle: 'bold'
    }).setOrigin(0.5);
    root.add(countdown);
    this.time.addEvent({
      delay: 60_000,
      loop: true,
      callback: () => {
        if (countdown.active) countdown.setText(formatWeeklyCountdown(snapshot.endsAt));
      }
    });
    this.tweens.add({ targets: sync, alpha: { from: 0.28, to: 1 }, duration: 900, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: root, x, alpha: 1, duration: 360, ease: 'Sine.easeOut' });
  }

  private createTipRotator(centerX: number, panelWidth: number, availableTop: number, availableBottom: number): void {
    const availableHeight = availableBottom - availableTop;
    if (availableHeight < 38) return;
    const panelHeight = Math.min(66, availableHeight);
    const y = (availableTop + availableBottom) / 2;
    const panel = this.add.rectangle(centerX, y, panelWidth, panelHeight, 0x07131f, 0.76)
      .setStrokeStyle(1, 0x58f4ff, 0.38).setDepth(14);
    let currentTip = Phaser.Math.Between(0, MAIN_MENU_TIPS.length - 1);
    const tipText = this.add.text(centerX, y + 7, MAIN_MENU_TIPS[currentTip], {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: panelWidth < 400 ? '13px' : '16px',
      fontStyle: 'bold',
      color: '#f4d5ff',
      align: 'center',
      lineSpacing: 2
    }).setOrigin(0.5).setWordWrapWidth(panelWidth - 36, true).setMaxLines(2).setDepth(15);
    this.add.text(centerX, y - panelHeight / 2 + 5, 'OPERATIVE INTEL', {
      fontFamily: 'Orbitron, sans-serif', fontSize: panelWidth < 400 ? '8px' : '10px', color: '#62efff'
    }).setOrigin(0.5, 0).setDepth(15);

    this.time.addEvent({
      delay: 6200,
      loop: true,
      callback: () => {
        if (!tipText.active) return;
        let nextTip = currentTip;
        while (nextTip === currentTip) nextTip = Phaser.Math.Between(0, MAIN_MENU_TIPS.length - 1);
        currentTip = nextTip;
        this.tweens.add({
          targets: tipText,
          alpha: 0,
          duration: 220,
          onComplete: () => {
            if (!tipText.active) return;
            tipText.setText(MAIN_MENU_TIPS[currentTip]);
            this.tweens.add({ targets: tipText, alpha: 1, duration: 280 });
          }
        });
      }
    });
    this.tweens.add({ targets: panel, alpha: { from: 0.68, to: 0.92 }, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private getRunSetupSelection(): RunSetupSelection {
    return SaveSystem.getNextRunSetupSelection();
  }

  private clearRunSetupSelection(): void {
    SaveSystem.setNextRunSetupSelection({ modFocus: null, contract: null });
  }

  private createAnimatedBackground(width: number, height: number): void {
    const stripes = [
      { y: height * 0.18, h: 120, color: 0x14233d, alpha: 0.28, duration: 4600 },
      { y: height * 0.45, h: 160, color: 0x0f2d39, alpha: 0.22, duration: 5200 },
      { y: height * 0.74, h: 130, color: 0x31163b, alpha: 0.2, duration: 6100 }
    ];
    for (const stripe of stripes) {
      const band = this.add.rectangle(width * 0.5, stripe.y, width * 1.2, stripe.h, stripe.color, stripe.alpha);
      this.tweens.add({
        targets: band,
        x: { from: width * 0.47, to: width * 0.53 },
        alpha: { from: stripe.alpha * 0.7, to: stripe.alpha * 1.25 },
        duration: stripe.duration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
    for (let i = 0; i < 22; i += 1) {
      const x = Phaser.Math.Between(30, Math.max(30, width - 30));
      const y = Phaser.Math.Between(30, Math.max(30, height - 30));
      const dot = this.add.circle(x, y, Phaser.Math.Between(1, 3), Phaser.Math.RND.pick([0x58f4ff, 0xff8bcf, 0xa8ff78]), 0.55);
      this.tweens.add({
        targets: dot,
        y: y + Phaser.Math.Between(-28, 28),
        x: x + Phaser.Math.Between(-24, 24),
        alpha: { from: 0.2, to: 0.75 },
        scale: { from: 0.7, to: 1.3 },
        duration: Phaser.Math.Between(1800, 3600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 900)
      });
    }
    const ringLeft = this.add.circle(width * 0.15, height * 0.24, 110, 0x58f4ff, 0.06).setStrokeStyle(2, 0x58f4ff, 0.45);
    const ringRight = this.add.circle(width * 0.86, height * 0.78, 140, 0xff8bcf, 0.05).setStrokeStyle(2, 0xff8bcf, 0.4);
    this.tweens.add({ targets: ringLeft, scale: { from: 0.92, to: 1.08 }, alpha: { from: 0.08, to: 0.2 }, duration: 3400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: ringRight, scale: { from: 0.9, to: 1.06 }, alpha: { from: 0.07, to: 0.18 }, duration: 4100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private createArenaOverlay(width: number, height: number): void {
    const obstacleSpecs = [
      { x: 0.08, y: 0.18, w: 0.13, h: 0.055, angle: -8 },
      { x: 0.18, y: 0.56, w: 0.19, h: 0.045, angle: 12 },
      { x: 0.08, y: 0.84, w: 0.12, h: 0.07, angle: -4 },
      { x: 0.9, y: 0.34, w: 0.12, h: 0.055, angle: 8 },
      { x: 0.82, y: 0.68, w: 0.18, h: 0.045, angle: -11 },
      { x: 0.93, y: 0.88, w: 0.1, h: 0.065, angle: 5 }
    ];
    for (const spec of obstacleSpecs) {
      const obstacleWidth = Phaser.Math.Clamp(width * spec.w, 90, 250);
      const obstacleHeight = Phaser.Math.Clamp(height * spec.h, 30, 66);
      this.add.rectangle(width * spec.x + 7, height * spec.y + 8, obstacleWidth, obstacleHeight, 0x000000, 0.28)
        .setRotation(Phaser.Math.DegToRad(spec.angle));
      this.add.rectangle(width * spec.x, height * spec.y, obstacleWidth, obstacleHeight, 0x101b28, 0.48)
        .setStrokeStyle(2, 0x326c7d, 0.52).setRotation(Phaser.Math.DegToRad(spec.angle));
      this.add.rectangle(width * spec.x, height * spec.y, obstacleWidth * 0.62, 2, 0x61eaff, 0.2)
        .setRotation(Phaser.Math.DegToRad(spec.angle));
    }
    const sites = [
      { x: width * 0.18, y: height * 0.34, radius: Phaser.Math.Clamp(width * 0.044, 42, 76), color: 0x58f4ff, label: 'A', delay: 0 },
      { x: width * 0.83, y: height * 0.52, radius: Phaser.Math.Clamp(width * 0.04, 40, 70), color: 0xff8bcf, label: 'B', delay: 1500 },
      { x: width * 0.28, y: height * 0.82, radius: Phaser.Math.Clamp(width * 0.038, 38, 66), color: 0xa8ff78, label: 'C', delay: 3000 }
    ];
    for (const site of sites) this.createSimulatedBombSite(site.x, site.y, site.radius, site.color, site.label, site.delay);
  }

  private createSimulatedBombSite(x: number, y: number, radius: number, color: number, label: string, delay: number): void {
    const floor = this.add.circle(x, y, radius, color, 0.025).setStrokeStyle(2, color, 0.26);
    const inner = this.add.circle(x, y, radius * 0.68, 0x061019, 0.28).setStrokeStyle(1, color, 0.34);
    const chargeArc = this.add.graphics();
    const charge = { value: 0 };
    const redraw = (): void => {
      chargeArc.clear();
      chargeArc.lineStyle(4, color, 0.28 + charge.value * 0.66);
      chargeArc.beginPath();
      chargeArc.arc(x, y, radius * 0.86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge.value, false);
      chargeArc.strokePath();
    };
    redraw();
    const siteLabel = this.add.text(x, y - 2, label, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.round(radius * 0.42)}px`, color: '#e7fdff', stroke: '#061019', strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0.42);
    const status = this.add.text(x, y + radius + 13, 'CHARGING', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: Phaser.Display.Color.IntegerToColor(color).rgba
    }).setOrigin(0.5).setAlpha(0.32);
    this.tweens.add({
      targets: charge,
      value: 1,
      duration: 5200,
      delay,
      repeat: -1,
      repeatDelay: 900,
      ease: 'Sine.easeIn',
      onUpdate: redraw,
      onRepeat: () => { charge.value = 0; redraw(); }
    });
    this.tweens.add({
      targets: [floor, inner, siteLabel, status],
      alpha: { from: 0.2, to: 0.58 },
      scale: { from: 0.97, to: 1.035 },
      duration: 1050,
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    if (!SaveSystem.get().settings.particles) return;
    this.time.addEvent({
      delay: 360,
      loop: true,
      callback: () => {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const tangent = angle + Phaser.Math.FloatBetween(-0.75, 0.75);
        const sparkX = x + Math.cos(angle) * radius * 0.9;
        const sparkY = y + Math.sin(angle) * radius * 0.9;
        const spark = this.add.rectangle(sparkX, sparkY, Phaser.Math.Between(7, 15), 2, color, 0.72).setRotation(tangent);
        this.tweens.add({
          targets: spark,
          x: sparkX + Math.cos(tangent) * Phaser.Math.Between(8, 18),
          y: sparkY + Math.sin(tangent) * Phaser.Math.Between(8, 18),
          alpha: 0,
          duration: 240,
          onComplete: () => spark.destroy()
        });
      }
    });
  }
}
