import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import {
  WEEKLY_OPERATION_ROTATIONS,
  createDefaultWeeklyOperationsState,
  formatWeeklyCountdown,
  getWeeklyRotationSlot,
  resolveWeeklyOperations
} from '../src/game/progression/WeeklyOperations.ts';

const progressSource = (overrides = {}) => ({
  enemiesDestroyed: 100,
  roundsCompleted: 8,
  bombSitesDestroyed: 12,
  highestRound: 9,
  totalCreditsEarned: 4_000,
  ...overrides
});

test('new and existing profiles receive backward-compatible weekly operation state', () => {
  const fresh = createDefaultLocalSave('weekly-new', 'Weekly New');
  assert.deepEqual(fresh.progress.weeklyOperations, createDefaultWeeklyOperationsState());

  const legacy = normalizeLocalSave({
    ...fresh,
    version: 8,
    progress: { ...fresh.progress, weeklyOperations: undefined }
  });
  assert.ok(legacy);
  assert.deepEqual(legacy.progress.weeklyOperations, createDefaultWeeklyOperationsState());
  assert.equal(legacy.progress.enemiesDestroyed, fresh.progress.enemiesDestroyed);
});

test('weekly objectives use a rotation baseline and grant their reward exactly once', () => {
  const now = Date.UTC(2026, 7, 10, 12);
  const initial = resolveWeeklyOperations(progressSource(), createDefaultWeeklyOperationsState(), now);
  assert.equal(initial.snapshot.objectives.length, 3);
  assert.ok(initial.snapshot.objectives.every((objective) => objective.current === 0 || objective.progressMode === 'absolute'));
  assert.equal(initial.rewardToGrant, null);

  const completedProgress = { ...progressSource() };
  for (const objective of initial.snapshot.objectives) {
    if (objective.progressMode === 'absolute') completedProgress[objective.statKey] = objective.target;
    else completedProgress[objective.statKey] = initial.state.baselines[objective.statKey] + objective.target;
  }
  const completed = resolveWeeklyOperations(completedProgress, initial.state, now + 60_000);
  assert.equal(completed.snapshot.complete, true);
  assert.deepEqual(completed.rewardToGrant, completed.snapshot.reward);
  assert.equal(completed.state.rewardClaimed, true);

  const reopened = resolveWeeklyOperations(completedProgress, completed.state, now + 120_000);
  assert.equal(reopened.snapshot.complete, true);
  assert.equal(reopened.rewardToGrant, null);
  assert.equal(reopened.state.rewardClaimed, true);
});

test('weekly rotation resets claim state and snapshots new cumulative baselines', () => {
  const now = Date.UTC(2026, 7, 10, 12);
  const first = resolveWeeklyOperations(progressSource(), createDefaultWeeklyOperationsState(), now);
  const nextWeek = getWeeklyRotationSlot(now).endsAt + 1;
  const advanced = progressSource({ enemiesDestroyed: 900, roundsCompleted: 30, bombSitesDestroyed: 45, highestRound: 20, totalCreditsEarned: 50_000 });
  const rotated = resolveWeeklyOperations(advanced, { ...first.state, rewardClaimed: true }, nextWeek);
  assert.notEqual(rotated.state.rotationId, first.state.rotationId);
  assert.equal(rotated.state.rewardClaimed, false);
  assert.equal(rotated.state.baselines.enemiesDestroyed, 900);
  assert.equal(rotated.snapshot.objectives.length, 3);
  assert.ok(WEEKLY_OPERATION_ROTATIONS.length > 1);
});

test('countdown formatting is stable and exposes the available state at expiry', () => {
  const now = Date.UTC(2026, 7, 10, 12);
  assert.equal(formatWeeklyCountdown(now + 2 * 86_400_000 + 14 * 3_600_000 + 32 * 60_000, now), 'NEW OPERATIONS IN 2D 14H 32M');
  assert.equal(formatWeeklyCountdown(now, now), 'NEW OPERATIONS AVAILABLE');
});

test('Main Menu is display/deploy only while Garage owns Signal and Contract selection UI', () => {
  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(menu, /ONE-RUN SETUP/);
  assert.doesNotMatch(menu, /MOD_FOCUS_CATEGORIES|RUN_CONTRACT_IDS/);
  assert.match(menu, /RUN CONFIG \/\/ SIGNAL:/);
  assert.match(garage, /showRunConfiguration/);
  assert.match(garage, /Signals weight one Mod category/);
  assert.match(garage, /Contracts modify encounter rules and rewards/);
  assert.match(garage, /getRunSetupCost\(setup\)/);
  assert.match(garage, /modFocus: option\.id/);
  assert.match(garage, /contract: option\.id/);
});

test('Main Menu uses one deployment stack and removes profile, save, and control clutter', () => {
  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  for (const label of ['DEPLOY ONLINE', 'DEPLOY LOCAL', 'OPERATOR GARAGE', 'MOD COLLECTION', 'STORE', 'LEADERBOARDS', 'OPTIONS']) {
    assert.match(menu, new RegExp(`'${label}'`));
  }
  assert.doesNotMatch(menu, /'Switch Profile'/);
  assert.doesNotMatch(menu, /'Local Save Information'/);
  assert.doesNotMatch(menu, /Controls:\\n/);
  assert.doesNotMatch(menu, /Plant at Site A, B, or C/);
  assert.match(menu, /WELCOME, OPERATIVE/);
  assert.match(menu, /WEEKLY OPERATIONS/);
  assert.match(menu, /OPERATIVE INTEL/);
});

test('Main Menu second-pass presentation uses responsive command modules and a layered weekly cyber deck', () => {
  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  assert.match(menu, /createCommandButton\(/);
  assert.match(menu, /createProtocolChassis\(/);
  assert.match(menu, /Phaser\.Math\.Clamp\(width \* \(narrow \? 0\.42 : 0\.23\)/);
  assert.match(menu, /WEEKLY OPERATIONS \/\/ MISSION DECK/);
  assert.match(menu, /createChamferedFramePoints\(panelWidth, panelHeight, cut\)/);
  assert.match(menu, /createCenteredHexagonPoints\(iconRadius\)/);
  assert.match(menu, /for \(let segment = 1; segment < 8; segment \+= 1\)/);
  assert.match(menu, /OPERATIVE INTEL \/\/ LIVE FEED/);
  assert.match(menu, /this\.scale\.on\('resize', this\.handleResize, this\)/);
  assert.match(menu, /this\.scale\.off\('resize', this\.handleResize, this\)/);
});

test('Main Menu polygon frames use positive local geometry so their visual centers stay aligned', () => {
  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  assert.match(menu, /const createChamferedFramePoints[\s\S]*?cut, 0,[\s\S]*?width - cut, 0/);
  assert.match(menu, /points\.push\(\(Math\.cos\(angle\) \+ 1\) \* radius, \(Math\.sin\(angle\) \+ 1\) \* radius\)/);
  assert.doesNotMatch(menu, /const points = \[\s*-outerWidth \/ 2/);
  assert.match(menu, /protocolY - protocolHeight \/ 2/);
});

test('Options Gameplay owns the readable core and active-profile control reference', () => {
  const options = readFileSync(new URL('../src/game/scenes/OptionsScene.ts', import.meta.url), 'utf8');
  assert.match(options, /CONTROLS \/ GAMEPLAY REFERENCE/);
  assert.match(options, /CORE CONTROLS/);
  assert.match(options, /bindingLabel\(bindings\[action\]\)/);
  assert.match(options, /WASD  MOVE/);
});
