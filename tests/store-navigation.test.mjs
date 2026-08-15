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

test('Upgrade and Cosmetic modes share the same layered cyber-console storefront shell', () => {
  const ui = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/ui/stores/storefront.css', import.meta.url), 'utf8');
  assert.match(ui, /shell\.append\(this\.renderConsoleDecor\(\), this\.renderHeader\(snapshot\), this\.renderModeTabs\(\), this\.renderBody\(snapshot\)\)/);
  assert.match(ui, /ARMORY BUS \/\/ ONLINE/);
  assert.match(ui, /VISUAL FORGE \/\/ ONLINE/);
  assert.match(styles, /\.store-console-decor/);
  assert.match(styles, /repeating-linear-gradient\(0deg/);
  assert.match(styles, /\.store-categories::before,\.store-grid-panel::before,\.store-details::before/);
});

test('store selection and transactions preserve inventory scroll with a persistent selected state', () => {
  const ui = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/ui/stores/storefront.css', import.meta.url), 'utf8');
  assert.match(ui, /private captureScrollState\(\): StoreScrollState \| null/);
  assert.match(ui, /gridTop: grid\?\.scrollTop \?\? 0/);
  assert.match(ui, /if \(grid\) grid\.scrollTop = state\.gridTop/);
  assert.match(ui, /querySelectorAll<HTMLElement>\('\.store-card\.selected'\)[\s\S]*?card\.classList\.add\('selected'\)/);
  assert.match(ui, /querySelector<HTMLElement>\('\.store-details'\)[\s\S]*?replaceWith\(this\.renderDetails/);
  assert.doesNotMatch(ui, /querySelector<HTMLElement>\('\.store-action'\)\?\.focus\(\)/);
  assert.match(ui, /private perform\([\s\S]*?this\.render\(\)/);
  assert.match(styles, /\.store-card\.selected \{/);
  assert.match(styles, /\.store-card\.selected::before/);
});
