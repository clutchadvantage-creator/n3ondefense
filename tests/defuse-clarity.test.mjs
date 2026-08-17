import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('HUD defuse state uses a visible caution icon and pulses visible objective elements', async () => {
  const source = await readFile(new URL('../src/game/systems/Hud.ts', import.meta.url), 'utf8');
  assert.match(source, /defuseWarningIcon/);
  assert.match(source, /defuseWarningTriangle\.moveTo\(0, -12\)/);
  assert.match(source, /this\.objectiveText\.displayWidth \/ 2/);
  assert.match(source, /targets: \[this\.objectiveText, this\.objectiveTimerText, this\.defuseWarningIcon/);
  assert.match(source, /setVisible\(payload\.defuseAlert\)/);
});

test('bombsite defuse warning reuses a striped perimeter and cleans every effect', async () => {
  const source = await readFile(new URL('../src/game/systems/BombSiteManager.ts', import.meta.url), 'utf8');
  assert.match(source, /const stripeCount = 24/);
  assert.match(source, /setDefuseWarningVisible\(site\.id, site\.state === BombSiteState\.BeingDefused\)/);
  assert.match(source, /paused: true/);
  assert.match(source, /effect\.defusePulse\.remove\(\)/);
  assert.match(source, /effect\.defuseBoundary\.destroy\(\)/);
});

test('defuse audio follows global multi-site danger instead of one stopped site', async () => {
  const source = await readFile(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(source, /bomb-site-defuse-started/);
  assert.match(source, /this\.audio\.playSfx\('defuseAlarm'\)/);
  assert.match(source, /this\.audio\.startDisarmLoop\(\)/);
  assert.match(source, /anotherSiteIsBeingDefused/);
  assert.match(source, /if \(anotherSiteIsBeingDefused\) this\.audio\.startDisarmLoop\(\)/);
});
