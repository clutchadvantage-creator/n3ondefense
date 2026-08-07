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

    this.add.text(width / 2, 96, 'ROUND FINISHED', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '48px',
      color: '#6bfffb'
    }).setOrigin(0.5);

    this.add.text(width / 2, 168, `Round ${payload?.completedRound ?? '-'} complete`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '34px',
      color: '#d8f8ff'
    }).setOrigin(0.5);

    this.add.text(
      width / 2,
      252,
      `Credits Gained: ${payload?.creditsGained ?? 0}\nCore Tokens Gained: ${payload?.coreTokensGained ?? 0}\nProtocol: ${(payload?.protocol ?? 'normal').toUpperCase()}  •  Mods Earned: ${payload?.modsEarned.length ?? 0}\nCompleted Seed: ${payload?.completedSeed ?? '-'}\nCompleted Layout: ${payload?.completedTemplate ?? '-'}`,
      {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '28px',
        color: '#d6eeff',
        align: 'center'
      }
    ).setOrigin(0.5);

    this.add.text(
      width / 2,
      384,
      `Next Round: ${payload?.nextRound ?? '-'}\nNext Seed: ${payload?.nextSeed ?? '-'}\nNext Layout: ${payload?.nextTemplate ?? '-'}`,
      {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '30px',
        color: '#ffc89a',
        align: 'center'
      }
    ).setOrigin(0.5);

    const continueButton = createButton(this, width / 2, 492, 'Continue To Next Round', () => {
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
        modsEarned: payload.modsEarned
      };
      startArenaLoad(this, { reason: 'continue-next-round', session, message: 'Deploying next round arena...' });
    }, 320);

    createButton(this, width / 2, 552, 'Store', () => {
      this.scene.start(SceneKeys.Upgrades, { returnScene: SceneKeys.RoundFinished });
    }, 320);

    createButton(this, width / 2, 612, 'Quit To Main Menu', () => {
      OnlineRunManager.complete('quit', payload?.completedRound);
      this.registry.remove('arena-session');
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    }, 320);

    this.add.text(width / 2, height - 34, 'Endless flow: continue to generate a new arena each round.', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '20px',
      color: '#9eb8d4'
    }).setOrigin(0.5);
  }
}
