import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_AIM_SETTINGS,
  DEFAULT_HUD_SETTINGS,
  normalizeAimSettings,
  normalizeHudSettings
} from '../src/game/config/interfaceSettings.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

test('new profiles receive presentation defaults that preserve the original HUD and aiming feel', () => {
  const save = createDefaultLocalSave('interface-defaults', 'Interface Defaults');
  assert.deepEqual(save.settings.hud, DEFAULT_HUD_SETTINGS);
  assert.deepEqual(save.settings.aim, DEFAULT_AIM_SETTINGS);
});

test('version-nine profiles migrate to the current version without losing settings and receive nested defaults', () => {
  const original = createDefaultLocalSave('interface-migrate', 'Interface Migrate');
  const legacy = structuredClone(original);
  legacy.version = 9;
  legacy.settings.masterVolume = 0.42;
  delete legacy.settings.hud;
  delete legacy.settings.aim;
  const migrated = normalizeLocalSave(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 12);
  assert.equal(migrated.settings.masterVolume, 0.42);
  assert.deepEqual(migrated.settings.hud, DEFAULT_HUD_SETTINGS);
  assert.deepEqual(migrated.settings.aim, DEFAULT_AIM_SETTINGS);
  assert.equal(migrated.settings.buttonJiggle, 1);
});

test('HUD and reticle settings clamp malformed imported values and preserve valid selections', () => {
  assert.deepEqual(normalizeHudSettings({
    scale: 99, panelOpacity: -2, backgroundOpacity: 0.63, glow: 'high', animation: 'reduced', edgeMargin: 400, textScale: 0.1
  }), {
    scale: 1.4, panelOpacity: 0.2, backgroundOpacity: 0.63, glow: 'high', animation: 'reduced', edgeMargin: 36, textScale: 0.85
  });
  assert.deepEqual(normalizeAimSettings({
    mouseSensitivity: 1.37,
    reticle: { style: 'triad', size: 4, color: 'magenta', opacity: 0, glow: 'low' }
  }), {
    mouseSensitivity: 1.37,
    reticle: { style: 'triad', size: 1.8, color: 'magenta', opacity: 0.3, glow: 'low' }
  });
});

test('Options preview and Arena use the same reticle renderer while sensitivity remains pointer-lock only', () => {
  const options = readFileSync(new URL('../src/game/scenes/OptionsScene.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const pointerLock = readFileSync(new URL('../src/game/input/GameplayPointerLock.ts', import.meta.url), 'utf8');
  assert.match(options, /drawReticle\(graphic, 0, 0, settings\.reticle\)/);
  assert.match(arena, /drawReticle\(this\.crosshair, 0, 0, this\.aimSettings\.reticle/);
  assert.match(arena, /if \(this\.crosshairValid === valid\) return/);
  assert.match(pointerLock, /event\.movementX \* this\.sensitivity/);
  assert.doesNotMatch(options, /setSensitivity/);
});
