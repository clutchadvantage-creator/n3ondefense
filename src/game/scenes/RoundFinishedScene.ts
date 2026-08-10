import Phaser from 'phaser';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import type { ArenaSessionState, RoundFinishedPayload } from '../types';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import { RUN_PROTOCOLS, normalizeRunProtocolId } from '../mods/modBalance.ts';

export class RoundFinishedScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.RoundFinished);
  }

  create(): void {
    const payload = this.registry.get('round-finished') as RoundFinishedPayload | undefined;
    const protocolDefinition = RUN_PROTOCOLS[normalizeRunProtocolId(payload?.protocol)];
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x040811, 1);
    const panelWidth = Math.min(920, width - 48);
    const panelHeight = Math.min(700, height - 36);
    const panelTop = (height - panelHeight) / 2;
    const panelBottom = panelTop + panelHeight;
    this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x091421, 0.94)
      .setStrokeStyle(2, 0x55dff4, 0.7);

    this.add.text(width / 2, panelTop + 32, 'ROUND FINISHED', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: `${Phaser.Math.Clamp(width * 0.038, 32, 46)}px`,
      color: '#6bfffb',
      align: 'center',
      wordWrap: { width: panelWidth - 64, useAdvancedWrap: true }
    }).setOrigin(0.5, 0);

    this.add.text(width / 2, panelTop + 88, `Round ${payload?.completedRound ?? '-'} complete`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${height < 700 ? 25 : 30}px`,
      color: '#d8f8ff'
    }).setOrigin(0.5, 0);

    const completedSummary = this.add.text(
      width / 2,
      panelTop + 132,
      `Credits Gained: ${payload?.creditsGained ?? 0}\nCore Tokens Gained: ${payload?.coreTokensGained ?? 0}\nPlasma Chips Gained: ${payload?.plasmaChipsGained ?? 0}${payload?.bossDefeated ? `\nBoss Defeated: ${payload.bossDefeated.replace(/-/g, ' ').toUpperCase()}` : ''}\nProtocol: ${protocolDefinition.label}  •  Contract: ${(payload?.contract ?? 'none').replace(/-/g, ' ').toUpperCase()}\nMod Signal: ${(payload?.modFocus ?? 'none').replace(/([A-Z])/g, ' $1').toUpperCase()}  •  Mods Earned: ${payload?.modsEarned.length ?? 0}\nCompleted Seed: ${payload?.completedSeed ?? '-'}\nCompleted Layout: ${payload?.completedTemplate ?? '-'}`,
      {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: `${height < 700 ? 19 : 22}px`,
        color: '#d6eeff',
        align: 'center',
        lineSpacing: 3,
        wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
      }
    ).setOrigin(0.5, 0);

    const nextSummary = this.add.text(
      width / 2,
      completedSummary.y + completedSummary.height + 18,
      `Next Round: ${payload?.nextRound ?? '-'}\nNext Seed: ${payload?.nextSeed ?? '-'}\nNext Layout: ${payload?.nextTemplate ?? '-'}`,
      {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: `${height < 700 ? 20 : 24}px`,
        color: '#ffc89a',
        align: 'center',
        lineSpacing: 3,
        wordWrap: { width: panelWidth - 72, useAdvancedWrap: true }
      }
    ).setOrigin(0.5, 0);

    const buttonSpacing = 48;
    const buttonHalfHeight = 20;
    const footerFontSize = height < 700 ? 16 : 18;
    const footerEstimatedHeight = footerFontSize + 6;
    const minimumFirstButtonY = nextSummary.y + nextSummary.height + 24;
    const preferredFirstButtonY = Math.max(minimumFirstButtonY, panelBottom - 288);
    const preferredFooterBottom = panelBottom - 12;
    const preferredFooterTop = preferredFooterBottom - footerEstimatedHeight;
    const preferredButtonStackBottom = preferredFirstButtonY + buttonSpacing * 4 + buttonHalfHeight;
    const footerBottom = preferredButtonStackBottom + 10 <= preferredFooterTop
      ? preferredFooterBottom
      : Math.min(height - 8, panelBottom + 14);
    const footerTop = footerBottom - footerEstimatedHeight;
    const latestFirstButtonY = footerTop - 10 - buttonSpacing * 4 - buttonHalfHeight;
    const footerFits = latestFirstButtonY >= minimumFirstButtonY;
    const firstButtonY = footerFits
      ? Math.min(preferredFirstButtonY, latestFirstButtonY)
      : preferredFirstButtonY;

    const continueButton = createButton(this, width / 2, firstButtonY, 'Continue To Next Round', () => {
      disableButton(continueButton);
      if (!payload) {
        startArenaLoad(this, { reason: 'continue-next-round', message: 'Building next arena...' });
        return;
      }

      const session: ArenaSessionState = {
        baseSeed: payload.baseSeed,
        round: payload.nextRound,
        objectiveMode: payload.objectiveMode,
        protocol: payload.protocol,
        runStartedAt: payload.runStartedAt,
        equippedMods: payload.equippedMods,
        modsEarned: payload.modsEarned,
        modFocus: payload.modFocus,
        contract: payload.contract,
        creditsSpentBeforeRun: payload.creditsSpentBeforeRun,
        upgradeCompletionPercentage: payload.upgradeCompletionPercentage,
        accountProgressionTier: payload.accountProgressionTier,
        runCreditsEarned: payload.runCreditsEarned
      };
      startArenaLoad(this, { reason: 'continue-next-round', session, message: 'Deploying next round arena...' });
    }, 320);

    createButton(this, width / 2, firstButtonY + buttonSpacing, 'Store', () => {
      this.scene.start(SceneKeys.Upgrades, { returnScene: SceneKeys.RoundFinished });
    }, 320);

    createButton(this, width / 2, firstButtonY + buttonSpacing * 2, 'Mod Collection', () => {
      this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.RoundFinished });
    }, 320);

    createButton(this, width / 2, firstButtonY + buttonSpacing * 3, 'Export Gameplay Metrics', () => {
      GameplayTelemetryRecorder.exportToJsonFile();
    }, 320);

    createButton(this, width / 2, firstButtonY + buttonSpacing * 4, 'Quit To Main Menu', () => {
      OnlineRunManager.complete('quit', payload?.completedRound);
      GameplayTelemetryRecorder.finishRun('quit');
      this.registry.remove('arena-session');
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    }, 320);

    if (footerFits) {
      this.add.text(width / 2, footerBottom, 'Endless flow: continue to generate a new arena each round.', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: `${footerFontSize}px`,
        color: '#9eb8d4',
        align: 'center',
        wordWrap: { width: panelWidth - 56, useAdvancedWrap: true }
      }).setOrigin(0.5, 1);
    }
  }
}
