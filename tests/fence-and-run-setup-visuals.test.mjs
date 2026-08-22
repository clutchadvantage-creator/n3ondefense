import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fence = readFileSync(new URL('../src/game/abilities/Fence.ts', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../src/game/systems/Hud.ts', import.meta.url), 'utf8');
const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');

test('operative fences deploy two telescoping nodes and four live conductors without changing combat endpoints', () => {
  assert.match(fence, /const FENCE_WIRE_LEVELS = \[-5, -11, -17, -23\]/);
  assert.match(fence, /for \(const localX of \[-halfWidth, halfWidth\]\)/);
  assert.match(fence, /const poleRoot = scene\.add\.container/);
  assert.match(fence, /targets: this\.poleRoots, scaleY: 1/);
  assert.match(fence, /targets: this\.wires, scaleX: 1/);
  assert.match(fence, /targets: this\.warningLights/);
  assert.match(fence, /targets: pip,[\s\S]*?repeat: -1/);
  assert.match(fence, /this\.x1 = x - offsetX/);
  assert.match(fence, /this\.x2 = x \+ offsetX/);
});

test('HUD cooldown modules mirror the deployed fence, turret, mine, and shield art', () => {
  const iconRenderer = hud.slice(hud.indexOf('export function drawHudAbilityIcon'), hud.indexOf('/**\n * Single live gameplay HUD'));
  assert.match(iconRenderer, /Miniature of the deployed two-node telescoping fence/);
  assert.match(iconRenderer, /Same base, rotating housing, barrel, and muzzle silhouette as Turret/);
  assert.match(iconRenderer, /Twelve-spike shell, inner ring, and armed core/);
  assert.match(iconRenderer, /Layered energy bubble with orbit segments and crackling core/);
});

test('one-run setup uses the advanced console shell without changing setup callbacks', () => {
  const runSetup = garage.slice(garage.indexOf('private showRunConfiguration'), garage.indexOf('private showLibrary'));
  const consoleUi = readFileSync(new URL('../src/game/ui/RunConfigurationConsoleUi.ts', import.meta.url), 'utf8');
  assert.match(runSetup, /createRunConfigurationConsole\(this/);
  assert.match(consoleUi, /SYSTEM STATUS/);
  assert.match(consoleUi, /TACTICAL WALLET/);
  assert.match(consoleUi, /SIGNAL WEIGHTING PREVIEW/);
  assert.match(consoleUi, /ACTIVE MOD FOCUS/);
  assert.match(consoleUi, /ENCOUNTER SIMULATION/);
  assert.match(consoleUi, /REWARD PARAMETERS/);
  assert.match(consoleUi, /DEPLOYMENT SUMMARY \/\/ SYSTEM FEED/);
  assert.match(runSetup, /SaveSystem\.setNextRunSetupSelection/);
  assert.match(runSetup, /this\.scene\.restart\(\{ returnScene: this\.returnScene \}\)/);
  assert.match(garage, /this\.tweens\.killTweensOf\(this\.overlayAnimatedTargets\)/);
});
