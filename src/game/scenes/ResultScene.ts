import Phaser from 'phaser';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import type { ArenaReward } from '../types';
import { startArenaLoad } from '../utils/runFlow';
import { createButton, disableButton } from '../utils/ui';
import { OnlineRunManager } from '../../online/OnlineRunManager';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Results);
  }

  create(): void {
    const result = this.registry.get('result') as ArenaReward | undefined;
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x05070d, 1);

    const victory = result?.reason === 'victory';
    this.add.text(width / 2, 130, victory ? 'MISSION SUCCESS' : 'MISSION FAILED', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '46px',
      color: victory ? '#56ff90' : '#ff5a76'
    }).setOrigin(0.5);

    this.add.text(width / 2, 210, `Credits Earned: ${result?.credits ?? 0}\nCore Tokens Earned: ${result?.coreTokens ?? 0}\nRound: ${result?.round ?? '-'}  Seed: ${result?.seed ?? '-'}`, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '28px',
      color: '#dbfaff',
      align: 'center'
    }).setOrigin(0.5);

    const reasonText =
      result?.reason === 'bombDefused' ? 'Defeat: bomb was defused.' :
      result?.reason === 'playerDead' ? 'Defeat: operator was eliminated.' :
      'Victory: payload detonated.';

    this.add.text(width / 2, 300, reasonText, {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '24px',
      color: '#f8b8ff'
    }).setOrigin(0.5);

    const submissionStatus = OnlineRunManager.lastSubmissionStatus();
    this.add.text(width / 2, 342, submissionStatus && submissionStatus !== 'local'
      ? `ONLINE RUN: ${submissionStatus.replace(/_/g, ' ').toUpperCase()}`
      : 'LOCAL RUN — NOT SUBMITTED ONLINE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '20px',
      color: submissionStatus === 'verified' ? '#8fffc4' : submissionStatus === 'rejected' || submissionStatus === 'failed' ? '#ff8da2' : '#ffc889'
    }).setOrigin(0.5);

    const replayButton = createButton(this, width / 2, 390, 'Replay Local', () => {
      OnlineRunManager.beginLocalRun();
      disableButton(replayButton);
      this.registry.remove('round-finished');
      startArenaLoad(this, { reason: 'replay-after-fail', message: 'Rebuilding mission arena...' });
    });
    createButton(this, width / 2, 442, 'Upgrade Store', () => this.scene.start(SceneKeys.Upgrades));
    createButton(this, width / 2, 494, 'Cosmetics Store', () => this.scene.start(SceneKeys.Cosmetics));
    createButton(this, width / 2, 546, 'Main Menu', () => {
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    });
  }
}
