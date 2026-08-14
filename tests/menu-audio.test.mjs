import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SFX_DEFINITIONS, createDefaultSoundVolumes } from '../src/game/config/audio.ts';

test('menu interaction recordings are registered with backward-compatible volume defaults', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/menuclick.mp3', import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/hoversound.mp3', import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/itemlocked.mp3', import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/startsound.mp3', import.meta.url)));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'menu'));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'menuHover'));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'itemLocked'));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'runStart'));
  assert.equal(createDefaultSoundVolumes().menu, 1);
  assert.equal(createDefaultSoundVolumes().menuHover, 1);
  assert.equal(createDefaultSoundVolumes().itemLocked, 1);
  assert.equal(createDefaultSoundVolumes().runStart, 1);
});

test('central audio manager pools the real menu recordings instead of synthesizing menu beeps', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  assert.match(audio, /MENU_SFX_POOL_SIZE = 4/);
  assert.match(audio, /soundeffects\/menuclick\.mp3/);
  assert.match(audio, /soundeffects\/hoversound\.mp3/);
  assert.match(audio, /soundeffects\/itemlocked\.mp3/);
  assert.match(audio, /case 'menu':[\s\S]*?case 'itemLocked':[\s\S]*?this\.playMenuSfx\(name\)/);
  assert.doesNotMatch(audio, /case 'menu':[\s\S]*?this\.beep\(/);
});

test('menu hover audio is centralized, throttled, and covers shared Phaser controls and cards', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const htmlAudio = readFileSync(new URL('../src/ui/installMenuAudio.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/game/utils/ui.ts', import.meta.url), 'utf8');
  const cards = readFileSync(new URL('../src/game/mods/ModCardView.ts', import.meta.url), 'utf8');
  assert.match(audio, /MENU_HOVER_SFX_MIN_INTERVAL_MS = 45/);
  assert.match(audio, /now - this\.lastMenuHoverSfxAt < MENU_HOVER_SFX_MIN_INTERVAL_MS/);
  assert.match(htmlAudio, /addEventListener\('pointerover'/);
  assert.match(htmlAudio, /closest<HTMLButtonElement>\('#game-ui-root button'\)/);
  assert.match(htmlAudio, /button\.contains\(relatedTarget\)/);
  assert.match(ui, /hit\.on\('pointerover'[\s\S]*?playSfx\('menuHover'\)/);
  assert.match(cards, /container\.on\('pointerover'[\s\S]*?playSfx\('menuHover'\)/);
});

test('shared Phaser buttons use normal audio for accepted actions and locked audio when disabled or rejected', () => {
  const ui = readFileSync(new URL('../src/game/utils/ui.ts', import.meta.url), 'utf8');
  assert.match(ui, /if \(!state\.enabled\) \{[\s\S]*?playSfx\('itemLocked'\)/);
  assert.match(ui, /accepted === false \? 'itemLocked' : buttonSound/);
  assert.match(ui, /if \(state\) state\.enabled = false/);
});

test('deployment start recording is restricted to Start Online and Start Local buttons', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/game/utils/ui.ts', import.meta.url), 'utf8');
  assert.match(audio, /soundeffects\/startsound\.mp3/);
  assert.match(audio, /case 'runStart':[\s\S]*?this\.playRunStartSfx\(\)/);
  assert.match(ui, /buttonSound: Extract<AudioSfxName, 'menu' \| 'runStart'> = 'menu'/);
  assert.equal((menu.match(/pairButtonWidth, 'runStart'/g) ?? []).length, 2);
  assert.match(menu, /'Start Online'[\s\S]*?pairButtonWidth, 'runStart'/);
  assert.match(menu, /'Start Local'[\s\S]*?pairButtonWidth, 'runStart'/);
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
