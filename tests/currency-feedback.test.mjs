import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('HUD displays accumulating signed currency changes beside authoritative totals', () => {
  const hud = readFileSync(new URL('../src/game/systems/Hud.ts', import.meta.url), 'utf8');
  assert.match(hud, /interface ResourceVisual[\s\S]*?delta: Phaser\.GameObjects\.Text/);
  assert.match(hud, /const change = value - visual\.lastValue/);
  assert.match(hud, /sameDirection \? visual\.displayedDelta \+ change : change/);
  assert.match(hud, /gained \? '#69ff9c' : '#ff647d'/);
  assert.match(hud, /visual\.deltaHideTimer\?\.remove\(false\)/);
});

test('Store and Mod Collection show green income and red charges without owning wallet state', () => {
  const store = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
  const collection = readFileSync(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8');
  const collectionUi = readFileSync(new URL('../src/game/ui/ModCollectionUi.ts', import.meta.url), 'utf8');
  assert.match(store, /const before = this\.options\.getSnapshot\(\)/);
  assert.match(store, /credits: after\.credits - before\.credits/);
  assert.match(store, /delta > 0 \? 'gain' : 'loss'/);
  assert.match(collection, /const before = this\.captureCurrencySnapshot\(\)/);
  assert.match(collection, /plasmaChips: SaveSystem\.getModCollection\(\)\.plasmaChips/);
  assert.match(collection, /after\[key\] - before\[key\]/);
  assert.match(collectionUi, /gained \? '#69ff9c' : '#ff647d'/);
});
