import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SceneKeys } from '../src/game/flow/SceneKeys.ts';
import { resolveModCollectionReturnRoute } from '../src/game/mods/ModCollectionNavigation.ts';

test('Mod Collection only offers an Arena return for a live paused encounter', () => {
  const request = { returnScene: SceneKeys.Arena, resumePausedScene: true };
  assert.deepEqual(resolveModCollectionReturnRoute(request, true), {
    returnScene: SceneKeys.Arena,
    resumePausedScene: true
  });
  assert.deepEqual(resolveModCollectionReturnRoute(request, false), {
    returnScene: SceneKeys.MainMenu,
    resumePausedScene: false
  });
});

test('Mod Collection ignores malformed resumable routes and defaults to Main Menu', () => {
  assert.deepEqual(resolveModCollectionReturnRoute({ returnScene: SceneKeys.Arena }, true), {
    returnScene: SceneKeys.MainMenu,
    resumePausedScene: false
  });
  assert.deepEqual(resolveModCollectionReturnRoute(undefined, false), {
    returnScene: SceneKeys.MainMenu,
    resumePausedScene: false
  });
});

test('non-gameplay collection routes never inherit resumable gameplay state', () => {
  for (const returnScene of [SceneKeys.RoundFinished, SceneKeys.Garage]) {
    assert.deepEqual(resolveModCollectionReturnRoute({ returnScene, resumePausedScene: true }, false), {
      returnScene,
      resumePausedScene: false
    });
  }
});

test('Main Menu always supplies a fresh non-resumable Mod Collection route', () => {
  const source = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  assert.match(source, /scene\.start\(SceneKeys\.Mods, \{[\s\S]*?returnScene: SceneKeys\.MainMenu,[\s\S]*?resumePausedScene: false/);
});

test('all Garage overlays share an inset Close-button position', () => {
  const source = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  assert.match(source, /closeRightInset = narrow \? 18 : 30/);
  assert.match(source, /closeY = narrow \? 48 : 50/);
  assert.match(source, /width - closeWidth \/ 2 - closeRightInset, closeY/);
});
