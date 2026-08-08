import type Phaser from 'phaser';
import type { ArenaSessionState } from '../types';
import { SceneKeys, SceneStatusOrder, type SceneKeyValue } from './SceneKeys';

export type ArenaTransitionReason =
  | 'startup'
  | 'new-run'
  | 'replay-after-fail'
  | 'continue-next-round'
  | 'return-to-menu';

export interface ArenaTransitionRequest {
  reason: ArenaTransitionReason;
  session?: ArenaSessionState;
  message?: string;
}

export interface TransitionSnapshot {
  transitionInProgress: boolean;
  currentScene: string;
  targetScene: string;
  reason: ArenaTransitionReason | 'none';
  sessionRound: number | null;
  sessionSeed: number | null;
  lastStep: string;
  lastError: string;
  sceneStatuses: Record<string, string>;
}

const TRANSITION_WATCHDOG_MS = 5500;

export class RunTransitionManager {
  private static inProgress = false;
  private static reason: ArenaTransitionReason | 'none' = 'none';
  private static targetScene: string = SceneKeys.Loading;
  private static sessionRound: number | null = null;
  private static sessionSeed: number | null = null;
  private static lastStep = 'idle';
  private static lastError = '';
  private static watchdogId: number | null = null;

  static requestArenaTransition(scene: Phaser.Scene, request: ArenaTransitionRequest): boolean {
    const session = RunTransitionManager.validateSession(request.session);
    if (request.session && !session) {
      RunTransitionManager.fail(scene, 'Invalid session payload');
      return false;
    }

    if (RunTransitionManager.inProgress) {
      RunTransitionManager.log(scene, 'duplicate-ignored', request.reason, session, {
        warning: 'Transition already in progress'
      });
      return false;
    }

    if (!RunTransitionManager.hasScene(scene, SceneKeys.Loading)) {
      RunTransitionManager.fail(scene, `Missing scene key: ${SceneKeys.Loading}`);
      return false;
    }

    RunTransitionManager.inProgress = true;
    RunTransitionManager.reason = request.reason;
    RunTransitionManager.targetScene = SceneKeys.Loading;
    RunTransitionManager.sessionRound = session?.round ?? null;
    RunTransitionManager.sessionSeed = session?.baseSeed ?? null;
    RunTransitionManager.lastStep = 'request-received';
    RunTransitionManager.lastError = '';

    if (session) {
      scene.registry.set('arena-session', session);
    } else {
      scene.registry.remove('arena-session');
    }

    if (scene.scene.key !== SceneKeys.Loading && (scene.scene.isActive(SceneKeys.Loading) || scene.scene.isSleeping(SceneKeys.Loading))) {
      scene.scene.stop(SceneKeys.Loading);
      RunTransitionManager.lastStep = 'stale-loading-stopped';
    }

    RunTransitionManager.startWatchdog(scene);
    RunTransitionManager.log(scene, 'start-loading', request.reason, session, {
      message: request.message ?? ''
    });

    if (scene.scene.key === SceneKeys.Loading) {
      scene.scene.restart(request);
    } else {
      scene.scene.start(SceneKeys.Loading, request);
    }
    return true;
  }

  static markStep(scene: Phaser.Scene, step: string): void {
    RunTransitionManager.lastStep = step;
    RunTransitionManager.log(scene, step, RunTransitionManager.reason, undefined);
  }

  static markArenaStarted(scene: Phaser.Scene): void {
    RunTransitionManager.inProgress = false;
    RunTransitionManager.targetScene = SceneKeys.Arena;
    RunTransitionManager.lastStep = 'arena-started';
    RunTransitionManager.clearWatchdog();
    RunTransitionManager.log(scene, 'arena-started', RunTransitionManager.reason, undefined);
  }

  static clearForMenu(scene: Phaser.Scene): void {
    RunTransitionManager.inProgress = false;
    RunTransitionManager.reason = 'return-to-menu';
    RunTransitionManager.targetScene = SceneKeys.MainMenu;
    RunTransitionManager.lastStep = 'returned-to-menu';
    RunTransitionManager.clearWatchdog();
    RunTransitionManager.log(scene, 'returned-to-menu', 'return-to-menu', undefined);
  }

  static fail(scene: Phaser.Scene, error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    RunTransitionManager.inProgress = false;
    RunTransitionManager.lastError = msg;
    RunTransitionManager.lastStep = 'transition-failed';
    RunTransitionManager.clearWatchdog();
    RunTransitionManager.log(scene, 'transition-failed', RunTransitionManager.reason, undefined, { error: msg });
  }

  static setRuntimeError(scene: Phaser.Scene, error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    RunTransitionManager.lastError = msg;
    RunTransitionManager.log(scene, 'runtime-error', RunTransitionManager.reason, undefined, { error: msg });
  }

  static snapshot(scene: Phaser.Scene): TransitionSnapshot {
    return {
      transitionInProgress: RunTransitionManager.inProgress,
      currentScene: scene.scene.key,
      targetScene: RunTransitionManager.targetScene,
      reason: RunTransitionManager.reason,
      sessionRound: RunTransitionManager.sessionRound,
      sessionSeed: RunTransitionManager.sessionSeed,
      lastStep: RunTransitionManager.lastStep,
      lastError: RunTransitionManager.lastError || '-',
      sceneStatuses: RunTransitionManager.getSceneStatuses(scene)
    };
  }

  private static validateSession(session: ArenaSessionState | undefined): ArenaSessionState | undefined {
    if (!session) return undefined;
    if (!Number.isFinite(session.baseSeed)) return undefined;
    if (!Number.isFinite(session.round) || session.round < 1) return undefined;
    if (session.objectiveMode !== 'open' && session.objectiveMode !== 'sequential') return undefined;
    return {
      baseSeed: Math.floor(session.baseSeed),
      round: Math.max(1, Math.floor(session.round)),
      objectiveMode: session.objectiveMode,
      protocol: session.protocol === 'overdrive' ? 'overdrive' : 'normal',
      runStartedAt: Number.isFinite(session.runStartedAt) ? session.runStartedAt : Date.now(),
      equippedMods: Array.isArray(session.equippedMods) ? session.equippedMods : [],
      modsEarned: Array.isArray(session.modsEarned) ? session.modsEarned : [],
      modFocus: session.modFocus ?? null,
      contract: session.contract ?? null,
      creditsSpentBeforeRun: Math.max(0, Math.floor(session.creditsSpentBeforeRun ?? 0)),
      upgradeCompletionPercentage: Math.max(0, Math.min(100, session.upgradeCompletionPercentage ?? 0)),
      accountProgressionTier: session.accountProgressionTier ?? 'new',
      runCreditsEarned: Math.max(0, Math.floor(session.runCreditsEarned ?? 0))
    };
  }

  private static hasScene(scene: Phaser.Scene, key: SceneKeyValue): boolean {
    try {
      scene.scene.get(key);
      return true;
    } catch {
      return false;
    }
  }

  private static getSceneStatuses(scene: Phaser.Scene): Record<string, string> {
    const statuses: Record<string, string> = {};
    for (const key of SceneStatusOrder) {
      if (!RunTransitionManager.hasScene(scene, key)) {
        statuses[key] = 'missing';
        continue;
      }
      const active = scene.scene.isActive(key);
      const sleeping = scene.scene.isSleeping(key);
      const paused = scene.scene.isPaused(key);
      statuses[key] = active ? 'active' : sleeping ? 'sleeping' : paused ? 'paused' : 'inactive';
    }
    return statuses;
  }

  private static startWatchdog(scene: Phaser.Scene): void {
    RunTransitionManager.clearWatchdog();
    RunTransitionManager.watchdogId = window.setTimeout(() => {
      if (!RunTransitionManager.inProgress) return;
      RunTransitionManager.fail(scene, `Timeout waiting for arena start after ${TRANSITION_WATCHDOG_MS}ms`);
    }, TRANSITION_WATCHDOG_MS);
  }

  private static clearWatchdog(): void {
    if (RunTransitionManager.watchdogId !== null) {
      window.clearTimeout(RunTransitionManager.watchdogId);
      RunTransitionManager.watchdogId = null;
    }
  }

  private static log(
    scene: Phaser.Scene,
    step: string,
    reason: ArenaTransitionReason | 'none',
    session?: ArenaSessionState,
    extra?: Record<string, unknown>
  ): void {
    // eslint-disable-next-line no-console
    console.log('[RUN TRANSITION]', {
      step,
      currentScene: scene.scene.key,
      targetScene: RunTransitionManager.targetScene,
      reason,
      session: session ?? {
        round: RunTransitionManager.sessionRound,
        seed: RunTransitionManager.sessionSeed
      },
      sceneStatuses: RunTransitionManager.getSceneStatuses(scene),
      transitionInProgress: RunTransitionManager.inProgress,
      lastStep: RunTransitionManager.lastStep,
      lastRuntimeError: RunTransitionManager.lastError,
      ...(extra ?? {})
    });
  }
}
