import Phaser from 'phaser';
import type { ArenaSessionState } from '../types';
import { RunTransitionManager, type ArenaTransitionRequest } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import type { ArenaLoadRequest } from '../utils/runFlow';
import { createButton } from '../utils/ui';

export class LoadingScene extends Phaser.Scene {
  private transitionRequest?: ArenaTransitionRequest;
  private debugText?: Phaser.GameObjects.Text;
  private debugTimer?: Phaser.Time.TimerEvent;
  private handoffStarted = false;
  private shutdownHandled = false;
  private statusText?: Phaser.GameObjects.Text;
  private onWindowError?: (event: ErrorEvent) => void;
  private onUnhandledRejection?: (event: PromiseRejectionEvent) => void;

  constructor() {
    super(SceneKeys.Loading);
  }

  init(data: ArenaLoadRequest): void {
    this.transitionRequest = data as ArenaTransitionRequest;
    this.handoffStarted = false;
    this.shutdownHandled = false;
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x040811, 1);

    this.add.text(width * 0.5, height * 0.5 - 120, 'INITIALIZING OPERATION', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '38px',
      color: '#69f6ff'
    }).setOrigin(0.5);

    const status = this.add.text(width * 0.5, height * 0.5 - 66, this.transitionRequest?.message ?? 'Building tactical arena...', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '24px',
      color: '#cfefff'
    }).setOrigin(0.5);
    this.statusText = status;

    const barW = Math.min(560, Math.max(320, width * 0.55));
    this.add.rectangle(width * 0.5, height * 0.5, barW, 20, 0x102032, 1).setStrokeStyle(2, 0x4fdfff, 0.9);
    const fill = this.add.rectangle(width * 0.5 - barW * 0.5 + 2, height * 0.5, 4, 14, 0x67f7ff, 1).setOrigin(0, 0.5);
    const pct = this.add.text(width * 0.5, height * 0.5 + 34, '0%', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '24px',
      color: '#d7f7ff'
    }).setOrigin(0.5);

    this.debugText = this.add.text(18, height - 276, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#8ef7ff',
      backgroundColor: '#09131f'
    }).setDepth(3000).setScrollFactor(0).setPadding(10, 8, 10, 8);

    RunTransitionManager.markStep(this, 'entered loading');
    this.attachRuntimeErrorTracing();
    this.refreshDebugOverlay();
    this.debugTimer = this.time.addEvent({ delay: 140, loop: true, callback: () => this.refreshDebugOverlay() });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shutdownHandled = true;
      this.debugTimer?.remove(false);
      this.detachRuntimeErrorTracing();
      if (RunTransitionManager.snapshot(this).transitionInProgress && !this.handoffStarted) {
        RunTransitionManager.fail(this, 'Loading scene shutdown before handoff started');
      }
    });

    const req = this.transitionRequest;
    if (!req || !req.reason) {
      this.handleInvalidRequest('Missing transition request/reason');
      return;
    }

    const session = this.parseSession(req.session);
    if (session) {
      this.registry.set('arena-session', session);
    } else {
      this.registry.remove('arena-session');
    }

    let progress = 0;
    const maxFill = barW - 4;
    const updateProgress = (): void => {
      fill.width = 4 + maxFill * progress;
      pct.setText(`${Math.round(progress * 100)}%`);
    };

    const timer = this.time.addEvent({
      delay: 65,
      loop: true,
      callback: () => {
        progress = Math.min(0.93, progress + Phaser.Math.FloatBetween(0.04, 0.12));
        updateProgress();
      }
    });

    this.time.delayedCall(680, () => {
      RunTransitionManager.markStep(this, 'timer fired');
      timer.remove(false);
      progress = 1;
      updateProgress();
      status.setText('Deploying...');

      this.time.delayedCall(120, () => this.beginArenaHandoff(session, req.reason));
    });

    this.time.delayedCall(5000, () => {
      if (this.shutdownHandled) return;
      if (!this.handoffStarted) {
        RunTransitionManager.fail(this, 'Arena start timeout: handoff never started');
        this.statusText?.setText('Transition timeout. Check trace below.');
        this.showReturnButton();
      }
    });
  }

  private beginArenaHandoff(session: ArenaSessionState | undefined, reason: ArenaTransitionRequest['reason']): void {
    if (this.handoffStarted) return;
    this.handoffStarted = true;
    RunTransitionManager.markStep(this, 'launchArena called');

    const arenaActive = this.scene.isActive(SceneKeys.Arena);
    const arenaSleeping = this.scene.isSleeping(SceneKeys.Arena);
    const arenaPaused = this.scene.isPaused(SceneKeys.Arena);

    if (arenaActive || arenaSleeping || arenaPaused) {
      this.scene.stop(SceneKeys.Arena);
      RunTransitionManager.markStep(this, 'stopped existing arena');
    }

    this.time.delayedCall(0, () => {
      RunTransitionManager.markStep(this, 'starting arena scene');
      this.scene.start(SceneKeys.Arena, { session, transitionReason: reason });
    });
  }

  private handleInvalidRequest(reason: string): void {
    RunTransitionManager.fail(this, reason);
    this.statusText?.setText(`Transition error: ${reason}`);
    this.showReturnButton();
  }

  private showReturnButton(): void {
    const { width, height } = this.scale;
    createButton(this, width * 0.5, height * 0.5 + 86, 'Return To Main Menu', () => {
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    }, 300);
  }

  private refreshDebugOverlay(): void {
    if (!this.debugText) return;
    const snap = RunTransitionManager.snapshot(this);
    const statusLine = (label: string, key: string): string => `${label.padEnd(13, ' ')} ${snap.sceneStatuses[key] ?? 'missing'}`;
    const lines = [
      `current scene: ${snap.currentScene}`,
      `target scene: ${snap.targetScene}`,
      `reason: ${snap.reason}`,
      `session round: ${snap.sessionRound ?? '-'}`,
      `session seed: ${snap.sessionSeed ?? '-'}`,
      `transition in progress: ${snap.transitionInProgress}`,
      `last step: ${snap.lastStep}`,
      `last runtime error: ${snap.lastError}`,
      'scene statuses:',
      statusLine('boot', SceneKeys.Boot),
      statusLine('splash', SceneKeys.Splash),
      statusLine('local-profiles', SceneKeys.LocalProfiles),
      statusLine('main-menu', SceneKeys.MainMenu),
      statusLine('loading', SceneKeys.Loading),
      statusLine('arena', SceneKeys.Arena),
      statusLine('results', SceneKeys.Results),
      statusLine('round-finished', SceneKeys.RoundFinished),
      statusLine('options', SceneKeys.Options),
      statusLine('upgrades', SceneKeys.Upgrades),
      statusLine('cosmetics', SceneKeys.Cosmetics)
    ];
    this.debugText.setText(lines.join('\n'));
  }

  private attachRuntimeErrorTracing(): void {
    this.onWindowError = (event: ErrorEvent) => {
      RunTransitionManager.setRuntimeError(this, event.error ?? event.message ?? 'window.onerror');
      this.refreshDebugOverlay();
    };
    this.onUnhandledRejection = (event: PromiseRejectionEvent) => {
      RunTransitionManager.setRuntimeError(this, event.reason ?? 'unhandledrejection');
      this.refreshDebugOverlay();
    };

    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  private detachRuntimeErrorTracing(): void {
    if (this.onWindowError) {
      window.removeEventListener('error', this.onWindowError);
      this.onWindowError = undefined;
    }
    if (this.onUnhandledRejection) {
      window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
      this.onUnhandledRejection = undefined;
    }
  }

  private parseSession(session: unknown): ArenaSessionState | undefined {
    if (!session || typeof session !== 'object') return undefined;
    const candidate = session as Partial<ArenaSessionState>;
    if (typeof candidate.baseSeed !== 'number' || !Number.isFinite(candidate.baseSeed)) return undefined;
    if (typeof candidate.round !== 'number' || !Number.isFinite(candidate.round)) return undefined;
    if (candidate.objectiveMode !== 'open' && candidate.objectiveMode !== 'sequential') return undefined;

    return {
      baseSeed: Math.floor(candidate.baseSeed),
      round: Math.max(1, Math.floor(candidate.round)),
      objectiveMode: candidate.objectiveMode,
      protocol: candidate.protocol === 'overdrive' ? 'overdrive' : 'normal'
    };
  }
}
