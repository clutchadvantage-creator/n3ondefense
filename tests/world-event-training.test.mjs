import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorialProgress, completeFirstRunTeachingRound, isInitialCombatTrainingPending, requestTutorialReplay } from '../src/game/tutorial/TutorialProgress.ts';
import { createCampaignProgress } from '../src/game/progression/CampaignProgression.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

test('new players are protected through all three combat teaching rounds, then unlock before menu lessons', () => {
  const state = createTutorialProgress(), campaign = createCampaignProgress();
  assert.equal(isInitialCombatTrainingPending(state, campaign), true);
  state.firstRunStage = 'arena-teaching';
  for (const round of [1, 2]) {
    completeFirstRunTeachingRound(state, round);
    assert.equal(isInitialCombatTrainingPending(state, campaign), true);
  }
  // Acknowledging the round-3 release prompt alone is not completing round 3.
  state.completedSequences.push('onboarding.certification');
  assert.equal(isInitialCombatTrainingPending(state, campaign), true);
  completeFirstRunTeachingRound(state, 3);
  assert.equal(state.firstRunStage, 'waiting-for-garage');
  assert.equal(isInitialCombatTrainingPending(state, campaign), false);
  requestTutorialReplay(state, 'onboarding.menu-welcome');
  assert.equal(isInitialCombatTrainingPending(state, campaign), false);
});

test('Store/Garage lessons and skipped onboarding do not block the rotation', () => {
  for (const stage of ['waiting-for-store', 'store-teaching', 'waiting-for-garage', 'garage-teaching', 'mod-collection-teaching', 'complete']) {
    const state = { ...createTutorialProgress(), firstRunStage: stage, replaySequenceId: 'onboarding.tactics' };
    assert.equal(isInitialCombatTrainingPending(state, createCampaignProgress()), false);
  }
});

test('existing campaign completion and migrated access cannot be relocked by replay or stale tutorial flags', () => {
  const proofs = [
    p => { p.packages.training.eligible = true; }, p => { p.packages.training.claimed = true; },
    p => { p.modes.normal.highestCompletedRound = 3; }, p => { p.modes.overdrive.highestCompletedRound = 1; },
    p => { p.modes.supreme.highestCompletedRound = 1; }, p => { p.legacyModeAccess.overdrive = true; },
    p => { p.legacyModeAccess.supreme = true; }
  ];
  for (const prove of proofs) {
    const campaign = createCampaignProgress(); prove(campaign);
    assert.equal(isInitialCombatTrainingPending(createTutorialProgress(), campaign), false);
  }
});

test('legacy saves and saved graduates retain access after normalization without repeating early rounds', () => {
  const legacy = createDefaultLocalSave('legacy', 'Legacy'); delete legacy.tutorials;
  const normalizedLegacy = normalizeLocalSave(legacy);
  assert.equal(isInitialCombatTrainingPending(normalizedLegacy.tutorials, normalizedLegacy.progress.campaign), false);
  const saved = createDefaultLocalSave('graduate', 'Graduate');
  saved.tutorials.trainingRoundsCompleted = 3; saved.tutorials.firstRunStage = 'waiting-for-garage';
  const restored = normalizeLocalSave(JSON.parse(JSON.stringify(saved)));
  requestTutorialReplay(restored.tutorials, 'onboarding.menu-welcome');
  assert.equal(isInitialCombatTrainingPending(restored.tutorials, restored.progress.campaign), false);
});
