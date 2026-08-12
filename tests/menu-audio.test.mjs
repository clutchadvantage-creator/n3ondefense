import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SFX_DEFINITIONS, createDefaultSoundVolumes } from '../src/game/config/audio.ts';

test('menu interaction recordings are registered with backward-compatible volume defaults', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/menuclick.mp3', import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/itemlocked.mp3', import.meta.url)));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'menu'));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'itemLocked'));
  assert.equal(createDefaultSoundVolumes().menu, 1);
  assert.equal(createDefaultSoundVolumes().itemLocked, 1);
});

test('central audio manager pools the real menu recordings instead of synthesizing menu beeps', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  assert.match(audio, /MENU_SFX_POOL_SIZE = 4/);
  assert.match(audio, /soundeffects\/menuclick\.mp3/);
  assert.match(audio, /soundeffects\/itemlocked\.mp3/);
  assert.match(audio, /case 'menu':[\s\S]*?case 'itemLocked':[\s\S]*?this\.playMenuSfx\(name\)/);
  assert.doesNotMatch(audio, /case 'menu':[\s\S]*?this\.beep\(/);
});

test('shared Phaser buttons use normal audio for accepted actions and locked audio when disabled or rejected', () => {
  const ui = readFileSync(new URL('../src/game/utils/ui.ts', import.meta.url), 'utf8');
  assert.match(ui, /if \(!state\.enabled\) \{[\s\S]*?playSfx\('itemLocked'\)/);
  assert.match(ui, /accepted === false \? 'itemLocked' : 'menu'/);
  assert.match(ui, /if \(state\) state\.enabled = false/);
});

test('HTML menus are centrally covered while unaffordable Store actions defer to locked feedback', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const htmlAudio = readFileSync(new URL('../src/ui/installMenuAudio.ts', import.meta.url), 'utf8');
  const storefront = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
  assert.match(main, /installMenuAudio\(\)/);
  assert.match(htmlAudio, /closest<HTMLButtonElement>\('#game-ui-root button'\)/);
  assert.match(htmlAudio, /unavailable \? 'itemLocked' : 'menu'/);
  assert.match(storefront, /dataset\.menuAudio = 'deferred'/);
  assert.match(storefront, /if \(locked\) card\.dataset\.locked = 'true'/);
  assert.match(storefront, /setAttribute\('aria-disabled', unavailable \? 'true' : 'false'\)/);
  assert.match(storefront, /playSfx\(unavailable \? 'itemLocked' : 'menu'\)/);
});

test('locked Overdrive tiers and failed Mod economy operations use locked feedback', () => {
  const garage = readFileSync(new URL('../src/game/scenes/OperatorGarageScene.ts', import.meta.url), 'utf8');
  const mods = readFileSync(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8');
  assert.match(garage, /if \(!unlocked\) \{[\s\S]*?playSfx\('itemLocked'\)/);
  assert.match(mods, /private apply\([\s\S]*?return result\.ok/);
  assert.match(mods, /return nextUpgrade \? this\.apply/);
});
