import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared controller router covers DOM controls, text entry, sliders, selects, modal scopes, and hot switching', () => {
  const navigation = source('src/game/input/UiNavigationController.ts');
  for (const token of [
    'input:not([type="hidden"]):not([type="file"])',
    'select:not([data-controller-ignore="true"])',
    'textarea:not([data-controller-ignore="true"])',
    '.store-dialog-backdrop',
    '.profile-modal-backdrop',
    'tutorial-overlay:not([hidden])',
    "window.addEventListener('pointermove'",
    "if (this.device === 'gamepad' && !pad.connected) this.device = 'keyboardMouse'"
  ]) assert.ok(navigation.includes(token), `missing controller infrastructure: ${token}`);
});

test('controller-capable scene families register their interactive controls through the shared focus layer', () => {
  const checks = [
    ['src/game/scenes/MainMenuScene.ts', /createButton\(/],
    ['src/game/scenes/OptionsScene.ts', /configureSceneUiNavigation[\s\S]*?registerUiFocusable/],
    ['src/game/scenes/OperatorGarageScene.ts', /configureSceneUiNavigation[\s\S]*?showPlasmaRecalibration[\s\S]*?showCurrencyExchange/],
    ['src/game/scenes/ModCollectionScene.ts', /configureSceneUiNavigation[\s\S]*?createModCardView/],
    ['src/game/scenes/ResultScene.ts', /createButton\(/],
    ['src/game/scenes/RoundFinishedScene.ts', /createDebriefActions\(/],
    ['src/game/anomalies/heist/HeistScene.ts', /createPauseMenuView/],
    ['src/ui/local-profiles/LocalProfilesUi.ts', /document\.createElement\('button'\)/]
  ];
  for (const [path, pattern] of checks) assert.match(source(path), pattern, `${path} bypasses the shared controller-capable UI path`);
});

test('dynamic Garage systems provide grouped navigation for Library, Gear Locker, Run Configuration, and Economy Console', () => {
  const garage = source('src/game/scenes/OperatorGarageScene.ts');
  for (const group of [
    'mod-library-toolbar',
    'mod-library-card-grid',
    'gear-locker-categories',
    'gear-locker-card-grid',
    'run-configuration-signals',
    'run-configuration-contracts',
    'economy-console-tabs',
    'currency-exchange-amounts'
  ]) assert.ok(garage.includes(group), `missing focus group ${group}`);
  assert.match(garage, /showPlasmaRecalibration[\s\S]*?configureSceneUiNavigation\(this, \{ onBack:/);
});

test('controller confirmation is edge-triggered and currency exchange retains its transaction lock', () => {
  const navigation = source('src/game/input/UiNavigationController.ts');
  const garage = source('src/game/scenes/OperatorGarageScene.ts');
  assert.match(navigation, /this\.states\.pressed\('confirm'\)/);
  assert.doesNotMatch(navigation, /this\.states\.held\('confirm'\)/);
  assert.match(garage, /this\.time\.now < this\.exchangeConfirmLockedUntil/);
  assert.match(garage, /this\.exchangeConfirmLockedUntil = this\.time\.now \+ 450/);
});
