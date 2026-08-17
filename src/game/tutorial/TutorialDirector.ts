import { SaveSystem } from '../systems/SaveSystem.ts';
import { TUTORIAL_SEQUENCES } from './TutorialRegistry.ts';
import { completeTutorialSequence, completeTutorialStep, isTutorialSequenceEligible, skipTutorialSequence } from './TutorialProgress.ts';
import { TutorialEventBus } from './TutorialEventBus.ts';
import { TutorialOverlay } from './TutorialOverlay.ts';
import type { TutorialEvent, TutorialHost, TutorialSequenceDefinition } from './TutorialTypes.ts';
import { compactBindingLabel } from '../config/controls.ts';
import { resolveTutorialAdvancePolicy, type TutorialAdvancePolicy } from './TutorialStepRules.ts';

/** One director per visible scene. Awarding/game state remains independent of this presentation queue. */
export class TutorialDirector {
  private readonly overlay: TutorialOverlay;
  private readonly unsubscribe: () => void;
  private active: TutorialSequenceDefinition | null = null;
  private readonly pending: TutorialSequenceDefinition[] = [];
  private stepIndex = 0;
  private timer: number | null = null;
  private transitionTimer: number | null = null;
  private acceptingCompletion = false;
  private advancePolicy: TutorialAdvancePolicy | null = null;
  private destroyed = false;
  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (event.code === 'KeyK' && this.active && this.active.skippable !== false) this.skip();
    else if (event.code === 'Enter' && this.acceptingCompletion && this.advancePolicy?.type === 'manual') this.advance();
  };

  constructor(private readonly host: TutorialHost) {
    this.overlay = new TutorialOverlay(() => this.skip());
    this.unsubscribe = TutorialEventBus.subscribe((event) => this.onEvent(event));
    window.addEventListener('keydown', this.keyHandler);
  }

  startEligible(): void {
    if (this.active || this.destroyed) return;
    const progress = SaveSystem.getTutorialProgress();
    const replay = progress.replaySequenceId
      ? TUTORIAL_SEQUENCES.find((sequence) => sequence.id === progress.replaySequenceId && sequence.scene === this.host.scene)
      : null;
    const sequence = replay ?? TUTORIAL_SEQUENCES.find((candidate) =>
      candidate.autoStart
      && isTutorialSequenceEligible(progress, candidate, this.host.scene)
    );
    if (sequence) this.begin(sequence);
  }

  replay(sequenceId: string): boolean {
    const sequence = TUTORIAL_SEQUENCES.find((candidate) => candidate.id === sequenceId && candidate.scene === this.host.scene);
    if (!sequence) return false;
    this.finish(false);
    this.begin(sequence);
    return true;
  }

  isBlockingGameplay(): boolean {
    return this.active?.steps[this.stepIndex]?.mode === 'hard-pause';
  }

  awaits(event: string): boolean {
    return this.acceptingCompletion
      && this.advancePolicy?.type === 'event'
      && this.advancePolicy.event === event;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimer();
    this.clearTransitionTimer();
    this.host.setMode('live');
    this.unsubscribe();
    window.removeEventListener('keydown', this.keyHandler);
    this.overlay.destroy();
  }

  private onEvent(event: TutorialEvent): void {
    if (this.destroyed) return;
    if (this.active) {
      if (this.acceptingCompletion && this.advancePolicy?.type === 'event' && this.advancePolicy.event === event.type) {
        this.advance();
        return;
      }
      this.queueTriggeredSequence(event);
      return;
    }
    if (!SaveSystem.get().settings.contextualTutorials) return;
    const sequence = this.findTriggeredSequence(event);
    if (sequence) this.begin(sequence);
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

  private begin(sequence: TutorialSequenceDefinition): void {
    if (this.destroyed) return;
    this.active = sequence;
    const completed = SaveSystem.getTutorialProgress().completedSteps[sequence.id] ?? [];
    this.stepIndex = Math.max(0, sequence.steps.findIndex((step) => !completed.includes(step.id)));
    if (this.stepIndex < 0) this.stepIndex = 0;
    this.showStep();
    TutorialEventBus.emit('tutorial.sequenceStarted', { sequenceId: sequence.id });
  }

  private showStep(): void {
    if (!this.active) return;
    this.clearTimer();
    this.acceptingCompletion = true;
    const sourceStep = this.active.steps[this.stepIndex];
    const eventActionAvailable = sourceStep.completion.type !== 'event'
      || this.host.isEventActionAvailable?.(sourceStep.completion.event) !== false;
    this.advancePolicy = resolveTutorialAdvancePolicy(sourceStep.completion, eventActionAvailable);
    const bindings = SaveSystem.get().settings.abilityBindings;
    const replacements: Record<string, string> = {
      '{FENCE}': compactBindingLabel(bindings.fence),
      '{TURRET}': compactBindingLabel(bindings.turret),
      '{MINE}': compactBindingLabel(bindings.mine),
      '{DASH}': compactBindingLabel(bindings.dash),
      '{SHIELD}': compactBindingLabel(bindings.shield)
    };
    const replaceBindings = (value: string): string => Object.entries(replacements)
      .reduce((copy, [token, label]) => copy.replaceAll(token, label), value);
    const actionUnavailable = this.advancePolicy.type === 'manual'
      && this.advancePolicy.reason === 'action-unavailable';
    const step = {
      ...sourceStep,
      body: `${replaceBindings(sourceStep.body)}${actionUnavailable
        ? ' This action is not currently available; continue when ready.'
        : ''}`,
      inputDemo: sourceStep.inputDemo?.map(replaceBindings)
    };
    this.host.setMode(step.mode);
    this.overlay.show(
      step,
      this.stepIndex,
      this.active.steps.length,
      () => step.target ? this.host.resolveTarget(step.target) : null,
      () => this.advance(),
      this.active.skippable !== false,
      this.advancePolicy.type === 'manual' ? this.advancePolicy.label : null
    );
    TutorialEventBus.emit('tutorial.stepShown', { sequenceId: this.active.id, stepId: step.id });
    if (this.advancePolicy.type === 'auto') {
      this.timer = window.setTimeout(() => this.advance(), this.advancePolicy.delayMs);
    }
  }

  private advance(): void {
    if (!this.active || !this.acceptingCompletion) return;
    this.acceptingCompletion = false;
    this.advancePolicy = null;
    this.clearTimer();
    const sequence = this.active;
    const step = sequence.steps[this.stepIndex];
    SaveSystem.updateTutorialProgress((state) => completeTutorialStep(state, sequence.id, step.id));
    this.overlay.confirm();
    TutorialEventBus.emit('tutorial.stepCompleted', { sequenceId: sequence.id, stepId: step.id });
    this.stepIndex += 1;
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
    if (!this.active || this.active.skippable === false) return;
    const sequenceId = this.active.id;
    const skippedIds = sequenceId.startsWith('onboarding.')
      ? ['onboarding.basic-controls', 'onboarding.defense', 'onboarding.hud']
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
    this.clearTimer();
    this.acceptingCompletion = false;
    this.advancePolicy = null;
    this.active = null;
    this.overlay.hide();
    this.host.setMode('live');
    if (notify && sequenceId) this.host.onComplete?.(sequenceId);
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleTransition(callback: () => void, delayMs: number): void {
    this.clearTransitionTimer();
    this.transitionTimer = window.setTimeout(() => {
      this.transitionTimer = null;
      if (!this.destroyed) callback();
    }, delayMs);
  }

  private clearTransitionTimer(): void {
    if (this.transitionTimer !== null) window.clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
  }

  private startNext(): void {
    if (this.destroyed) return;
    const queued = this.pending.shift();
    if (queued) this.begin(queued);
    else this.startEligible();
  }
}
