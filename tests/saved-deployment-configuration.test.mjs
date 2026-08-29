import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ECONOMY_BALANCE, RUN_CONTRACTS } from '../src/game/economy/economyBalance.ts';
import { getRunSetupCost } from '../src/game/economy/EconomyService.ts';
import {
  DeploymentLaunchGate,
  SAVED_DEPLOYMENT_REMINDER_INTERVAL_MS,
  acknowledgeSavedDeploymentReminder,
  commitDeploymentLaunch,
  getDeploymentConfigurationSnapshot,
  hasDeploymentSelection,
  isSavedDeploymentActive,
  isSavedDeploymentReminderDue,
  publishDeploymentConfigurationChanged,
  setSavedDeploymentEnabled,
  subscribeDeploymentConfigurationChanged
} from '../src/game/garage/SavedDeploymentConfiguration.ts';
import { createDefaultGarageState, normalizeGarageState } from '../src/game/garage/GarageState.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const fundedSave = () => {
  const save = createDefaultLocalSave('saved-deployment', 'Saved Deployment');
  save.wallet.credits = 1_000_000;
  return save;
};

test('older Garage state defaults saved deployment to off without inferring it from selections', () => {
  const garage = normalizeGarageState({ nextRun: { contract: 'elite-hunt', modFocus: 'weapon' }, presets: [] });
  assert.equal(garage.savedDeploymentEnabled, false);
  assert.equal(garage.lastDeploymentReminderAt, null);
  assert.deepEqual(garage.nextRun, { contract: 'elite-hunt', modFocus: 'weapon' });
});

test('version-16 profiles migrate selected IDs without enabling persistence', () => {
  const legacy = createDefaultLocalSave('saved-migrate', 'Saved Migrate');
  legacy.version = 16;
  legacy.garage = { nextRun: { contract: 'bomb-rush', modFocus: 'defense' }, presets: legacy.garage.presets };
  const migrated = normalizeLocalSave(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 17);
  assert.equal(migrated.garage.savedDeploymentEnabled, false);
  assert.deepEqual(migrated.garage.nextRun, { contract: 'bomb-rush', modFocus: 'defense' });
});

test('Contract-only, Signal-only, and combined configurations are recognized', () => {
  assert.equal(hasDeploymentSelection({ contract: 'elite-hunt', modFocus: null }), true);
  assert.equal(hasDeploymentSelection({ contract: null, modFocus: 'player' }), true);
  assert.equal(hasDeploymentSelection({ contract: 'elite-hunt', modFocus: 'player' }), true);
  assert.equal(hasDeploymentSelection({ contract: null, modFocus: null }), false);
});

test('deployment change notifications carry IDs, persistence state, and a freshly resolved current cost', () => {
  const garage = createDefaultGarageState();
  garage.savedDeploymentEnabled = true;
  garage.nextRun = { contract: 'elite-hunt', modFocus: 'weapon' };
  const snapshots = [];
  const unsubscribe = subscribeDeploymentConfigurationChanged((snapshot) => snapshots.push(snapshot));
  publishDeploymentConfigurationChanged(garage);
  unsubscribe();
  garage.nextRun.contract = 'bomb-rush';
  publishDeploymentConfigurationChanged(garage);
  assert.deepEqual(snapshots, [getDeploymentConfigurationSnapshot({
    ...garage,
    nextRun: { contract: 'elite-hunt', modFocus: 'weapon' }
  })]);
  assert.equal(snapshots[0].calculatedCurrentCost,
    RUN_CONTRACTS['elite-hunt'].cost + ECONOMY_BALANCE.modFocus.cost);
});

test('enabling persistence acknowledges the selection without charging anything', () => {
  const save = fundedSave();
  save.garage.nextRun = { contract: 'elite-hunt', modFocus: 'weapon' };
  const before = save.wallet.credits;
  setSavedDeploymentEnabled(save.garage, true, Date.UTC(2026, 7, 1));
  assert.equal(save.wallet.credits, before);
  assert.equal(save.garage.savedDeploymentEnabled, true);
  assert.equal(save.garage.lastDeploymentReminderAt, '2026-08-01T00:00:00.000Z');
});

test('saved Contract-only launch charges once and retains the Contract', () => {
  const save = fundedSave();
  save.garage.nextRun = { contract: 'elite-hunt', modFocus: null };
  save.garage.savedDeploymentEnabled = true;
  const before = save.wallet.credits;
  const result = commitDeploymentLaunch(save);
  assert.equal(result.ok, true);
  assert.equal(before - save.wallet.credits, RUN_CONTRACTS['elite-hunt'].cost);
  assert.deepEqual(save.garage.nextRun, { contract: 'elite-hunt', modFocus: null });
  assert.equal(result.economySnapshot.contract, 'elite-hunt');
});

test('saved Signal-only launch charges once and retains the Signal', () => {
  const save = fundedSave();
  save.garage.nextRun = { contract: null, modFocus: 'utility' };
  save.garage.savedDeploymentEnabled = true;
  const before = save.wallet.credits;
  const result = commitDeploymentLaunch(save);
  assert.equal(result.ok, true);
  assert.equal(before - save.wallet.credits, ECONOMY_BALANCE.modFocus.cost);
  assert.deepEqual(save.garage.nextRun, { contract: null, modFocus: 'utility' });
});

test('saved combined launch resolves the current authoritative combined price', () => {
  const save = fundedSave();
  save.garage.nextRun = { contract: 'fortified-enemy', modFocus: 'bombSite' };
  save.garage.savedDeploymentEnabled = true;
  const currentCost = getRunSetupCost(save.garage.nextRun);
  const result = commitDeploymentLaunch(save);
  assert.equal(result.cost, currentCost);
  assert.equal(result.economySnapshot.creditsSpentBeforeRun, currentCost);
  assert.deepEqual(result.selection, { contract: 'fortified-enemy', modFocus: 'bombSite' });
});

test('manual configuration preserves legacy consume-on-launch behavior', () => {
  const save = fundedSave();
  save.garage.nextRun = { contract: 'bomb-rush', modFocus: 'defense' };
  save.garage.savedDeploymentEnabled = false;
  assert.equal(commitDeploymentLaunch(save).ok, true);
  assert.deepEqual(save.garage.nextRun, { contract: null, modFocus: null });
});

test('disabling persistence does not charge or silently clear the selected IDs', () => {
  const save = fundedSave();
  save.garage.nextRun = { contract: 'bomb-rush', modFocus: 'defense' };
  save.garage.savedDeploymentEnabled = true;
  const before = save.wallet.credits;
  setSavedDeploymentEnabled(save.garage, false);
  assert.equal(save.wallet.credits, before);
  assert.deepEqual(save.garage.nextRun, { contract: 'bomb-rush', modFocus: 'defense' });
});

test('Contract and Signal can be replaced or cleared independently', () => {
  const garage = createDefaultGarageState();
  garage.nextRun = { contract: 'elite-hunt', modFocus: 'weapon' };
  garage.nextRun = { ...garage.nextRun, contract: 'bomb-rush' };
  assert.deepEqual(garage.nextRun, { contract: 'bomb-rush', modFocus: 'weapon' });
  garage.nextRun = { ...garage.nextRun, modFocus: null };
  assert.deepEqual(garage.nextRun, { contract: 'bomb-rush', modFocus: null });
  garage.nextRun = { ...garage.nextRun, contract: null };
  assert.deepEqual(garage.nextRun, { contract: null, modFocus: null });
});

test('insufficient funds never partially deduct or clear saved configuration', () => {
  const save = fundedSave();
  save.garage.nextRun = { contract: 'elite-hunt', modFocus: 'weapon' };
  save.garage.savedDeploymentEnabled = true;
  save.wallet.credits = getRunSetupCost(save.garage.nextRun) - 1;
  const beforeWallet = structuredClone(save.wallet);
  const beforeProgress = structuredClone(save.progress.creditSpendByCategory);
  const result = commitDeploymentLaunch(save);
  assert.equal(result.ok, false);
  assert.deepEqual(save.wallet, beforeWallet);
  assert.deepEqual(save.progress.creditSpendByCategory, beforeProgress);
  assert.deepEqual(save.garage.nextRun, { contract: 'elite-hunt', modFocus: 'weapon' });
});

test('saved configuration is active only when the toggle and at least one selected ID are present', () => {
  const garage = createDefaultGarageState();
  garage.savedDeploymentEnabled = true;
  assert.equal(isSavedDeploymentActive(garage), false);
  garage.nextRun.contract = 'elite-hunt';
  assert.equal(isSavedDeploymentActive(garage), true);
  garage.savedDeploymentEnabled = false;
  assert.equal(isSavedDeploymentActive(garage), false);
});

test('three-day reminder is not due before the interval and is due at its boundary', () => {
  const garage = createDefaultGarageState();
  garage.nextRun.contract = 'elite-hunt';
  setSavedDeploymentEnabled(garage, true, 1_000_000);
  assert.equal(isSavedDeploymentReminderDue(garage, 1_000_000 + SAVED_DEPLOYMENT_REMINDER_INTERVAL_MS - 1), false);
  assert.equal(isSavedDeploymentReminderDue(garage, 1_000_000 + SAVED_DEPLOYMENT_REMINDER_INTERVAL_MS), true);
});

test('missing reminder timestamp on an active migrated configuration safely causes a reminder', () => {
  const garage = createDefaultGarageState();
  garage.savedDeploymentEnabled = true;
  garage.nextRun.modFocus = 'player';
  garage.lastDeploymentReminderAt = null;
  assert.equal(isSavedDeploymentReminderDue(garage, Date.now()), true);
});

test('acknowledging YES updates the timestamp only on a successful committed launch', () => {
  const save = fundedSave();
  save.garage.savedDeploymentEnabled = true;
  save.garage.nextRun.contract = 'elite-hunt';
  const now = Date.UTC(2026, 7, 8);
  const result = commitDeploymentLaunch(save, { acknowledgeReminder: true, nowMs: now });
  assert.equal(result.ok, true);
  assert.equal(save.garage.lastDeploymentReminderAt, new Date(now).toISOString());
});

test('failed commit does not acknowledge an overdue reminder', () => {
  const save = fundedSave();
  save.garage.savedDeploymentEnabled = true;
  save.garage.nextRun.contract = 'elite-hunt';
  save.garage.lastDeploymentReminderAt = '2026-01-01T00:00:00.000Z';
  save.wallet.credits = 0;
  assert.equal(commitDeploymentLaunch(save, { acknowledgeReminder: true, nowMs: Date.UTC(2026, 7, 8) }).ok, false);
  assert.equal(save.garage.lastDeploymentReminderAt, '2026-01-01T00:00:00.000Z');
});

test('explicit reminder acknowledgement has no wallet side effects', () => {
  const save = fundedSave();
  const before = save.wallet.credits;
  acknowledgeSavedDeploymentReminder(save.garage, Date.UTC(2026, 7, 9));
  assert.equal(save.wallet.credits, before);
});

test('launch gate rejects mouse/controller double activation until released', () => {
  const gate = new DeploymentLaunchGate();
  assert.equal(gate.begin(), true);
  assert.equal(gate.begin(), false);
  gate.release();
  assert.equal(gate.begin(), true);
  gate.commit();
  assert.equal(gate.begin(), false);
});

test('launch gate permits retry after validation/server failure but not after commit', () => {
  const gate = new DeploymentLaunchGate();
  assert.equal(gate.begin(), true);
  gate.release();
  assert.equal(gate.begin(), true);
  gate.commit();
  gate.release();
  assert.equal(gate.busy, true);
});

test('a simulated rapid double start can commit only one wallet transaction', () => {
  const save = fundedSave();
  save.garage.savedDeploymentEnabled = true;
  save.garage.nextRun = { contract: 'elite-hunt', modFocus: 'weapon' };
  const gate = new DeploymentLaunchGate();
  const before = save.wallet.credits;
  if (gate.begin()) { assert.equal(commitDeploymentLaunch(save).ok, true); gate.commit(); }
  if (gate.begin()) commitDeploymentLaunch(save);
  assert.equal(before - save.wallet.credits, getRunSetupCost(save.garage.nextRun));
});

test('Main Menu routes Local and Online through the shared commit and reminder gate', () => {
  const source = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  assert.match(source, /launchConfiguredRun\('online'\)/);
  assert.match(source, /launchConfiguredRun\('local'\)/);
  assert.match(source, /SaveSystem\.isSavedDeploymentReminderDue\(\)/);
  assert.match(source, /SaveSystem\.commitDeploymentLaunch/);
  assert.doesNotMatch(source, /clearRunSetupSelection/);
  assert.match(source, /subscribeDeploymentConfigurationChanged/);
  assert.match(source, /Phaser\.Scenes\.Events\.WAKE/);
  assert.match(source, /refreshRunConfigurationReadout/);
  assert.match(source, /CURRENT CONFIG \/\/ ONE RUN/);
  assert.match(source, /SAVED DEPLOYMENT \/\/ ON \/\/ NO CONTRACT OR SIGNAL SELECTED/);
});

test('Results Try Again is a separately charged new attempt using the same commit', () => {
  const source = readFileSync(new URL('../src/game/scenes/ResultScene.ts', import.meta.url), 'utf8');
  assert.match(source, /SaveSystem\.commitDeploymentLaunch\(\)/);
  assert.match(source, /DeploymentLaunchGate/);
  assert.match(source, /\.\.\.commit\.economySnapshot/);
});

test('continuing an internal round never executes a deployment fee transaction', () => {
  const source = readFileSync(new URL('../src/game/scenes/RoundFinishedScene.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /commitDeploymentLaunch|purchaseRunSetup/);
  assert.match(source, /creditsSpentBeforeRun: payload\.creditsSpentBeforeRun/);
});

test('saved configuration console exposes persistence, dynamic cost, and controller-aware controls', () => {
  const source = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.match(source, /KEEP CONFIGURATION ACTIVE/);
  assert.match(source, /SaveSystem\.setSavedDeploymentEnabled/);
  assert.match(source, /focusModalDepth: 30/);
  assert.match(source, /RUN COST/);
});
