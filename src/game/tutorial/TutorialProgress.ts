import type { TutorialProgressState } from '../save/LocalSaveTypes.ts';
import type { TutorialSequenceDefinition } from './TutorialTypes.ts';

export const createTutorialProgress = (): TutorialProgressState => ({
  version: 2,
  firstRunWelcomePending: true,
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
  && (!sequence.prerequisite || isTutorialSequenceComplete(state, sequence.prerequisite));

export const completeTutorialStep = (state: TutorialProgressState, sequenceId: string, stepId: string): void => {
  const steps = state.completedSteps[sequenceId] ?? (state.completedSteps[sequenceId] = []);
  addUnique(steps, stepId);
};

export const completeTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  addUnique(state.completedSequences, sequenceId);
  state.skippedSequences = state.skippedSequences.filter((id) => id !== sequenceId);
  if (state.replaySequenceId === sequenceId) state.replaySequenceId = null;
  if (sequenceId === 'onboarding.menu-welcome') state.firstRunWelcomePending = false;
};

export const skipTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  addUnique(state.skippedSequences, sequenceId);
  if (state.replaySequenceId === sequenceId) state.replaySequenceId = null;
  if (sequenceId === 'onboarding.menu-welcome') state.firstRunWelcomePending = false;
};

export const requestTutorialReplay = (state: TutorialProgressState, sequenceId: string): void => {
  state.replaySequenceId = sequenceId;
  resetTutorialSequence(state, sequenceId);
  if (sequenceId === 'onboarding.menu-welcome') state.firstRunWelcomePending = true;
};

export const resetTutorialSequence = (state: TutorialProgressState, sequenceId: string): void => {
  state.completedSequences = state.completedSequences.filter((id) => id !== sequenceId);
  state.skippedSequences = state.skippedSequences.filter((id) => id !== sequenceId);
  delete state.completedSteps[sequenceId];
};
