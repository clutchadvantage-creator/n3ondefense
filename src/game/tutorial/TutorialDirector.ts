import { SaveSystem } from '../systems/SaveSystem.ts';
import { TUTORIAL_SEQUENCES } from './TutorialRegistry.ts';
import { acknowledgeTutorialMessage, completeTutorialSequence, introduceTutorialStep, isTutorialSequenceEligible, needsTutorialStep, skipTutorialSequence } from './TutorialProgress.ts';
import { TutorialEventBus } from './TutorialEventBus.ts';
import { TutorialOverlay } from './TutorialOverlay.ts';
import type { TutorialEvent, TutorialHost, TutorialSequenceDefinition } from './TutorialTypes.ts';
import { resolveTutorialCopy } from './TutorialCopy.ts';
import { resolveTutorialAdvancePolicy, type TutorialAdvancePolicy } from './TutorialStepRules.ts';
import {
  getUiInputPresentation,
  subscribeUiInputPresentation
} from '../input/UiNavigationController.ts';
import type { TutorialStepDefinition } from './TutorialTypes.ts';
import { LyraComms } from '../lyra/LyraComms.ts';

/** One director per visible scene. Awarding/game state remains independent of this presentation queue. */
export class TutorialDirector {
  private readonly overlay: TutorialOverlay;
  private readonly unsubscribe: () => void;
  private readonly presentationUnsubscribe: () => void;
  private active: TutorialSequenceDefinition | null = null;
  private readonly pending: TutorialSequenceDefinition[] = [];
  private stepIndex = 0;
  private timer: number | null = null;
  private transitionTimer: number | null = null;
  private acceptingCompletion = false;
  private advancePolicy: TutorialAdvancePolicy | null = null;
  private destroyed = false;
  private readonly profileId: string | null;
  private replaying = false;
  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (!this.active) return;
    if (event.code === 'Escape') {
      // Archive the explanation, then let the scene's normal Back/Pause action run.
      this.suspend();
      return;
    }
    if (event.code === 'KeyK' && this.active.skippable !== false) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.skip();
    } else if (event.code === 'Enter' && this.acceptingCompletion && this.advancePolicy?.type === 'manual') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.advance();
    }
  };

  constructor(private readonly host: TutorialHost) {
    this.profileId = SaveSystem.getActiveProfileSummary()?.id ?? null;
    SaveSystem.recordTutorialEvent('screen.entered', host.scene);
    this.overlay = new TutorialOverlay(() => this.skip(), host.scene === 'arena');
    this.unsubscribe = TutorialEventBus.subscribe((event) => this.onEvent(event));
    this.presentationUnsubscribe = subscribeUiInputPresentation(() => {
      if (!this.active || !this.canPresent()) { this.suspend(); return; }
      const copy = this.resolvePresentedCopy(this.active.steps[this.stepIndex]);
      this.overlay.updatePromptText(copy.body, copy.inputDemo);
      LyraComms.get().training(this.host.scene, `tutorial.${this.active.id}.${this.active.steps[this.stepIndex].id}`, copy.body);
    });
    window.addEventListener('keydown', this.keyHandler, { capture: true });
  }

  startEligible(): void {
    if (this.active || !this.canPresent()) return;
    const progress = SaveSystem.getTutorialProgress();
    const replay = progress.replaySequenceId
      ? TUTORIAL_SEQUENCES.find((sequence) => sequence.id === progress.replaySequenceId && sequence.scene === this.host.scene)
      : null;
    const sequence = replay ?? TUTORIAL_SEQUENCES.find((candidate) =>
      candidate.autoStart
      && (!candidate.earlyDiscovery || SaveSystem.get().settings.contextualTutorials
        || (progress.trainingRoundsCompleted ?? 0) === 3 || progress.learning?.legacyTrainingCleared)
      && (this.host.trainingRound?.() ?? 1) >= (candidate.minimumTrainingRound ?? 1)
      && isTutorialSequenceEligible(progress, candidate, this.host.scene)
    );
    if (sequence) this.begin(sequence);
  }

  replay(sequenceId: string): boolean {
    const sequence = TUTORIAL_SEQUENCES.find((candidate) => candidate.id === sequenceId && candidate.scene === this.host.scene);
    if (!sequence) return false;
    this.finish(false);
    this.begin(sequence, true);
    return true;
  }

  isBlockingGameplay(): boolean {
    return this.active?.steps[this.stepIndex]?.mode === 'hard-pause';
  }

  isActive(): boolean {
    return this.active !== null;
  }

  awaits(event: string): boolean {
    return this.acceptingCompletion
      && this.advancePolicy?.type === 'event'
      && this.advancePolicy.event === event;
  }

  isActiveSequence(sequenceId: string): boolean {
    return this.active?.id === sequenceId;
  }

  isActiveStep(sequenceId: string, stepId: string): boolean {
    return this.active?.id === sequenceId && this.active.steps[this.stepIndex]?.id === stepId;
  }

  /** Completes a visible acknowledgement from another trusted UI action. */
  completeActiveManualStep(sequenceId: string, stepId: string): boolean {
    if (!this.isActiveStep(sequenceId, stepId)
      || !this.acceptingCompletion
      || this.advancePolicy?.type !== 'manual') return false;
    this.advance();
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    LyraComms.get().endTraining(this.host.scene);
    this.clearTimer();
    this.clearTransitionTimer();
    this.host.setMode('live');
    this.unsubscribe();
    this.presentationUnsubscribe();
    window.removeEventListener('keydown', this.keyHandler, { capture: true });
    this.overlay.destroy();
  }

  /** Navigation, death and pause retire only transient presentation. */
  suspend(): void {
    this.clearTransitionTimer();
    this.pending.length = 0;
    this.finish(false);
  }

  private ownsProfile(): boolean {
    return !this.destroyed && !!this.profileId && this.profileId === SaveSystem.getActiveProfileSummary()?.id;
  }

  private canPresent(): boolean {
    return this.ownsProfile() && this.host.canPresent?.() !== false;
  }

  private onEvent(event: TutorialEvent): void {
    if (!this.ownsProfile()) { this.suspend(); return; }
    SaveSystem.recordTutorialEvent(event.type, event.payload);
    if (!this.canPresent()) { this.suspend(); return; }
    if (this.active) {
      if (this.acceptingCompletion && this.advancePolicy?.type === 'event' && this.advancePolicy.event === event.type) {
        this.advance();
        return;
      }
      this.queueTriggeredSequence(event);
      return;
    }
    const sequence = SaveSystem.get().settings.contextualTutorials ? this.findTriggeredSequence(event) : undefined;
    if (sequence) this.begin(sequence);
    else this.startEligible();
  }

  private findTriggeredSequence(event: TutorialEvent): TutorialSequenceDefinition | undefined {
    const progress = SaveSystem.getTutorialProgress();
    return TUTORIAL_SEQUENCES.find((candidate) =>
      candidate.triggerEvent === event.type
      && isTutorialSequenceEligible(progress, candidate, this.host.scene)
    );
  }

  private queueTriggeredSequence(event: TutorialEvent): void {
    if (!SaveSystem.get().settings.contextualTutorials) return;
    const sequence = this.findTriggeredSequence(event);
    if (sequence && sequence !== this.active && !this.pending.some((item) => item.id === sequence.id)) this.pending.push(sequence);
  }

  private begin(sequence: TutorialSequenceDefinition, replay = false): void {
    if (!this.canPresent()) return;
    this.active = sequence;
    const progress = SaveSystem.getTutorialProgress();
    this.replaying = replay || progress.replaySequenceId === sequence.id;
    this.stepIndex = this.replaying ? 0 : sequence.steps.findIndex(step => needsTutorialStep(progress, sequence.id, step));
    if (this.stepIndex < 0) { this.finish(false); return; }
    this.showStep();
    TutorialEventBus.emit('tutorial.sequenceStarted', { sequenceId: sequence.id });
  }

  private showStep(): void {
    if (!this.active) return;
    if (!this.canPresent()) { this.suspend(); return; }
    while (!this.replaying && this.stepIndex < this.active.steps.length
      && !needsTutorialStep(SaveSystem.getTutorialProgress(), this.active.id, this.active.steps[this.stepIndex])) this.stepIndex++;
    if (this.stepIndex >= this.active.steps.length) { this.finish(true); this.startNext(); return; }
    this.clearTimer();
    this.acceptingCompletion = true;
    const sourceStep = this.active.steps[this.stepIndex];
    const eventActionAvailable = sourceStep.completion.type !== 'event'
      || this.host.isEventActionAvailable?.(sourceStep.completion.event) !== false;
    this.advancePolicy = resolveTutorialAdvancePolicy(sourceStep.completion, eventActionAvailable);
    const presented = this.resolvePresentedCopy(sourceStep);
    const actionUnavailable = this.advancePolicy.type === 'manual'
      && this.advancePolicy.reason === 'action-unavailable';
    const step = {
      ...sourceStep,
      // A normally action-gated live step can fall back to Continue when the
      // action is unavailable. Give that fallback a usable cursor and pause.
      mode: actionUnavailable && sourceStep.mode === 'live' ? 'hard-pause' as const : sourceStep.mode,
      body: `${presented.body}${actionUnavailable
        ? ' This action is not currently available; continue when ready.'
        : ''}`,
      inputDemo: presented.inputDemo
    };
    this.host.setMode(step.mode);
    this.overlay.show(
      step,
      this.stepIndex,
      this.active.steps.length,
      () => step.target ? this.host.resolveTarget(step.target) : null,
      () => this.advance(),
      this.active.skippable !== false,
      this.advancePolicy.type === 'manual'
        ? (this.advancePolicy.reason === 'acknowledgement' ? step.advanceLabel ?? this.advancePolicy.label : this.advancePolicy.label)
        : step.mode === 'menu' ? 'CONTINUE LATER' : null
    );
    SaveSystem.updateTutorialProgress(state => introduceTutorialStep(state, this.active!.id, step.id));
    LyraComms.get().training(this.host.scene, `tutorial.${this.active.id}.${step.id}`, step.body);
    TutorialEventBus.emit('tutorial.stepShown', { sequenceId: this.active.id, stepId: step.id });
    if (this.advancePolicy.type === 'auto') {
      this.timer = window.setTimeout(() => this.advance(), this.advancePolicy.delayMs);
    }
  }

  private resolvePresentedCopy(step: TutorialStepDefinition): { body: string; inputDemo?: string[] } {
    const { device, family } = getUiInputPresentation();
    return resolveTutorialCopy(step, device, family, SaveSystem.get().settings.abilityBindings);
  }

  private advance(): void {
    if (!this.active || !this.acceptingCompletion || !this.ownsProfile()) return;
    this.acceptingCompletion = false;
    this.advancePolicy = null;
    this.clearTimer();
    const sequence = this.active;
    const step = sequence.steps[this.stepIndex];
    SaveSystem.updateTutorialProgress((state) => acknowledgeTutorialMessage(state, sequence.id, step));
    this.overlay.confirm();
    LyraComms.get().endTraining(this.host.scene);
    TutorialEventBus.emit('tutorial.stepCompleted', { sequenceId: sequence.id, stepId: step.id });
    this.stepIndex += 1;
    while (!this.replaying && this.stepIndex < sequence.steps.length
      && !needsTutorialStep(SaveSystem.getTutorialProgress(), sequence.id, sequence.steps[this.stepIndex])) this.stepIndex++;
    if (this.stepIndex >= sequence.steps.length) {
      SaveSystem.updateTutorialProgress((state) => completeTutorialSequence(state, sequence.id));
      TutorialEventBus.emit('tutorial.sequenceCompleted', { sequenceId: sequence.id });
      this.finish(true);
      this.scheduleTransition(() => this.startNext(), 180);
      return;
    }
    // Apply the next gate synchronously with the acknowledgement/action. In
    // particular, leaving a hard-pause from a button click must restore mouse
    // capture inside that same trusted browser gesture.
    this.host.setMode(sequence.steps[this.stepIndex].mode);
    this.scheduleTransition(() => { if (this.active === sequence) this.showStep(); }, 170);
  }

  private skip(): void {
    if (!this.active || this.active.skippable === false || !this.ownsProfile()) return;
    const sequenceId = this.active.id;
    const skippedIds = sequenceId.startsWith('onboarding.')
      ? TUTORIAL_SEQUENCES.filter(({ id }) => id.startsWith('onboarding.')).map(({ id }) => id)
      : [sequenceId];
    SaveSystem.updateTutorialProgress((state) => {
      for (const id of skippedIds) skipTutorialSequence(state, id);
    });
    for (const id of skippedIds) TutorialEventBus.emit('tutorial.sequenceSkipped', { sequenceId: id });
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      if (skippedIds.includes(this.pending[index].id)) this.pending.splice(index, 1);
    }
    this.finish(true);
    this.scheduleTransition(() => this.startNext(), 100);
  }

  private finish(notify: boolean): void {
    const sequenceId = this.active?.id;
    LyraComms.get().endTraining(this.host.scene);
    this.clearTimer();
    this.clearTransitionTimer();
    this.acceptingCompletion = false;
    this.advancePolicy = null;
    this.active = null;
    this.overlay.hide();
    this.host.setMode('live');
    if (notify && sequenceId && this.ownsProfile()) this.host.onComplete?.(sequenceId);
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleTransition(callback: () => void, delayMs: number): void {
    this.clearTransitionTimer();
    this.transitionTimer = window.setTimeout(() => {
      this.transitionTimer = null;
      if (this.canPresent()) callback();
      else if (!this.destroyed) this.suspend();
    }, delayMs);
  }

  private clearTransitionTimer(): void {
    if (this.transitionTimer !== null) window.clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
  }

  private startNext(): void {
    if (!this.canPresent()) return;
    const progress = SaveSystem.getTutorialProgress();
    while (this.pending.length) {
      const queued = this.pending.shift()!;
      if (isTutorialSequenceEligible(progress, queued, this.host.scene)) { this.begin(queued); return; }
    }
    this.startEligible();
  }
}
