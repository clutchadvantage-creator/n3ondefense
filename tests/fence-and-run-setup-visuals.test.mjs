import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fence = readFileSync(new URL('../src/game/abilities/Fence.ts', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../src/game/systems/Hud.ts', import.meta.url), 'utf8');
const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');

test('fence presentation uses cached pylons and scene-clock conductors while endpoints stay fixed', () => {
  assert.match(fence, /fenceTexture\(appearance.id\)/);
  assert.match(fence, /for\(const px of \[-width\/2,width\/2\]\)/);
  assert.match(fence, /for\(let i=0;i<4;i\+\+\)/);
  assert.match(fence, /this.x1=x-ox; this.y1=y-oy; this.x2=x\+ox; this.y2=y\+oy/);
  assert.match(fence, /updateCosmetic/);
  assert.doesNotMatch(fence, /tweens.add|repeat: -1/);
});

test('HUD cooldown modules mirror the deployed fence, turret, mine, and shield art', () => {
  const iconRenderer = hud.slice(hud.indexOf('export function drawHudAbilityIcon'), hud.indexOf('/**\n * Single live gameplay HUD'));
  assert.match(iconRenderer, /Miniature of the deployed two-node telescoping fence/);
  assert.match(iconRenderer, /Same base, rotating housing, barrel, and muzzle silhouette as Turret/);
  assert.match(iconRenderer, /Twelve-spike shell, inner ring, and armed core/);
  assert.match(iconRenderer, /Layered energy bubble with orbit segments and crackling core/);
});

test('one-run setup uses the advanced console shell and keeps the console open while selecting', () => {
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
  assert.doesNotMatch(runSetup, /this\.scene\.restart\(\{ returnScene: this\.returnScene \}\)/);
  assert.equal((runSetup.match(/this\.showRunConfiguration\(\)/g) ?? []).length, 3);
  assert.equal((runSetup.match(/this\.refreshConfigurationTerminalState\(\)/g) ?? []).length, 3);
  assert.match(runSetup, /fontSize: typography\.selection/);
  assert.match(runSetup, /fontSize: `\$\{typography\.selectionDescription\}px`/);
  assert.match(consoleUi, /calculateRunConfigurationLayout\(width, height\)/);
  assert.match(consoleUi, /walletLine, typography\.walletValue/);
  assert.match(garage, /this\.tweens\.killTweensOf\(this\.overlayAnimatedTargets\)/);
});
