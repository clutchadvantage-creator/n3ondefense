import type Phaser from 'phaser';
import type { ArenaSessionState } from '../types';
import { RunTransitionManager, type ArenaTransitionReason } from '../flow/RunTransitionManager';

export interface ArenaLoadRequest {
  reason: ArenaTransitionReason;
  session?: ArenaSessionState;
  message?: string;
}

export const startArenaLoad = (scene: Phaser.Scene, request?: ArenaLoadRequest): void => {
  if (!request) {
    RunTransitionManager.fail(scene, 'Missing transition request');
    return;
  }
  RunTransitionManager.requestArenaTransition(scene, request);
};
