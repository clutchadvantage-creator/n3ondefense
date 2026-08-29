import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import {
  completeTutorialSequence,
  completeTutorialStep,
  completeFirstRunTeachingRound,
  createTutorialProgress,
  isTutorialSequenceComplete,
  isTutorialSequenceEligible,
  requestTutorialReplay,
  setFirstRunTeachingStage,
  skipTutorialSequence
} from '../src/game/tutorial/TutorialProgress.ts';
import { TUTORIAL_SEQUENCES } from '../src/game/tutorial/TutorialRegistry.ts';
import { resolveTutorialAdvancePolicy } from '../src/game/tutorial/TutorialStepRules.ts';
import {
  projectTutorialBoundsToViewport,
  projectViewportBoundsToTutorialMount,
  resolveTutorialCalloutPlacement,
  unionTutorialBounds
} from '../src/game/tutorial/TutorialTargeting.ts';

test('tutorial progress uses stable ids and supports completion, skipping, and replay', () => {
  const progress = createTutorialProgress();
  assert.equal(progress.version, 3);
  assert.equal(progress.firstRunWelcomePending, true);
  assert.equal(progress.firstRunStage, 'welcome-main-menu');
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
  assert.equal(migrated.version, 17);
  assert.equal(migrated.settings.contextualTutorials, true);
  assert.deepEqual(migrated.tutorials.completedSequences, []);
  assert.equal(migrated.tutorials.replaySequenceId, null);
  assert.equal(migrated.tutorials.firstRunWelcomePending, false);
  assert.equal(migrated.tutorials.firstRunStage, 'complete');
});

test('version-2 fresh-profile progress resumes before Start Local instead of opening another scene', () => {
  const source = createDefaultLocalSave('repair-welcome', 'Repair Welcome');
  const legacy = structuredClone(source);
  legacy.tutorials = {
    version: 2,
    firstRunWelcomePending: true,
    completedSequences: [],
    skippedSequences: [],
    completedSteps: { 'onboarding.menu-welcome': ['welcome'] },
    replaySequenceId: null
  };
  const migrated = normalizeLocalSave(legacy);
  assert.ok(migrated);
  assert.equal(migrated.tutorials.firstRunStage, 'waiting-for-start-local');
  assert.equal(migrated.tutorials.firstRunWelcomePending, true);
});

test('fresh-profile Main Menu welcome is one-time and does not spill into established profiles', () => {
  const freshSave = createDefaultLocalSave('fresh-welcome', 'Fresh Welcome');
  const persistedFreshSave = normalizeLocalSave(structuredClone(freshSave));
  assert.ok(persistedFreshSave);
  assert.equal(persistedFreshSave.tutorials.firstRunWelcomePending, true);

  const fresh = createTutorialProgress();
  const welcome = TUTORIAL_SEQUENCES.find(({ id }) => id === 'onboarding.menu-welcome');
  assert.ok(welcome);
  assert.equal(welcome.scene, 'menu');
  assert.equal(welcome.freshProfileOnly, true);
  assert.equal(isTutorialSequenceEligible(fresh, welcome, 'menu'), true);
  assert.equal(welcome.steps.at(-1).target, 'menu.start-local');
  assert.equal(welcome.steps.at(-1).completion.event, 'ui.startLocalSelected');
  assert.match(welcome.steps.at(-1).body, /does not publish scores/i);
  completeTutorialStep(fresh, welcome.id, 'welcome');
  assert.equal(fresh.firstRunStage, 'waiting-for-start-local');
  assert.equal(fresh.firstRunWelcomePending, true);
  completeTutorialStep(fresh, welcome.id, 'start-local');
  completeTutorialSequence(fresh, welcome.id);
  assert.equal(fresh.firstRunStage, 'arena-teaching');
  assert.equal(fresh.firstRunWelcomePending, false);
  assert.equal(isTutorialSequenceEligible(fresh, welcome, 'menu'), false);

  const established = createTutorialProgress();
  setFirstRunTeachingStage(established, 'complete');
  assert.equal(isTutorialSequenceEligible(established, welcome, 'menu'), false);
});

test('exact first-run state machine requires real menu actions and ends after Mod Collection teaching', () => {
  const progress = createTutorialProgress();
  completeTutorialStep(progress, 'onboarding.menu-welcome', 'welcome');
  assert.equal(progress.firstRunStage, 'waiting-for-start-local');
  completeTutorialStep(progress, 'onboarding.menu-welcome', 'start-local');
  completeTutorialSequence(progress, 'onboarding.menu-welcome');
  assert.equal(progress.firstRunStage, 'arena-teaching');

  assert.equal(completeFirstRunTeachingRound(progress), true);
  assert.equal(progress.firstRunStage, 'waiting-for-store');
  completeTutorialStep(progress, 'onboarding.menu-store', 'store');
  assert.equal(progress.firstRunStage, 'store-teaching');
  completeTutorialSequence(progress, 'onboarding.store');
  assert.equal(progress.firstRunStage, 'waiting-for-garage');
  completeTutorialStep(progress, 'onboarding.menu-garage', 'garage');
  assert.equal(progress.firstRunStage, 'garage-teaching');
  completeTutorialStep(progress, 'onboarding.garage', 'mod-collection');
  assert.equal(progress.firstRunStage, 'mod-collection-teaching');
  completeTutorialSequence(progress, 'onboarding.mod-collection');
  assert.equal(progress.firstRunStage, 'complete');
  assert.equal(isTutorialSequenceComplete(progress, 'progression.store'), true);
  assert.equal(isTutorialSequenceComplete(progress, 'progression.mod-collection'), true);
});

test('successful Teaching-round completion advances to Store even when a presentation flag is still settling', () => {
  const progress = createTutorialProgress();
  setFirstRunTeachingStage(progress, 'arena-teaching');
  completeTutorialSequence(progress, 'onboarding.basic-controls');

  assert.equal(isTutorialSequenceComplete(progress, 'onboarding.defense'), false);
  assert.equal(isTutorialSequenceComplete(progress, 'onboarding.hud'), false);
  assert.equal(completeFirstRunTeachingRound(progress), true);
  assert.equal(progress.firstRunStage, 'waiting-for-store');
  assert.equal(isTutorialSequenceComplete(progress, 'onboarding.defense'), true);
  assert.equal(isTutorialSequenceComplete(progress, 'onboarding.hud'), true);

  const resume = TUTORIAL_SEQUENCES.find(({ id }) => id === 'onboarding.menu-resume-training');
  const store = TUTORIAL_SEQUENCES.find(({ id }) => id === 'onboarding.menu-store');
  assert.equal(isTutorialSequenceEligible(progress, resume, 'menu'), false);
  assert.equal(isTutorialSequenceEligible(progress, store, 'menu'), true);
  assert.equal(completeFirstRunTeachingRound(progress), false);
});

test('tutorial eligibility respects scene, prerequisites, completion, and skip state', () => {
  const progress = createTutorialProgress();
  setFirstRunTeachingStage(progress, 'arena-teaching');
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

test('tutorial targeting unions live controls and keeps full-height callouts inside the viewport', () => {
  assert.deepEqual(unionTutorialBounds([
    { x: 200, y: 300, width: 180, height: 44 },
    { x: 200, y: 360, width: 180, height: 44 }
  ]), { x: 200, y: 300, width: 180, height: 104 });
  assert.deepEqual(resolveTutorialCalloutPlacement(
    1280, 720,
    { x: 20, y: 130, width: 900, height: 570 },
    440, 230
  ), { x: 640, y: 360, position: 'center' });
});

test('Mod Collection teaching always exposes acknowledgement instead of an install dead end', () => {
  const collection = TUTORIAL_SEQUENCES.find(({ id }) => id === 'progression.mod-collection');
  assert.ok(collection);
  assert.equal(collection.steps.find(({ id }) => id === 'equip').completion.type, 'manual');
  assert.equal(collection.steps.every(({ completion }) => completion.type === 'manual'), true);
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
  assert.match(arena, /this\.pointerLock\?\.release\(\)/);
  assert.match(arena, /this\.pointerLock\.requestLock\(\)/);
  assert.match(arena, /const displayDiameter = diameter \* camera\.zoom/);
  assert.match(arena, /firstRunStage === 'arena-teaching'/);
  assert.match(arena, /completeFirstRunTeachingRound\(progress\)/);
  assert.match(arena, /this\.scene\.start\(SceneKeys\.MainMenu\)/);
});

test('first-run scene handoff, live Main Menu targets, and undimmed Arena teaching are wired', async () => {
  const [profiles, profileUi, menu, store, storefront, garage, mods, overlay, styles] = await Promise.all([
    readFile(new URL('../src/game/scenes/LocalProfileScene.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/local-profiles/LocalProfilesUi.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/scenes/UpgradeStoreScene.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/tutorial/TutorialOverlay.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/style.css', import.meta.url), 'utf8')
  ]);
  assert.match(profiles, /SaveSystem\.createProfile\(value\)[\s\S]*?this\.scene\.start\(SceneKeys\.MainMenu, \{ showFirstRunWelcome: true \}\)/);
  assert.doesNotMatch(profileUi, /this\.root\.replaceChildren\(\)/);
  assert.match(profileUi, /this\.screen\?\.remove\(\)/);
  assert.match(menu, /data\.showFirstRunWelcome[\s\S]*?replay\('onboarding\.menu-welcome'\)/);
  assert.match(menu, /'menu\.start-local', localStartButton/);
  assert.match(menu, /allowTeachingMenuAction\('local'/);
  assert.match(menu, /TutorialEventBus\.emit\('ui\.startLocalSelected'\)/);
  assert.match(menu, /TutorialEventBus\.emit\('ui\.storeSelected'\)/);
  assert.match(menu, /TutorialEventBus\.emit\('ui\.garageSelected'\)/);
  assert.match(menu, /firstRunStage === 'arena-teaching' && profile\.roundsCompleted > 0/);
  assert.match(menu, /completeFirstRunTeachingRound\(progress\)/);
  assert.match(store, /onboarding\.store[\s\S]*?SceneKeys\.MainMenu/);
  assert.doesNotMatch(storefront, /root\.replaceChildren/);
  assert.match(storefront, /this\.screen\?\.remove\(\)/);
  assert.match(garage, /'garage\.mod-collection'/);
  assert.match(garage, /TutorialEventBus\.emit\('ui\.modCollectionSelected'\)/);
  assert.match(mods, /onboarding\.mod-collection[\s\S]*?SceneKeys\.MainMenu/);
  assert.match(mods, /this\.tutorialDirector\.startEligible\(\)/);
  assert.match(overlay, /resolveTutorialCalloutPlacement/);
  assert.match(overlay, /event\.stopPropagation\(\)/);
  assert.match(overlay, /event\.preventDefault\(\)/);
  assert.match(styles, /\.tutorial-overlay--arena \.tutorial-shade \{ display: none !important; \}/);
  assert.match(styles, /max-height: calc\(100% - 32px\); overflow-y: auto/);
  assert.match(styles, /\.tutorial-continue \{[\s\S]*?position: sticky/);
});
