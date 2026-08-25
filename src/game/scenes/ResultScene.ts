import Phaser from 'phaser';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { OBJECTIVE_CONFIG } from '../config/gameplay';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { RUN_PROTOCOLS, normalizeRunProtocolId } from '../mods/modBalance.ts';
import { protocolStart } from '../mods/ModRules.ts';
import { shouldShowInitialDeploymentBriefing } from '../progression/ProgressionMessaging.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import type { ArenaReward } from '../types';
import { calculateDebriefLayout, splitDebriefPrimary } from '../ui/DebriefLayout.ts';
import {
  createDebriefActions,
  createDebriefHighlight,
  createDebriefShell,
  createOperationReadout,
  createRewardSummary
} from '../ui/DebriefUi.ts';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton } from '../utils/ui';
import { setSceneUiModalDepth } from '../input/UiNavigationController.ts';

const displayId = (value: string | null | undefined): string => value
  ? value.replace(/([A-Z])/g, ' $1').replace(/-/g, ' ').trim().toUpperCase()
  : 'NONE';

const formatRunTime = (durationMs: number | undefined): string => {
  const totalSeconds = Math.max(0, Math.floor((durationMs ?? 0) / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export class ResultScene extends Phaser.Scene {
  private readonly handleResize = (): void => { this.scene.restart(); };

  constructor() {
    super(SceneKeys.Results);
  }

  create(): void {
    setSceneUiModalDepth(this, 0);
    const result = this.registry.get('result') as ArenaReward | undefined;
    const resultProtocol = normalizeRunProtocolId(result?.protocol);
    const { width, height } = this.scale;
    const victory = result?.reason === 'victory';
    const layout = calculateDebriefLayout(width, height);
    const sections = splitDebriefPrimary(layout.primary, layout.compact);
    const roundReached = result?.highestRound ?? result?.round ?? '-';
    const screenTone = victory ? 'success' : 'failed';

    createDebriefShell(this, layout, screenTone, victory ? 'MISSION SUCCESS' : 'MISSION FAILED', `RUN ENDED // ROUND ${roundReached}`);
    createRewardSummary(this, sections.rewards, [
      { kind: 'credits', value: result?.runCreditsEarned ?? result?.credits ?? 0 },
      { kind: 'coreTokens', value: result?.coreTokens ?? 0 },
      { kind: 'plasmaChips', value: result?.plasmaChips ?? 0 },
      { kind: 'fluxCores', value: result?.fluxCores ?? 0 }
    ], layout.compact, true);

    const submissionStatus = OnlineRunManager.lastSubmissionStatus();
    createOperationReadout(this, sections.operation, [
      { label: 'PROTOCOL', value: RUN_PROTOCOLS[resultProtocol].label.toUpperCase() },
      { label: 'CONTRACT', value: displayId(result?.contract) },
      { label: 'SIGNAL', value: displayId(result?.modFocus) },
      { label: 'MODS ACQUIRED', value: String(result?.modsEarned.length ?? 0) },
      { label: 'HIGHEST ROUND', value: String(roundReached) },
      { label: 'COMPLETED SEED', value: String(result?.seed ?? '-') },
      { label: 'RUN TIME', value: formatRunTime(result?.runDurationMs) },
      { label: 'DEPLOYMENT', value: submissionStatus && submissionStatus !== 'local' ? 'ONLINE' : 'LOCAL' }
    ], layout.compact);

    const outcome = result?.reason === 'bombDefused'
      ? { primary: 'BOMB SITE LOST', summary: 'CHARGE DEFUSED BEFORE DETONATION' }
      : result?.reason === 'playerDead'
        ? { primary: 'OPERATIVE ELIMINATED', summary: 'COMBAT FRAME NO LONGER OPERATIONAL' }
        : { primary: 'PAYLOAD DETONATED', summary: 'MISSION OBJECTIVE COMPLETE' };
    const submissionLabel = submissionStatus && submissionStatus !== 'local'
      ? `ONLINE RUN ${submissionStatus.replace(/_/g, ' ').toUpperCase()}`
      : 'LOCAL RUN // NOT SUBMITTED ONLINE';
    createDebriefHighlight(this, sections.highlight, {
      eyebrow: victory ? 'MISSION OUTCOME // VERIFIED' : 'COMBAT DEBRIEF // SETBACK REPORT',
      primary: outcome.primary,
      details: victory
        ? [outcome.summary, submissionLabel]
        : [outcome.summary, submissionLabel, 'PROGRESSION SAVED // RETURN STRONGER'],
      tone: screenTone
    }, layout.compact);

    let replayButton!: Phaser.GameObjects.Container;
    const actions = createDebriefActions(this, layout.actions, [
      {
        label: 'REPLAY LOCAL',
        primary: true,
        onClick: () => {
          OnlineRunManager.beginLocalRun();
          disableButton(replayButton);
          this.registry.remove('round-finished');
          const protocol = resultProtocol;
          const deploymentStart = protocolStart(
            protocol,
            SaveSystem.getHighestRound(),
            SaveSystem.getSupremeHighestRound(),
            SaveSystem.getNormalHighestRound(),
            SaveSystem.hasCompletedRegularOverdrive()
          );
          startArenaLoad(this, {
            reason: 'replay-after-fail',
            session: {
              baseSeed: Phaser.Math.Between(1, 999_999_999),
              round: deploymentStart.startingRound,
              objectiveMode: OBJECTIVE_CONFIG.defaultMode,
              protocol,
              runStartedAt: Date.now(),
              equippedMods: new ModRuntime(SaveSystem.getModCollection(), undefined, protocol).snapshot(),
              modsEarned: [],
              // Paid one-run setup is consumed by the original run. Replay never
              // grants a free Contract or focused Mod signal.
              ...SaveSystem.buildRunEconomySnapshot({ modFocus: null, contract: null }, 0)
            },
            message: 'Rebuilding mission arena...'
          });
        }
      },
      {
        label: 'STORE',
        onClick: () => this.scene.start(SceneKeys.Upgrades, { returnScene: SceneKeys.MainMenu, resumePausedScene: false })
      },
      {
        label: 'MOD COLLECTION',
        onClick: () => this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.MainMenu, resumePausedScene: false })
      },
      {
        label: 'EXPORT GAMEPLAY METRICS',
        onClick: () => GameplayTelemetryRecorder.exportToJsonFile()
      },
      {
        label: 'MAIN MENU',
        warning: !victory,
        onClick: () => {
          RunTransitionManager.clearForMenu(this);
          this.scene.start(SceneKeys.MainMenu);
        }
      }
    ], layout.compact, victory ? 'MISSION ARCHIVE // COMPLETE' : 'ADAPT // UPGRADE // RETURN STRONGER');
    replayButton = actions.get('REPLAY LOCAL')!;

    this.scale.off('resize', this.handleResize, this);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.handleResize, this));

    const briefingState = SaveSystem.getInitialDeploymentBriefingState();
    if (shouldShowInitialDeploymentBriefing(result, briefingState)) {
      SaveSystem.markInitialDeploymentBriefingSeen();
      this.showInitialDeploymentBriefing();
    }
  }

  private showInitialDeploymentBriefing(): void {
    setSceneUiModalDepth(this, 50);
    const { width, height } = this.scale;
    const modalWidth = Math.min(640, width - 32);
    const modalHeight = Math.min(330, height - 32);
    const modalTop = (height - modalHeight) / 2;
    const narrow = modalWidth < 540 || modalHeight < 300;
    const overlay = this.add.container(0, 0).setDepth(1000);
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x02050a, 0.72).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, modalWidth, modalHeight, 0x09131f, 0.99).setStrokeStyle(2, 0x55dff4, 0.92);
    const accent = this.add.rectangle(width / 2, modalTop + 5, modalWidth - 10, 3, 0xff4ed3, 0.82);
    const header = this.add.text(width / 2, modalTop + 24, 'N3ON PROTOCOL // INITIAL DEPLOYMENTS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${narrow ? 15 : 20}px`, color: '#55dff4', align: 'center',
      wordWrap: { width: modalWidth - 44, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
    const divider = this.add.rectangle(width / 2, header.y + header.height + 8, modalWidth - 56, 1, 0x55dff4, 0.38);
    const lead = this.add.text(width / 2, divider.y + 12, 'SURVIVAL IS NOT EXPECTED.\nEVERY DEPLOYMENT MAKES YOU STRONGER.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 17 : 21}px`, color: '#f8b8ff', fontStyle: 'bold', align: 'center', lineSpacing: 2,
      wordWrap: { width: modalWidth - 48, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
    const body = this.add.text(width / 2, lead.y + lead.height + 12, 'EARN CREDITS. UPGRADE YOUR OPERATIVE.\nCOLLECT AND IMPROVE MODS.\nADAPT YOUR BUILD. RETURN STRONGER.', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${narrow ? 15 : 18}px`, color: '#dbfaff', align: 'center', lineSpacing: narrow ? 1 : 3,
      wordWrap: { width: modalWidth - 54, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
    const glitchBars = [
      this.add.rectangle(width / 2 - modalWidth * 0.27, modalTop + modalHeight * 0.36, 76, 2, 0x55dff4, 0.34),
      this.add.rectangle(width / 2 + modalWidth * 0.2, modalTop + modalHeight * 0.61, 54, 2, 0xff4ed3, 0.3)
    ];

    let dismissed = false;
    const dismiss = (): void => {
      if (dismissed) return;
      dismissed = true;
      this.input.keyboard?.off('keydown-ESC', dismiss);
      this.tweens.killTweensOf([header, ...glitchBars]);
      overlay.destroy(true);
      setSceneUiModalDepth(this, 0);
    };
    const continueButton = createButton(this, width / 2, modalTop + modalHeight - 36, 'CONTINUE', dismiss, Math.min(240, modalWidth - 64), 'menu', {
      focusModalDepth: 50,
      focusDefaultPriority: 100,
      focusLabel: 'CLOSE INITIAL DEPLOYMENT BRIEFING'
    });
    overlay.add([shade, panel, accent, header, divider, lead, body, ...glitchBars, continueButton]);
    this.input.keyboard?.once('keydown-ESC', dismiss);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-ESC', dismiss));
    this.tweens.add({
      targets: header,
      alpha: { from: 0.45, to: 1 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      onComplete: () => header.setAlpha(1)
    });
    this.tweens.add({ targets: glitchBars, x: '+=18', alpha: 0.08, duration: 90, yoyo: true, repeat: 2 });
  }
}
