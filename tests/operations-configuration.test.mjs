import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NORMAL_CHECKPOINT_INTERVAL,
  getHighestUnlockedNormalCheckpoint,
  getOperationsCheckpointOptions,
  getOperationsModeStatuses,
  getUnlockedNormalStartRounds,
  resolveOperationsConfiguration,
  selectOperationsCheckpoint
} from '../src/game/progression/OperationsConfiguration.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const progress = (normalHighestRound, overrides = {}) => ({
  highestRound: normalHighestRound,
  normalHighestRound,
  supremeHighestRound: 0,
  regularOverdriveCompleted: false,
  supremeOverdriveCompleted: false,
  ...overrides
});

test('Normal checkpoints unlock permanently every five rounds and always retain Round 1', () => {
  assert.equal(NORMAL_CHECKPOINT_INTERVAL, 5);
  assert.deepEqual(getUnlockedNormalStartRounds(0), [1]);
  assert.deepEqual(getUnlockedNormalStartRounds(4), [1]);
  assert.deepEqual(getUnlockedNormalStartRounds(5), [1, 5]);
  assert.deepEqual(getUnlockedNormalStartRounds(20), [1, 5, 10, 15, 20]);
  assert.deepEqual(getUnlockedNormalStartRounds(40), [1, 5, 10, 15, 20, 25, 30, 35, 40]);
  assert.equal(getHighestUnlockedNormalCheckpoint(42), 40);
});

test('selected Normal start remains independent from highest Normal progression', () => {
  const initial = { preferred: 'normal', selectedNormalStartRound: 40 };
  const selection = selectOperationsCheckpoint(initial, progress(40), 'normal', 10);
  assert.equal(selection.ok, true);
  assert.equal(selection.preference.selectedNormalStartRound, 10);
  const resolved = resolveOperationsConfiguration(selection.preference, progress(40));
  assert.deepEqual(resolved, { mode: 'normal', protocol: 'normal', startingRound: 10 });
  assert.equal(progress(40).normalHighestRound, 40);
});

test('Normal checkpoint validation rejects locked and malformed selections', () => {
  const current = { preferred: 'normal', selectedNormalStartRound: 1 };
  assert.equal(selectOperationsCheckpoint(current, progress(20), 'normal', 25).ok, false);
  assert.equal(selectOperationsCheckpoint(current, progress(20), 'normal', 17).ok, false);
  assert.equal(selectOperationsCheckpoint(current, progress(20), 'normal', 1).ok, true);
});

test('Operations mode and checkpoint availability delegates to existing protocol progression', () => {
  const freshModes = getOperationsModeStatuses(progress(0));
  assert.deepEqual(freshModes.map(({ mode, unlocked }) => [mode, unlocked]), [
    ['normal', true], ['overdrive', false], ['supreme', false]
  ]);
  const overdriveProgress = progress(53);
  assert.equal(getOperationsModeStatuses(overdriveProgress).find((entry) => entry.mode === 'overdrive').unlocked, true);
  assert.equal(getOperationsModeStatuses(overdriveProgress).find((entry) => entry.mode === 'supreme').unlocked, false);
  const supremeProgress = progress(53, { regularOverdriveCompleted: true });
  assert.equal(getOperationsModeStatuses(supremeProgress).find((entry) => entry.mode === 'supreme').unlocked, true);

  const preference = { preferred: 'normal', selectedNormalStartRound: 1 };
  const overdrive = getOperationsCheckpointOptions('overdrive', preference, overdriveProgress);
  assert.ok(overdrive.some((entry) => entry.startingRound === 50 && entry.unlocked));
  const supreme = getOperationsCheckpointOptions('supreme', preference, supremeProgress);
  assert.equal(supreme.find((entry) => entry.startingRound === 51).unlocked, true);
  assert.equal(supreme.find((entry) => entry.startingRound === 55).unlocked, false);
});

test('existing saves migrate their prior Normal starting point without losing progression', () => {
  const legacy = createDefaultLocalSave('operations-legacy', 'Operations Legacy');
  legacy.progress.highestRound = 27;
  legacy.progress.normalHighestRound = 27;
  legacy.protocol = { preferred: 'normal' };
  const migrated = normalizeLocalSave(legacy);
  assert.ok(migrated);
  assert.equal(migrated.progress.normalHighestRound, 27);
  assert.equal(migrated.protocol.selectedNormalStartRound, 20, 'migration preserves the old ten-round derived start');
  assert.equal(resolveOperationsConfiguration(migrated.protocol, migrated.progress).startingRound, 20);
});

test('selected Operations configuration persists across normalization and invalid starts clamp safely', () => {
  const save = createDefaultLocalSave('operations-persist', 'Operations Persist');
  save.progress.highestRound = 40;
  save.progress.normalHighestRound = 40;
  save.protocol = { preferred: 'normal', selectedNormalStartRound: 10 };
  const reloaded = normalizeLocalSave(structuredClone(save));
  assert.equal(reloaded.protocol.selectedNormalStartRound, 10);
  assert.equal(reloaded.progress.normalHighestRound, 40);

  save.protocol.selectedNormalStartRound = 999;
  const repaired = normalizeLocalSave(save);
  assert.equal(repaired.protocol.selectedNormalStartRound, 40);
  assert.equal(repaired.progress.normalHighestRound, 40);
});

test('changing Operations preference never mutates tutorial or progression state', () => {
  const save = createDefaultLocalSave('operations-tutorial', 'Operations Tutorial');
  save.progress.highestRound = 25;
  save.progress.normalHighestRound = 25;
  save.tutorials.firstRunStage = 'complete';
  const beforeProgress = structuredClone(save.progress);
  const beforeTutorials = structuredClone(save.tutorials);
  const result = selectOperationsCheckpoint(save.protocol, save.progress, 'normal', 1);
  assert.equal(result.ok, true);
  save.protocol = result.preference;
  assert.deepEqual(save.progress, beforeProgress);
  assert.deepEqual(save.tutorials, beforeTutorials);
});

test('Main Menu is a launch summary while Garage owns controller-ready Operations selection', () => {
  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const results = readFileSync(new URL('../src/game/scenes/ResultScene.ts', import.meta.url), 'utf8');

  assert.match(menu, /OPERATIONS CONFIGURATION/);
  assert.match(menu, /openOperations: true/);
  assert.match(menu, /SaveSystem\.getOperationsConfiguration\(\)/);
  assert.doesNotMatch(menu, /cycleUnlockedProtocol|previousProtocolButton|nextProtocolButton/);
  assert.doesNotMatch(menu, /ONLINE IDENTITY WILL BE CREATED WHEN YOU DEPLOY ONLINE/);
  assert.match(menu, /launchConfiguredRun\('local'\)/);
  assert.match(menu, /launchConfiguredRun\('online'\)/);

  assert.match(garage, /private showOperations\(/);
  assert.match(garage, /operations-mode-tabs/);
  assert.match(garage, /operations-checkpoint-grid/);
  assert.match(garage, /SIGNALS & CONTRACTS/);
  assert.match(garage, /SaveSystem\.setOperationsCheckpoint/);
  assert.match(results, /SaveSystem\.getOperationsConfiguration\(\)/);
});
