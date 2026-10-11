import type { FirstRunTeachingStage, TutorialProgressState } from '../save/LocalSaveTypes.ts';
import { TUTORIAL_SEQUENCES, TUTORIAL_SEQUENCE_BY_ID } from './TutorialRegistry.ts';
import type { TutorialSequenceDefinition, TutorialStepDefinition } from './TutorialTypes.ts';

type Learning = NonNullable<TutorialProgressState['learning']>;
const freshLearning = (): Learning => ({ version: 1, objectives: {}, messages: {}, trainingRounds: [], started: false, dismissed: false, legacyGraduated: false, legacyTrainingCleared: false, replays: [] });
export const createTutorialProgress = (): TutorialProgressState => ({
  version: 3, lyraCurriculum: 4, trainingRoundsCompleted: 0, lyraSeen: [],
  firstRunWelcomePending: true, firstRunStage: 'welcome-main-menu',
  completedSequences: [], skippedSequences: [], completedSteps: {}, replaySequenceId: null,
  learning: freshLearning()
});
const addUnique = (values: string[], value: string): void => { if (!values.includes(value)) values.push(value); };

/** Contextual and formal explanations of the same system share durable identities. */
export function tutorialObjectiveId(sequence: string, step: string): string {
  if (sequence === 'progression.upgrades') return `onboarding.store.${step === 'core-tokens' ? 'currencies' : step}`;
  if (sequence === 'progression.store') return 'onboarding.menu-store.store';
  if (sequence === 'progression.garage') return 'onboarding.menu-garage.garage';
  if (sequence === 'progression.garage-loadout' && step === 'loadout') return 'onboarding.garage.loadout';
  if (sequence === 'progression.mod-collection' && ['archive', 'details', 'equip'].includes(step)) return `onboarding.mod-collection.${step}`;
  return `${sequence}.${step}`;
}

/** Migrate old presentation records without treating a fallback Continue as a completed action. */
export function tutorialLearning(state: TutorialProgressState): Learning {
  if (state.learning) return state.learning;
  const learning = state.learning = freshLearning();
  learning.started = !['welcome-main-menu', 'waiting-for-start-local'].includes(state.firstRunStage);
  learning.dismissed = state.skippedSequences.some(id => id.startsWith('onboarding.'));
  learning.legacyGraduated = state.firstRunStage === 'complete';
  learning.legacyTrainingCleared = state.lyraCurriculum !== 4
    && ['waiting-for-store', 'store-teaching', 'waiting-for-garage', 'garage-teaching', 'mod-collection-teaching'].includes(state.firstRunStage);
  const count = Math.min(3, Math.max(0, state.trainingRoundsCompleted ?? 0));
  learning.trainingRounds = Array.from({ length: count }, (_, i) => i + 1);
  for (const sequence of TUTORIAL_SEQUENCES) for (const step of sequence.steps) {
    const id = tutorialObjectiveId(sequence.id, step.id);
    const explicit = state.completedSteps[sequence.id]?.includes(step.id);
    if (explicit || state.completedSequences.includes(sequence.id)) learning.messages[id] = 'acknowledged';
    if (explicit) learning.objectives[id] = step.completion.type === 'event'
      && ['mods.equipped', 'economy.upgradePurchased', 'economy.upgradePurchaseAttempted'].includes(step.completion.event)
      ? 'IN_PROGRESS' : 'COMPLETED';
  }
  return learning;
}

export function hasTutorialObjective(state: TutorialProgressState, id: string): boolean {
  return tutorialLearning(state).objectives[id] === 'COMPLETED';
}
export function hasTutorialMessage(state: TutorialProgressState, sequence: string, step: string): boolean {
  return !!tutorialLearning(state).messages[tutorialObjectiveId(sequence, step)];
}
export function needsTutorialStep(state: TutorialProgressState, sequence: string, step: TutorialStepDefinition): boolean {
  return !hasTutorialMessage(state, sequence, step.id) && !hasTutorialObjective(state, tutorialObjectiveId(sequence, step.id));
}
export function introduceTutorialStep(state: TutorialProgressState, sequence: string, step: string): void {
  const learning = tutorialLearning(state), id = tutorialObjectiveId(sequence, step);
  learning.messages[id] ??= 'delivered';
  learning.objectives[id] ??= 'INTRODUCED';
  reconcileTutorialProgress(state);
}

export const isTutorialSequenceComplete = (state: TutorialProgressState, sequenceId: string): boolean => {
  if (state.completedSequences.includes(sequenceId) || state.skippedSequences.includes(sequenceId)) return true;
  const sequence = TUTORIAL_SEQUENCE_BY_ID.get(sequenceId);
  return !!sequence && sequence.steps.every(step => step.completion.type === 'event'
    ? hasTutorialObjective(state, tutorialObjectiveId(sequenceId, step.id))
    : hasTutorialMessage(state, sequenceId, step.id));
};

export function reconcileTutorialProgress(state: TutorialProgressState): void {
  const learning = tutorialLearning(state);
  let consecutive = 0;
  while (learning.trainingRounds.includes(consecutive + 1) && consecutive < 3) consecutive++;
  state.trainingRoundsCompleted = consecutive;
  if (consecutive === 3) learning.objectives['training.rounds'] = 'COMPLETED';
  else if (learning.started) learning.objectives['training.rounds'] = 'IN_PROGRESS';
  for (const sequence of TUTORIAL_SEQUENCES) {
    if (isTutorialSequenceComplete(state, sequence.id) && !state.skippedSequences.includes(sequence.id)) addUnique(state.completedSequences, sequence.id);
  }
  if (learning.dismissed || learning.legacyGraduated) state.firstRunStage = 'complete';
  else if (!hasTutorialObjective(state, 'training.rounds') && !learning.legacyTrainingCleared) state.firstRunStage = learning.started ? 'arena-teaching'
    : hasTutorialMessage(state, 'onboarding.menu-welcome', 'welcome') ? 'waiting-for-start-local' : 'welcome-main-menu';
  else state.firstRunStage = !isTutorialSequenceComplete(state, 'onboarding.mod-collection') ? 'waiting-for-garage'
    : !isTutorialSequenceComplete(state, 'onboarding.store') ? 'waiting-for-store' : 'complete';
  state.firstRunWelcomePending = !learning.started && !learning.dismissed && !learning.legacyGraduated
    && !isTutorialSequenceComplete(state, 'onboarding.menu-welcome');
}

export const isTutorialSequenceEligible = (state: TutorialProgressState, sequence: TutorialSequenceDefinition, scene: string): boolean => {
  const learning = tutorialLearning(state);
  if (sequence.scene !== scene || isTutorialSequenceComplete(state, sequence.id)) return false;
  if (!sequence.steps.some(step => needsTutorialStep(state, sequence.id, step))) return false;
  if (sequence.id.startsWith('onboarding.') && (learning.dismissed || learning.legacyGraduated)) return false;
  if (sequence.id === 'onboarding.menu-resume-training') return learning.started && !hasTutorialObjective(state, 'training.rounds');
  if (sequence.earlyDiscovery) return true;
  return (!sequence.freshProfileOnly || state.firstRunWelcomePending)
    && (!sequence.firstRunStages || sequence.firstRunStages.includes(state.firstRunStage))
    && (state.firstRunStage === 'complete' || !sequence.contextual || Boolean(sequence.firstRunStages))
    && (!sequence.prerequisite || isTutorialSequenceComplete(state, sequence.prerequisite));
};

/** Compatibility API for deliberate resets/legacy callers. Normal progression is evidence-driven. */
export const setFirstRunTeachingStage = (state: TutorialProgressState, stage: FirstRunTeachingStage): void => {
  const learning = tutorialLearning(state);
  if (stage === 'arena-teaching') learning.started = true;
  if (stage === 'complete') learning.dismissed = true;
  state.firstRunStage = stage;
  state.firstRunWelcomePending = stage === 'welcome-main-menu' || stage === 'waiting-for-start-local';
};

/** Successful Normal Arena outcomes only. Repeated round-one wins still count as just round one. */
export const completeFirstRunTeachingRound = (state: TutorialProgressState, round: number): boolean => {
  if (![1, 2, 3].includes(round)) return false;
  const wasComplete = hasTutorialObjective(state, 'training.rounds');
  const learning = tutorialLearning(state);
  learning.started = true;
  if (!learning.trainingRounds.includes(round)) learning.trainingRounds.push(round);
  learning.trainingRounds.sort();
  reconcileTutorialProgress(state);
  return !wasComplete && hasTutorialObjective(state, 'training.rounds');
};

export function completeTutorialStep(state: TutorialProgressState, sequenceId: string, stepId: string): void {
  const learning = tutorialLearning(state), id = tutorialObjectiveId(sequenceId, stepId);
  learning.messages[id] = 'acknowledged';
  learning.objectives[id] = 'COMPLETED';
  addUnique(state.completedSteps[sequenceId] ??= [], stepId);
  reconcileTutorialProgress(state);
}

/** Dismissing an action explanation does not claim that the action happened. */
export function acknowledgeTutorialMessage(state: TutorialProgressState, sequence: string, step: TutorialStepDefinition): void {
  if (step.completion.type !== 'event') { completeTutorialStep(state, sequence, step.id); return; }
  const learning = tutorialLearning(state), id = tutorialObjectiveId(sequence, step.id);
  learning.messages[id] = 'acknowledged';
  if (learning.objectives[id] !== 'COMPLETED') learning.objectives[id] = 'IN_PROGRESS';
  reconcileTutorialProgress(state);
}

/** Authoritative events count regardless of which explanation is visible. */
export function recordTutorialEvent(state: TutorialProgressState, type: string, payload?: unknown): boolean {
  const learning = tutorialLearning(state);
  let changed = false;
  if (type === 'screen.entered' && payload === 'arena' && !learning.started) { learning.started = true; changed = true; }
  if (type === 'screen.entered') {
    const visits: Record<string, string[]> = {
      upgrades: ['ui.storeSelected', 'ui.storeOpened'], garage: ['ui.garageSelected', 'ui.garageOpened'],
      mods: ['ui.modCollectionSelected']
    };
    for (const event of visits[String(payload)] ?? []) changed = recordTutorialEvent(state, event) || changed;
  }
  for (const sequence of TUTORIAL_SEQUENCES) for (const step of sequence.steps) {
    if (step.completion.type !== 'event' || step.completion.event !== type) continue;
    const id = tutorialObjectiveId(sequence.id, step.id);
    if (learning.objectives[id] === 'COMPLETED') continue;
    learning.objectives[id] = 'COMPLETED';
    addUnique(state.completedSteps[sequence.id] ??= [], step.id);
    changed = true;
  }
  if (changed) reconcileTutorialProgress(state);
  return changed;
}

export function reconcileTutorialEvidence(state: TutorialProgressState, equipped: boolean, upgraded: boolean): void {
  if (equipped) recordTutorialEvent(state, 'mods.equipped');
  if (upgraded) recordTutorialEvent(state, 'economy.upgradePurchased');
  reconcileTutorialProgress(state);
}
export const completeTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  // Finishing a UI array is not proof of an action.
  if (isTutorialSequenceComplete(state, sequenceId)) addUnique(state.completedSequences, sequenceId);
  if (state.replaySequenceId === sequenceId) state.replaySequenceId = tutorialLearning(state).replays?.shift() ?? null;
  reconcileTutorialProgress(state);
};
export const skipTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  addUnique(state.skippedSequences, sequenceId);
  if (sequenceId.startsWith('onboarding.')) tutorialLearning(state).dismissed = true;
  if (state.replaySequenceId === sequenceId) state.replaySequenceId = null;
  reconcileTutorialProgress(state);
};
/** Explicit replays own a presentation cursor and never erase accomplishments. */
export const requestTutorialReplay = (state: TutorialProgressState, sequenceId: string): void => {
  state.replaySequenceId = sequenceId;
  tutorialLearning(state).replays = [];
};
export const resetTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  addUnique(tutorialLearning(state).replays ??= [], sequenceId);
};
