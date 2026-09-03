import Phaser from 'phaser';
import type { ArenaSessionState } from '../types';
import { RunTransitionManager, type ArenaTransitionRequest } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import type { ArenaLoadRequest } from '../utils/runFlow';
import { createButton } from '../utils/ui';
import { normalizeRunProtocolId } from '../mods/modBalance.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import { configureSceneUiNavigation, getUiInputPresentation, subscribeUiInputPresentation } from '../input/UiNavigationController.ts';

interface PreparationStep { label: string; target: number; run: () => void; }

/** New-run deployment gate and compact between-round loader. */
export class LoadingScene extends Phaser.Scene {
  private transitionRequest?: ArenaTransitionRequest;
  private debugText?: Phaser.GameObjects.Text;
  private debugTimer?: Phaser.Time.TimerEvent;
  private handoffStarted = false;
  private statusText?: Phaser.GameObjects.Text;
  private onWindowError?: (event: ErrorEvent) => void;
  private onUnhandledRejection?: (event: PromiseRejectionEvent) => void;
  private unsubscribeInputPresentation?: () => void;
  private core?: Phaser.GameObjects.Container;
  private coreOuter?: Phaser.GameObjects.Arc;
  private coreInner?: Phaser.GameObjects.Arc;
  private corePulse?: Phaser.GameObjects.Arc;
  private coreBaseY = 0;
  private coreStartedAt = 0;

  constructor() { super(SceneKeys.Loading); }

  init(data: ArenaLoadRequest): void {
    this.transitionRequest = data as ArenaTransitionRequest;
    this.handoffStarted = false;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(160, 0, 0, 0);
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x01040a, 1);
    this.drawFrame(width, height);
    this.add.text(width * 0.5, Math.max(58, height * 0.13), 'N3ON DEPLOYMENT CONTROL', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '36px', color: '#69f6ff', stroke: '#06101c', strokeThickness: 5
    }).setOrigin(0.5);
    this.add.text(width * 0.5, Math.max(94, height * 0.13 + 38), 'COMBAT INSTANCE HANDSHAKE // SECURE CHANNEL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#e46fc4'
    }).setOrigin(0.5);
    this.createFluxCore(width * 0.5, height * 0.39);
    this.add.text(width * 0.5, height * 0.565, 'INITIALIZING DEPLOYMENT', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '24px', color: '#72f7ff'
    }).setOrigin(0.5);
    this.statusText = this.add.text(width * 0.5, height * 0.615, 'VALIDATING DEPLOYMENT LINK', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '24px', color: '#cfefff', fontStyle: 'bold'
    }).setOrigin(0.5);

    const barW = Math.min(620, Math.max(320, width * 0.58));
    this.add.rectangle(width * 0.5, height * 0.68, barW, 20, 0x091a27, 1).setStrokeStyle(2, 0x4fdfff, 0.85);
    const fill = this.add.rectangle(width * 0.5 - barW * 0.5 + 3, height * 0.68, 2, 12, 0x67f7ff, 1).setOrigin(0, 0.5);
    const pct = this.add.text(width * 0.5, height * 0.68 + 31, '0%', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '22px', color: '#d7f7ff'
    }).setOrigin(0.5);

    this.debugText = this.add.text(18, height - 276, '', {
      fontFamily: 'Consolas, monospace', fontSize: '14px', color: '#8ef7ff', backgroundColor: '#09131f'
    }).setDepth(3000).setScrollFactor(0).setPadding(10, 8, 10, 8).setVisible(import.meta.env.DEV);
    RunTransitionManager.markStep(this, 'entered loading');
    this.attachRuntimeErrorTracing();
    this.refreshDebugOverlay();
    if (import.meta.env.DEV) this.debugTimer = this.time.addEvent({ delay: 140, loop: true, callback: () => this.refreshDebugOverlay() });
    configureSceneUiNavigation(this, {});
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.debugTimer?.remove(false);
      this.unsubscribeInputPresentation?.();
      this.unsubscribeInputPresentation = undefined;
      this.detachRuntimeErrorTracing();
      if (RunTransitionManager.snapshot(this).transitionInProgress && !this.handoffStarted) {
        RunTransitionManager.fail(this, 'Loading scene shutdown before handoff started');
      }
    });

    const request = this.transitionRequest;
    if (!request?.reason) { this.handleInvalidRequest('Missing transition request/reason'); return; }
    const session = this.parseSession(request.session);
    const steps: PreparationStep[] = [
      { label: 'VALIDATING DEPLOYMENT LINK', target: 0.28, run: () => {
        if (request.session && !session) throw new Error('Invalid Arena session payload');
      } },
      { label: 'SYNCING RUN CONFIGURATION', target: 0.58, run: () => {
        if (session) this.registry.set('arena-session', session); else this.registry.remove('arena-session');
      } },
      { label: 'VERIFYING ASSET CACHE', target: 0.82, run: () => {
        if (!this.textures.exists('pixel') || !this.textures.exists('circle')) throw new Error('Required combat textures unavailable');
      } },
      { label: 'ARMING AUDIO / INPUT GATE', target: 1, run: () => {
        // Construct/read the existing shared systems now; the trusted deploy
        // gesture below performs the browser-restricted resume/capture work.
        void AudioManager.get();
        void getUiInputPresentation();
      } }
    ];
    const requireConfirmation = request.reason !== 'continue-next-round';
    let displayedProgress = 0;
    let completedProgress = 0;
    let stepIndex = 0;
    let ready = false;
    const maxFill = barW - 6;
    const deploy = createButton(this, width * 0.5, height * 0.81, 'CLICK TO DEPLOY', () => {
      if (!ready || this.handoffStarted) return false;
      this.confirmDeployment(session, request.reason);
      return true;
    }, Math.min(390, width * 0.48), 'menu', { height: 54, fontSize: 21, focusDefaultPriority: 100 });
    deploy.setVisible(false).setDepth(100);
    this.unsubscribeInputPresentation = subscribeUiInputPresentation((device) => {
      const label = deploy.getByName('button-label') as Phaser.GameObjects.Text | null;
      label?.setText(device === 'gamepad' ? 'PRESS A TO DEPLOY' : 'CLICK TO DEPLOY');
    });

    const progressTimer = this.time.addEvent({
      delay: requireConfirmation ? 70 : 32, loop: true, callback: () => {
        try {
          const stepsThisTick = requireConfirmation ? 1 : 2;
          for (let count = 0; count < stepsThisTick && stepIndex < steps.length; count += 1) {
            const step = steps[stepIndex++];
            step.run();
            completedProgress = step.target;
            this.statusText?.setText(step.label);
            RunTransitionManager.markStep(this, step.label.toLowerCase());
          }
          displayedProgress += (completedProgress - displayedProgress) * (requireConfirmation ? 0.42 : 0.7);
          if (completedProgress === 1 && 1 - displayedProgress < 0.012) displayedProgress = 1;
          fill.width = Math.max(2, maxFill * displayedProgress);
          pct.setText(`${Math.round(displayedProgress * 100)}%`);
          if (displayedProgress < 1 || ready) return;
          ready = true;
          progressTimer.remove(false);
          this.statusText?.setText(requireConfirmation ? 'DEPLOYMENT READY' : 'ROUND LINK READY');
          if (requireConfirmation) {
            RunTransitionManager.awaitUserConfirmation(this);
            deploy.setVisible(true);
          } else {
            this.time.delayedCall(45, () => this.beginArenaHandoff(session, request.reason));
          }
        } catch (error) {
          progressTimer.remove(false);
          this.handleInvalidRequest(error instanceof Error ? error.message : String(error));
        }
      }
    });
  }

  update(time: number): void {
    if (!this.core || !this.coreOuter || !this.coreInner || !this.corePulse) return;
    const elapsed = time - this.coreStartedAt;
    this.coreOuter.rotation = elapsed * 0.0006;
    this.coreInner.rotation = -elapsed * 0.00092;
    this.corePulse.setScale(0.92 + Math.sin(elapsed * 0.004) * 0.08).setAlpha(0.26 + Math.sin(elapsed * 0.004) * 0.1);
    this.core.y = this.coreBaseY + Math.sin(elapsed * 0.003) * 4;
  }

  private confirmDeployment(session: ArenaSessionState | undefined, reason: ArenaTransitionRequest['reason']): void {
    RunTransitionManager.resumeAfterUserConfirmation(this);
    AudioManager.get().resumeFromUserGesture();
    if (getUiInputPresentation().device !== 'gamepad' && typeof this.game.canvas.requestPointerLock === 'function') {
      try {
        const result = this.game.canvas.requestPointerLock();
        if (result && typeof result.catch === 'function') void result.catch(() => undefined);
      } catch { /* Arena retains its normal explicit capture fallback. */ }
    }
    this.statusText?.setText('FLUX COLLAPSE // DEPLOYING');
    if (!this.core) { this.beginArenaHandoff(session, reason); return; }
    this.tweens.add({
      targets: this.core, scale: 0.06, alpha: 0, angle: 24, duration: 230, ease: 'Cubic.easeIn',
      onComplete: () => this.beginArenaHandoff(session, reason)
    });
  }

  private createFluxCore(x: number, y: number): void {
    const glow = this.add.circle(0, 0, 82, 0x4deaff, 0.09).setBlendMode(Phaser.BlendModes.ADD);
    this.corePulse = this.add.circle(0, 0, 58, 0xff4fd8, 0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.coreOuter = this.add.circle(0, 0, 64, 0x000000, 0).setStrokeStyle(4, 0x54f5ff, 0.85);
    this.coreInner = this.add.circle(0, 0, 43, 0x000000, 0).setStrokeStyle(3, 0xff5bda, 0.88);
    const shell = this.add.graphics();
    shell.lineStyle(3, 0xbffcff, 0.92);
    shell.strokePoints([
      new Phaser.Math.Vector2(0, -48), new Phaser.Math.Vector2(37, -22), new Phaser.Math.Vector2(37, 22),
      new Phaser.Math.Vector2(0, 48), new Phaser.Math.Vector2(-37, 22), new Phaser.Math.Vector2(-37, -22)
    ], true);
    shell.lineStyle(2, 0x286c86, 0.75);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2;
      shell.lineBetween(Math.cos(angle) * 43, Math.sin(angle) * 43, Math.cos(angle) * 61, Math.sin(angle) * 61);
    }
    const core = this.add.circle(0, 0, 25, 0xc8fbff, 0.96).setStrokeStyle(3, 0xff63df, 1).setBlendMode(Phaser.BlendModes.ADD);
    this.core = this.add.container(x, y, [glow, this.corePulse, this.coreOuter, this.coreInner, shell, core]);
    this.coreBaseY = y;
    this.coreStartedAt = this.time.now;
  }

  private drawFrame(width: number, height: number): void {
    const frame = this.add.graphics();
    frame.lineStyle(2, 0x39ddec, 0.5).strokeRect(24, 24, width - 48, height - 48);
    frame.lineStyle(1, 0xff4fd0, 0.34).lineBetween(width * 0.22, 74, width * 0.78, 74);
    frame.fillStyle(0x43f0ff, 0.85);
    for (const x of [34, width - 38]) for (const y of [34, height - 38]) frame.fillRect(x, y, 4, 4);
  }

  private beginArenaHandoff(session: ArenaSessionState | undefined, reason: ArenaTransitionRequest['reason']): void {
    if (this.handoffStarted) return;
    this.handoffStarted = true;
    RunTransitionManager.markStep(this, 'launchArena called');
    if (this.scene.isActive(SceneKeys.Arena) || this.scene.isSleeping(SceneKeys.Arena) || this.scene.isPaused(SceneKeys.Arena)) {
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
    this.statusText?.setText(`TRANSITION ERROR // ${reason}`);
    this.showReturnButton();
  }

  private showReturnButton(): void {
    const { width, height } = this.scale;
    createButton(this, width * 0.5, height * 0.5 + 190, 'RETURN TO MAIN MENU', () => {
      RunTransitionManager.clearForMenu(this);
      this.scene.start(SceneKeys.MainMenu);
    }, 320);
  }

  private refreshDebugOverlay(): void {
    if (!this.debugText) return;
    const snap = RunTransitionManager.snapshot(this);
    const statusLine = (label: string, key: string): string => `${label.padEnd(13, ' ')} ${snap.sceneStatuses[key] ?? 'missing'}`;
    this.debugText.setText([
      `current scene: ${snap.currentScene}`, `target scene: ${snap.targetScene}`, `reason: ${snap.reason}`,
      `session round: ${snap.sessionRound ?? '-'}`, `session seed: ${snap.sessionSeed ?? '-'}`,
      `transition in progress: ${snap.transitionInProgress}`, `last step: ${snap.lastStep}`,
      `last runtime error: ${snap.lastError}`, 'scene statuses:',
      statusLine('loading', SceneKeys.Loading), statusLine('arena', SceneKeys.Arena), statusLine('main-menu', SceneKeys.MainMenu)
    ].join('\n'));
  }

  private attachRuntimeErrorTracing(): void {
    this.onWindowError = (event) => {
      RunTransitionManager.setRuntimeError(this, event.error ?? event.message ?? 'window.onerror');
      this.refreshDebugOverlay();
    };
    this.onUnhandledRejection = (event) => {
      RunTransitionManager.setRuntimeError(this, event.reason ?? 'unhandledrejection');
      this.refreshDebugOverlay();
    };
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  private detachRuntimeErrorTracing(): void {
    if (this.onWindowError) window.removeEventListener('error', this.onWindowError);
    if (this.onUnhandledRejection) window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
    this.onWindowError = undefined;
    this.onUnhandledRejection = undefined;
  }

  private parseSession(session: unknown): ArenaSessionState | undefined {
    if (!session || typeof session !== 'object') return undefined;
    const candidate = session as Partial<ArenaSessionState>;
    if (typeof candidate.baseSeed !== 'number' || !Number.isFinite(candidate.baseSeed)) return undefined;
    if (typeof candidate.round !== 'number' || !Number.isFinite(candidate.round)) return undefined;
    if (candidate.objectiveMode !== 'open' && candidate.objectiveMode !== 'sequential') return undefined;
    return {
      baseSeed: Math.floor(candidate.baseSeed), round: Math.max(1, Math.floor(candidate.round)), objectiveMode: candidate.objectiveMode,
      protocol: normalizeRunProtocolId(candidate.protocol), runStartedAt: candidate.runStartedAt,
      equippedMods: candidate.equippedMods, modsEarned: candidate.modsEarned, modFocus: candidate.modFocus ?? null,
      contract: candidate.contract ?? null, creditsSpentBeforeRun: candidate.creditsSpentBeforeRun ?? 0,
      upgradeCompletionPercentage: candidate.upgradeCompletionPercentage ?? 0,
      accountProgressionTier: candidate.accountProgressionTier ?? 'new', runCreditsEarned: candidate.runCreditsEarned ?? 0
    };
  }
}
