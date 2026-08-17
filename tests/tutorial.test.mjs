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
import { resolveTutorialAdvancePolicy } from '../src/game/tutorial/TutorialStepRules.ts';
import {
  projectTutorialBoundsToViewport,
  projectViewportBoundsToTutorialMount
} from '../src/game/tutorial/TutorialTargeting.ts';

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
  assert.equal(TUTORIAL_SEQUENCES.flatMap(({ steps }) => steps).some(({ completion }) => completion.type === 'auto'), false);
  assert.equal(basic.steps.find(({ id }) => id === 'welcome').completion.type, 'manual');
});

test('tutorial advance policies separate acknowledgement, action, fallback, and intentional timer behavior', () => {
  assert.deepEqual(resolveTutorialAdvancePolicy({ type: 'manual' }), {
    type: 'manual', label: 'GOT IT', reason: 'acknowledgement'
  });
  assert.deepEqual(resolveTutorialAdvancePolicy({ type: 'event', event: 'combat.weaponFired' }), {
    type: 'event', event: 'combat.weaponFired'
  });
  assert.deepEqual(resolveTutorialAdvancePolicy({ type: 'event', event: 'mods.equipped' }, false), {
    type: 'manual', label: 'CONTINUE', reason: 'action-unavailable'
  });
  assert.deepEqual(resolveTutorialAdvancePolicy({ type: 'auto', delayMs: 1200 }), {
    type: 'auto', delayMs: 1200
  });
});

test('tutorial target projection accounts for canvas and game mount offsets and scaling', () => {
  const viewport = projectTutorialBoundsToViewport(
    { x: 200, y: 100, width: 400, height: 200 },
    { x: 100, y: 50, width: 800, height: 450 },
    1600,
    900
  );
  assert.deepEqual(viewport, { x: 200, y: 100, width: 200, height: 100 });
  assert.deepEqual(
    projectViewportBoundsToTutorialMount(
      viewport,
      { x: 80, y: 30, width: 1000, height: 500 },
      2000,
      1000
    ),
    { x: 240, y: 140, width: 400, height: 200 }
  );
});

test('first defuse teaching names the danger and requires acknowledgement', () => {
  const sequence = TUTORIAL_SEQUENCES.find(({ id }) => id === 'context.first-defuse');
  assert.equal(sequence.triggerEvent, 'objective.defuseStarted');
  assert.equal(sequence.steps[0].target, 'world.defusingBombsite');
  assert.equal(sequence.steps[0].completion.type, 'manual');
  assert.match(sequence.steps[0].body, /Eliminate or interrupt every defuser/);
});

test('Arena tutorial cleanup and success events are wired to authoritative gameplay paths', async () => {
  const arena = await readFile(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /TutorialEventBus\.emit\('combat\.playerMoved'\)/);
  assert.match(arena, /TutorialEventBus\.emit\('combat\.weaponFired'\)/);
  assert.match(arena, /TutorialEventBus\.emit\(`combat\.ability\.\$\{type\}`/);
  assert.match(arena, /this\.tutorialDirector\?\.destroy\(\)/);
  assert.match(arena, /this\.tutorialHardPaused \|\| this\.state\.state === RoundState\.Paused/);
  assert.match(arena, /TutorialEventBus\.emit\('objective\.defuseStarted'/);
  assert.match(arena, /this\.tutorialPointerLockWasActive = this\.pointerLock\?\.locked \?\? false/);
  assert.match(arena, /this\.pointerLock\?\.release\(\)/);
  assert.match(arena, /this\.pointerLock\.requestLock\(\)/);
});
