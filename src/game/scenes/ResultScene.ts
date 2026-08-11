import Phaser from 'phaser';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import type { ArenaReward } from '../types';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { OBJECTIVE_CONFIG } from '../config/gameplay';
import { RUN_PROTOCOLS, normalizeRunProtocolId } from '../mods/modBalance.ts';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import { shouldShowInitialDeploymentBriefing } from '../progression/ProgressionMessaging.ts';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Results);
  }

  create(): void {
    const result = this.registry.get('result') as ArenaReward | undefined;
    const resultProtocol = normalizeRunProtocolId(result?.protocol);
    const { width, height } = this.scale;
    const compactLayout = height < 620;
    this.add.rectangle(width / 2, height / 2, width, height, 0x05070d, 1);
    const panelWidth = Math.min(860, width - 48);
    const panelHeight = Math.min(680, height - (compactLayout ? 24 : 40));
    const panelTop = (height - panelHeight) / 2;
    this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x09131f, 0.94)
      .setStrokeStyle(2, 0x55dff4, 0.72);

    const victory = result?.reason === 'victory';
    this.add.text(width / 2, panelTop + (compactLayout ? 20 : 42), victory ? 'MISSION SUCCESS' : 'MISSION FAILED', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: `${compactLayout ? Phaser.Math.Clamp(width * 0.037, 28, 36) : Phaser.Math.Clamp(width * 0.037, 32, 46)}px`,
      color: victory ? '#56ff90' : '#ff5a76',
      align: 'center',
      wordWrap: { width: panelWidth - 64, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const summary = this.add.text(width / 2, panelTop + (compactLayout ? 70 : 108), `Run Credits Earned: ${result?.runCreditsEarned ?? result?.credits ?? 0}\nCore Tokens Earned This Round: ${result?.coreTokens ?? 0}\nHighest Round: ${result?.highestRound ?? result?.round ?? '-'}  Seed: ${result?.seed ?? '-'}\nProtocol: ${RUN_PROTOCOLS[resultProtocol].label}  Contract: ${(result?.contract ?? 'none').replace(/-/g, ' ').toUpperCase()}\nMod Signal: ${(result?.modFocus ?? 'none').replace(/([A-Z])/g, ' $1').toUpperCase()}  Mods Earned: ${result?.modsEarned.length ?? 0}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${compactLayout ? 17 : height < 700 ? 20 : 23}px`,
      color: '#dbfaff',
      align: 'center',
      lineSpacing: compactLayout ? 0 : 4,
      wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const reasonText =
      result?.reason === 'bombDefused' ? 'Defeat: bomb was defused.' :
      result?.reason === 'playerDead' ? 'Defeat: operator was eliminated.' :
      'Victory: payload detonated.';

    const reason = this.add.text(width / 2, summary.y + summary.height + (compactLayout ? 10 : 20), reasonText, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${compactLayout ? 20 : 24}px`,
      color: '#f8b8ff',
      align: 'center',
      wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const submissionStatus = OnlineRunManager.lastSubmissionStatus();
    const onlineStatus = this.add.text(width / 2, reason.y + reason.height + (compactLayout ? 6 : 14), submissionStatus && submissionStatus !== 'local'
      ? `ONLINE RUN: ${submissionStatus.replace(/_/g, ' ').toUpperCase()}`
      : 'LOCAL RUN — NOT SUBMITTED ONLINE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compactLayout ? 16 : 20}px`,
      color: submissionStatus === 'verified' ? '#8fffc4' : submissionStatus === 'rejected' || submissionStatus === 'failed' ? '#ff8da2' : '#ffc889',
      align: 'center',
      wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const buttonSpacing = compactLayout ? 44 : 52;
    const firstButtonY = Math.max(
      onlineStatus.y + onlineStatus.height + (compactLayout ? 18 : 28),
      panelTop + panelHeight - (compactLayout ? 194 : 228)
    );

    if (!victory) {
      this.add.text(width / 2, panelTop + panelHeight - (compactLayout ? 8 : 12), 'PROGRESSION SAVED // ADAPT. UPGRADE. RETURN STRONGER.', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: `${compactLayout ? 13 : 15}px`,
        color: '#74dce8',
        align: 'center',
        wordWrap: { width: panelWidth - 48, useAdvancedWrap: true }
      }).setOrigin(0.5, 1).setAlpha(0.72);
    }

    const replayButton = createButton(this, width / 2, firstButtonY, 'Replay Local', () => {
      OnlineRunManager.beginLocalRun();
      disableButton(replayButton);
      this.registry.remove('round-finished');
      const protocol = resultProtocol;
      startArenaLoad(this, {
        reason: 'replay-after-fail',
        session: {
          baseSeed: Phaser.Math.Between(1, 999_999_999),
          round: RUN_PROTOCOLS[protocol].startingRound,
          objectiveMode: OBJECTIVE_CONFIG.defaultMode,
          protocol,
          runStartedAt: Date.now(),
          equippedMods: new ModRuntime(SaveSystem.getModCollection()).snapshot(),
          modsEarned: [],
          // Paid one-run setup is consumed by the original run. Replay never
          // grants a free Contract or focused Mod signal.
          ...SaveSystem.buildRunEconomySnapshot({ modFocus: null, contract: null }, 0)
        },
        message: 'Rebuilding mission arena...'
      });
    });
    createButton(this, width / 2, firstButtonY + buttonSpacing, 'Store', () => this.scene.start(SceneKeys.Upgrades, {
      returnScene: SceneKeys.MainMenu,
      resumePausedScene: false
    }));
    createButton(this, width / 2, firstButtonY + buttonSpacing * 2, 'Export Gameplay Metrics', () => {
      GameplayTelemetryRecorder.exportToJsonFile();
    });
    createButton(this, width / 2, firstButtonY + buttonSpacing * 3, 'Main Menu', () => {
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    });

    const briefingState = SaveSystem.getInitialDeploymentBriefingState();
    if (shouldShowInitialDeploymentBriefing(result, briefingState)) {
      SaveSystem.markInitialDeploymentBriefingSeen();
      this.showInitialDeploymentBriefing();
    }
  }

  private showInitialDeploymentBriefing(): void {
    const { width, height } = this.scale;
    const modalWidth = Math.min(640, width - 32);
    const modalHeight = Math.min(330, height - 32);
    const modalTop = (height - modalHeight) / 2;
    const narrow = modalWidth < 540 || modalHeight < 300;
    const overlay = this.add.container(0, 0).setDepth(1000);
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x02050a, 0.72)
      .setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, modalWidth, modalHeight, 0x09131f, 0.99)
      .setStrokeStyle(2, 0x55dff4, 0.92);
    const accent = this.add.rectangle(width / 2, modalTop + 5, modalWidth - 10, 3, 0xff4ed3, 0.82);
    const header = this.add.text(width / 2, modalTop + 24, 'N3ON PROTOCOL // INITIAL DEPLOYMENTS', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: `${narrow ? 15 : 20}px`,
      color: '#55dff4',
      align: 'center',
      wordWrap: { width: modalWidth - 44, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
    const divider = this.add.rectangle(width / 2, header.y + header.height + 8, modalWidth - 56, 1, 0x55dff4, 0.38);
    const lead = this.add.text(width / 2, divider.y + 12, 'SURVIVAL IS NOT EXPECTED.\nEVERY DEPLOYMENT MAKES YOU STRONGER.', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${narrow ? 17 : 21}px`,
      color: '#f8b8ff',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: modalWidth - 48, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);
    const body = this.add.text(width / 2, lead.y + lead.height + 12, 'EARN CREDITS. UPGRADE YOUR OPERATIVE.\nCOLLECT AND IMPROVE MODS.\nADAPT YOUR BUILD. RETURN STRONGER.', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${narrow ? 15 : 18}px`,
      color: '#dbfaff',
      align: 'center',
      lineSpacing: narrow ? 1 : 3,
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
    };
    const continueButton = createButton(this, width / 2, modalTop + modalHeight - 36, 'CONTINUE', dismiss, Math.min(240, modalWidth - 64));
    overlay.add([shade, panel, accent, header, divider, lead, body, ...glitchBars, continueButton]);
    this.input.keyboard?.once('keydown-ESC', dismiss);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', dismiss);
    });
    this.tweens.add({
      targets: header,
      alpha: { from: 0.45, to: 1 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      onComplete: () => header.setAlpha(1)
    });
    this.tweens.add({
      targets: glitchBars,
      x: '+=18',
      alpha: 0.08,
      duration: 90,
      yoyo: true,
      repeat: 2
    });
  }
}
