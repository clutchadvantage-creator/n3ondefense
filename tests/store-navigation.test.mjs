import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SceneKeys } from '../src/game/flow/SceneKeys.ts';
import { resolveStoreReturnRoute } from '../src/game/stores/StoreNavigation.ts';

test('Store only offers an Arena return for an explicitly requested live paused encounter', () => {
  const request = { returnScene: SceneKeys.Arena, resumePausedScene: true };
  assert.deepEqual(resolveStoreReturnRoute(request, true), {
    returnScene: SceneKeys.Arena,
    resumePausedScene: true
  });
  assert.deepEqual(resolveStoreReturnRoute(request, false), {
    returnScene: SceneKeys.MainMenu,
    resumePausedScene: false
  });
  assert.deepEqual(resolveStoreReturnRoute({ returnScene: SceneKeys.Arena }, true), {
    returnScene: SceneKeys.MainMenu,
    resumePausedScene: false
  });
});

test('Main Menu and failed-run Store routes never inherit a previous gameplay return', () => {
  const mainRoute = { returnScene: SceneKeys.MainMenu, resumePausedScene: false };
  assert.deepEqual(resolveStoreReturnRoute(mainRoute, true), mainRoute);
  assert.deepEqual(resolveStoreReturnRoute(undefined, true), mainRoute);

  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  const results = readFileSync(new URL('../src/game/scenes/ResultScene.ts', import.meta.url), 'utf8');
  for (const source of [menu, results]) {
    assert.match(source, /scene\.start\(SceneKeys\.Upgrades, \{[\s\S]*?returnScene: SceneKeys\.MainMenu,[\s\S]*?resumePausedScene: false/);
  }
});

test('completed-round Store returns to results without gaining resumable gameplay state', () => {
  assert.deepEqual(resolveStoreReturnRoute({
    returnScene: SceneKeys.RoundFinished,
    resumePausedScene: true
  }, false), {
    returnScene: SceneKeys.RoundFinished,
    resumePausedScene: false
  });
});

test('Pause Menu launches Store over the paused Arena and restores the pause screen', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  assert.match(arena, /scene\.pause\(\);[\s\S]*?scene\.launch\(SceneKeys\.Upgrades, \{ returnScene: SceneKeys\.Arena, resumePausedScene: true \}\)/);
  assert.match(arena, /events\.on\('return-from-store', this\.onReturnFromStore\)/);
  assert.match(arena, /events\.on\('quit-from-store', this\.onQuitFromStore\)/);
});

test('both Store scenes validate return data before rendering a secondary return button', () => {
  for (const scene of ['UpgradeStoreScene.ts', 'CosmeticsStoreScene.ts']) {
    const source = readFileSync(new URL(`../src/game/scenes/${scene}`, import.meta.url), 'utf8');
    assert.match(source, /resolveStoreReturnRoute\(data, arenaCanResume\)/);
    assert.match(source, /returnRoute\.returnScene === SceneKeys\.MainMenu \? undefined/);
    assert.match(source, /this\.scene\.isPaused\(SceneKeys\.Arena\) && this\.registry\.has\('arena-session'\)/);
  }
});
