import type { FirstRunTeachingStage, TutorialProgressState } from '../save/LocalSaveTypes.ts';
import type { TutorialSequenceDefinition } from './TutorialTypes.ts';

export const createTutorialProgress = (): TutorialProgressState => ({
  version: 3,
  firstRunWelcomePending: true,
  firstRunStage: 'welcome-main-menu',
  completedSequences: [],
  skippedSequences: [],
  completedSteps: {},
  replaySequenceId: null
});

const addUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) values.push(value);
};

export const isTutorialSequenceComplete = (state: TutorialProgressState, sequenceId: string): boolean =>
  state.completedSequences.includes(sequenceId) || state.skippedSequences.includes(sequenceId);

export const isTutorialSequenceEligible = (
  state: TutorialProgressState,
  sequence: TutorialSequenceDefinition,
  scene: string
): boolean => sequence.scene === scene
  && !isTutorialSequenceComplete(state, sequence.id)
  && (!sequence.freshProfileOnly || state.firstRunWelcomePending)
  && (!sequence.firstRunStages || sequence.firstRunStages.includes(state.firstRunStage))
  && (state.firstRunStage === 'complete' || !sequence.contextual || Boolean(sequence.firstRunStages))
  && (!sequence.prerequisite || isTutorialSequenceComplete(state, sequence.prerequisite));

export const setFirstRunTeachingStage = (state: TutorialProgressState, stage: FirstRunTeachingStage): void => {
  state.firstRunStage = stage;
  state.firstRunWelcomePending = stage === 'welcome-main-menu' || stage === 'waiting-for-start-local';
};

/**
 * A successful round is the authoritative completion signal for the Arena
 * portion of first-run Teaching. Do not require every presentation sequence
 * flag here: a round can finish while the final acknowledgement is settling,
 * which previously left the profile at `arena-teaching` and made Main Menu
 * incorrectly demand another START LOCAL deployment.
 */
export const completeFirstRunTeachingRound = (state: TutorialProgressState): boolean => {
  if (state.firstRunStage !== 'arena-teaching') return false;
  for (const sequenceId of ['onboarding.basic-controls', 'onboarding.defense', 'onboarding.hud']) {
    addUnique(state.completedSequences, sequenceId);
    state.skippedSequences = state.skippedSequences.filter((id) => id !== sequenceId);
  }
  setFirstRunTeachingStage(state, 'waiting-for-store');
  return true;
};

export const completeTutorialStep = (state: TutorialProgressState, sequenceId: string, stepId: string): void => {
  const steps = state.completedSteps[sequenceId] ?? (state.completedSteps[sequenceId] = []);
  addUnique(steps, stepId);
  if (sequenceId === 'onboarding.menu-welcome' && stepId === 'welcome') {
    setFirstRunTeachingStage(state, 'waiting-for-start-local');
  } else if (sequenceId === 'onboarding.menu-welcome' && stepId === 'start-local') {
    setFirstRunTeachingStage(state, 'arena-teaching');
  } else if (sequenceId === 'onboarding.menu-store' && stepId === 'store') {
    setFirstRunTeachingStage(state, 'store-teaching');
  } else if (sequenceId === 'onboarding.menu-garage' && stepId === 'garage') {
    setFirstRunTeachingStage(state, 'garage-teaching');
  } else if (sequenceId === 'onboarding.garage' && stepId === 'mod-collection') {
    setFirstRunTeachingStage(state, 'mod-collection-teaching');
  }
};

export const completeTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  addUnique(state.completedSequences, sequenceId);
  state.skippedSequences = state.skippedSequences.filter((id) => id !== sequenceId);
  if (state.replaySequenceId === sequenceId) state.replaySequenceId = null;
  if (sequenceId === 'onboarding.menu-welcome') state.firstRunWelcomePending = false;
  if (sequenceId === 'onboarding.store') setFirstRunTeachingStage(state, 'waiting-for-garage');
  if (sequenceId === 'onboarding.mod-collection') {
    // The exact first-run route already taught these same systems. Mark the
    // contextual equivalents complete so their delayed menu triggers cannot
    // immediately replay Store/Garage/Collection teaching after graduation.
    for (const equivalent of [
      'progression.store',
      'progression.upgrades',
      'progression.garage',
      'progression.garage-loadout',
      'progression.mod-collection'
    ]) addUnique(state.completedSequences, equivalent);
    setFirstRunTeachingStage(state, 'complete');
  }
};

export const skipTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  addUnique(state.skippedSequences, sequenceId);
  if (state.replaySequenceId === sequenceId) state.replaySequenceId = null;
  if (sequenceId.startsWith('onboarding.')) setFirstRunTeachingStage(state, 'complete');
};

export const requestTutorialReplay = (state: TutorialProgressState, sequenceId: string): void => {
  state.replaySequenceId = sequenceId;
  resetTutorialSequence(state, sequenceId);
  if (sequenceId === 'onboarding.menu-welcome') state.firstRunWelcomePending = true;
  if (sequenceId === 'onboarding.menu-welcome') setFirstRunTeachingStage(state, 'welcome-main-menu');
};

export const resetTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  state.completedSequences = state.completedSequences.filter((id) => id !== sequenceId);
  state.skippedSequences = state.skippedSequences.filter((id) => id !== sequenceId);
  delete state.completedSteps[sequenceId];
};
