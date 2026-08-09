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

export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Results);
  }

  create(): void {
    const result = this.registry.get('result') as ArenaReward | undefined;
    const resultProtocol = normalizeRunProtocolId(result?.protocol);
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x05070d, 1);
    const panelWidth = Math.min(860, width - 48);
    const panelHeight = Math.min(680, height - 40);
    const panelTop = (height - panelHeight) / 2;
    this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x09131f, 0.94)
      .setStrokeStyle(2, 0x55dff4, 0.72);

    const victory = result?.reason === 'victory';
    this.add.text(width / 2, panelTop + 42, victory ? 'MISSION SUCCESS' : 'MISSION FAILED', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: `${Phaser.Math.Clamp(width * 0.037, 32, 46)}px`,
      color: victory ? '#56ff90' : '#ff5a76',
      align: 'center',
      wordWrap: { width: panelWidth - 64, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const summary = this.add.text(width / 2, panelTop + 108, `Run Credits Earned: ${result?.runCreditsEarned ?? result?.credits ?? 0}\nCore Tokens Earned This Round: ${result?.coreTokens ?? 0}\nHighest Round: ${result?.highestRound ?? result?.round ?? '-'}  Seed: ${result?.seed ?? '-'}\nProtocol: ${RUN_PROTOCOLS[resultProtocol].label}  Contract: ${(result?.contract ?? 'none').replace(/-/g, ' ').toUpperCase()}\nMod Signal: ${(result?.modFocus ?? 'none').replace(/([A-Z])/g, ' $1').toUpperCase()}  Mods Earned: ${result?.modsEarned.length ?? 0}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${height < 700 ? 20 : 23}px`,
      color: '#dbfaff',
      align: 'center',
      lineSpacing: 4,
      wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const reasonText =
      result?.reason === 'bombDefused' ? 'Defeat: bomb was defused.' :
      result?.reason === 'playerDead' ? 'Defeat: operator was eliminated.' :
      'Victory: payload detonated.';

    const reason = this.add.text(width / 2, summary.y + summary.height + 20, reasonText, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '24px',
      color: '#f8b8ff',
      align: 'center',
      wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const submissionStatus = OnlineRunManager.lastSubmissionStatus();
    const onlineStatus = this.add.text(width / 2, reason.y + reason.height + 14, submissionStatus && submissionStatus !== 'local'
      ? `ONLINE RUN: ${submissionStatus.replace(/_/g, ' ').toUpperCase()}`
      : 'LOCAL RUN — NOT SUBMITTED ONLINE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '20px',
      color: submissionStatus === 'verified' ? '#8fffc4' : submissionStatus === 'rejected' || submissionStatus === 'failed' ? '#ff8da2' : '#ffc889',
      align: 'center',
      wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    const firstButtonY = Math.max(onlineStatus.y + onlineStatus.height + 28, panelTop + panelHeight - 228);

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
    createButton(this, width / 2, firstButtonY + 52, 'Store', () => this.scene.start(SceneKeys.Upgrades));
    createButton(this, width / 2, firstButtonY + 104, 'Export Gameplay Metrics', () => {
      GameplayTelemetryRecorder.exportToJsonFile();
    });
    createButton(this, width / 2, firstButtonY + 156, 'Main Menu', () => {
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    });
  }
}
