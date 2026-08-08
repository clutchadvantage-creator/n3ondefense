import Phaser from 'phaser';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import type { ArenaSessionState, RoundFinishedPayload } from '../types';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';

export class RoundFinishedScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.RoundFinished);
  }

  create(): void {
    const payload = this.registry.get('round-finished') as RoundFinishedPayload | undefined;
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
      `Credits Gained: ${payload?.creditsGained ?? 0}\nCore Tokens Gained: ${payload?.coreTokensGained ?? 0}\nProtocol: ${(payload?.protocol ?? 'normal').toUpperCase()}  •  Contract: ${(payload?.contract ?? 'none').replace(/-/g, ' ').toUpperCase()}\nMod Signal: ${(payload?.modFocus ?? 'none').replace(/([A-Z])/g, ' $1').toUpperCase()}  •  Mods Earned: ${payload?.modsEarned.length ?? 0}\nCompleted Seed: ${payload?.completedSeed ?? '-'}\nCompleted Layout: ${payload?.completedTemplate ?? '-'}`,
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

    const firstButtonY = Math.max(nextSummary.y + nextSummary.height + 28, panelBottom - 192);

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

    createButton(this, width / 2, firstButtonY + 52, 'Store', () => {
      this.scene.start(SceneKeys.Upgrades, { returnScene: SceneKeys.RoundFinished });
    }, 320);

    createButton(this, width / 2, firstButtonY + 104, 'Quit To Main Menu', () => {
      OnlineRunManager.complete('quit', payload?.completedRound);
      this.registry.remove('arena-session');
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    }, 320);

    this.add.text(width / 2, panelBottom - 22, 'Endless flow: continue to generate a new arena each round.', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '18px',
      color: '#9eb8d4',
      align: 'center',
      wordWrap: { width: panelWidth - 56, useAdvancedWrap: true }
    }).setOrigin(0.5, 1);
  }
}
