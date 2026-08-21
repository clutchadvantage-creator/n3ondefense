import Phaser from 'phaser';
import mainMenuBackgroundUrl from '../../assets/mainmenubackground.png';
import { GAME_TAGLINE, GAME_TITLE, OBJECTIVE_CONFIG } from '../config/gameplay';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { AudioManager } from '../systems/AudioManager';
import { SaveSystem } from '../systems/SaveSystem';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton, enableButton, setButtonJiggleTargets } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { RUN_PROTOCOL_IDS, RUN_PROTOCOLS, cycleUnlockedProtocol, getUnlockedProtocolIds } from '../mods/modBalance.ts';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { MOD_FOCUS_LABELS, RUN_CONTRACTS } from '../economy/economyBalance.ts';
import { getRunSetupCost } from '../economy/EconomyService.ts';
import type { RunSetupSelection } from '../economy/types.ts';
import { formatWeeklyCountdown, type WeeklyOperationDeck, type WeeklyOperationDecksSnapshot, type WeeklyOperationsSnapshot } from '../progression/WeeklyOperations.ts';
import { TutorialDirector } from '../tutorial/TutorialDirector.ts';
import { TutorialEventBus } from '../tutorial/TutorialEventBus.ts';
import { completeFirstRunTeachingRound } from '../tutorial/TutorialProgress.ts';
import { projectTutorialBoundsToViewport } from '../tutorial/TutorialTargeting.ts';

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

// Phaser applies the display origin after measuring polygon geometry. Keeping
// points inside positive local bounds makes x/y the true visual center.
const createChamferedFramePoints = (width: number, height: number, cut: number): number[] => [
  cut, 0,
  width - cut, 0,
  width, cut,
  width, height - cut,
  width - cut, height,
  cut, height,
  0, height - cut,
  0, cut
];

const createCenteredHexagonPoints = (radius: number): number[] => {
  const points: number[] = [];
  for (let point = 0; point < 6; point += 1) {
    const angle = Math.PI / 3 * point - Math.PI / 2;
    points.push((Math.cos(angle) + 1) * radius, (Math.sin(angle) + 1) * radius);
  }
  return points;
};

interface MainMenuLaunchData {
  /** Set only by successful creation of a brand-new local profile. */
  showFirstRunWelcome?: boolean;
}

export class MainMenuScene extends Phaser.Scene {
  private readonly audio = AudioManager.get();
  private tutorialDirector: TutorialDirector | null = null;
  private operationDeck: WeeklyOperationDeck = 'regular';
  private readonly handleResize = (): void => { this.scene.restart(); };

  constructor() {
    super(SceneKeys.MainMenu);
  }

  preload(): void {
    if (!this.textures.exists('main-menu-background')) {
      this.load.image('main-menu-background', mainMenuBackgroundUrl);
    }
  }

  create(data: MainMenuLaunchData = {}): void {
    this.audio.startMusicLoop();
    const { width, height } = this.scale;
    if (this.scene.isActive(SceneKeys.Arena) || this.scene.isPaused(SceneKeys.Arena)) this.scene.stop(SceneKeys.Arena);
    this.registry.remove('arena-session');
    RunTransitionManager.clearForMenu(this);

    this.createStaticBackground(width, height);
    this.createBranding(width, height);

    const profile = SaveSystem.getActiveProfileSummary();
    if (profile) {
      // Repair profiles already stranded by the previous completion guard.
      // A persisted completed round proves that this first-run deployment
      // succeeded, so Main Menu must continue at Store—not START LOCAL.
      if (SaveSystem.getTutorialProgress().firstRunStage === 'arena-teaching' && profile.roundsCompleted > 0) {
        SaveSystem.updateTutorialProgress((progress) => { completeFirstRunTeachingRound(progress); });
      }
    }
    const requestedProtocol = profile ? SaveSystem.getPreferredProtocol() : 'normal';
    const protocol = profile && SaveSystem.getHighestRound() >= RUN_PROTOCOLS[requestedProtocol].unlockHighestRound
      ? requestedProtocol
      : 'normal';
    const protocolDefinition = RUN_PROTOCOLS[protocol];
    const equippedMods = profile ? new ModRuntime(SaveSystem.getModCollection()).snapshot() : [];
    const narrow = width < 1120;
    const short = height < 900;
    const tiny = height < 680;
    const centerX = narrow ? width * 0.34 : width * 0.5;

    const onlineStatus = this.add.text(centerX, tiny ? 75 : short ? 108 : 148, profile ? 'CHECKING ONLINE IDENTITY...' : 'CREATE A LOCAL PROFILE TO START', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${tiny ? 13 : short ? 16 : 19}px`, color: '#9fc8d8', fontStyle: 'bold', align: 'center', letterSpacing: 1
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

    const briefingWidth = Phaser.Math.Clamp(width * (narrow ? 0.34 : 0.2), narrow ? (width < 750 ? 240 : 280) : 330, narrow ? 390 : 400);
    const briefingX = width - Math.max(12, width * 0.018) - briefingWidth / 2;
    const briefingTop = tiny ? 58 : short ? 78 : 96;
    const briefingHeight = Math.max(300, Math.min(short ? 600 : 680, height - briefingTop - 18));
    this.createOperativeBriefing(briefingX, briefingTop, briefingWidth, briefingHeight, profile?.name ?? null);

    const unlockedProtocols = profile ? getUnlockedProtocolIds(SaveSystem.getHighestRound()) : ['normal'] as const;
    const protocolY = tiny ? 128 : short ? 177 : 235;
    const protocolArrowWidth = tiny ? 42 : short ? 50 : 58;
    const protocolGap = tiny ? 7 : 10;
    const protocolWidth = Phaser.Math.Clamp(width * (narrow ? 0.35 : 0.21), narrow ? 220 : 340, narrow ? 390 : 410);
    const protocolHeight = tiny ? 42 : short ? 54 : 68;
    const protocolArrowOffset = protocolWidth / 2 + protocolGap + protocolArrowWidth / 2;
    this.add.text(centerX, protocolY - protocolHeight / 2 - (tiny ? 14 : short ? 18 : 22), 'DEPLOYMENT PROTOCOL', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${tiny ? 11 : short ? 14 : 17}px`, color: '#78ddeb', letterSpacing: 2
    }).setOrigin(0.5).setDepth(21);

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

    this.createProtocolChassis(centerX, protocolY, protocolWidth + protocolArrowWidth * 2 + protocolGap * 4, protocolHeight + (tiny ? 12 : 18));
    const protocolButton = this.createCommandButton(centerX, protocolY, `${protocolDefinition.label}\nSTART ROUND ${protocolDefinition.startingRound}`, () => selectProtocol(1), protocolWidth, protocolHeight, 'protocol', 'menu', tiny ? 13 : short ? 16 : 19);
    const previousProtocolButton = this.createCommandButton(centerX - protocolArrowOffset, protocolY, '<', () => selectProtocol(-1), protocolArrowWidth, protocolHeight, 'selector', 'menu', tiny ? 16 : 21);
    const nextProtocolButton = this.createCommandButton(centerX + protocolArrowOffset, protocolY, '>', () => selectProtocol(1), protocolArrowWidth, protocolHeight, 'selector', 'menu', tiny ? 16 : 21);
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
    const readoutY = tiny ? 164 : short ? 218 : 290;
    const readoutWidth = protocolWidth + (tiny ? 70 : 130);
    this.add.rectangle(centerX, readoutY, readoutWidth, tiny ? 23 : 30, 0x06131f, 0.9)
      .setStrokeStyle(1, setupCost > 0 ? 0xffbf63 : 0x3bb9c9, 0.48);
    this.add.rectangle(centerX - readoutWidth / 2 + 6, readoutY, 3, tiny ? 13 : 18, setupCost > 0 ? 0xffc56d : 0x6fffc1, 0.9);
    this.add.text(centerX, readoutY, setupSummary, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${tiny ? 10 : short ? 13 : 15}px`, color: setupCost > 0 ? '#ffd287' : '#9ae8f1', align: 'center', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5).setWordWrapWidth(readoutWidth - 24, true).setMaxLines(1);

    const menuStartY = tiny ? 202 : short ? 268 : 356;
    const menuRowGap = tiny ? 38 : short ? 49 : 62;
    const singleButtonWidth = Phaser.Math.Clamp(width * (narrow ? 0.42 : 0.23), narrow && width < 750 ? 250 : 330, 450);
    const menuButtonHeight = tiny ? 32 : short ? 41 : 52;

    const startButton = this.createCommandButton(centerX, menuStartY, 'DEPLOY ONLINE', () => {
      if (!profile) {
        this.scene.start(SceneKeys.LocalProfiles);
        return;
      }
      if (!this.allowTeachingMenuAction('online', onlineStatus)) return false;
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
    }, singleButtonWidth, menuButtonHeight + 2, 'primary', 'runStart', tiny ? 15 : short ? 18 : 21);

    const localStartButton = this.createCommandButton(centerX, menuStartY + menuRowGap, 'START LOCAL', () => {
      if (!profile) {
        this.scene.start(SceneKeys.LocalProfiles);
        return;
      }
      if (!this.allowTeachingMenuAction('local', onlineStatus)) return false;
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
      this.confirmLocalTeachingSelection();
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
    }, singleButtonWidth, menuButtonHeight, 'secondary', 'runStart', tiny ? 14 : short ? 17 : 20);

    const navFontSize = tiny ? 14 : short ? 16 : 19;
    const garageButton = this.createCommandButton(centerX, menuStartY + menuRowGap * 2, 'OPERATOR GARAGE', () => {
      if (!this.allowTeachingMenuAction('garage', onlineStatus)) return false;
      TutorialEventBus.emit('ui.garageSelected');
      TutorialEventBus.emit('ui.garageOpened');
      this.scene.start(SceneKeys.Garage, { returnScene: SceneKeys.MainMenu });
      return true;
    }, singleButtonWidth, menuButtonHeight, 'navigation', 'menu', navFontSize);
    this.createCommandButton(centerX, menuStartY + menuRowGap * 3, 'MOD COLLECTION', () => {
      if (!this.allowTeachingMenuAction('mods', onlineStatus)) return false;
      this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.MainMenu, resumePausedScene: false });
      return true;
    }, singleButtonWidth, menuButtonHeight, 'navigation', 'menu', navFontSize);
    const storeButton = this.createCommandButton(centerX, menuStartY + menuRowGap * 4, 'STORE', () => {
      if (!this.allowTeachingMenuAction('store', onlineStatus)) return false;
      TutorialEventBus.emit('ui.storeSelected');
      TutorialEventBus.emit('ui.storeOpened');
      this.scene.start(SceneKeys.Upgrades, {
        returnScene: SceneKeys.MainMenu,
        resumePausedScene: false
      });
      return true;
    }, singleButtonWidth, menuButtonHeight, 'navigation', 'menu', navFontSize);
    this.createCommandButton(centerX, menuStartY + menuRowGap * 5, 'LEADERBOARDS', () => {
      if (!this.allowTeachingMenuAction('other', onlineStatus)) return false;
      this.scene.start(SceneKeys.OnlineLeaderboards);
      return true;
    }, singleButtonWidth, menuButtonHeight, 'navigation', 'menu', navFontSize);
    this.createCommandButton(centerX, menuStartY + menuRowGap * 6, 'OPTIONS', () => {
      if (!this.allowTeachingMenuAction('other', onlineStatus)) return false;
      this.scene.start(SceneKeys.Options, { returnScene: SceneKeys.MainMenu, resumeGameplay: false });
      return true;
    }, singleButtonWidth, menuButtonHeight, 'navigation', 'menu', navFontSize);

    const lastMenuY = menuStartY + menuRowGap * 6;
    const tipBottom = Math.min(height - 22, lastMenuY + (tiny ? 82 : short ? 124 : 154));
    this.createTipRotator(centerX, Math.min(singleButtonWidth + (tiny ? 70 : 150), narrow ? width * 0.68 : 760), lastMenuY + (tiny ? 24 : short ? 38 : 50), tipBottom);
    const storageMessage = SaveSystem.getStorageMessage();
    if (storageMessage && tipBottom < height - 28) {
      this.add.text(centerX, Math.min(height - 12, tipBottom + 16), storageMessage, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#ff9aa8', align: 'center',
        wordWrap: { width: singleButtonWidth + 100, useAdvancedWrap: true }
      }).setOrigin(0.5).setMaxLines(1);
    }
    this.scale.off('resize', this.handleResize, this);
    this.scale.on('resize', this.handleResize, this);
    const tutorialTargets = new Map<string, Phaser.GameObjects.Container>([
      ['menu.start-local', localStartButton],
      ['menu.store', storeButton],
      ['menu.garage', garageButton]
    ]);
    this.tutorialDirector = new TutorialDirector({
      scene: 'menu',
      resolveTarget: (target) => {
        const bounds = tutorialTargets.get(target)?.getBounds();
        if (!bounds) return null;
        const canvas = this.game.canvas.getBoundingClientRect();
        return projectTutorialBoundsToViewport(bounds, canvas, this.scale.width, this.scale.height);
      },
      setMode: () => undefined
    });
    // Fresh profile creation is an authoritative onboarding entry point. The
    // persisted pending flag still handles reloads/restarts, while this launch
    // signal guarantees that the greeting is presented on the handoff itself.
    if (data.showFirstRunWelcome) this.tutorialDirector.replay('onboarding.menu-welcome');
    else this.tutorialDirector.startEligible();
    window.setTimeout(() => {
      if (!this.scene.isActive()) return;
      const briefing = SaveSystem.getInitialDeploymentBriefingState();
      if (briefing.seen && SaveSystem.get().settings.contextualTutorials) TutorialEventBus.emit('progression.firstFailure');
      const collection = SaveSystem.getModCollection();
      if (Object.values(collection.inventory).some((entry) => entry.discovered)) TutorialEventBus.emit('progression.firstModOwned');
    }, 250);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
      this.tutorialDirector?.destroy();
      this.tutorialDirector = null;
    });
  }

  private allowTeachingMenuAction(
    action: 'local' | 'online' | 'store' | 'garage' | 'mods' | 'other',
    status: Phaser.GameObjects.Text
  ): boolean {
    const stage = SaveSystem.getTutorialProgress().firstRunStage;
    if (stage === 'complete') return true;
    const allowed = stage === 'waiting-for-start-local' || stage === 'arena-teaching'
      ? action === 'local'
      : stage === 'waiting-for-store' || stage === 'store-teaching'
        ? action === 'store'
        : stage === 'waiting-for-garage' || stage === 'garage-teaching'
          ? action === 'garage'
          : stage === 'mod-collection-teaching'
            ? action === 'garage' || action === 'mods'
            : false;
    if (allowed) return true;
    const instruction = stage === 'welcome-main-menu'
      ? 'READ THE WELCOME BRIEFING, THEN SELECT NEXT.'
      : stage === 'waiting-for-start-local' || stage === 'arena-teaching'
        ? 'TRAINING LINK ACTIVE // SELECT START LOCAL.'
        : stage === 'waiting-for-store' || stage === 'store-teaching'
          ? 'TEACHING LINK ACTIVE // SELECT STORE.'
          : 'TEACHING LINK ACTIVE // SELECT OPERATOR GARAGE.';
    status.setText(instruction).setColor('#ffbd85');
    return false;
  }

  private confirmLocalTeachingSelection(): void {
    const stage = SaveSystem.getTutorialProgress().firstRunStage;
    if ((stage === 'waiting-for-start-local' || stage === 'arena-teaching')
      && this.tutorialDirector?.awaits('ui.startLocalSelected')) {
      TutorialEventBus.emit('ui.startLocalSelected');
    }
  }

  private createCommandButton(
    x: number,
    y: number,
    label: string,
    onClick: () => unknown,
    width: number,
    height: number,
    style: 'primary' | 'secondary' | 'navigation' | 'protocol' | 'selector',
    sound: 'menu' | 'runStart' = 'menu',
    fontSize = 18
  ): Phaser.GameObjects.Container {
    const accent = style === 'primary' || style === 'protocol' ? 0x62f4ff : style === 'secondary' ? 0xff68cf : 0x46c6dc;
    const outerWidth = width + (style === 'primary' ? 16 : 10);
    const outerHeight = height + (style === 'primary' ? 14 : 10);
    const cut = Math.min(12, outerHeight * 0.24);
    const points = createChamferedFramePoints(outerWidth, outerHeight, cut);
    const housing = this.add.container(x, y).setDepth(22);
    const shadow = this.add.polygon(4, 5, points, 0x000000, 0.5);
    const chassis = this.add.polygon(0, 0, points, style === 'primary' ? 0x0c2638 : 0x091521, 0.96)
      .setStrokeStyle(style === 'primary' ? 2 : 1, accent, style === 'primary' ? 0.72 : 0.48);
    const underlight = this.add.rectangle(0, outerHeight / 2 - 2, outerWidth - cut * 2, 3, accent, style === 'primary' ? 0.62 : 0.28);
    housing.add([shadow, chassis, underlight]);
    if (style === 'primary' || style === 'protocol') {
      this.tweens.add({ targets: chassis, alpha: { from: 0.78, to: 1 }, duration: style === 'primary' ? 1100 : 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    const button = createButton(this, x, y, label, onClick, width, sound, { height, fontSize, horizontalPadding: 34 }).setDepth(24);
    const overlay = this.add.container(x, y).setDepth(25);
    const topEdge = this.add.rectangle(0, -height / 2 + 2, width - 22, 2, 0xb7fbff, style === 'primary' ? 0.6 : 0.28);
    const leftRail = this.add.rectangle(-width / 2 + 5, 0, 3, Math.max(10, height - 19), accent, 0.42);
    const rightRail = this.add.rectangle(width / 2 - 5, 0, 2, Math.max(10, height - 23), accent, 0.24);
    const led = this.add.circle(-width / 2 + 13, 0, style === 'selector' ? 2 : 2.5, accent, 0.9);
    const sweep = this.add.rectangle(-width / 2 + 20, 0, 2, Math.max(8, height - 16), 0xffffff, style === 'primary' ? 0.2 : 0.08);
    overlay.add([topEdge, leftRail, rightRail, led, sweep]);
    setButtonJiggleTargets(button, [housing, button, overlay]);
    this.tweens.add({ targets: led, alpha: { from: 0.25, to: 1 }, duration: 780, yoyo: true, repeat: -1 });
    this.tweens.add({
      targets: sweep,
      x: width / 2 - 20,
      alpha: { from: 0.03, to: style === 'primary' ? 0.28 : 0.12 },
      duration: style === 'primary' ? 1450 : 2600,
      delay: Phaser.Math.Between(0, 900),
      repeat: -1,
      repeatDelay: style === 'primary' ? 800 : 1900,
      ease: 'Sine.easeInOut'
    });
    return button;
  }

  private createProtocolChassis(x: number, y: number, width: number, height: number): void {
    const cut = Math.min(18, height * 0.28);
    const points = createChamferedFramePoints(width, height, cut);
    this.add.polygon(x + 5, y + 7, points, 0x000000, 0.52).setDepth(17);
    const plate = this.add.polygon(x, y, points, 0x07131f, 0.92).setStrokeStyle(2, 0x26768d, 0.6).setDepth(18);
    this.add.rectangle(x, y - height / 2 + 4, width - cut * 2, 3, 0x55efff, 0.35).setDepth(19);
    this.add.rectangle(x - width / 2 + 7, y, 3, height - cut * 1.7, 0xff5bcf, 0.36).setDepth(19);
    this.add.rectangle(x + width / 2 - 7, y, 3, height - cut * 1.7, 0x55efff, 0.36).setDepth(19);
    this.tweens.add({ targets: plate, alpha: { from: 0.78, to: 1 }, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private createBranding(width: number, height: number): void {
    const tiny = height < 680;
    const short = height < 900;
    const y = tiny ? 8 : short ? 17 : 28;
    const size = tiny ? 28 : short ? 40 : Phaser.Math.Clamp(width * 0.031, 48, 58);
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
    this.add.text(width / 2, y + size + (tiny ? -1 : 3), GAME_TAGLINE, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${tiny ? 14 : short ? 19 : 23}px`, color: '#f8c7f9', letterSpacing: 1
    }).setOrigin(0.5, 0);
    const rail = this.add.rectangle(width / 2, y + size + (tiny ? 23 : short ? 32 : 43), Math.min(560, width * 0.46), 2, 0x55efff, 0.34);
    this.tweens.add({ targets: title, alpha: { from: 0.82, to: 1 }, duration: 2300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: [cyanGhost, pinkGhost], x: '+=1', alpha: { from: 0.1, to: 0.3 }, duration: 1650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: rail, scaleX: { from: 0.76, to: 1 }, alpha: { from: 0.2, to: 0.55 }, duration: 1800, yoyo: true, repeat: -1 });
  }

  private createOperativeBriefing(x: number, top: number, panelWidth: number, panelHeight: number, profileName: string | null): void {
    const root = this.add.container(x + 24, top).setDepth(30).setAlpha(0);
    const dense = panelWidth < 330 || panelHeight < 500;
    const spacious = panelWidth >= 390 && panelHeight >= 580;
    const cut = dense ? 10 : 17;
    const halfW = panelWidth / 2;
    const halfH = panelHeight / 2;
    const framePoints = createChamferedFramePoints(panelWidth, panelHeight, cut);
    const shadow = this.add.polygon(6, halfH + 8, framePoints, 0x000000, 0.62);
    const chassis = this.add.polygon(0, halfH, framePoints, 0x08111b, 0.99).setStrokeStyle(2, 0x3caec4, 0.78);
    const innerGlass = this.add.rectangle(0, 10, panelWidth - 24, panelHeight - 20, 0x081a27, 0.88)
      .setOrigin(0.5, 0).setStrokeStyle(1, 0x7af5ff, 0.25);
    const scanlines = this.add.grid(0, 12, panelWidth - 28, panelHeight - 24, panelWidth, dense ? 7 : 9, 0x000000, 0, 0x63efff, 0.026)
      .setOrigin(0.5, 0);
    const leftMount = this.add.rectangle(-halfW - 5, halfH, 10, panelHeight * 0.52, 0x101e2b, 0.95).setStrokeStyle(1, 0xff5bcf, 0.36);
    const rightMount = this.add.rectangle(halfW + 5, halfH, 10, panelHeight * 0.52, 0x101e2b, 0.95).setStrokeStyle(1, 0x55efff, 0.36);
    const topRail = this.add.rectangle(0, 5, panelWidth - cut * 2, 4, 0x65f4ff, 0.48);
    const magentaRail = this.add.rectangle(-halfW + 8, halfH, 3, panelHeight - cut * 3, 0xff5bcf, 0.42);
    const headerHeight = dense ? 98 : 122;
    const header = this.add.rectangle(0, 14, panelWidth - 30, headerHeight, 0x0b2130, 0.96)
      .setOrigin(0.5, 0).setStrokeStyle(1, 0x59eaff, 0.5);
    const headerInset = this.add.rectangle(0, 18, panelWidth - 40, 3, 0xff5bcf, 0.42).setOrigin(0.5, 0);
    const welcome = this.add.text(-halfW + (dense ? 22 : 28), dense ? 28 : 30, profileName ? `WELCOME, OPERATIVE ${profileName.toUpperCase()}` : 'OPERATIVE BRIEFING', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${dense ? 11 : spacious ? 17 : 15}px`, color: '#86f8ff', fontStyle: 'bold'
    }).setOrigin(0, 0).setWordWrapWidth(panelWidth - (dense ? 44 : 56), true).setMaxLines(1);
    const operationsHeading = this.add.text(-halfW + (dense ? 22 : 28), dense ? 49 : 57, 'WEEKLY OPERATIONS // MISSION DECK', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 10 : spacious ? 16 : 14}px`, color: '#ff9ddd', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0);
    const sync = this.add.text(halfW - (dense ? 18 : 24), dense ? 50 : 61, 'DATA SYNC', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 8 : 11}px`, color: '#70dbe8', letterSpacing: 1
    }).setOrigin(1, 0);
    root.add([shadow, chassis, leftMount, rightMount, innerGlass, scanlines, topRail, magentaRail, header, headerInset, welcome, operationsHeading, sync]);
    for (const side of [-1, 1]) {
      for (const screwY of [13, panelHeight - 13]) {
        root.add(this.add.circle(side * (halfW - 12), screwY, dense ? 2 : 3, side < 0 ? 0xff5bcf : 0x55efff, 0.75));
      }
    }

    if (!profileName) {
      root.add(this.add.rectangle(0, panelHeight * 0.48, panelWidth - 54, dense ? 94 : 128, 0x07131f, 0.92).setStrokeStyle(1, 0x6adfee, 0.35));
      root.add(this.add.text(0, panelHeight * 0.48, 'PROFILE LINK REQUIRED\nSELECT AN OPERATIVE TO RECEIVE WEEKLY OPERATIONS', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 13 : 18}px`, color: '#9fcbd8', align: 'center', lineSpacing: 8,
        wordWrap: { width: panelWidth - 70, useAdvancedWrap: true }
      }).setOrigin(0.5));
      this.tweens.add({ targets: root, x, alpha: 1, duration: 420, ease: 'Sine.easeOut' });
      return;
    }

    let snapshots: WeeklyOperationDecksSnapshot;
    try {
      snapshots = SaveSystem.getWeeklyOperations();
    } catch {
      root.add(this.add.rectangle(0, panelHeight * 0.48, panelWidth - 54, dense ? 94 : 128, 0x21101a, 0.82).setStrokeStyle(1, 0xff6e9d, 0.55));
      root.add(this.add.text(0, panelHeight * 0.48, 'WEEKLY OPERATIONS\nDATA LINK UNAVAILABLE', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 14 : 20}px`, color: '#ffaeaf', align: 'center', lineSpacing: 9, fontStyle: 'bold'
      }).setOrigin(0.5));
      this.tweens.add({ targets: root, x, alpha: 1, duration: 420, ease: 'Sine.easeOut' });
      return;
    }

    const snapshot: WeeklyOperationsSnapshot = snapshots[this.operationDeck];
    if (snapshot.complete) operationsHeading.setText('WEEKLY OPERATIONS // COMPLETE').setColor('#77ffad');
    const selectorY = dense ? 83 : 101;
    const arrowWidth = dense ? 30 : 38;
    const arrowHeight = dense ? 21 : 27;
    const arrowOffset = dense ? 82 : 112;
    const switchDeck = (direction: -1 | 1): boolean => {
      this.operationDeck = direction < 0
        ? (this.operationDeck === 'regular' ? 'overdrive' : 'regular')
        : (this.operationDeck === 'overdrive' ? 'regular' : 'overdrive');
      this.scene.restart();
      return true;
    };
    const previousDeck = createButton(this, -arrowOffset, selectorY, '<', () => switchDeck(-1), arrowWidth, 'menu', { height: arrowHeight, fontSize: dense ? 12 : 16, horizontalPadding: 4 });
    const nextDeck = createButton(this, arrowOffset, selectorY, '>', () => switchDeck(1), arrowWidth, 'menu', { height: arrowHeight, fontSize: dense ? 12 : 16, horizontalPadding: 4 });
    const deckLabel = this.add.text(0, selectorY, this.operationDeck === 'regular' ? 'REGULAR CHALLENGES' : 'OVERDRIVE CHALLENGES', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${dense ? 8 : spacious ? 12 : 10}px`,
      color: this.operationDeck === 'regular' ? '#8cebf7' : '#ffb15c', fontStyle: 'bold', letterSpacing: dense ? 0 : 1
    }).setOrigin(0.5);
    root.add([previousDeck, nextDeck, deckLabel]);
    const rewardHeight = dense ? 76 : 104;
    const footerHeight = dense ? 25 : 34;
    const objectiveTop = headerHeight + (dense ? 24 : 34);
    const objectiveBottom = panelHeight - rewardHeight - footerHeight - (dense ? 12 : 18);
    const rowGap = dense ? 7 : 11;
    const rowHeight = (objectiveBottom - objectiveTop - rowGap * 2) / Math.max(1, snapshot.objectives.length);
    const cardWidth = panelWidth - (dense ? 30 : 42);
    snapshot.objectives.forEach((objective, index) => {
      const cardTop = objectiveTop + index * (rowHeight + rowGap);
      const cardCenterY = cardTop + rowHeight * 0.5;
      const accent = objective.complete ? 0x72ffac : 0x52eaff;
      const card = this.add.rectangle(0, cardTop, cardWidth, rowHeight, objective.complete ? 0x0b291f : 0x091824, objective.complete ? 0.78 : 0.88)
        .setOrigin(0.5, 0).setStrokeStyle(1, accent, objective.complete ? 0.68 : 0.34);
      const leftEdge = this.add.rectangle(-cardWidth / 2 + 3, cardCenterY, 4, Math.max(8, rowHeight - 12), accent, objective.complete ? 0.78 : 0.42);
      root.add([card, leftEdge]);

      const iconRadius = Math.max(10, Math.min(spacious ? 21 : 17, rowHeight * 0.25));
      const iconX = -cardWidth / 2 + (dense ? 25 : 34);
      const hexPoints = createCenteredHexagonPoints(iconRadius);
      const iconHalo = this.add.circle(iconX, cardCenterY, iconRadius + (dense ? 4 : 7), accent, objective.complete ? 0.12 : 0.045);
      const icon = this.add.polygon(iconX, cardCenterY, hexPoints, objective.complete ? 0x163c2b : 0x102838, 0.98)
        .setStrokeStyle(2, accent, objective.complete ? 0.95 : 0.62);
      const iconText = this.add.text(iconX, cardCenterY, objective.complete ? '\u2713' : String(index + 1).padStart(2, '0'), {
        fontFamily: objective.complete ? 'Rajdhani, sans-serif' : 'Orbitron, sans-serif',
        fontSize: `${dense ? 10 : objective.complete ? 20 : 11}px`, color: objective.complete ? '#c8ffdb' : '#8cebf7', fontStyle: 'bold'
      }).setOrigin(0.5);
      root.add([iconHalo, icon, iconText]);
      if (objective.complete) {
        this.tweens.add({ targets: [iconHalo, icon], alpha: { from: 0.5, to: 1 }, scale: { from: 0.94, to: 1.06 }, duration: 1200 + index * 110, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }

      const contentLeft = -cardWidth / 2 + (dense ? 47 : 66);
      const contentRight = cardWidth / 2 - (dense ? 10 : 16);
      root.add(this.add.text(contentLeft, cardTop + (dense ? 6 : 11), objective.title.toUpperCase(), {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 10 : spacious ? 17 : 14}px`, color: objective.complete ? '#b6ffd1' : '#e0faff', fontStyle: 'bold', letterSpacing: dense ? 0 : 1
      }).setOrigin(0, 0).setWordWrapWidth(contentRight - contentLeft, true).setMaxLines(1));
      root.add(this.add.text(contentRight, cardTop + (dense ? 22 : 34), objective.complete ? 'COMPLETE' : `${objective.current.toLocaleString()} / ${objective.target.toLocaleString()}`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 9 : spacious ? 15 : 12}px`, color: objective.complete ? '#75ffad' : '#a9d3df', fontStyle: 'bold'
      }).setOrigin(1, 0));

      const ratio = Math.min(1, objective.current / objective.target);
      const barY = cardTop + rowHeight - (dense ? 10 : 16);
      const barWidth = contentRight - contentLeft;
      const trackOuter = this.add.rectangle(contentLeft, barY, barWidth, dense ? 7 : 11, 0x02070b, 0.94).setOrigin(0, 0.5).setStrokeStyle(1, 0x315a69, 0.65);
      const trackInner = this.add.rectangle(contentLeft + 2, barY, Math.max(2, barWidth - 4), dense ? 3 : 5, 0x102a36, 1).setOrigin(0, 0.5);
      const fillGlow = this.add.rectangle(contentLeft + 2, barY, Math.max(2, (barWidth - 4) * ratio), dense ? 7 : 10, accent, 0.16).setOrigin(0, 0.5);
      const fill = this.add.rectangle(contentLeft + 2, barY, Math.max(2, (barWidth - 4) * ratio), dense ? 3 : 5, accent, 0.96).setOrigin(0, 0.5);
      fill.setScale(0, 1);
      fillGlow.setScale(0, 1);
      root.add([trackOuter, trackInner, fillGlow, fill]);
      for (let segment = 1; segment < 8; segment += 1) {
        root.add(this.add.rectangle(contentLeft + barWidth * segment / 8, barY, 1, dense ? 5 : 9, 0x061018, 0.72));
      }
      this.tweens.add({ targets: [fill, fillGlow], scaleX: 1, duration: 520 + index * 120, delay: 160 + index * 90, ease: 'Sine.easeOut' });
    });

    const rewardTop = panelHeight - rewardHeight - footerHeight;
    const rewardPlate = this.add.rectangle(0, rewardTop, panelWidth - (dense ? 30 : 42), rewardHeight - (dense ? 6 : 10), snapshot.complete ? 0x0d291f : 0x1b1524, 0.94)
      .setOrigin(0.5, 0).setStrokeStyle(1, snapshot.complete ? 0x72ffac : 0xff65cf, 0.58);
    const rewardRail = this.add.rectangle(0, rewardTop + 3, panelWidth - (dense ? 48 : 64), 3, snapshot.complete ? 0x72ffac : 0xff65cf, 0.62).setOrigin(0.5, 0);
    root.add([rewardPlate, rewardRail]);
    root.add(this.add.text(0, rewardTop + (dense ? 9 : 14), snapshot.complete && snapshot.rewardClaimed
      ? `${this.operationDeck.toUpperCase()} REWARD // ACQUIRED`
      : `${this.operationDeck.toUpperCase()} COMPLETION REWARD`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${dense ? 9 : spacious ? 14 : 12}px`, color: snapshot.complete ? '#78ffae' : '#ff9bda', fontStyle: 'bold'
    }).setOrigin(0.5, 0));
    const primaryReward = `${snapshot.reward.credits.toLocaleString()} CREDITS  +  ${snapshot.reward.coreTokens} CORE TOKEN${snapshot.reward.coreTokens === 1 ? '' : 'S'}`;
    const bonusRewardParts = [
      snapshot.reward.plasmaChips ? `${snapshot.reward.plasmaChips} PLASMA` : '',
      snapshot.reward.fluxCores ? `${snapshot.reward.fluxCores} FLUX CORES` : '',
      snapshot.reward.randomMod ? 'RANDOM MOD' : ''
    ].filter(Boolean);
    const rewardText = [primaryReward, bonusRewardParts.join('  +  ')].filter(Boolean).join('\n');
    root.add(this.add.text(0, rewardTop + (dense ? 28 : 40), rewardText, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 10 : spacious ? 16 : 14}px`, color: '#ffd287',
      fontStyle: 'bold', letterSpacing: dense ? 0 : 1, align: 'center', lineSpacing: dense ? 0 : 2,
      wordWrap: { width: panelWidth - (dense ? 42 : 58), useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2));
    const countdown = this.add.text(0, panelHeight - footerHeight / 2 - 2, formatWeeklyCountdown(snapshot.endsAt), {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${dense ? 10 : spacious ? 15 : 13}px`, color: '#9cd5df', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0.5);
    root.add(countdown);
    this.time.addEvent({
      delay: 60_000,
      loop: true,
      callback: () => {
        if (countdown.active) countdown.setText(formatWeeklyCountdown(snapshot.endsAt));
      }
    });
    const dataSweep = this.add.rectangle(-halfW + 20, 12, 2, panelHeight - 24, 0x8cf7ff, 0.08).setOrigin(0.5, 0);
    root.add(dataSweep);
    this.tweens.add({ targets: dataSweep, x: halfW - 20, alpha: { from: 0.02, to: 0.14 }, duration: 3400, repeat: -1, repeatDelay: 2400, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: sync, alpha: { from: 0.24, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: topRail, alpha: { from: 0.28, to: 0.7 }, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: root, x, alpha: 1, duration: 420, ease: 'Sine.easeOut' });
  }

  private createTipRotator(centerX: number, panelWidth: number, availableTop: number, availableBottom: number): void {
    const availableHeight = availableBottom - availableTop;
    if (availableHeight < 38) return;
    const compact = panelWidth < 400 || availableHeight < 72;
    const panelHeight = Math.min(compact ? 58 : 82, availableHeight);
    const y = (availableTop + availableBottom) / 2;
    const cut = Math.min(12, panelHeight * 0.22);
    const framePoints = createChamferedFramePoints(panelWidth, panelHeight, cut);
    this.add.polygon(centerX + 4, y + 5, framePoints, 0x000000, 0.48).setDepth(13);
    const panel = this.add.polygon(centerX, y, framePoints, 0x07131f, 0.92)
      .setStrokeStyle(1, 0x58f4ff, 0.5).setDepth(14);
    this.add.rectangle(centerX, y, panelWidth - 18, panelHeight - 14, 0x0a1a27, 0.7)
      .setStrokeStyle(1, 0xff5bcf, 0.14).setDepth(14);
    this.add.rectangle(centerX, y - panelHeight / 2 + 3, panelWidth - cut * 2, 3, 0x58f4ff, 0.45).setDepth(15);
    this.add.rectangle(centerX - panelWidth / 2 + 5, y, 3, panelHeight - cut * 1.6, 0xff5bcf, 0.5).setDepth(15);
    const intelLed = this.add.circle(centerX - panelWidth / 2 + (compact ? 18 : 24), y - panelHeight / 2 + (compact ? 13 : 17), compact ? 2 : 3, 0x78ffbd, 0.9).setDepth(16);
    let currentTip = Phaser.Math.Between(0, MAIN_MENU_TIPS.length - 1);
    const tipText = this.add.text(centerX, y + (compact ? 7 : 10), MAIN_MENU_TIPS[currentTip], {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: compact ? '14px' : '18px',
      fontStyle: 'bold',
      color: '#f4d5ff',
      align: 'center',
      lineSpacing: compact ? 1 : 3
    }).setOrigin(0.5).setWordWrapWidth(panelWidth - (compact ? 36 : 54), true).setMaxLines(2).setDepth(16);
    this.add.text(centerX - panelWidth / 2 + (compact ? 27 : 36), y - panelHeight / 2 + (compact ? 7 : 9), 'OPERATIVE INTEL // LIVE FEED', {
      fontFamily: 'Orbitron, sans-serif', fontSize: compact ? '8px' : '11px', color: '#62efff', letterSpacing: 1
    }).setOrigin(0, 0).setDepth(16);
    const scan = this.add.rectangle(centerX - panelWidth / 2 + 18, y, 2, panelHeight - 20, 0xa8fbff, 0.08).setDepth(15);

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
    this.tweens.add({ targets: intelLed, alpha: { from: 0.28, to: 1 }, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: scan, x: centerX + panelWidth / 2 - 18, alpha: { from: 0.02, to: 0.13 }, duration: 3200, repeat: -1, repeatDelay: 2200, ease: 'Sine.easeInOut' });
  }

  private getRunSetupSelection(): RunSetupSelection {
    return SaveSystem.getNextRunSetupSelection();
  }

  private clearRunSetupSelection(): void {
    SaveSystem.setNextRunSetupSelection({ modFocus: null, contract: null });
  }

  private createStaticBackground(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x03070c, 1).setDepth(-100);
    const background = this.add.image(width / 2, height / 2, 'main-menu-background').setDepth(-99);
    const coverScale = Math.max(width / background.width, height / background.height);
    background.setScale(coverScale);
  }
}
