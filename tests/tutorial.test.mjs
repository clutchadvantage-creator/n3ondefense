import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import {
  completeTutorialSequence,
  completeTutorialStep,
  createTutorialProgress,
  isTutorialSequenceComplete,
  isTutorialSequenceEligible,
  requestTutorialReplay,
  skipTutorialSequence
} from '../src/game/tutorial/TutorialProgress.ts';
import { TUTORIAL_SEQUENCES } from '../src/game/tutorial/TutorialRegistry.ts';

test('tutorial progress uses stable ids and supports completion, skipping, and replay', () => {
  const progress = createTutorialProgress();
  completeTutorialStep(progress, 'onboarding.basic-controls', 'move');
  completeTutorialStep(progress, 'onboarding.basic-controls', 'move');
  assert.deepEqual(progress.completedSteps['onboarding.basic-controls'], ['move']);
  completeTutorialSequence(progress, 'onboarding.basic-controls');
  assert.equal(isTutorialSequenceComplete(progress, 'onboarding.basic-controls'), true);
  requestTutorialReplay(progress, 'onboarding.basic-controls');
  assert.equal(isTutorialSequenceComplete(progress, 'onboarding.basic-controls'), false);
  assert.equal(progress.replaySequenceId, 'onboarding.basic-controls');
  skipTutorialSequence(progress, 'onboarding.basic-controls');
  assert.equal(isTutorialSequenceComplete(progress, 'onboarding.basic-controls'), true);
  assert.equal(progress.replaySequenceId, null);
});

test('older profiles safely migrate into optional tutorial and contextual-tip defaults', () => {
  const source = createDefaultLocalSave('tutorial-profile', 'Tutorial Profile');
  const legacy = structuredClone(source);
  legacy.version = 10;
  delete legacy.tutorials;
  delete legacy.settings.contextualTutorials;
  const migrated = normalizeLocalSave(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 13);
  assert.equal(migrated.settings.contextualTutorials, true);
  assert.deepEqual(migrated.tutorials.completedSequences, []);
  assert.equal(migrated.tutorials.replaySequenceId, null);
});

test('tutorial eligibility respects scene, prerequisites, completion, and skip state', () => {
  const progress = createTutorialProgress();
  const defense = TUTORIAL_SEQUENCES.find(({ id }) => id === 'onboarding.defense');
  assert.equal(isTutorialSequenceEligible(progress, defense, 'arena'), false);
  completeTutorialSequence(progress, 'onboarding.basic-controls');
  assert.equal(isTutorialSequenceEligible(progress, defense, 'menu'), false);
  assert.equal(isTutorialSequenceEligible(progress, defense, 'arena'), true);
  skipTutorialSequence(progress, defense.id);
  assert.equal(isTutorialSequenceEligible(progress, defense, 'arena'), false);
});

test('tutorial registry has unique sequence and step ids with event-driven action gates', () => {
  const sequenceIds = TUTORIAL_SEQUENCES.map(({ id }) => id);
  assert.equal(new Set(sequenceIds).size, sequenceIds.length);
  for (const sequence of TUTORIAL_SEQUENCES) {
    const stepIds = sequence.steps.map(({ id }) => id);
    assert.equal(new Set(stepIds).size, stepIds.length, `${sequence.id} repeats a step id`);
  }
  const basic = TUTORIAL_SEQUENCES.find(({ id }) => id === 'onboarding.basic-controls');
  assert.equal(basic.steps.find(({ id }) => id === 'move').completion.event, 'combat.playerMoved');
  assert.equal(basic.steps.find(({ id }) => id === 'fire').completion.event, 'combat.weaponFired');
});

test('Arena tutorial cleanup and success events are wired to authoritative gameplay paths', async () => {
  const arena = await readFile(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /TutorialEventBus\.emit\('combat\.playerMoved'\)/);
  assert.match(arena, /TutorialEventBus\.emit\('combat\.weaponFired'\)/);
  assert.match(arena, /TutorialEventBus\.emit\(`combat\.ability\.\$\{type\}`/);
  assert.match(arena, /this\.tutorialDirector\?\.destroy\(\)/);
  assert.match(arena, /this\.tutorialHardPaused \|\| this\.state\.state === RoundState\.Paused/);
});
