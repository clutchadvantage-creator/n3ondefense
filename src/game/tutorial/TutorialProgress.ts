import type { FirstRunTeachingStage, TutorialProgressState } from '../save/LocalSaveTypes.ts';
import type { TutorialSequenceDefinition } from './TutorialTypes.ts';
import type { CampaignProgress } from '../progression/CampaignProgression.ts';

/** Only first-time combat teaching suppresses world events. Existing completion,
 * migrated access, workstation lessons, and voluntary replay never re-lock them. */
export const isInitialCombatTrainingPending = (state: TutorialProgressState, campaign: CampaignProgress): boolean => {
  if (state.lyraCurriculum !== 4 || (state.trainingRoundsCompleted ?? 0) >= 3
    || campaign.packages.training.eligible || campaign.packages.training.claimed
    || campaign.modes.normal.highestCompletedRound >= 3
    || campaign.modes.overdrive.highestCompletedRound > 0 || campaign.modes.supreme.highestCompletedRound > 0
    || campaign.legacyModeAccess.overdrive || campaign.legacyModeAccess.supreme) return false;
  return state.firstRunStage === 'welcome-main-menu' || state.firstRunStage === 'waiting-for-start-local'
    || state.firstRunStage === 'arena-teaching';
};

export const createTutorialProgress = (): TutorialProgressState => ({
  version: 3,
  lyraCurriculum: 4,
  trainingRoundsCompleted: 0,
  lyraSeen: [],
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

const ARENA_TEACHING_SEQUENCES = ['onboarding.menu-welcome', 'onboarding.menu-resume-training',
  'onboarding.basic-controls', 'onboarding.defense', 'onboarding.hud', 'onboarding.tactics', 'onboarding.certification'];

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

const advancePostCombatTeaching = (state: TutorialProgressState): void => {
  setFirstRunTeachingStage(state, !isTutorialSequenceComplete(state, 'onboarding.mod-collection')
    ? 'waiting-for-garage' : !isTutorialSequenceComplete(state, 'onboarding.store')
      ? 'waiting-for-store' : 'complete');
};

/**
 * A successful round is the authoritative completion signal for the Arena
 * portion of first-run Teaching. Do not require every presentation sequence
 * flag here: a round can finish while the final acknowledgement is settling,
 * which previously left the profile at `arena-teaching` and made Main Menu
 * incorrectly demand another START LOCAL deployment.
 */
export const completeFirstRunTeachingRound = (state: TutorialProgressState, round = 3): boolean => {
  if (state.firstRunStage !== 'arena-teaching') return false;
  if (state.lyraCurriculum === 4) {
    state.trainingRoundsCompleted = Math.max(state.trainingRoundsCompleted ?? 0, Math.min(3, round));
    if (state.trainingRoundsCompleted < 3) return false;
  }
  for (const sequenceId of ARENA_TEACHING_SEQUENCES) {
    addUnique(state.completedSequences, sequenceId);
    state.skippedSequences = state.skippedSequences.filter((id) => id !== sequenceId);
  }
  if (state.replaySequenceId && ARENA_TEACHING_SEQUENCES.includes(state.replaySequenceId)) state.replaySequenceId = null;
  advancePostCombatTeaching(state);
  return true;
};

export const completeTutorialStep = (state: TutorialProgressState, sequenceId: string, stepId: string): void => {
  // Late UI acknowledgements must not regress a graduated profile back into a run.
  if (state.completedSequences.includes(sequenceId)) return;
  const steps = state.completedSteps[sequenceId] ?? (state.completedSteps[sequenceId] = []);
  addUnique(steps, stepId);
  // Replaying a workstation lesson does not reenroll a graduated profile.
  if (state.firstRunStage === 'complete') return;
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
  const alreadyGraduated = state.firstRunStage === 'complete';
  addUnique(state.completedSequences, sequenceId);
  state.skippedSequences = state.skippedSequences.filter((id) => id !== sequenceId);
  if (state.replaySequenceId === sequenceId) state.replaySequenceId = null;
  if (sequenceId === 'onboarding.menu-welcome') state.firstRunWelcomePending = false;
  if (sequenceId === 'onboarding.store') {
    for (const equivalent of ['progression.store', 'progression.upgrades']) addUnique(state.completedSequences, equivalent);
    if (!alreadyGraduated) advancePostCombatTeaching(state);
  }
  if (sequenceId === 'onboarding.mod-collection') {
    // The exact first-run route already taught these same systems. Mark the
    // contextual equivalents complete so their delayed menu triggers cannot
    // immediately replay Store/Garage/Collection teaching after graduation.
    for (const equivalent of [
      'progression.garage',
      'progression.garage-loadout',
      'progression.mod-collection'
    ]) addUnique(state.completedSequences, equivalent);
    if (!alreadyGraduated) advancePostCombatTeaching(state);
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
