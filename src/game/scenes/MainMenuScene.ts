import Phaser from 'phaser';
import { GAME_TAGLINE, GAME_TITLE, OBJECTIVE_CONFIG } from '../config/gameplay';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton, enableButton } from '../utils/ui';
import { showInfoModal } from '../utils/localSaveUi';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { bindingLabel } from '../config/controls';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol, getUnlockedProtocolIds } from '../mods/modBalance.ts';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { ECONOMY_BALANCE, MOD_FOCUS_CATEGORIES, MOD_FOCUS_LABELS, RUN_CONTRACT_IDS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { getRunSetupCost } from '../economy/EconomyService.ts';
import type { ModFocusSignalId, RunContractId, RunSetupSelection } from '../economy/types.ts';

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
  'Use Switch Profile on the main menu to create or select another local operative profile.',
  'Open Local Save Information to export a backup before clearing browser data or changing devices.',
  'The Store and Mod Collection are available after each completed round before you continue.',
  'Open Leaderboards from the main menu to review rankings from eligible online runs.',
  'The pause menu provides access to Options and your Mod Collection without ending the run.',
  'You can replay the animated splash screen from the Options menu.',
  'Use the protocol arrows on the main menu to choose among your unlocked starting tiers.',
  'Run Signals and Contracts are optional and charge their listed fee only when the run starts.'
] as const;

export class MainMenuScene extends Phaser.Scene {
  private readonly audio = AudioManager.get();
  private selectedModFocus: ModFocusSignalId | null = null;
  private selectedContract: RunContractId | null = null;

  constructor() {
    super(SceneKeys.MainMenu);
  }

  create(): void {
    this.audio.startMusicLoop();

    const { width, height } = this.scale;
    RunTransitionManager.clearForMenu(this);

    this.add.rectangle(width / 2, height / 2, width, height, 0x070b11, 1);
    this.createAnimatedBackground(width, height);
    this.createArenaOverlay(width, height);
    this.add.text(width / 2, 78, GAME_TITLE, {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '42px',
      color: '#58f4ff'
    }).setOrigin(0.5);

    this.add.text(width / 2, 108, GAME_TAGLINE, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '22px',
      color: '#f8c7f9'
    }).setOrigin(0.5);

    const profile = SaveSystem.getActiveProfileSummary();
    const save = profile ? SaveSystem.get() : undefined;
    const requestedProtocol = profile ? SaveSystem.getPreferredProtocol() : 'normal';
    const protocol = profile && SaveSystem.getHighestRound() >= RUN_PROTOCOLS[requestedProtocol].unlockHighestRound ? requestedProtocol : 'normal';
    const protocolDefinition = RUN_PROTOCOLS[protocol];
    const equippedMods = profile ? new ModRuntime(SaveSystem.getModCollection()).snapshot() : [];
    const storageMessage = SaveSystem.getStorageMessage();
    const profilePanel = this.add.container(width - 190, 130).setDepth(12);
    const panel = this.add.rectangle(0, 0, 320, 180, 0x0b1422, 0.96).setStrokeStyle(2, 0x55e9ff, 0.9).setOrigin(0.5);
    const profileTitle = this.add.text(0, -74, profile ? profile.name.toUpperCase() : 'LOCAL SAVE', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '20px',
      color: '#61f4ff'
    }).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(276, true).setMaxLines(2);
    const profileBody = this.add.text(0, -38, profile && save ? `${save.credits.toLocaleString()} Credits\n${save.coreTokens} Core Tokens\nHighest Round: ${profile.highestRound}\nLOCAL SAVE` : 'Select or create a local profile to continue.', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '16px',
      color: '#a6fff2',
      lineSpacing: 1
    }).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(276, true).setMaxLines(4);

    const saveNotice = SaveSystem.getNotice();
    if (saveNotice) {
      const notice = this.add.text(0, 76, saveNotice, {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '13px',
        color: '#ffc98f',
        align: 'center'
      }).setOrigin(0.5, 1).setWordWrapWidth(276, true).setMaxLines(2);
      profilePanel.add(notice);
    }

    profilePanel.add([panel, profileTitle, profileBody]);

    if (storageMessage) {
      this.add.text(width / 2, 140, storageMessage, {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '17px',
        color: '#ff9aa8',
        align: 'center',
        wordWrap: { width: Math.min(560, width - 80), useAdvancedWrap: true }
      }).setOrigin(0.5).setMaxLines(2);
    }

    profilePanel.setDepth(12);

    const onlineStatus = this.add.text(width / 2, 166, profile ? 'CHECKING ONLINE IDENTITY...' : 'CREATE A LOCAL PROFILE TO START', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#9fc8d8'
    }).setOrigin(0.5);
    if (profile) {
      void OnlineRunManager.initializeIdentity(profile.id).then((status) => {
        if (!onlineStatus.active) return;
        const labels = {
          connected: 'ONLINE IDENTITY CONNECTED',
          none: 'ONLINE IDENTITY WILL BE CREATED WHEN YOU START ONLINE',
          expired: 'ONLINE SESSION EXPIRED — START ONLINE TO RECOVER',
          unavailable: 'ONLINE SERVICE UNAVAILABLE — LOCAL MODE REMAINS AVAILABLE'
        } as const;
        onlineStatus.setText(labels[status]).setColor(status === 'connected' ? '#8fffc4' : status === 'unavailable' ? '#ffbd85' : '#9fc8d8');
      });
    }

    const unlockedProtocols = profile ? getUnlockedProtocolIds(SaveSystem.getHighestRound()) : ['normal'] as const;
    const protocolY = 202;
    const protocolArrowWidth = 44;
    const protocolGap = 8;
    const protocolWidth = Math.max(200, Math.min(320, width - protocolArrowWidth * 2 - protocolGap * 2 - 24));
    const protocolArrowOffset = protocolWidth / 2 + protocolGap + protocolArrowWidth / 2;
    const menuStartY = 254;
    const menuRowGap = 54;
    const pairGap = 16;
    const pairButtonWidth = Math.max(170, Math.min(250, (width - pairGap - 48) / 2));
    const pairOffset = (pairButtonWidth + pairGap) / 2;
    const singleButtonWidth = Math.max(220, Math.min(280, width - 48));
    const selectProtocol = (direction: 1 | -1): void => {
      if (!profile) return;
      const next = cycleUnlockedProtocol(protocol, SaveSystem.getHighestRound(), direction);
      if (next === protocol && unlockedProtocols.length === 1) {
        const nextLocked = RUN_PROTOCOL_IDS.find((id) => SaveSystem.getHighestRound() < RUN_PROTOCOLS[id].unlockHighestRound);
        if (nextLocked) onlineStatus.setText(`${RUN_PROTOCOLS[nextLocked].label} UNLOCKS AT ROUND ${RUN_PROTOCOLS[nextLocked].unlockHighestRound}`).setColor('#ffbd85');
        return;
      }
      const result = SaveSystem.setPreferredProtocol(next);
      if (result.ok) this.scene.restart();
      else onlineStatus.setText(result.message ?? 'PROTOCOL LOCKED').setColor('#ffbd85');
    };
    const protocolButton = createButton(this, width / 2, protocolY, `${protocolDefinition.label}\nSTART ROUND ${protocolDefinition.startingRound}`, () => selectProtocol(1), protocolWidth);
    const previousProtocolButton = createButton(this, width / 2 - protocolArrowOffset, protocolY, '<', () => selectProtocol(-1), protocolArrowWidth);
    const nextProtocolButton = createButton(this, width / 2 + protocolArrowOffset, protocolY, '>', () => selectProtocol(1), protocolArrowWidth);
    if (profile && unlockedProtocols.length === 1) {
      protocolButton.setAlpha(0.82);
      previousProtocolButton.setAlpha(0.82);
      nextProtocolButton.setAlpha(0.82);
    }

    const setupSelection = this.getRunSetupSelection();
    const setupCost = getRunSetupCost(setupSelection);
    const setupX = Math.max(170, width * 0.15);
    this.add.rectangle(setupX, 325, 315, 300, 0x081521, 0.88)
      .setStrokeStyle(2, 0x55e9ff, 0.65).setDepth(12);
    this.add.text(setupX, 198, 'ONE-RUN SETUP', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '17px', color: '#61f4ff'
    }).setOrigin(0.5).setDepth(13);
    this.add.text(setupX, 222, 'Optional pursuits are charged only when a run starts.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#a8c7d4', align: 'center'
    }).setOrigin(0.5).setDepth(13).setWordWrapWidth(270, true);
    createButton(this, setupX, 266, `Signal: ${this.selectedModFocus ? MOD_FOCUS_LABELS[this.selectedModFocus] : 'None'}`, () => {
      const current = this.selectedModFocus ? MOD_FOCUS_CATEGORIES.indexOf(this.selectedModFocus) : -1;
      this.selectedModFocus = current >= MOD_FOCUS_CATEGORIES.length - 1 ? null : MOD_FOCUS_CATEGORIES[current + 1];
      this.scene.restart();
    }, 276).setDepth(13);
    createButton(this, setupX, 320, `Contract: ${this.selectedContract ? RUN_CONTRACTS[this.selectedContract].label : 'None'}`, () => {
      const current = this.selectedContract ? RUN_CONTRACT_IDS.indexOf(this.selectedContract) : -1;
      this.selectedContract = current >= RUN_CONTRACT_IDS.length - 1 ? null : RUN_CONTRACT_IDS[current + 1];
      this.scene.restart();
    }, 276).setDepth(13);
    this.add.text(setupX, 365, setupCost > 0
      ? `RUN FEE  ${setupCost.toLocaleString()} CREDITS\nSignal ${this.selectedModFocus ? `${ECONOMY_BALANCE.modFocus.categoryWeightMultiplier}x category weighting` : 'off'}  •  Contract ${this.selectedContract ? 'active' : 'off'}`
      : 'RUN FEE  FREE\nStandard drop and challenge rules', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: setupCost > 0 ? '#ffd66b' : '#9fe8c2', align: 'center'
    }).setOrigin(0.5).setDepth(13);
    this.add.text(setupX, 414, this.selectedContract
      ? RUN_CONTRACTS[this.selectedContract].description
      : this.selectedModFocus
        ? `${MOD_FOCUS_LABELS[this.selectedModFocus]} favors that category while preserving rarity and total drop quantity.`
        : 'No Contract or focused Mod hunt selected.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#a8c7d4', align: 'center'
    }).setOrigin(0.5).setDepth(13).setWordWrapWidth(276, true);

    const startButton = createButton(this, width / 2 - pairOffset, menuStartY, 'Start Online', () => {
      if (!profile) {
        this.scene.start(SceneKeys.LocalProfiles);
        return;
      }
      disableButton(startButton);
      void (async () => {
        const selection = this.getRunSetupSelection();
        if (!SaveSystem.canAffordRunSetup(selection)) {
          onlineStatus.setText(`RUN SETUP REQUIRES ${getRunSetupCost(selection).toLocaleString()} CREDITS.`).setColor('#ff9aab');
          enableButton(startButton);
          return;
        }
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
        const session = {
          baseSeed: result.seed,
          round: protocolDefinition.startingRound,
          objectiveMode: OBJECTIVE_CONFIG.defaultMode,
          protocol,
          runStartedAt: Date.now(),
          equippedMods,
          modsEarned: [],
          ...economySnapshot
        };
        startArenaLoad(this, {
          reason: 'new-run',
          session,
          message: 'Deploying server-authorized online operation...'
        });
      })();
    }, pairButtonWidth);
    const localStartButton = createButton(this, width / 2 + pairOffset, menuStartY, 'Start Local', () => {
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
        return;
      }
      const economySnapshot = SaveSystem.buildRunEconomySnapshot(selection, purchase.cost);
      this.clearRunSetupSelection();
      OnlineRunManager.beginLocalRun();
      startArenaLoad(this, {
        reason: 'new-run',
        session: {
          baseSeed: Phaser.Math.Between(1, 999_999_999), round: protocolDefinition.startingRound,
          objectiveMode: OBJECTIVE_CONFIG.defaultMode, protocol, runStartedAt: Date.now(), equippedMods, modsEarned: [], ...economySnapshot
        },
        message: 'Building explicitly local operation...'
      });
    }, pairButtonWidth);
    createButton(this, width / 2, menuStartY + menuRowGap, 'Store', () => this.scene.start(SceneKeys.Upgrades), singleButtonWidth);
    createButton(this, width / 2 - pairOffset, menuStartY + menuRowGap * 2, 'Mod Collection', () => this.scene.start(SceneKeys.Mods), pairButtonWidth);
    createButton(this, width / 2 + pairOffset, menuStartY + menuRowGap * 2, 'Leaderboards', () => this.scene.start(SceneKeys.OnlineLeaderboards), pairButtonWidth);
    createButton(this, width / 2, menuStartY + menuRowGap * 3, 'Options', () => this.scene.start(SceneKeys.Options), singleButtonWidth);
    createButton(this, width / 2, menuStartY + menuRowGap * 4, 'Switch Profile', () => this.scene.start(SceneKeys.LocalProfiles), singleButtonWidth);
    const lastMenuY = menuStartY + menuRowGap * 5;
    createButton(this, width / 2, lastMenuY, 'Local Save Information', () => {
      showInfoModal(
        this,
        'LOCAL SAVE INFORMATION',
        'Your profile and game progress are saved only in this browser. Your save will not automatically appear on another device or browser. Clearing site data, private browsing, browser cleanup tools, or uninstalling the browser may remove your save. Use Export Save to create a backup. You can import that backup into another browser or device.',
        [
          {
            label: 'Export Active Profile',
            onClick: () => {
              const result = SaveSystem.exportActiveProfile();
              if (result.ok) {
                this.add.text(width / 2, 520, 'Backup exported.', {
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '18px',
                  color: '#99ffcc'
                }).setOrigin(0.5).setDepth(5000);
              }
            },
            width: 240
          },
          {
            label: 'Close',
            onClick: () => undefined,
            width: 180
          }
        ]
      );
    }, singleButtonWidth);

    const bindings = save?.settings.abilityBindings;
    const abilityControls = bindings
      ? `${bindingLabel(bindings.fence)} Fence    ${bindingLabel(bindings.turret)} Turret    ${bindingLabel(bindings.mine)} Mine    ${bindingLabel(bindings.dash)} Dash    ${bindingLabel(bindings.shield)} Shield`
      : 'Q Fence    F Turret    R Mine    Space Dash    Middle Mouse Shield';
    const controlsFontSize = height < 760 ? 18 : 20;
    const controlsY = height - 126;
    this.createTipRotator(width, lastMenuY + 34, controlsY - controlsFontSize * 2.4 - 10);
    this.add.text(width / 2, controlsY, `Controls:\nWASD Move    Mouse Aim    LMB Fire    E Plant/Interact\n${abilityControls}\n1/2/3 Select Ability    Esc Pause`, {
      fontFamily: 'Rajdhani, sans-serif',
      color: '#d6f0ff',
      fontSize: `${controlsFontSize}px`,
      align: 'center',
      lineSpacing: 3,
      wordWrap: { width: Math.min(940, width - 64), useAdvancedWrap: true }
    }).setOrigin(0.5).setMaxLines(5);

    this.add.text(width / 2, height - 38, 'Plant at Site A, B, or C. Survive until detonation.', {
      fontFamily: 'Rajdhani, sans-serif',
      color: '#ff8bcf',
      fontSize: '19px',
      align: 'center',
      wordWrap: { width: width - 48, useAdvancedWrap: true }
    }).setOrigin(0.5).setMaxLines(2);
  }

  private createTipRotator(width: number, availableTop: number, availableBottom: number): void {
    const availableHeight = availableBottom - availableTop;
    if (availableHeight < 48) return;
    const panelWidth = Math.min(760, width - 48);
    const panelHeight = Math.min(66, availableHeight);
    const y = (availableTop + availableBottom) / 2;
    const panel = this.add.rectangle(width / 2, y, panelWidth, panelHeight, 0x07131f, 0.76)
      .setStrokeStyle(1, 0x58f4ff, 0.38).setDepth(14);
    let currentTip = Phaser.Math.Between(0, MAIN_MENU_TIPS.length - 1);
    const tipText = this.add.text(width / 2, y, `TIP: ${MAIN_MENU_TIPS[currentTip]}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: width < 700 ? '16px' : '18px',
      fontStyle: 'bold',
      color: '#f4d5ff',
      align: 'center',
      lineSpacing: 2
    }).setOrigin(0.5).setWordWrapWidth(panelWidth - 36, true).setMaxLines(2).setDepth(15);

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
            tipText.setText(`TIP: ${MAIN_MENU_TIPS[currentTip]}`);
            this.tweens.add({ targets: tipText, alpha: 1, duration: 280 });
          }
        });
      }
    });
    this.tweens.add({ targets: panel, alpha: { from: 0.68, to: 0.92 }, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private getRunSetupSelection(): RunSetupSelection {
    return { modFocus: this.selectedModFocus, contract: this.selectedContract };
  }

  private clearRunSetupSelection(): void {
    this.selectedModFocus = null;
    this.selectedContract = null;
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

    this.tweens.add({
      targets: ringLeft,
      scale: { from: 0.92, to: 1.08 },
      alpha: { from: 0.08, to: 0.2 },
      duration: 3400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: ringRight,
      scale: { from: 0.9, to: 1.06 },
      alpha: { from: 0.07, to: 0.18 },
      duration: 4100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
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
      const shadow = this.add.rectangle(width * spec.x + 7, height * spec.y + 8, obstacleWidth, obstacleHeight, 0x000000, 0.28)
        .setRotation(Phaser.Math.DegToRad(spec.angle));
      const obstacle = this.add.rectangle(width * spec.x, height * spec.y, obstacleWidth, obstacleHeight, 0x101b28, 0.48)
        .setStrokeStyle(2, 0x326c7d, 0.52)
        .setRotation(Phaser.Math.DegToRad(spec.angle));
      const seam = this.add.rectangle(width * spec.x, height * spec.y, obstacleWidth * 0.62, 2, 0x61eaff, 0.2)
        .setRotation(Phaser.Math.DegToRad(spec.angle));
      shadow.setDepth(0);
      obstacle.setDepth(0);
      seam.setDepth(0);
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
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.round(radius * 0.42)}px`, color: '#e7fdff',
      stroke: '#061019', strokeThickness: 4
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
        const spark = this.add.rectangle(sparkX, sparkY, Phaser.Math.Between(7, 15), 2, color, 0.72)
          .setRotation(tangent);
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
